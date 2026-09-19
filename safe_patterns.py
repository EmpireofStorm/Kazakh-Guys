import sqlite3

DB_PATH = "tasks.db"


def already_parameterized(project_id):
    """The correct pattern -- must NOT be flagged."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT * FROM tasks WHERE project_id = ?", (project_id,))
    return cur.fetchall()


def concatenation_for_logging_not_sql(name):
    """String concatenation exists, but never reaches execute() -- must
    NOT be flagged, this isn't a query at all."""
    message = "Hello " + name
    print(message)
    return message


def format_for_display_not_sql(count):
    """.format() exists, but on a plain string, never passed to
    execute() -- must NOT be flagged."""
    return "{} items found".format(count)


def execute_with_no_dynamic_content():
    """A literal-only query, no concatenation, no variables -- must NOT
    be flagged, there's nothing tainted here."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM tasks")
    return cur.fetchone()


def executemany_is_already_safe(rows):
    """executemany with placeholders -- must NOT be flagged."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.executemany("INSERT INTO tasks (project_id, title) VALUES (?, ?)", rows)
    conn.commit()
