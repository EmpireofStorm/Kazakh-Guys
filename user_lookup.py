from tasks_search import get_connection


def get_user_by_email(email):
    conn = get_connection()
    cur = conn.cursor()
    sql = "SELECT id, email, name FROM users WHERE email = '{}'".format(email)
    cur.execute(sql)
    rows = cur.fetchall()
    conn.close()
    return rows
