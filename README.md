# Explainable AI for Data Cleaning

An end-to-end web application that uses AI/ML to detect and clean dirty
datasets — while explaining **why** every cleaning decision was made.

Built for an MCA capstone project (Adaptive Data Quality Intelligence).

---

## 1. What it does

Upload a messy CSV/Excel file and the app will:

1. **Detect** data-quality issues in four main categories (plus three
   specialised checks):
   - Missing values (with a statistically justified fill suggestion);
     columns that are more than 90% empty are reported once as a
     *sparse column* (drop or keep) instead of being filled cell by cell
   - Exact and near-duplicate rows (fuzzy matching on names; e-mail and
     code-like columns are skipped because near-identical values there are
     different entities, not typos)
   - Statistical outliers (Local Outlier Factor on numeric columns, row
     identifiers excluded, explained with SHAP)
   - Inconsistent formatting (mixed casing, date formats, numeric-as-text)
   - Rare categories in low-cardinality text columns (likely typos)
   - Date anomalies (dates far outside the usual range, before 1900 or in the future)
   - Invalid formats in e-mail columns (and phone columns, recognised by name)
   - Impossible values (age outside 0-120; negative price, salary, quantity or count)
     and **user-defined rules** per dataset (min/max, allowed values, regex)
   - Temporal spikes: in time-ordered data, a value far from its neighbouring rows
2. **Explain** every single suggestion in plain English — not just "this is
   an outlier" but *which columns drove that decision and by how much*.
3. **Score** the dataset across four quality dimensions (completeness,
   uniqueness, validity, consistency) plus one overall score.
4. Let you **accept/reject individual suggestions**, then apply cleaning.
5. Show a **before/after comparison** of the quality score.
6. Let you **download** the cleaned dataset as CSV.

---

## 2. Architecture

```
┌──────────────┐      REST/JSON      ┌───────────────────┐      ┌─────────────┐
│   React SPA   │ ──────────────────▶ │   FastAPI backend  │ ───▶ │  MongoDB    │
│ (Vite, ADQI UI) │ ◀────────────────  │ (Python, sklearn,  │      │ (metadata,  │
│  plain CSS bars │                    │  pandas, SHAP)     │      │  run history)│
└──────────────┘                      └─────────┬──────────┘      └─────────────┘
                                                 │
                                        ┌────────▼─────────┐
                                        │  Local file store  │
                                        │ (uploads/cleaned)  │
                                        └────────────────────┘
```

- **Frontend (React + Vite)**: the same UI as the ADQI project — landing page,
  Pipeline and Explainability explainer pages, and a dashboard with Upload,
  Profile, Review, Admin and Export screens (hash-routed, so every header
  link is always clickable; screens that need data say so instead of being
  disabled). Talks to the backend purely over REST.
- **Backend (FastAPI)**: stateless request handlers that call into a
  `services/` layer containing all the ML/rule-based detectors. Uploaded
  files are stored on disk; dataset **metadata** (filename, row/column
  counts, last analysis result, cleaning run history) is stored in
  **MongoDB** so a dataset's state survives backend restarts.
- **Database (MongoDB)**: two collections — `datasets` (one doc per
  uploaded dataset, including its most recent analysis) and
  `cleaning_runs` (an audit trail of every cleaning operation, with
  before/after scores).

### Why this split?

The ML pipeline is CPU-bound and stateless per request, so it's implemented
as plain Python functions in `app/services/`, independent of both the web
framework and the database. This makes each detector unit-testable in
isolation (see `backend/tests/test_services.py`) without needing a running
server or database at all.

---

## 3. Folder structure

```
edaic/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app, CORS, routers, /health
│   │   ├── config.py                # env-driven settings
│   │   ├── database.py              # MongoDB / mongomock connection
│   │   ├── models/schemas.py        # Pydantic request/response models
│   │   ├── services/
│   │   │   ├── missing_values.py    # missing-value detection + imputation
│   │   │   ├── duplicates.py        # exact + fuzzy duplicate detection
│   │   │   ├── outliers.py          # Local Outlier Factor + SHAP explanations
│   │   │   ├── inconsistencies.py   # rule-based formatting checks
│   │   │   ├── categorical_dates.py # rare categories + date-range anomalies
│   │   │   ├── rules.py             # pattern, range and user-defined rule checks
│   │   │   ├── temporal.py          # rolling-window spikes in time-ordered data
│   │   │   ├── preprocessing.py     # numeric view of numbers stored as text
│   │   │   ├── adaptive.py          # feedback loop (decay, reversal check, config)
│   │   │   ├── quality_score.py     # composite quality score
│   │   │   └── cleaning.py          # orchestrator: analyze_dataset() / apply_cleaning()
│   │   ├── api/routes/
│   │   │   ├── upload.py            # POST /api/datasets/upload
│   │   │   ├── analyze.py           # POST /api/datasets/{id}/analyze
│   │   │   ├── clean.py             # POST /api/datasets/{id}/clean
│   │   │   ├── download.py          # GET  /api/datasets/{id}/download
│   │   │   ├── dashboard.py         # GET  /api/datasets/{id}/dashboard
│   │   │   ├── preview.py           # GET  /api/datasets/{id}/preview
│   │   │   ├── adaptive.py          # GET/POST /api/adaptive/state, /reset, /config
│   │   │   └── rules.py             # GET/PUT /api/datasets/{id}/rules
│   │   └── utils/file_handling.py   # upload validation, CSV/Excel I/O
│   ├── tests/                       # pytest suite (66 tests)
│   ├── sample_data/dirty_customers.csv
│   ├── requirements.txt
│   ├── .env.example
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── api/client.js            # axios wrapper for all backend calls
│   │   ├── pages/
│   │   │   ├── Landing.jsx          # home: video background, stats, CTA
│   │   │   ├── Pipeline.jsx         # long-form explainer (1 of 2)
│   │   │   ├── Explainability.jsx   # long-form explainer (2 of 2)
│   │   │   ├── UploadScreen.jsx     # dashboard: upload + column types + preview
│   │   │   ├── ProfileScreen.jsx    # dashboard: quality scores, column profile, charts
│   │   │   ├── ReviewScreen.jsx     # dashboard: accept/reject issues, apply cleaning
│   │   │   ├── ExportScreen.jsx     # dashboard: before/after, download
│   │   │   └── AdminScreen.jsx      # adaptive sensitivity monitor
│   │   ├── components/              # AppHeader, Screen, UploadPanel, IssueList,
│   │   │                            # DataPreviewTable, ColumnProfileTable,
│   │   │                            # BeforeAfterComparison, BarChart, SkipLink
│   │   ├── styles/                  # ported from ADQI: site.css (tokens + landing),
│   │   │                            # shell.css (dashboard), content.css, edaic.css
│   │   ├── utils/exportReport.js    # issue report (CSV) download
│   │   ├── session.js               # dataset/analysis/decisions state, lives above the router
│   │   ├── router.js                # hash router (#/pipeline, #/app/review, ...)
│   │   └── App.jsx                  # route -> page, landing/dashboard body mode
│   ├── package.json
│   ├── .env.example
│   ├── nginx.conf
│   └── Dockerfile
└── docker-compose.yml               # mongo + backend + frontend, one command
```

---

## 4. How to run it

### Option A — Docker Compose (simplest, one command)

Requires Docker + Docker Compose installed.

```bash
cd edaic
docker compose up --build
```

Then open:
- Frontend: http://localhost:5173
- Backend API docs (Swagger): http://localhost:8000/docs

This runs a real MongoDB container automatically — no extra setup needed.

### Option B — Run locally without Docker

**Backend:**

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# By default USE_MOCK_DB=true in .env.example, so it runs with an
# in-memory database and needs NO real MongoDB installed — perfect
# for a quick demo. Set USE_MOCK_DB=false and MONGO_URI to use real Mongo.

uvicorn app.main:app --reload --port 8000
```

Backend now running at http://localhost:8000 (interactive docs at `/docs`).

**Frontend** (in a second terminal):

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Frontend now running at http://localhost:5173.

### Running the test suite

```bash
cd backend
source venv/bin/activate
pytest tests/ -v
```

All 66 tests should pass (51 service-level unit tests + 15 API integration
tests using FastAPI's TestClient, run against the in-memory mock database).

---

## 5. Environment variables

**Backend (`backend/.env`)**

| Variable | Default | Description |
|---|---|---|
| `ENV` | `development` | environment name |
| `DEBUG` | `true` | debug flag |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://localhost:3000` | CORS allow-list |
| `MONGO_URI` | `mongodb://localhost:27017` | MongoDB connection string |
| `MONGO_DB_NAME` | `edaic_db` | database name |
| `USE_MOCK_DB` | `false` | `true` = run with in-memory mongomock, no real MongoDB needed |
| `MAX_UPLOAD_SIZE_MB` | `25` | max upload size |
| `OUTLIER_CONTAMINATION` | `0.05` | expected outlier proportion for Local Outlier Factor |
| `RANDOM_STATE` | `42` | seed for reproducibility |

**Frontend (`frontend/.env`)**

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000` | backend base URL |

---

## 6. How the ML pipeline works

Each detector in `app/services/` is independent and returns a list of
**Issue** objects (`issue_type`, `column`, `row_index`, `severity`,
`original_value`, `suggested_value`, `explanation`, `detected_by`,
`confidence`), so the frontend renders every fix category the same way.

- **Missing values** — for each column, chooses mean (symmetric numeric
  columns), median (skewed numeric columns, robust to outliers), or mode
  (categorical/text columns), and reports *why* that statistic was picked.
- **Duplicates** — exact row hashing catches full duplicates; a
  similarity-ratio pass (`difflib.SequenceMatcher`) on the most
  identity-like text column catches near-duplicates (typos, spacing).
- **Outliers** — a **Local Outlier Factor (LOF)** model is fit on all
  numeric columns. Unlike distance-from-center methods, LOF flags a point
  based on how much *less dense* its local neighborhood is compared to
  its neighbors' neighborhoods — so it can catch outliers that are only
  unusual within a specific local cluster, not just extreme values overall.
  Flagged points are explained using **SHAP**, which attributes the
  anomaly score to individual columns — so instead of "row 14 is weird"
  you get "row 14 is weird mainly because of `age` (2.5σ from the mean)".
  If SHAP can't compute in time, a z-score fallback still produces a
  useful (if less precise) explanation, so the pipeline never breaks.
- **Inconsistent values** — rule-based checks for: casing/whitespace
  variants of the same category, mixed date formats within one column,
  and numeric values contaminated with units/commas/symbols.
- **Quality score** — a weighted composite (`0.35×completeness +
  0.20×uniqueness + 0.25×validity + 0.20×consistency`), each dimension
  computed directly from the detected issues.

## 7. How the Explainable AI (XAI) component works

The explainability layer has two tiers:

1. **Rule-based explanations** (missing values, duplicates, inconsistencies)
   are inherently interpretable — the suggestion *is* the reasoning
   ("median used because the column is skewed").
2. **Model-based explanations** (outliers) use **SHAP** (SHapley Additive
   exPlanations), a game-theoretic method that attributes the Local
   Outlier Factor model's anomaly score to individual input features for
   a *specific* row. This answers "why is this row anomalous?" rather than just "is
   this row anomalous?" — the core requirement of an explainable, rather
   than black-box, cleaning system.

Every issue also carries a `confidence` score and a `detected_by` field
naming the exact method used, so the audit trail is transparent end-to-end.

---

## 8. Demonstrating it to your project guide

1. Start with the **sample dataset** at `backend/sample_data/dirty_customers.csv`
   — it's deliberately seeded with one of each issue type.
2. Upload it and let the analysis run. Point out the **quality score
   breakdown** (completeness/uniqueness/validity/consistency) before
   touching anything.
3. Expand a few issues in the list and read the explanation aloud — this
   is the "explainable" part of the pitch. The outlier explanation
   naming specific SHAP-driven columns is the strongest talking point.
4. Reject one suggestion (to show human-in-the-loop control), accept the
   rest, and click **Apply cleaning**.
5. Show the **before/after** score comparison — this is your quantified
   proof that the pipeline improved data quality.
6. Download the cleaned CSV and open it to show the actual changes.
7. If asked about scalability/production-readiness: mention the
   MongoDB audit trail (`cleaning_runs` collection) that logs every
   cleaning operation, and the Docker Compose setup that containerizes
   the whole stack for deployment.

---

## 9. Notes on design choices worth mentioning in review

- **Human-in-the-loop by design**: nothing is silently overwritten —
  every fix is a *suggestion* the user can accept or reject individually
  before it's applied, which directly maps to the "adaptive... with
  feedback loop" framing of the project.
- **mongomock fallback**: lets the whole app run and be graded without
  requiring the examiner to install MongoDB — a practical concession
  for an academic demo, clearly documented so it isn't mistaken for
  hiding a missing integration.
- **SHAP has a fallback**: because SHAP's `KernelExplainer`-style
  computation can be slow or fail on some data shapes, a z-score-based
  explanation is substituted automatically rather than crashing — a
  small but real reliability/robustness decision worth calling out.


---

## 10. Adaptive feedback loop and its API

Accept/reject decisions on **outlier** issues adjust LOF's `contamination`
(sensitivity) within bounds. Recent decisions weigh more than old ones
(`decay`, default 0.95), and a batch in which the reviewer reverses earlier
decisions on the same cell is held instead of applied.

| Endpoint | Purpose |
|---|---|
| `GET /api/adaptive/state` | current sensitivity, counts, recent accept rate, reversals, history |
| `POST /api/adaptive/reset` | back to defaults |
| `POST /api/adaptive/config` | change `step`, `batch_size`, `decay`, `min`, `max`, `accept_threshold`, `reject_threshold` (validated; 400 on invalid values) |

Known limitations: a consistently biased reviewer is not detected; free-text
columns get no anomaly check; the quality-score weights are heuristic.

## 11. User-defined rules

```
PUT /api/datasets/{id}/rules
{"rules": [{"column": "score", "min": 0, "max": 100},
           {"column": "tier", "allowed": ["gold", "silver"]},
           {"column": "code", "regex": "[A-Z]-\\d"}]}
```
Rules are stored with the dataset and applied on every analysis. A rule with no
condition, min above max, or an invalid regex returns 400. Violations are only
flagged (`range_violation`, `pattern_violation`) and never changed automatically.
`GET /api/datasets/{id}/rules` returns the stored rules.
