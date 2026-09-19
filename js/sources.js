(function (root) {
  root.OrbitData = root.OrbitData || {};
  root.OrbitData.SOURCES = {
    "apps/web/src/App.tsx": `export function App() {
  return <ProfileForm />;
}
`,
    "apps/web/src/profile/ProfileForm.tsx": `export function ProfileForm({ user }) {
  const el = document.getElementById("name");
  // stored display name written as HTML
  el.innerHTML = user.displayName;
  return null;
}
`,
    "apps/precedent/playbooks/new-hire.md": `# New hire
Never move PII without a GraphDev blast-radius pass.
`,
    "apps/precedent/src/assign.ts": `export function assign(blob) {
  return load(blob);
}
`,
    "services/gateway/src/router.ts": `export async function webhook(req) {
  const url = req.body.callback;
  return fetch(url);
}
`,
    "services/gateway/src/rateLimit.ts": `export const windowMs = 60_000;
export const max = 120;
`,
    "services/billing/src/invoices.ts": `export function getInvoice(id) {
  return db.invoices.find(id);
}
`,
    "services/billing/src/access.ts": `export function canRead(invoice, ctx) {
  return Boolean(invoice && ctx);
}
`,
    "services/contracts/src/redline.ts": `export const dpa = "Personal data may be processed in the EU.";
`,
    "services/contracts/src/residency.ts": `export const allowedRegions = ["eu-central-1"];
`,
    "services/auth/src/session.ts": `export function issueSession(userId: string) {
  return {
    name: "sid",
    value: sign(userId),
    httpOnly: true,
  };
}
`,
    "services/auth/src/oidc.ts": `export const issuer = process.env.OIDC_ISSUER;
`,
    "services/users/src/lookup.ts": `import { db } from "../db";

export async function lookup(id: string) {
  const sql =
    "SELECT id, display_name, email FROM users WHERE id = '" + id + "'";
  return db.query(sql);
}
`,
    "services/users/src/profile.ts": `export function publicProfile(row) {
  return { id: row.id, displayName: row.displayName };
}
`,
    "services/audit/src/append.ts": `export function append(event) {
  return db.audit.insert({ ...event, at: Date.now() });
}
`,
    "infra/region/config.yaml": `default_region: eu-central-1
pii_store: eu-central-1
failover: eu-west-1
`,
    "infra/region/residency.ts": `export const piiRegion = "eu-central-1";
`,
    "infra/k8s/cluster.yaml": `apiVersion: v1
kind: Secret
metadata:
  name: cluster-deploy
`,
    "infra/k8s/secrets.env": `CLUSTER_TOKEN=********
`,
    "infra/db/users.sql": `CREATE TABLE users (id text primary key, display_name text);
`,
    "infra/db/migrations/": `-- pin noted in package.json
`,
    "infra/db/package.json": `{
  "dependencies": { "pg": "8.6.0" }
}
`,
    "infra/redis/session.conf": `maxmemory 256mb
`,
  };

  root.OrbitData.FIXES = {
    "F-SQL-1": {
      findingId: "F-SQL-1",
      moduleId: "user-service",
      file: "services/users/src/lookup.ts",
      title: "Unsafe database query",
      why: "The id is pasted into SQL. Bind it as a value instead.",
      flagged:
        'const sql =\n  "SELECT id, display_name, email FROM users WHERE id = \'" + id + "\'";\nreturn db.query(sql);',
      replacement:
        "return db.query(\n  \"SELECT id, display_name, email FROM users WHERE id = $1\",\n  [id]\n);",
      patchedFile: `import { db } from "../db";

export async function lookup(id: string) {
  return db.query(
    "SELECT id, display_name, email FROM users WHERE id = $1",
    [id]
  );
}
`,
    },
    "F-SQL-1-SAFE": {
      findingId: "F-SQL-1",
      moduleId: "user-service",
      file: "services/users/src/lookup.ts",
      safe: true,
      title: "Safer rewrite",
      why: "Keep the same function name so other files keep working.",
      flagged:
        "return db.query(\n  \"SELECT id, display_name, email FROM users WHERE id = $1\",\n  [id]\n);",
      replacement:
        "export async function lookup(id: string) {\n  const rows = await db.query(\n    \"SELECT id, display_name, email FROM users WHERE id = $1\",\n    [id]\n  );\n  return rows;\n}",
      patchedFile: `import { db } from "../db";

export async function lookup(id: string) {
  const rows = await db.query(
    "SELECT id, display_name, email FROM users WHERE id = $1",
    [id]
  );
  return rows;
}
`,
    },
  };
})(window);
