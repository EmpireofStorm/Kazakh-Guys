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
  { id: "api-gateway", filePath: ["gateway/router.py"], dependsOn: ["auth-service", "user-service", "task-service", "billing-service", "search-service", "ci-cd-pipeline"] },
  { id: "web-app", filePath: ["src/components/CommentThread.jsx"], dependsOn: ["api-gateway"] },
  { id: "mobile-bff", filePath: ["mobile/bff.py"], dependsOn: ["api-gateway"] },
  { id: "auth-service", filePath: ["auth/tokens.py"], dependsOn: ["users-db", "redis-cache", "ci-cd-pipeline"] },
  { id: "user-service", filePath: ["users/profile.py"], dependsOn: ["users-db"] },
  { id: "task-service", filePath: ["tasks/search.py"], dependsOn: ["tasks-db", "search-service", "file-upload-service", "notification-service", "webhook-service", "admin-dashboard"] },
  { id: "billing-service", filePath: ["billing/stripe_client.py"], dependsOn: ["users-db", "notification-service", "admin-dashboard", "ci-cd-pipeline"] },
  { id: "notification-service", filePath: ["notifications/sender.py"], dependsOn: ["background-worker"] },
  { id: "file-upload-service", filePath: ["uploads/handlers.py"], dependsOn: ["background-worker"] },
  { id: "search-service", filePath: ["search/requirements.txt"], dependsOn: [] },
  { id: "webhook-service", filePath: ["webhooks/dispatcher.py"], dependsOn: ["background-worker"] },
  { id: "admin-dashboard", filePath: ["admin/routes.py"], dependsOn: ["users-db"] },
  { id: "analytics-service", filePath: ["analytics/track.py"], dependsOn: ["tasks-db", "users-db"] },
  { id: "users-db", filePath: ["users/schema.sql"], dependsOn: [] },
  { id: "tasks-db", filePath: ["tasks/schema.sql"], dependsOn: [] },
  { id: "redis-cache", filePath: ["cache/config.py"], dependsOn: [] },
  { id: "background-worker", filePath: ["worker/queue_consumer.py"], dependsOn: [] },
  { id: "ci-cd-pipeline", filePath: [".github/workflows/deploy.yml"], dependsOn: [] },
];

export const FINDINGS = [
  { id: "F-AUTH-1", moduleId: "auth-service", attackCategory: "authz", severity: "critical", title: "Refresh tokens never expire" },
  { id: "F-SEC-1", moduleId: "billing-service", attackCategory: "secret", severity: "critical", title: "Stripe live key in source" },
  { id: "F-IDOR-1", moduleId: "file-upload-service", attackCategory: "idor", severity: "high", title: "Attachment download skips access check" },
  { id: "F-SSRF-1", moduleId: "webhook-service", attackCategory: "ssrf", severity: "high", title: "Webhook URLs never validated" },
  { id: "F-SQL-1", moduleId: "task-service", attackCategory: "sqli", severity: "high", title: "Task search concatenates SQL" },
  { id: "F-DESER-1", moduleId: "background-worker", attackCategory: "deser", severity: "medium", title: "Jobs deserialized with pickle" },
  { id: "F-XSS-1", moduleId: "web-app", attackCategory: "xss", severity: "medium", title: "Comments render unsanitized HTML" },
  { id: "F-CVE-1", moduleId: "search-service", attackCategory: "cve", severity: "medium", title: "Elasticsearch client pinned to 7.10.0" },
];

export const SOURCES = {
  "tasks/search.py": `def search_tasks(project_id, query):\n    sql = "SELECT * FROM tasks WHERE project_id = " + project_id + " AND title LIKE '%" + query + "%'"\n    return db.execute(sql)\n`,
  "src/components/CommentThread.jsx": `function CommentThread({ comments }) {\n  return comments.map(c => c.body)\n}\n`,
  "uploads/handlers.py": `def download_attachment(file_id, current_user):\n    file = db.get_file(file_id)\n    return stream_from_s3(file.s3_key)\n`,
  "auth/tokens.py": `REFRESH_SECRET = "prod-refresh-secret-2024"\n`,
  "webhooks/dispatcher.py": `def send_webhook(url, payload):\n    return requests.post(url, json=payload, timeout=5)\n`,
  "worker/queue_consumer.py": `def process_job(raw_message):\n    job = pickle.loads(raw_message.body)\n    return JOB_HANDLERS[job.type](job.payload)\n`,
  "search/requirements.txt": `elasticsearch==7.10.0\n`,
  "billing/stripe_client.py": `stripe.api_key = "sk_live_REDACTED_DEMO"\n`,
  "gateway/router.py": `def route_request(request):\n    return forward(SERVICE_MAP[request.path_prefix], request)\n`,
  "mobile/bff.py": `def get_dashboard(user_id):\n    return {"tasks": task_client.list_tasks(user_id)}\n`,
  "users/profile.py": `def get_profile(user_id):\n    return db.get_user(user_id)\n`,
  "notifications/sender.py": `def send_email(to, template, context):\n    return mailer.send(to, render(template, context))\n`,
  "admin/routes.py": `def list_users():\n    return db.list_all_users()\n`,
  "tasks/schema.sql": `CREATE TABLE tasks (id SERIAL PRIMARY KEY, project_id INTEGER, title TEXT);\n`,
  "users/schema.sql": `CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT);\n`,
  "cache/config.py": `SESSION_TTL_SECONDS = 3600\n`,
  "analytics/track.py": `def track_event(user_id, event_name, props):\n    segment_client.track(user_id, event_name, props)\n`,
  ".github/workflows/deploy.yml": `jobs:\n  deploy:\n    steps:\n      - run: ./scripts/migrate.sh\n`,
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
