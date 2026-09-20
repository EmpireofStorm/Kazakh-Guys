(function (root) {
  root.OrbitData = root.OrbitData || {};
  root.OrbitData.SOURCES = {
    "tasks/search.py": `def search_tasks(project_id, query):
    sql = "SELECT * FROM tasks WHERE project_id = " + project_id + " AND title LIKE '%" + query + "%'"
    return db.execute(sql)
`,
    "src/components/CommentThread.jsx": `function CommentThread({ comments }) {
  return (
    <div className="comment-thread">
      {comments.map(c => (
        <div key={c.id} dangerouslySetInnerHTML={{ __html: c.body }} />
      ))}
    </div>
  );
}
`,
    "uploads/handlers.py": `@app.get("/attachments/{file_id}")
def download_attachment(file_id, current_user):
    file = db.get_file(file_id)
    return stream_from_s3(file.s3_key)
`,
    "auth/tokens.py": `REFRESH_SECRET = "prod-refresh-secret-2024"

def issue_refresh_token(user_id):
    return jwt.encode({"sub": user_id}, REFRESH_SECRET, algorithm="HS256")
`,
    "webhooks/dispatcher.py": `def send_webhook(url, payload):
    response = requests.post(url, json=payload, timeout=5)
    return response.status_code
`,
    "worker/queue_consumer.py": `import pickle

def process_job(raw_message):
    job = pickle.loads(raw_message.body)
    return JOB_HANDLERS[job.type](job.payload)
`,
    "search/requirements.txt": `fastapi==0.95.0
elasticsearch==7.10.0
redis==4.3.0
`,
    "billing/stripe_client.py": `import stripe

stripe.api_key = "sk_live_REDACTED_DEMO"

def create_subscription(customer_id, price_id):
    return stripe.Subscription.create(customer=customer_id, items=[{"price": price_id}])
`,
    "gateway/router.py": `def route_request(request):
    service = SERVICE_MAP[request.path_prefix]
    return forward(service, request)
`,
    "mobile/bff.py": `def get_dashboard(user_id):
    tasks = task_client.list_tasks(user_id)
    return {"tasks": tasks, "version": "mobile-v2"}
`,
    "users/profile.py": `def get_profile(user_id):
    return db.get_user(user_id)
`,
    "notifications/sender.py": `def send_email(to, template, context):
    return mailer.send(to, render(template, context))
`,
    "admin/routes.py": `@app.get("/admin/users")
@require_session
def list_users():
    return db.list_all_users()
`,
    "tasks/schema.sql": `CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id),
    title TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT now()
);
`,
    "users/schema.sql": `CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
);
`,
    "cache/config.py": `REDIS_URL = os.environ["REDIS_URL"]
SESSION_TTL_SECONDS = 3600
`,
    "analytics/track.py": `def track_event(user_id, event_name, props):
    segment_client.track(user_id, event_name, props)
`,
    ".github/workflows/deploy.yml": `jobs:
  deploy:
    steps:
      - run: aws s3 sync ./build s3://tallybird-prod
      - run: ./scripts/migrate.sh
`,
  };

  root.OrbitData.FIXES = {
    "F-SQL-1": {
      findingId: "F-SQL-1",
      moduleId: "task-service",
      file: "tasks/search.py",
      title: "Unsafe task search query",
      why: "The search string is pasted into SQL. Bind it as a value instead.",
      flagged:
        'sql = "SELECT * FROM tasks WHERE project_id = " + project_id + " AND title LIKE \'%" + query + "%\'"\nreturn db.execute(sql)',
      replacement:
        'sql = "SELECT * FROM tasks WHERE project_id = %s AND title LIKE %s"\nreturn db.execute(sql, (project_id, "%" + query + "%"))',
      patchedFile: `def search_tasks(project_id, query):
    sql = "SELECT * FROM tasks WHERE project_id = %s AND title LIKE %s"
    return db.execute(sql, (project_id, "%" + query + "%"))
`,
    },
    "F-SQL-1-SAFE": {
      findingId: "F-SQL-1",
      moduleId: "task-service",
      file: "tasks/search.py",
      safe: true,
      title: "Safer rewrite",
      why: "Keep search_tasks(project_id, query) so callers keep working.",
      flagged:
        'sql = "SELECT * FROM tasks WHERE project_id = %s AND title LIKE %s"\nreturn db.execute(sql, (project_id, "%" + query + "%"))',
      replacement:
        "def search_tasks(project_id, query):\n    pattern = '%' + query + '%'\n    return db.execute(\n        'SELECT * FROM tasks WHERE project_id = %s AND title LIKE %s',\n        (project_id, pattern)\n    )",
      patchedFile: `def search_tasks(project_id, query):
    pattern = "%" + query + "%"
    return db.execute(
        "SELECT * FROM tasks WHERE project_id = %s AND title LIKE %s",
        (project_id, pattern)
    )
`,
    },
  };
})(window);
