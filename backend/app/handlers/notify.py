from typing import Dict, Any, Optional
from app.db import get_db_cursor

def execute_notify_step(org_id: str, workflow_run_id: str, config: Dict[str, Any], input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Executes a Notification step by inserting a pending alert into public.notifications.
    Note: org_id is ALWAYS derived from the workflow database record.
    """
    channel = config.get("channel", "email")
    recipient = config.get("recipient", "admin@organization.com")
    message = config.get("message", f"Workflow run alert: {input_data.get('summary', 'Step completed')}")

    with get_db_cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO public.notifications (org_id, workflow_run_id, channel, recipient, message, status)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, created_at;
            """,
            (org_id, workflow_run_id, channel, recipient, message, "pending")
        )
        notification = cursor.fetchone()

    return {
        "status": "success",
        "notification_id": str(notification["id"]),
        "channel": channel,
        "recipient": recipient,
        "org_id": org_id,
        "workflow_run_id": workflow_run_id
    }
