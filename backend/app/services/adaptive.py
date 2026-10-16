"""
A small, honest adaptive feedback loop.

Every accept/reject decision a reviewer makes on an OUTLIER issue is
logged to `feedback_events`. Once enough new decisions have accumulated,
the outlier detector's `contamination` parameter (how much of the data
Local Outlier Factor expects to be anomalous) is nudged up or down within
safe, hard-coded bounds:

- Reviewers mostly ACCEPTING flagged outliers suggests the current
  sensitivity is finding real issues worth a look, so contamination
  nudges UP slightly (catch a bit more next time).
- Reviewers mostly REJECTING flagged outliers suggests the detector is
  raising false positives, so contamination nudges DOWN slightly (be a
  little more conservative next time).

Only outlier decisions move this parameter. The other three detectors
(missing values, duplicates, inconsistent formatting) are rule-based —
there is no equivalent tunable sensitivity knob for them, so their
accept/reject decisions are still logged for the audit trail but don't
feed back into anything.

Three refinements make the loop more careful:
  - Recency weighting: every earlier decision is multiplied by `decay`
    (default 0.95) before a new one is added, so recent behaviour counts
    more than behaviour from long ago. Raw counts are still kept for display.
  - Inconsistent-reviewer check: when a reviewer decides the SAME flagged
    cell (same dataset, column and row) in the opposite way to an earlier
    decision, that is a reversal. If more than half of the repeated
    decisions in a batch are reversals, the batch is considered unreliable
    and the sensitivity is held instead of moved.
  - Configurable: step, batch size, accept/reject thresholds, decay and the
    bounds are stored in the state and can be changed through the API
    (see `update_config`), within validated ranges.

It is still deliberately simple and openly imperfect — a working
mechanism, not a claim of a solved research problem:
  - Decay reduces, but does not eliminate, catastrophic forgetting.
  - The reversal check only catches reviewers who contradict themselves
    on the same cell; a reviewer who is consistently biased is not detected.
  - Parameters are set by the user, not learned.
These limitations are the ones raised in the literature survey
(catastrophic forgetting / feedback bias in adaptive-threshold systems)
and are stated here rather than hidden.
"""
from app.database import db, now_iso
from app.config import settings

adaptive_state_collection = db["adaptive_state"]
feedback_events_collection = db["feedback_events"]

_STATE_ID = "outlier_contamination"

CONTAMINATION_MIN = 0.02
CONTAMINATION_MAX = 0.15
ADJUST_STEP = 0.005
BATCH_SIZE = 5  # re-evaluate the contamination value after every N new outlier decisions
ACCEPT_THRESHOLD = 0.7   # accept rate at/above this -> raise sensitivity
REJECT_THRESHOLD = 0.3   # accept rate at/below this -> lower sensitivity
DECAY = 0.95             # weight kept by each earlier decision when a new one arrives
REVERSAL_LIMIT = 0.5     # share of repeated decisions that are reversals before a batch is distrusted


def _default_state() -> dict:
    now = now_iso()
    return {
        "_id": _STATE_ID,
        "contamination": settings.OUTLIER_CONTAMINATION,
        "default_contamination": settings.OUTLIER_CONTAMINATION,
        "min": CONTAMINATION_MIN,
        "max": CONTAMINATION_MAX,
        "step": ADJUST_STEP,
        "batch_size": BATCH_SIZE,
        "accept_threshold": ACCEPT_THRESHOLD,
        "reject_threshold": REJECT_THRESHOLD,
        "decay": DECAY,
        "weighted_accepted": 0.0,
        "weighted_rejected": 0.0,
        "batch_repeats": 0,
        "batch_reversals": 0,
        "total_reversals": 0,
        "held_batches": 0,
        "total_outlier_decisions": 0,
        "accepted_outlier_decisions": 0,
        "rejected_outlier_decisions": 0,
        "decisions_since_last_adjustment": 0,
        "history": [],  # [{"at", "from", "to", "reason", "accept_rate"}]
        "created_at": now,
        "updated_at": now,
    }


def get_adaptive_state() -> dict:
    doc = adaptive_state_collection.find_one({"_id": _STATE_ID})
    if not doc:
        doc = _default_state()
        adaptive_state_collection.insert_one(doc)
    else:
        # states stored by an earlier version miss the newer fields
        for k, v in _default_state().items():
            doc.setdefault(k, v)
    return doc


_CONFIG_RULES = {
    "step": (0.0005, 0.05),
    "batch_size": (1, 100),
    "decay": (0.5, 1.0),
    "min": (0.001, 0.5),
    "max": (0.001, 0.5),
    "accept_threshold": (0.5, 0.99),
    "reject_threshold": (0.01, 0.5),
}


def update_config(changes: dict) -> dict:
    """Changes the adaptive loop's settings. Unknown keys and values outside
    the allowed ranges are rejected with ValueError, so the loop can never
    be configured into an unsafe or meaningless state."""
    state = get_adaptive_state()
    new = {}
    for key, value in changes.items():
        if value is None:
            continue
        if key not in _CONFIG_RULES:
            raise ValueError(f"'{key}' cannot be configured")
        lo, hi = _CONFIG_RULES[key]
        if not (lo <= value <= hi):
            raise ValueError(f"'{key}' must be between {lo} and {hi}")
        new[key] = int(value) if key == "batch_size" else float(value)
    merged = {**state, **new}
    if merged["min"] >= merged["max"]:
        raise ValueError("'min' must be smaller than 'max'")
    if merged["reject_threshold"] >= merged["accept_threshold"]:
        raise ValueError("'reject_threshold' must be smaller than 'accept_threshold'")
    state.update(new)
    state["contamination"] = round(min(state["max"], max(state["min"], state["contamination"])), 4)
    state["updated_at"] = now_iso()
    adaptive_state_collection.replace_one({"_id": _STATE_ID}, state, upsert=True)
    return state


def current_contamination() -> float:
    """What analyze_dataset() should use right now for LOF's contamination
    parameter, unless the caller explicitly overrides it."""
    return get_adaptive_state()["contamination"]


def reset_adaptive_state() -> dict:
    """Wipes the adaptive state and feedback history back to the
    out-of-the-box default. Used by the "Reset sensitivity" control in
    the UI, and by tests that need a clean slate."""
    adaptive_state_collection.delete_one({"_id": _STATE_ID})
    feedback_events_collection.delete_many({})
    return get_adaptive_state()


def record_feedback(dataset_id: str, issue_type: str, issue_id: str, accepted: bool,
                    column: str | None = None, row_index: int | None = None) -> dict:
    """Logs one reviewer decision. Returns the current adaptive state
    (updated, if this decision triggered an adjustment).

    `column` and `row_index` identify the flagged cell, so that a later
    decision on the same cell can be compared with this one."""
    cell_key = f"{dataset_id}|{column}|{row_index}" if column is not None and row_index is not None else None
    previous = None
    if cell_key and issue_type == "outlier":
        earlier = list(feedback_events_collection.find({"cell_key": cell_key}))
        if earlier:
            previous = sorted(earlier, key=lambda e: e["at"])[-1]

    feedback_events_collection.insert_one({
        "dataset_id": dataset_id,
        "issue_type": issue_type,
        "issue_id": issue_id,
        "cell_key": cell_key,
        "accepted": bool(accepted),
        "at": now_iso(),
    })

    if issue_type != "outlier":
        return get_adaptive_state()

    state = get_adaptive_state()
    if previous is not None:
        state["batch_repeats"] += 1
        if bool(previous["accepted"]) != bool(accepted):
            state["batch_reversals"] += 1
            state["total_reversals"] += 1
    decay = state["decay"]
    state["weighted_accepted"] = state["weighted_accepted"] * decay + (1.0 if accepted else 0.0)
    state["weighted_rejected"] = state["weighted_rejected"] * decay + (0.0 if accepted else 1.0)
    state["total_outlier_decisions"] += 1
    if accepted:
        state["accepted_outlier_decisions"] += 1
    else:
        state["rejected_outlier_decisions"] += 1
    state["decisions_since_last_adjustment"] += 1

    if state["decisions_since_last_adjustment"] >= state["batch_size"]:
        state = _maybe_adjust(state)

    state["updated_at"] = now_iso()
    adaptive_state_collection.replace_one({"_id": _STATE_ID}, state, upsert=True)
    return state


def _recent_accept_rate(state: dict) -> float:
    total = state["weighted_accepted"] + state["weighted_rejected"]
    return state["weighted_accepted"] / total if total else 0.5


def _maybe_adjust(state: dict) -> dict:
    accept_rate = _recent_accept_rate(state)

    old = state["contamination"]
    new = old

    repeats, reversals = state["batch_repeats"], state["batch_reversals"]
    unreliable = repeats >= 2 and reversals / repeats > REVERSAL_LIMIT
    state["batch_repeats"] = 0
    state["batch_reversals"] = 0

    if unreliable:
        state["held_batches"] += 1
        state["decisions_since_last_adjustment"] = 0
        state["history"].append({
            "at": now_iso(), "from": old, "to": old,
            "reason": (f"held: {reversals} of {repeats} repeated decisions reversed an earlier "
                       f"decision on the same cell, so this batch is not trusted"),
            "accept_rate": round(accept_rate, 2),
        })
        state["history"] = state["history"][-20:]
        return state

    if accept_rate >= state["accept_threshold"]:
        new = min(state["max"], round(old + state["step"], 4))
        reason = (
            f"recent accept rate {accept_rate:.0%} — reviewers are mostly confirming "
            f"flagged outliers, raising sensitivity slightly"
        )
    elif accept_rate <= state["reject_threshold"]:
        new = max(state["min"], round(old - state["step"], 4))
        reason = (
            f"recent accept rate {accept_rate:.0%} — reviewers are mostly rejecting "
            f"flagged outliers, lowering sensitivity slightly"
        )
    else:
        reason = f"accept rate {accept_rate:.0%} so far — too close to neutral to act on, no change"

    if new != old:
        state["contamination"] = new
        state["history"].append({
            "at": now_iso(),
            "from": old,
            "to": new,
            "reason": reason,
            "accept_rate": round(accept_rate, 2),
        })
        state["history"] = state["history"][-20:]  # keep the last 20 adjustments only

    state["decisions_since_last_adjustment"] = 0
    return state
