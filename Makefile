# SlopGuard Makefile — Red Team prove targets (Step 4)

REPO_ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
BASE_URL ?= http://127.0.0.1:8000
RUN_ID ?= $(shell date -u +%Y%m%dT%H%M%SZ)
ARTIFACTS := $(REPO_ROOT)/artifacts/$(RUN_ID)
PYTHON ?= python3

.PHONY: prove prove-offline prove-sqli prove-auth health-wait demo-up demo-down

## Start demo-app via Docker Compose
demo-up:
	docker compose -f "$(REPO_ROOT)/docker-compose.yml" up --build -d demo-app

demo-down:
	docker compose -f "$(REPO_ROOT)/docker-compose.yml" down

health-wait:
	@echo "Waiting for $(BASE_URL)/health ..."
	@"$(PYTHON)" -c "import sys; sys.path.insert(0, r'$(REPO_ROOT)/harnesses'); from common import wait_for_health; \
	ok=wait_for_health('$(BASE_URL)', attempts=40, delay=0.5); \
	print('healthy' if ok else 'unhealthy'); sys.exit(0 if ok else 1)"

## Docker path: bring up sandbox, run both harnesses, write evidence
prove: demo-up health-wait
	@mkdir -p "$(ARTIFACTS)"
	"$(PYTHON)" "$(REPO_ROOT)/harnesses/sqli_http.py" --base-url "$(BASE_URL)" --repo-root "$(REPO_ROOT)" --run-id "$(RUN_ID)" --out "$(ARTIFACTS)/sqli_http.json"
	"$(PYTHON)" "$(REPO_ROOT)/harnesses/unauth_get.py" --base-url "$(BASE_URL)" --repo-root "$(REPO_ROOT)" --run-id "$(RUN_ID)" --out "$(ARTIFACTS)/unauth_get.json"
	@echo "Evidence written under $(ARTIFACTS)"

## Offline path: requires an already-running demo-app (uvicorn or prior compose)
prove-offline: health-wait
	@mkdir -p "$(ARTIFACTS)"
	"$(PYTHON)" "$(REPO_ROOT)/harnesses/sqli_http.py" --base-url "$(BASE_URL)" --repo-root "$(REPO_ROOT)" --run-id "$(RUN_ID)" --out "$(ARTIFACTS)/sqli_http.json"
	"$(PYTHON)" "$(REPO_ROOT)/harnesses/unauth_get.py" --base-url "$(BASE_URL)" --repo-root "$(REPO_ROOT)" --run-id "$(RUN_ID)" --out "$(ARTIFACTS)/unauth_get.json"
	@echo "Evidence written under $(ARTIFACTS)"

prove-sqli:
	"$(PYTHON)" "$(REPO_ROOT)/harnesses/sqli_http.py" --base-url "$(BASE_URL)" --repo-root "$(REPO_ROOT)" --run-id "$(RUN_ID)"

prove-auth:
	"$(PYTHON)" "$(REPO_ROOT)/harnesses/unauth_get.py" --base-url "$(BASE_URL)" --repo-root "$(REPO_ROOT)" --run-id "$(RUN_ID)"
