from app.db import get_db_cursor

with get_db_cursor() as cursor:
    cursor.execute("""
        SELECT w.id, w.name, w.org_id, om.role
        FROM public.workflows w
        JOIN public.org_members om ON om.org_id = w.org_id
        WHERE om.user_id = '10000000-0000-0000-0000-000000000001'
        ORDER BY w.name
        LIMIT 5;
    """)
    print("=== Workflows accessible to Alice ===")
    for row in cursor.fetchall():
        print(dict(row))
