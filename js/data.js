/* Shared mocked company graph + findings. No exploit payloads. */
(function (root) {
  const CATEGORIES = [
    { id: "sqli", label: "SQL injection" },
    { id: "xss", label: "Script injection" },
    { id: "idor", label: "Wrong user access" },
    { id: "authz", label: "Login bypass" },
    { id: "ssrf", label: "Server fetch abuse" },
    { id: "deser", label: "Unsafe object load" },
    { id: "cve", label: "Old libraries" },
    { id: "secret", label: "Secrets in code" },
  ];

  const MODULES = [
    {
      id: "web-app",
      name: "web-app",
      layer: "edge",
      filePath: ["apps/web/src/App.tsx", "apps/web/src/profile/ProfileForm.tsx"],
      dependsOn: ["api-gateway", "auth-service"],
    },
    {
      id: "onboarding-kit",
      name: "onboarding-kit",
      layer: "edge",
      filePath: ["apps/precedent/playbooks/new-hire.md", "apps/precedent/src/assign.ts"],
      dependsOn: ["user-service", "auth-service", "audit-log"],
    },
    {
      id: "api-gateway",
      name: "api-gateway",
      layer: "svc",
      filePath: ["services/gateway/src/router.ts", "services/gateway/src/rateLimit.ts"],
      dependsOn: ["auth-service", "user-service", "billing-svc", "region-config"],
    },
    {
      id: "billing-svc",
      name: "billing-svc",
      layer: "svc",
      filePath: ["services/billing/src/invoices.ts", "services/billing/src/access.ts"],
      dependsOn: ["postgres-core", "contracts-svc"],
    },
    {
      id: "contracts-svc",
      name: "contracts-svc",
      layer: "svc",
      filePath: ["services/contracts/src/redline.ts", "services/contracts/src/residency.ts"],
      dependsOn: ["region-config", "audit-log"],
    },
    {
      id: "auth-service",
      name: "auth-service",
      layer: "core",
      filePath: ["services/auth/src/session.ts", "services/auth/src/oidc.ts"],
      dependsOn: ["redis-session", "postgres-core"],
    },
    {
      id: "user-service",
      name: "user-service",
      layer: "core",
      filePath: ["services/users/src/lookup.ts", "services/users/src/profile.ts"],
      dependsOn: ["postgres-core", "audit-log", "region-config"],
    },
    {
      id: "audit-log",
      name: "audit-log",
      layer: "core",
      filePath: ["services/audit/src/append.ts"],
      dependsOn: ["postgres-core"],
    },
    {
      id: "region-config",
      name: "region-config",
      layer: "core",
      filePath: ["infra/region/config.yaml", "infra/region/residency.ts"],
      dependsOn: ["k8s-cluster"],
    },
    {
      id: "k8s-cluster",
      name: "k8s-cluster",
      layer: "infra",
      filePath: ["infra/k8s/cluster.yaml", "infra/k8s/secrets.env"],
      dependsOn: [],
    },
    {
      id: "postgres-core",
      name: "postgres-core",
      layer: "infra",
      filePath: ["infra/db/users.sql", "infra/db/migrations/"],
      dependsOn: [],
    },
    {
      id: "redis-session",
      name: "redis-session",
      layer: "infra",
      filePath: ["infra/redis/session.conf"],
      dependsOn: [],
    },
  ];

  const FINDINGS = [
    {
      id: "F-KZ-1",
      moduleId: "region-config",
      attackCategory: "secret",
      severity: "critical",
      title: "EU-pinned residency vs KZ localization",
      description:
        "region-config pins customer PII to eu-central-1. PolicyPulse flagged Law No. 94-VII (KZ data localization). Same event as the contracts-svc redline in PolicyPulse and the onboarding gap in Precedent.",
      suggestedFix:
        "--- a/infra/region/config.yaml\n+++ b/infra/region/config.yaml\n@@ residency @@\n- default_region: eu-central-1\n- pii_store: eu-central-1\n+ default_region: asia-central-1\n+ pii_store: kz-ala-1\n+ failover: kz-ala-1\n+ note: KZ localization — no PII egress",
      narrative: true,
    },
    {
      id: "F-SQL-1",
      moduleId: "user-service",
      attackCategory: "sqli",
      severity: "high",
      title: "Unparameterized user lookup",
      description:
        "services/users/src/lookup.ts concatenates request fields into a SQL string. Suggested fix is a parameterized query only — no attack samples in this demo.",
      suggestedFix:
        "--- a/services/users/src/lookup.ts\n+++ b/services/users/src/lookup.ts\n@@ lookup @@\n- db.query('SELECT * FROM users WHERE id = ' + id)\n+ db.query('SELECT * FROM users WHERE id = $1', [id])",
    },
    {
      id: "F-XSS-1",
      moduleId: "web-app",
      attackCategory: "xss",
      severity: "medium",
      title: "Unescaped profile field render",
      description:
        "ProfileForm writes a stored display name into the DOM without sanitizing. Patch switches to text content binding.",
      suggestedFix:
        "--- a/apps/web/src/profile/ProfileForm.tsx\n+++ b/apps/web/src/profile/ProfileForm.tsx\n@@ render @@\n- el.innerHTML = user.displayName\n+ el.textContent = user.displayName",
    },
    {
      id: "F-IDOR-1",
      moduleId: "billing-svc",
      attackCategory: "idor",
      severity: "high",
      title: "Invoice fetch without subject check",
      description:
        "invoices.ts loads a billing record by ID and does not compare the caller to the invoice owner.",
      suggestedFix:
        "--- a/services/billing/src/access.ts\n+++ b/services/billing/src/access.ts\n@@ authz @@\n+ assert(invoice.ownerId === ctx.subjectId, 'forbidden')",
    },
    {
      id: "F-AUTH-1",
      moduleId: "auth-service",
      attackCategory: "authz",
      severity: "high",
      title: "Session cookie missing host prefix",
      description:
        "session.ts issues a cookie without __Host- prefix or explicit SameSite. Patch tightens cookie flags only.",
      suggestedFix:
        "--- a/services/auth/src/session.ts\n+++ b/services/auth/src/session.ts\n@@ cookie @@\n- name: 'sid'\n+ name: '__Host-sid'\n+ sameSite: 'strict'\n+ secure: true",
    },
    {
      id: "F-SSRF-1",
      moduleId: "api-gateway",
      attackCategory: "ssrf",
      severity: "medium",
      title: "Webhook URL not allowlisted",
      description:
        "Gateway forwards a partner callback URL without restricting scheme or host. Patch adds an allowlist.",
      suggestedFix:
        "--- a/services/gateway/src/router.ts\n+++ b/services/gateway/src/router.ts\n@@ webhook @@\n+ assertAllowlist(url, ALLOWED_CALLBACK_HOSTS)",
    },
    {
      id: "F-DESER-1",
      moduleId: "onboarding-kit",
      attackCategory: "deser",
      severity: "medium",
      title: "Playbook blob decoded unsafely",
      description:
        "Precedent playbooks deserialize a stored blob with a permissive decoder. Patch switches to a JSON schema parse.",
      suggestedFix:
        "--- a/apps/precedent/src/assign.ts\n+++ b/apps/precedent/src/assign.ts\n@@ parse @@\n- load(blob)\n+ PlaybookSchema.parse(JSON.parse(blob))",
    },
    {
      id: "F-CVE-1",
      moduleId: "postgres-core",
      attackCategory: "cve",
      severity: "low",
      title: "Pinned client below patched line",
      description:
        "Dependency scan (simulated) reports the SQL client pin is older than the vendor patched release. Bump only.",
      suggestedFix:
        "--- a/infra/db/package.json\n+++ b/infra/db/package.json\n- \"pg\": \"8.6.0\"\n+ \"pg\": \"8.11.5\"",
    },
    {
      id: "F-SEC-1",
      moduleId: "k8s-cluster",
      attackCategory: "secret",
      severity: "critical",
      title: "Cluster token committed in secrets.env",
      description:
        "infra/k8s/secrets.env contains a long-lived cluster token. Patch removes the file from git and points the chart at a secret store reference.",
      suggestedFix:
        "--- a/infra/k8s/secrets.env\n+++ /dev/null\n@@ -\n- CLUSTER_TOKEN=********\n--- a/infra/k8s/cluster.yaml\n+++ b/infra/k8s/cluster.yaml\n+ secretRef: vault:cluster/deploy-token",
    },
  ];

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
      m.criticalityScore = Math.min(1, 0.25 + degree / 10);
    });
    return { modules: MODULES, byId };
  }

  const hydrated = hydrateModules();

  root.OrbitData = {
    CATEGORIES,
    MODULES: hydrated.modules,
    BY_ID: hydrated.byId,
    FINDINGS,
    loadState,
    setFinding,
    loadPrs,
    savePr,
    resetDemo: function () {
      localStorage.removeItem(STATE_KEY);
      localStorage.removeItem(PR_KEY);
    },
  };
})(window);
