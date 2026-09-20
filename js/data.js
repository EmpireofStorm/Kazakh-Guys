/* Tallybird — mocked B2B project-management company graph. No exploit payloads. */
(function (root) {
  const COMPANY = {
    name: "Tallybird",
    product: "project-management",
    url: "tallybird.app/projects/12/tasks",
    tasks: ["Design landing page", "Fix login bug", "Set up billing webhook"],
    tagline: "18 services, no dedicated security team",
  };

  const CATEGORIES = [
    { id: "sqli", label: "SQL Injection" },
    { id: "xss", label: "Cross-Site Scripting" },
    { id: "idor", label: "Broken Access Control (IDOR)" },
    { id: "authz", label: "Authentication Bypass" },
    { id: "ssrf", label: "Server-Side Request Forgery" },
    { id: "deser", label: "Insecure Deserialization" },
    { id: "cve", label: "Dependency / Known-CVE Scan" },
    { id: "secret", label: "Hardcoded Secrets" },
  ];

  const MODULES = [
    { id: "api-gateway", name: "api-gateway", layer: "svc", filePath: ["gateway/router.py"], dependsOn: ["auth-service", "user-service", "task-service", "billing-service", "search-service", "ci-cd-pipeline"], x: -120, y: 0, z: 60 },
    { id: "web-app", name: "web-app", layer: "edge", filePath: ["src/components/CommentThread.jsx"], dependsOn: ["api-gateway"], x: -260, y: 90, z: 40 },
    { id: "mobile-bff", name: "mobile-bff", layer: "edge", filePath: ["mobile/bff.py"], dependsOn: ["api-gateway"], x: -260, y: -90, z: -30 },
    { id: "auth-service", name: "auth-service", layer: "core", filePath: ["auth/tokens.py"], dependsOn: ["users-db", "redis-cache", "ci-cd-pipeline"], x: 10, y: 130, z: 90 },
    { id: "user-service", name: "user-service", layer: "core", filePath: ["users/profile.py"], dependsOn: ["users-db"], x: 10, y: 60, z: -100 },
    { id: "task-service", name: "task-service", layer: "core", filePath: ["tasks/search.py"], dependsOn: ["tasks-db", "search-service", "file-upload-service", "notification-service", "webhook-service", "admin-dashboard"], x: 40, y: -20, z: 130 },
    { id: "billing-service", name: "billing-service", layer: "svc", filePath: ["billing/stripe_client.py"], dependsOn: ["users-db", "notification-service", "admin-dashboard", "ci-cd-pipeline"], x: 60, y: 150, z: -60 },
    { id: "notification-service", name: "notification-service", layer: "svc", filePath: ["notifications/sender.py"], dependsOn: ["background-worker"], x: 150, y: 40, z: 150 },
    { id: "file-upload-service", name: "file-upload-service", layer: "svc", filePath: ["uploads/handlers.py"], dependsOn: ["background-worker"], x: 120, y: -140, z: 40 },
    { id: "search-service", name: "search-service", layer: "svc", filePath: ["search/requirements.txt"], dependsOn: [], x: 170, y: -60, z: -140 },
    { id: "webhook-service", name: "webhook-service", layer: "svc", filePath: ["webhooks/dispatcher.py"], dependsOn: ["background-worker"], x: 200, y: 100, z: 20 },
    { id: "admin-dashboard", name: "admin-dashboard", layer: "edge", filePath: ["admin/routes.py"], dependsOn: ["users-db"], x: -40, y: 190, z: -20 },
    { id: "analytics-service", name: "analytics-service", layer: "svc", filePath: ["analytics/track.py"], dependsOn: ["tasks-db", "users-db"], x: 200, y: -180, z: 100 },
    { id: "users-db", name: "users-db", layer: "infra", filePath: ["users/schema.sql"], dependsOn: [], x: -10, y: 0, z: -220 },
    { id: "tasks-db", name: "tasks-db", layer: "infra", filePath: ["tasks/schema.sql"], dependsOn: [], x: 90, y: -30, z: 210 },
    { id: "redis-cache", name: "redis-cache", layer: "infra", filePath: ["cache/config.py"], dependsOn: [], x: -90, y: 100, z: -160 },
    { id: "background-worker", name: "background-worker", layer: "infra", filePath: ["worker/queue_consumer.py"], dependsOn: [], x: 220, y: -10, z: 170 },
    { id: "ci-cd-pipeline", name: "ci-cd-pipeline", layer: "infra", filePath: [".github/workflows/deploy.yml"], dependsOn: [], x: -180, y: -160, z: 100 },
  ];

  const FINDINGS = [
    { id: "F-AUTH-1", moduleId: "auth-service", attackCategory: "authz", severity: "critical", title: "Refresh tokens never expire and use a hardcoded signing secret", description: "Any refresh token issued is valid forever and could be forged if the secret ever leaked." },
    { id: "F-SEC-1", moduleId: "billing-service", attackCategory: "secret", severity: "critical", title: "Stripe live secret key hardcoded in the billing client", description: "The production Stripe key is committed directly in source, visible to anyone with repo access." },
    { id: "F-IDOR-1", moduleId: "file-upload-service", attackCategory: "idor", severity: "high", title: "Attachment download endpoint does not verify project access", description: "Any authenticated user can download any file by guessing or incrementing its ID." },
    { id: "F-SSRF-1", moduleId: "webhook-service", attackCategory: "ssrf", severity: "high", title: "Outbound webhook URLs are never validated", description: "A customer-configured webhook URL can target internal-network addresses." },
    { id: "F-SQL-1", moduleId: "task-service", attackCategory: "sqli", severity: "high", title: "Task search builds SQL via string concatenation", description: "A crafted search query could alter the SQL executed against the tasks database." },
    { id: "F-DESER-1", moduleId: "background-worker", attackCategory: "deser", severity: "medium", title: "Background jobs are deserialized with pickle before validation", description: "A malicious or corrupted queue message could execute arbitrary code when processed." },
    { id: "F-XSS-1", moduleId: "web-app", attackCategory: "xss", severity: "medium", title: "Task comments render raw HTML without sanitizing", description: "A comment body can inject a script that runs in every other viewer's browser." },
    { id: "F-CVE-1", moduleId: "search-service", attackCategory: "cve", severity: "medium", title: "Elasticsearch client pinned to a version with a known CVE", description: "The pinned 7.10.0 client has a published advisory. Upgrade only — no exploit content in this demo." },
  ];

  const TESTS = {
    "task-service": ["test_search_returns_matching_tasks", "test_search_blocks_sql_injection", "test_search_pagination_unaffected"],
    "web-app": ["test_comment_renders_plain_text", "test_comment_blocks_script_injection", "test_markdown_formatting_preserved"],
    "file-upload-service": ["test_owner_can_download", "test_non_owner_gets_403", "test_signed_url_still_expires"],
    "auth-service": ["test_login_issues_valid_token", "test_expired_token_rejected", "test_secret_loaded_from_env"],
    "webhook-service": ["test_webhook_delivers_to_public_url", "test_internal_ip_blocked", "test_retry_backoff_unaffected"],
    "background-worker": ["test_job_processes_valid_payload", "test_malformed_payload_rejected", "test_queue_throughput_unaffected"],
    "search-service": ["test_search_index_builds", "test_client_library_patched_version", "test_query_latency_unaffected"],
    "billing-service": ["test_subscription_created", "test_api_key_not_in_source", "test_webhook_signature_still_verifies"],
  };

  const STATE_KEY = "orbit-finding-state";
  const PR_KEY = "orbit-simulated-prs";

  function defaultStatus() {
    const map = {};
    FINDINGS.forEach((f) => {
      map[f.id] = { status: "open", prId: null, riskNote: null };
    });
    return map;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return defaultStatus();
      return Object.assign(defaultStatus(), JSON.parse(raw));
    } catch (e) {
      return defaultStatus();
    }
  }

  function saveState(state) {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  function nextOpenFinding(afterId) {
    let queue = [];
    try {
      queue = JSON.parse(sessionStorage.getItem("orbit-scan-queue") || "[]");
    } catch (e) {
      queue = [];
    }
    if (!queue.length) queue = FINDINGS.map(function (f) { return f.id; });
    const state = loadState();
    const done = { "pr-opened": true, resolved: true, skipped: true };
    function pick(from) {
      for (let i = from; i < queue.length; i++) {
        const id = queue[i];
        if (id === afterId) continue;
        const st = (state[id] || {}).status;
        if (!done[st]) return FINDINGS.find(function (f) { return f.id === id; }) || null;
      }
      return null;
    }
    const idx = Math.max(0, queue.indexOf(afterId));
    return pick(idx + 1) || pick(0);
  }

  function setFinding(id, patch) {
    const state = loadState();
    state[id] = Object.assign({}, state[id] || { status: "open" }, patch);
    saveState(state);
    return state[id];
  }

  function loadPrs() {
    try {
      return JSON.parse(localStorage.getItem(PR_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }

  function savePr(pr) {
    const all = loadPrs();
    all.unshift(pr);
    localStorage.setItem(PR_KEY, JSON.stringify(all));
    return pr;
  }

  function hydrateModules() {
    const byId = {};
    MODULES.forEach((m) => {
      m.dependents = [];
      m.findings = [];
      byId[m.id] = m;
    });
    MODULES.forEach((m) => {
      m.dependsOn.forEach((dep) => {
        if (byId[dep]) byId[dep].dependents.push(m.id);
      });
    });
    FINDINGS.forEach((f) => {
      if (byId[f.moduleId]) byId[f.moduleId].findings.push(f.id);
    });
    MODULES.forEach((m) => {
      const degree = m.dependsOn.length + m.dependents.length;
      m.criticalityScore = Math.min(1, 0.25 + degree / 12);
    });
    return { modules: MODULES, byId };
  }

  const hydrated = hydrateModules();

  root.OrbitData = {
    COMPANY,
    CATEGORIES,
    MODULES: hydrated.modules,
    BY_ID: hydrated.byId,
    FINDINGS,
    TESTS,
    loadState,
    setFinding,
    nextOpenFinding,
    loadPrs,
    savePr,
    resetDemo: function () {
      localStorage.removeItem(STATE_KEY);
      localStorage.removeItem(PR_KEY);
    },
  };
})(window);
