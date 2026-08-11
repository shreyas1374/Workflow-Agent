from app.db import get_db_cursor
import json

with get_db_cursor() as cursor:
    cursor.execute("""
        SELECT id, config
        FROM public.workflow_steps
        WHERE step_type = 'http_request';
    """)
    rows = cursor.fetchall()
    updated_count = 0
    for row in rows:
        cfg = row["config"]
        if isinstance(cfg, dict) and "httpbin.org" in cfg.get("url", ""):
            cfg["url"] = "https://jsonplaceholder.typicode.com/todos/1"
            cursor.execute(
                "UPDATE public.workflow_steps SET config = %s WHERE id = %s;",
                (json.dumps(cfg), row["id"])
            )
            updated_count += 1

    print(f"Updated {updated_count} existing workflow steps to use https://jsonplaceholder.typicode.com/todos/1")
