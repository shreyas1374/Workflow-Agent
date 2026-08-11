import time
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db import get_db_cursor
from app.executor import start_workflow_run, resume_workflow

client = TestClient(app)

def test_checkpoint8_full_e2e_triggers():
    org_a_id = "a1111111-1111-1111-1111-111111111111"
    alice_id = "10000000-0000-0000-0000-000000000001"

    with get_db_cursor() as cursor:
        # 1. Create Test Workflow
        cursor.execute(
            """
            INSERT INTO public.workflows (org_id, name, description)
            VALUES (%s, 'Checkpoint 8 E2E Test Workflow', 'Testing Webhook, Scheduled, DB Event, and Notify triggers')
            RETURNING id;
            """,
            (org_a_id,)
        )
        wf_id = str(cursor.fetchone()["id"])

        # 2. Add Steps (llm_call -> approval_gate -> notify)
        cursor.execute(
            """
            INSERT INTO public.workflow_steps (workflow_id, position, step_type, config)
            VALUES
            (%s, 1, 'llm_call', '{"prompt": "E2E Prompt", "model": "gemini-2.0-flash"}'::jsonb),
            (%s, 2, 'approval_gate', '{"message": "E2E Signoff"}'::jsonb),
            (%s, 3, 'notify', '{"channel": "slack", "recipient": "#alerts", "message": "E2E Done"}'::jsonb);
            """,
            (wf_id, wf_id, wf_id)
        )

    # -----------------------------------------------------------------
    # 1. MANUAL TRIGGER PATHWAY
    # -----------------------------------------------------------------
    run_id_manual = start_workflow_run(wf_id, trigger_type="manual", async_exec=False)
    assert run_id_manual is not None

    with get_db_cursor() as cursor:
        cursor.execute("SELECT status, trigger_type FROM public.workflow_runs WHERE id = %s;", (run_id_manual,))
        manual_run = cursor.fetchone()
        assert manual_run["status"] == "paused"
        assert manual_run["trigger_type"] == "manual"

    resume_workflow(run_id_manual, alice_id)

    with get_db_cursor() as cursor:
        cursor.execute("SELECT status FROM public.workflow_runs WHERE id = %s;", (run_id_manual,))
        assert cursor.fetchone()["status"] == "completed"

    # -----------------------------------------------------------------
    # 2. WEBHOOK TRIGGER PATHWAY (Valid vs Invalid Secrets)
    # -----------------------------------------------------------------
    webhook_sec = f"secret-e2e-{int(time.time())}"
    with get_db_cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO public.workflow_triggers (workflow_id, trigger_type, webhook_secret)
            VALUES (%s, 'webhook', %s);
            """,
            (wf_id, webhook_sec)
        )

    # Invalid Secret
    res_inv = client.post("/actions/webhook/invalid-secret-xyz999")
    assert res_inv.status_code == 404
    assert "Invalid webhook secret" in res_inv.json()["detail"]

    # Valid Secret
    res_val = client.post(f"/actions/webhook/{webhook_sec}", json={"event": "signup", "payload": {"test": 1}})
    assert res_val.status_code == 200
    val_data = res_val.json()
    assert val_data["status"] == "running"
    assert val_data["trigger_type"] == "webhook"

    webhook_run_id = val_data["id"]
    with get_db_cursor() as cursor:
        cursor.execute("SELECT status, trigger_type FROM public.workflow_runs WHERE id = %s;", (webhook_run_id,))
        wh_run = cursor.fetchone()
        assert wh_run["trigger_type"] == "webhook"

    # -----------------------------------------------------------------
    # 3. DATABASE EVENT TRIGGER PATHWAY
    # -----------------------------------------------------------------
    with get_db_cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO public.workflow_triggers (workflow_id, trigger_type)
            VALUES (%s, 'db_event');
            """,
            (wf_id,)
        )

    # Simulate Hasura Event Trigger webhook payload for INSERT on custom_db_records
    event_payload = {
        "event": {
            "data": {
                "new": {
                    "id": "c1111111-1111-1111-1111-111111111111",
                    "org_id": org_a_id,
                    "title": "E2E Test Record",
                    "payload": {"source": "e2e_pytest"}
                }
            }
        }
    }
    res_event = client.post("/actions/events/db-record-inserted", json=event_payload)
    assert res_event.status_code == 200
    event_res_data = res_event.json()
    assert event_res_data["status"] == "processed"
    assert event_res_data["executed_runs_count"] >= 1

    # Cross-Organization Isolation Test: Record from Org B should NOT trigger Org A workflow
    org_b_payload = {
        "event": {
            "data": {
                "new": {
                    "id": "c2222222-2222-2222-2222-222222222222",
                    "org_id": "b2222222-2222-2222-2222-222222222222",
                    "title": "Org B Record",
                    "payload": {}
                }
            }
        }
    }
    res_b_event = client.post("/actions/events/db-record-inserted", json=org_b_payload)
    assert res_b_event.status_code == 200
    assert res_b_event.json()["executed_runs_count"] == 0

    # -----------------------------------------------------------------
    # 4. NOTIFY EVENT TRIGGER PATHWAY
    # -----------------------------------------------------------------
    notif_payload = {
        "event": {
            "data": {
                "new": {
                    "id": "n1111111-1111-1111-1111-111111111111",
                    "org_id": org_a_id,
                    "recipient_id": alice_id,
                    "title": "Workflow Completed",
                    "message": "Step notify triggered notification event"
                }
            }
        }
    }
    res_notif = client.post("/actions/events/notification-inserted", json=notif_payload)
    assert res_notif.status_code == 200
    assert res_notif.json()["status"] == "dispatched"
