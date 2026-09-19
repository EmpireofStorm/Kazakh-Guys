# Reference copy of the ORIGINAL vulnerable code, kept so the README's
# steps can be followed from a clean starting point.
# The live tasks_search.py in this folder is already the FIXED version,
# left that way so the diff is easy to see without re-running anything.
import sqlite3

DB_PATH = "tasks.db"


def get_connection():
    return sqlite3.connect(DB_PATH)


def search_tasks(project_id, query):
    conn = get_connection()
    cur = conn.cursor()
    sql = "SELECT id, title, project_id FROM tasks WHERE project_id = " + project_id + " AND title LIKE '%" + query + "%'"
    cur.execute(sql)
    rows = cur.fetchall()
    conn.close()
    return rows
