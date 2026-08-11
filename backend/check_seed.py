from app.db import get_db_cursor

with get_db_cursor() as cursor:
    cursor.execute("""
        SELECT om.org_id, om.user_id, om.role 
        FROM public.org_members om
        WHERE om.org_id IN ('a1111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222')
        ORDER BY om.org_id, om.role;
    """)
    print("=== org_members for test orgs ===")
    for row in cursor.fetchall():
        print(dict(row))

    cursor.execute("""
        SELECT id, name FROM public.organizations 
        WHERE id IN ('a1111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222');
    """)
    print("\n=== organizations ===")
    for row in cursor.fetchall():
        print(dict(row))
