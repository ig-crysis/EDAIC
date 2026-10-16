import os
os.environ["USE_MOCK_DB"] = "true"  # ensure tests never touch a real MongoDB

import io
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

SAMPLE_CSV = b"""id,name,age,city
1,Alice,25,Chicago
2,alice,25,chicago
3,Bob,30,Boston
4,Bob,30,Boston
5,Carol,,Denver
"""


def test_health_check():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_upload_rejects_bad_extension():
    resp = client.post(
        "/api/datasets/upload",
        files={"file": ("data.txt", io.BytesIO(b"hello"), "text/plain")},
    )
    assert resp.status_code == 400


def test_upload_rejects_empty_file():
    resp = client.post(
        "/api/datasets/upload",
        files={"file": ("data.csv", io.BytesIO(b""), "text/csv")},
    )
    assert resp.status_code == 400


def test_full_flow_upload_analyze_clean_download():
    # 1. Upload
    resp = client.post(
        "/api/datasets/upload",
        files={"file": ("dirty.csv", io.BytesIO(SAMPLE_CSV), "text/csv")},
    )
    assert resp.status_code == 200
    dataset_id = resp.json()["dataset_id"]
    assert resp.json()["n_rows"] == 5

    # 2. Analyze
    resp = client.post(f"/api/datasets/{dataset_id}/analyze")
    assert resp.status_code == 200
    body = resp.json()
    assert body["n_rows"] == 5
    assert len(body["issues"]) > 0
    assert "overall_score" in body["quality_score"] or "overall_score" in body["quality_score"]

    # 3. Dashboard
    resp = client.get(f"/api/datasets/{dataset_id}/dashboard")
    assert resp.status_code == 200
    assert resp.json()["total_issues"] == len(body["issues"])

    # 4. Clean (accept everything)
    resp = client.post(f"/api/datasets/{dataset_id}/clean", json={"dataset_id": dataset_id})
    assert resp.status_code == 200
    clean_body = resp.json()
    assert clean_body["n_changes_applied"] > 0

    # 5. Download cleaned file
    resp = client.get(f"/api/datasets/{dataset_id}/download")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    assert b"alice" in resp.content.lower()  # casing may be normalized during cleaning


def test_analyze_nonexistent_dataset_404():
    resp = client.post("/api/datasets/does-not-exist/analyze")
    assert resp.status_code == 404


def test_clean_before_analyze_returns_400():
    resp = client.post(
        "/api/datasets/upload",
        files={"file": ("d.csv", io.BytesIO(SAMPLE_CSV), "text/csv")},
    )
    dataset_id = resp.json()["dataset_id"]
    resp = client.post(f"/api/datasets/{dataset_id}/clean", json={"dataset_id": dataset_id})
    assert resp.status_code == 400


def test_preview_original_and_cleaned():
    resp = client.post(
        "/api/datasets/upload",
        files={"file": ("d.csv", io.BytesIO(SAMPLE_CSV), "text/csv")},
    )
    dataset_id = resp.json()["dataset_id"]

    # Original preview works right after upload, before analyze/clean
    resp = client.get(f"/api/datasets/{dataset_id}/preview?rows=3")
    assert resp.status_code == 200
    body = resp.json()
    assert body["columns"] == ["id", "name", "age", "city"]
    assert len(body["rows"]) == 3
    assert body["total_rows"] == 5

    # Cleaned preview 404s before cleaning has run
    resp = client.get(f"/api/datasets/{dataset_id}/preview?cleaned=true")
    assert resp.status_code == 404

    client.post(f"/api/datasets/{dataset_id}/analyze")
    client.post(f"/api/datasets/{dataset_id}/clean", json={"dataset_id": dataset_id})

    resp = client.get(f"/api/datasets/{dataset_id}/preview?cleaned=true")
    assert resp.status_code == 200
    assert resp.json()["total_rows"] <= 5  # duplicate row(s) may have been removed


def test_preview_rows_param_is_bounded():
    resp = client.post(
        "/api/datasets/upload",
        files={"file": ("d.csv", io.BytesIO(SAMPLE_CSV), "text/csv")},
    )
    dataset_id = resp.json()["dataset_id"]
    resp = client.get(f"/api/datasets/{dataset_id}/preview?rows=9999")
    assert resp.status_code == 200
    assert resp.json()["showing"] <= 5  # capped by actual row count, never over-reads


def test_preview_start_offset_jumps_to_correct_row():
    resp = client.post(
        "/api/datasets/upload",
        files={"file": ("d.csv", io.BytesIO(SAMPLE_CSV), "text/csv")},
    )
    dataset_id = resp.json()["dataset_id"]

    # SAMPLE_CSV has 5 rows (ids 1-5, names Alice/alice/Bob/Bob/Carol).
    # Jumping to start=3 should land on the 4th row (0-indexed), i.e. id=4.
    resp = client.get(f"/api/datasets/{dataset_id}/preview?rows=2&start=3")
    assert resp.status_code == 200
    body = resp.json()
    assert body["start"] == 3
    assert body["rows"][0]["id"] == 4
    assert body["rows"][0]["_row_index"] == 3


def test_adaptive_state_endpoint_has_defaults():
    client.post("/api/adaptive/reset")
    resp = client.get("/api/adaptive/state")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_outlier_decisions"] == 0
    assert body["min"] <= body["contamination"] <= body["max"]
    assert body["history"] == []


def test_clean_route_logs_outlier_feedback_and_reset_clears_it():
    client.post("/api/adaptive/reset")

    # A dataset that reliably produces an outlier issue.
    df_csv = b"value\n" + b"\n".join(str(v).encode() for v in [10, 11, 9, 12, 10, 11, 9, 10, 500])
    resp = client.post(
        "/api/datasets/upload",
        files={"file": ("outliers.csv", io.BytesIO(df_csv), "text/csv")},
    )
    dataset_id = resp.json()["dataset_id"]

    resp = client.post(f"/api/datasets/{dataset_id}/analyze")
    issues = resp.json()["issues"]
    outlier_issues = [i for i in issues if i["issue_type"] == "outlier"]

    if outlier_issues:
        accepted_ids = [i["issue_id"] for i in issues if i["issue_type"] != "outlier"]
        accepted_ids += [i["issue_id"] for i in outlier_issues]
        client.post(
            f"/api/datasets/{dataset_id}/clean",
            json={"dataset_id": dataset_id, "accepted_issue_ids": accepted_ids},
        )
        state = client.get("/api/adaptive/state").json()
        assert state["total_outlier_decisions"] >= 1
        assert state["accepted_outlier_decisions"] >= 1

    resp = client.post("/api/adaptive/reset")
    assert resp.status_code == 200
    assert resp.json()["total_outlier_decisions"] == 0


def test_preview_start_past_end_clamps_to_last_page():
    resp = client.post(
        "/api/datasets/upload",
        files={"file": ("d.csv", io.BytesIO(SAMPLE_CSV), "text/csv")},
    )
    dataset_id = resp.json()["dataset_id"]

    # Requesting a start way past the end of a 5-row file should NOT
    # return an empty page — it should clamp to the last available page.
    resp = client.get(f"/api/datasets/{dataset_id}/preview?rows=2&start=9999")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["rows"]) > 0
    assert body["start"] < 5


def test_question_mark_missing_marker_does_not_crash():
    """UCI-style CSVs use '?' for missing values; must analyze, not 500."""
    csv = "a,b,c\n" + "\n".join(f"{i},{i*2 if i%7 else '?'},x" for i in range(40))
    r = client.post("/api/datasets/upload", files={"file": ("q.csv", csv, "text/csv")})
    assert r.status_code == 200
    did = r.json()["dataset_id"]
    assert client.post(f"/api/datasets/{did}/analyze").status_code == 200


def test_adaptive_config_endpoint_accepts_valid_and_rejects_invalid():
    client.post("/api/adaptive/reset")
    ok = client.post("/api/adaptive/config", json={"step": 0.01, "batch_size": 3})
    assert ok.status_code == 200 and ok.json()["step"] == 0.01 and ok.json()["batch_size"] == 3
    bad = client.post("/api/adaptive/config", json={"step": 0.9})
    assert bad.status_code == 400
    client.post("/api/adaptive/reset")


def test_rules_endpoint_stores_rules_and_analysis_uses_them():
    csv = "id,score\n" + "\n".join(f"{i},{50+i%5}" for i in range(1, 20)) + "\n20,500\n"
    up = client.post("/api/datasets/upload", files={"file": ("r.csv", csv, "text/csv")})
    ds = up.json()["dataset_id"]
    bad = client.put(f"/api/datasets/{ds}/rules", json={"rules": [{"column": "score"}]})
    assert bad.status_code == 400
    ok = client.put(f"/api/datasets/{ds}/rules", json={"rules": [{"column": "score", "min": 0, "max": 100}]})
    assert ok.status_code == 200
    res = client.post(f"/api/datasets/{ds}/analyze").json()
    assert any(i["issue_type"] == "range_violation" and i["row_index"] == 19 for i in res["issues"])
