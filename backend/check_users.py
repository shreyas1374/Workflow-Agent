from app.db import get_db_cursor

with get_db_cursor() as cursor:
    # List all users in auth.users (Nhost stores users here)
    try:
        cursor.execute("""
            SELECT id, email, display_name
            FROM auth.users
            ORDER BY created_at
            LIMIT 20;
        """)
        print("=== auth.users ===")
        for row in cursor.fetchall():
            print(dict(row))
    except Exception as e:
        print(f"auth.users error: {e}")

    # Also check public org_members for org A
    cursor.execute("""
        SELECT om.org_id, om.user_id, om.role
        FROM public.org_members om
        ORDER BY om.org_id, om.role;
    """)
    print("\n=== all org_members ===")
    for row in cursor.fetchall():
        print(dict(row))

    # Check public.users if it exists
    try:
        cursor.execute("SELECT id FROM public.users LIMIT 10;")
        print("\n=== public.users ===")
        for row in cursor.fetchall():
            print(dict(row))
    except Exception as e:
        print(f"public.users error: {e}")
