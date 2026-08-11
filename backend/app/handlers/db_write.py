import json
from typing import Dict, Any
from app.db import get_db_cursor

def execute_db_write_step(org_id: str, config: Dict[str, Any], input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Executes a DB Write step by inserting a record into public.custom_db_records.
    Note: org_id is ALWAYS derived from the workflow database record, NEVER from user input.
    """
    target_table = config.get("table_name", "custom_records")
    payload = config.get("payload", input_data)
    
    with get_db_cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO public.custom_db_records (org_id, table_name, payload)
            VALUES (%s, %s, %s)
            RETURNING id, created_at;
            """,
            (org_id, target_table, json.dumps(payload))
        )
        record = cursor.fetchone()
        
    return {
        "status": "success",
        "record_id": str(record["id"]),
        "table_name": target_table,
        "org_id": org_id,
        "created_at": record["created_at"].isoformat() if hasattr(record["created_at"], "isoformat") else str(record["created_at"])
    }
