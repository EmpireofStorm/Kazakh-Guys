import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "tasks.db")


def init_db():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("DROP TABLE IF EXISTS tasks")
    cur.execute(
        """
        CREATE TABLE tasks (
            id INTEGER PRIMARY KEY,
            project_id TEXT NOT NULL,
            title TEXT NOT NULL
        )
        """
    )
    cur.executemany(
        "INSERT INTO tasks (project_id, title) VALUES (?, ?)",
        [
            ("1", "Design landing page"),
            ("1", "Fix login bug"),
            ("2", "Write onboarding docs"),
            ("2", "Set up billing webhook"),
            ("3", "O'Brien's task with an apostrophe"),
        ],
    )
    cur.execute("DROP TABLE IF EXISTS users")
    cur.execute(
        """
        CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL
        )
        """
    )
    cur.executemany(
        "INSERT INTO users (email, name) VALUES (?, ?)",
        [
            ("alice@tallybird.app", "Alice Nguyen"),
            ("dan.obrien@tallybird.app", "Dan O'Brien"),
        ],
    )
    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()
    print("Seeded tasks.db")
