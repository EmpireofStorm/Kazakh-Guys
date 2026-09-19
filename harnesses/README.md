# Red Team harnesses (sandbox only)

These scripts prove **BREACHED vs SAFE** against the SlopGuard `demo-app`.
They must never be pointed at third-party systems.

| Harness | Threat | Breach condition |
|---------|--------|------------------|
| `sqli_http.py` | `sql_injection` | SQLi payload returns ≥3 users |
| `unauth_get.py` | `missing_auth` | `/admin/users` returns admin data with no auth |

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Predicate matched (default: BREACHED; with `--expect-closed`: SAFE) |
| 1 | Predicate not matched |
| 2 | App unreachable / infra error |

Evidence JSON is written under `artifacts/<run_id>/`.

## Offline (uvicorn already running)

```bash
# terminal 1
cd demo-app && uvicorn app.main:app --port 8000

# terminal 2
make prove-offline
```

## Docker

```bash
make prove
```
