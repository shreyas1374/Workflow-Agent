from app.db import get_db_cursor
import json

RUN_ID = "dc095d4c-3edf-44fd-b9a8-4db4451e793b"

with get_db_cursor() as cursor:
    cursor.execute("""
        SELECT sr.id, sr.step_id, sr.status, sr.attempt_count, sr.error_message, sr.output, ws.step_type, ws.config
        FROM public.step_runs sr
        JOIN public.workflow_steps ws ON ws.id = sr.step_id
        WHERE sr.workflow_run_id = %s
        ORDER BY ws.position ASC;
    """, (RUN_ID,))
    rows = cursor.fetchall()
    
    print("=== Step Runs for Run ID ===")
    for row in rows:
        d = dict(row)
        print(f"Step Type: {d['step_type']}")
        print(f"Config: {d['config']}")
        print(f"Status: {d['status']}")
        print(f"Attempt Count: {d['attempt_count']}")
        print(f"Error: {d['error_message']}")
        print("-" * 50)
