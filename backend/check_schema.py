from app.db import get_db_cursor

with get_db_cursor() as cursor:
    cursor.execute("""
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name='step_runs' AND table_schema='public' 
        ORDER BY ordinal_position;
    """)
    for row in cursor.fetchall():
        print(dict(row))
