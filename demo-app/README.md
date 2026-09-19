# SlopGuard demo victim app (sandbox only)

Intentionally vulnerable FastAPI service used by SlopGuard scanners and Red Team harnesses.

## Seeds

| Threat | Where |
|--------|--------|
| SQL injection | `GET /search?q=` → string-concat SQL in `app/db.py` |
| Missing auth | `GET /admin/users` — no auth check |
| Hardcoded secret | `app/config.py` → demo `API_KEY` seed (Stripe-like live key format) |

## Run locally

```bash
cd demo-app
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Run with Docker

From repo root:

```bash
docker compose up --build demo-app
```

Then:

```bash
curl -s http://localhost:8000/health
curl -s 'http://localhost:8000/search?q=Alice'
curl -s "http://localhost:8000/search?q=%25'%20OR%20'1'%3D'1"
curl -s http://localhost:8000/admin/users
```

## Tests

```bash
cd demo-app && pip install -r requirements.txt && pytest -q
```
