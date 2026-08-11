from app.db import get_db_cursor

with get_db_cursor() as cursor:
    cursor.execute("""
        SELECT ws.id, ws.workflow_id, ws.position, ws.step_type, ws.config, w.name as workflow_name
        FROM public.workflow_steps ws
        JOIN public.workflows w ON w.id = ws.workflow_id
        WHERE ws.step_type = 'http_request'
        ORDER BY ws.created_at DESC;
    """)
    rows = cursor.fetchall()
    print("=== Configured HTTP Request Steps ===")
    for row in rows:
        print(dict(row))

    print("\n=== Latest FAILED Step Runs for HTTP Steps ===")
    cursor.execute("""
        SELECT sr.id, sr.workflow_run_id, sr.status, sr.attempt_count, sr.error_message, sr.output, ws.config
        FROM public.step_runs sr
        JOIN public.workflow_steps ws ON ws.id = sr.step_id
        WHERE ws.step_type = 'http_request'
        ORDER BY sr.started_at DESC
        LIMIT 5;
    """)
    sr_rows = cursor.fetchall()
    for sr in sr_rows:
        print(dict(sr))
