from app.db import get_db_cursor

with get_db_cursor() as cursor:
    cursor.execute("""
        UPDATE public.organizations
        SET current_usage = 0, active_running_count = 0
        RETURNING id, name, usage_quota, current_usage, active_running_count;
    """)
    rows = cursor.fetchall()
    print("=== Updated Organizations Quotas ===")
    for row in rows:
        print(dict(row))
