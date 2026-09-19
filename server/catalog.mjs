export const CATEGORIES = [
  { id: "sqli", label: "SQL injection" },
  { id: "xss", label: "Cross-site scripting" },
  { id: "idor", label: "Broken access control / IDOR" },
  { id: "authz", label: "Authentication bypass" },
  { id: "ssrf", label: "Server-side request forgery" },
  { id: "deser", label: "Insecure deserialization" },
  { id: "cve", label: "Known-CVE dependency scanning" },
  { id: "secret", label: "Hardcoded-secret exposure" },
];

export const MODULES = [
  { id: "web-app", filePath: ["apps/web/src/App.tsx", "apps/web/src/profile/ProfileForm.tsx"], dependsOn: ["api-gateway", "auth-service"] },
  { id: "onboarding-kit", filePath: ["apps/precedent/playbooks/new-hire.md", "apps/precedent/src/assign.ts"], dependsOn: ["user-service", "auth-service", "audit-log"] },
  { id: "api-gateway", filePath: ["services/gateway/src/router.ts", "services/gateway/src/rateLimit.ts"], dependsOn: ["auth-service", "user-service", "billing-svc", "region-config"] },
  { id: "billing-svc", filePath: ["services/billing/src/invoices.ts", "services/billing/src/access.ts"], dependsOn: ["postgres-core", "contracts-svc"] },
  { id: "contracts-svc", filePath: ["services/contracts/src/redline.ts", "services/contracts/src/residency.ts"], dependsOn: ["region-config", "audit-log"] },
  { id: "auth-service", filePath: ["services/auth/src/session.ts", "services/auth/src/oidc.ts"], dependsOn: ["redis-session", "postgres-core"] },
  { id: "user-service", filePath: ["services/users/src/lookup.ts", "services/users/src/profile.ts"], dependsOn: ["postgres-core", "audit-log", "region-config"] },
  { id: "audit-log", filePath: ["services/audit/src/append.ts"], dependsOn: ["postgres-core"] },
  { id: "region-config", filePath: ["infra/region/config.yaml", "infra/region/residency.ts"], dependsOn: ["k8s-cluster"] },
  { id: "k8s-cluster", filePath: ["infra/k8s/cluster.yaml", "infra/k8s/secrets.env"], dependsOn: [] },
  { id: "postgres-core", filePath: ["infra/db/users.sql", "infra/db/package.json"], dependsOn: [] },
  { id: "redis-session", filePath: ["infra/redis/session.conf"], dependsOn: [] },
];

export const FINDINGS = [
  { id: "F-KZ-1", moduleId: "region-config", attackCategory: "secret", severity: "critical", title: "EU-pinned residency vs KZ localization" },
  { id: "F-SQL-1", moduleId: "user-service", attackCategory: "sqli", severity: "high", title: "Unparameterized user lookup" },
  { id: "F-XSS-1", moduleId: "web-app", attackCategory: "xss", severity: "medium", title: "Unescaped profile field render" },
  { id: "F-IDOR-1", moduleId: "billing-svc", attackCategory: "idor", severity: "high", title: "Invoice fetch without subject check" },
  { id: "F-AUTH-1", moduleId: "auth-service", attackCategory: "authz", severity: "high", title: "Session cookie missing host prefix" },
  { id: "F-SSRF-1", moduleId: "api-gateway", attackCategory: "ssrf", severity: "medium", title: "Webhook URL not allowlisted" },
  { id: "F-DESER-1", moduleId: "onboarding-kit", attackCategory: "deser", severity: "medium", title: "Playbook blob decoded unsafely" },
  { id: "F-CVE-1", moduleId: "postgres-core", attackCategory: "cve", severity: "low", title: "Pinned client below patched line" },
  { id: "F-SEC-1", moduleId: "k8s-cluster", attackCategory: "secret", severity: "critical", title: "Cluster token committed in secrets.env" },
];

export const SOURCES = {
  "apps/web/src/App.tsx": `export function App() {\n  return <ProfileForm />;\n}\n`,
  "apps/web/src/profile/ProfileForm.tsx": `export function ProfileForm({ user }) {\n  const el = document.getElementById("name");\n  el.innerHTML = user.displayName;\n  return null;\n}\n`,
  "apps/precedent/playbooks/new-hire.md": `# New hire\nNever move PII without a GraphDev blast-radius pass.\n`,
  "apps/precedent/src/assign.ts": `export function assign(blob) {\n  return load(blob);\n}\n`,
  "services/gateway/src/router.ts": `export async function webhook(req) {\n  const url = req.body.callback;\n  return fetch(url);\n}\n`,
  "services/gateway/src/rateLimit.ts": `export const windowMs = 60_000;\nexport const max = 120;\n`,
  "services/billing/src/invoices.ts": `export function getInvoice(id) {\n  return db.invoices.find(id);\n}\n`,
  "services/billing/src/access.ts": `export function canRead(invoice, ctx) {\n  return Boolean(invoice && ctx);\n}\n`,
  "services/contracts/src/redline.ts": `export const dpa = "Personal data may be processed in the EU.";\n`,
  "services/contracts/src/residency.ts": `export const allowedRegions = ["eu-central-1"];\n`,
  "services/auth/src/session.ts": `export function issueSession(userId) {\n  return { name: "sid", value: sign(userId), httpOnly: true };\n}\n`,
  "services/auth/src/oidc.ts": `export const issuer = process.env.OIDC_ISSUER;\n`,
  "services/users/src/lookup.ts": `import { db } from "../db";\n\nexport async function lookup(id: string) {\n  const sql =\n    "SELECT id, display_name, email FROM users WHERE id = '" + id + "'";\n  return db.query(sql);\n}\n`,
  "services/users/src/profile.ts": `export function publicProfile(row) {\n  return { id: row.id, displayName: row.displayName };\n}\n`,
  "services/audit/src/append.ts": `export function append(event) {\n  return db.audit.insert({ ...event, at: Date.now() });\n}\n`,
  "infra/region/config.yaml": `default_region: eu-central-1\npii_store: eu-central-1\nfailover: eu-west-1\n`,
  "infra/region/residency.ts": `export const piiRegion = "eu-central-1";\n`,
  "infra/k8s/cluster.yaml": `apiVersion: v1\nkind: Secret\nmetadata:\n  name: cluster-deploy\n`,
  "infra/k8s/secrets.env": `CLUSTER_TOKEN=********\n`,
  "infra/db/users.sql": `CREATE TABLE users (id text primary key, display_name text);\n`,
  "infra/db/package.json": `{\n  "dependencies": { "pg": "8.6.0" }\n}\n`,
  "infra/redis/session.conf": `maxmemory 256mb\n`,
};

const byId = Object.fromEntries(MODULES.map((m) => [m.id, { ...m, dependents: [] }]));
MODULES.forEach((m) => {
  m.dependsOn.forEach((d) => {
    if (byId[d]) byId[d].dependents.push(m.id);
  });
});

export function blastRadius(originId) {
  const dist = { [originId]: 0 };
  const q = [originId];
  while (q.length) {
    const cur = q.shift();
    (byId[cur]?.dependents || []).forEach((dep) => {
      if (dist[dep] === undefined) {
        dist[dep] = dist[cur] + 1;
        q.push(dep);
      }
    });
  }
  return MODULES.map((m) => {
    const d = dist[m.id];
    let severity = "dim";
    if (m.id === originId) severity = "origin";
    else if (d === 1) severity = "red";
    else if (d === 2) severity = "amber";
    return { moduleId: m.id, distance: d ?? null, severity };
  });
}

export function moduleCode(moduleId) {
  const m = byId[moduleId];
  if (!m) return null;
  return m.filePath.map((p) => ({ path: p, body: SOURCES[p] || "" }));
}
