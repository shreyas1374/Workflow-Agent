import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_trigger_workflow_run_unauthorized():
    payload = {
        "action": {"name": "triggerWorkflowRun"},
        "input": {"workflow_id": "11111111-1111-1111-1111-111111111111"},
        "session_variables": {}
    }
    response = client.post("/actions/trigger-workflow-run", json=payload)
    assert response.status_code == 401
    assert "Unauthorized" in response.json()["detail"]

def test_approve_step_unauthorized():
    payload = {
        "action": {"name": "approveStep"},
        "input": {"step_run_id": "44444444-4444-4444-4444-444444444444"},
        "session_variables": {}
    }
    response = client.post("/actions/approve-step", json=payload)
    assert response.status_code == 401
    assert "Unauthorized" in response.json()["detail"]

def test_trigger_webhook_run_invalid_secret():
    payload = {
        "action": {"name": "triggerWebhookRun"},
        "input": {"webhook_secret": "invalid-secret-12345"},
        "session_variables": {}
    }
    response = client.post("/actions/trigger-webhook-run", json=payload)
    assert response.status_code == 404
    assert "Invalid webhook secret" in response.json()["detail"]

def test_trigger_webhook_run_missing_session_variables():
    # Should not throw 422 schema validation error when session_variables is omitted
    payload = {
        "action": {"name": "triggerWebhookRun"},
        "input": {"webhook_secret": "invalid-secret-99999"}
    }
    response = client.post("/actions/trigger-webhook-run", json=payload)
    assert response.status_code == 404
    assert "Invalid webhook secret" in response.json()["detail"]

def test_direct_webhook_endpoint_invalid_secret():
    response = client.post("/actions/webhook/invalid-secret-direct-123")
    assert response.status_code == 404
    assert "Invalid webhook secret" in response.json()["detail"]

def test_add_org_member_by_email_unauthorized():
    payload = {
        "action": {"name": "addOrgMemberByEmail"},
        "input": {"org_id": "a1111111-1111-1111-1111-111111111111", "email": "test@example.com", "role": "editor"},
        "session_variables": {}
    }
    response = client.post("/actions/add-org-member-by-email", json=payload)
    assert response.status_code == 401
    assert "Unauthorized" in response.json()["detail"]

def test_add_org_member_by_email_invalid_role():
    payload = {
        "action": {"name": "addOrgMemberByEmail"},
        "input": {"org_id": "a1111111-1111-1111-1111-111111111111", "email": "test@example.com", "role": "superadmin"},
        "session_variables": {"x-hasura-user-id": "10000000-0000-0000-0000-000000000001"}
    }
    response = client.post("/actions/add-org-member-by-email", json=payload)
    assert response.status_code == 400
    assert "Invalid role" in response.json()["detail"]

def test_create_organization_unauthorized():
    payload = {
        "action": {"name": "createOrganization"},
        "input": {"name": "New Test Org"},
        "session_variables": {}
    }
    response = client.post("/actions/create-organization", json=payload)
    assert response.status_code == 401
    assert "Unauthorized" in response.json()["detail"]

def test_review_join_request_unauthorized():
    payload = {
        "action": {"name": "reviewJoinRequest"},
        "input": {"request_id": "77777777-7777-7777-7777-777777777777", "action": "accept"},
        "session_variables": {}
    }
    response = client.post("/actions/review-join-request", json=payload)
    assert response.status_code == 401
    assert "Unauthorized" in response.json()["detail"]

def test_update_member_role_unauthorized():
    payload = {
        "action": {"name": "updateMemberRole"},
        "input": {"member_id": "88888888-8888-8888-8888-888888888888", "role": "editor"},
        "session_variables": {}
    }
    response = client.post("/actions/update-member-role", json=payload)
    assert response.status_code == 401
    assert "Unauthorized" in response.json()["detail"]

def test_remove_org_member_unauthorized():
    payload = {
        "action": {"name": "removeOrgMember"},
        "input": {"member_id": "99999999-9999-9999-9999-999999999999"},
        "session_variables": {}
    }
    response = client.post("/actions/remove-org-member", json=payload)
    assert response.status_code == 401
    assert "Unauthorized" in response.json()["detail"]

def test_create_webhook_trigger_unauthorized():
    payload = {
        "action": {"name": "createWebhookTrigger"},
        "input": {"workflow_id": "11111111-1111-1111-1111-111111111111"},
        "session_variables": {}
    }
    response = client.post("/actions/create-webhook-trigger", json=payload)
    assert response.status_code == 401
    assert "Unauthorized" in response.json()["detail"]

def test_create_webhook_trigger_editor_forbidden():
    from app.db import get_db_cursor
    org_a_id = "a1111111-1111-1111-1111-111111111111"
    bob_id = "8d319f8f-1c5d-4eb8-ab3b-54289f5c9e88"  # editor in Org A

    with get_db_cursor() as cursor:
        cursor.execute("INSERT INTO public.workflows (org_id, name) VALUES (%s, 'Test Action WF') RETURNING id;", (org_a_id,))
        wf_id = str(cursor.fetchone()["id"])

    try:
        payload = {
            "action": {"name": "createWebhookTrigger"},
            "input": {"workflow_id": wf_id},
            "session_variables": {"x-hasura-user-id": bob_id}
        }
        response = client.post("/actions/create-webhook-trigger", json=payload)
        assert response.status_code == 403
        assert "Forbidden" in response.json()["detail"]
    finally:
        with get_db_cursor() as cursor:
            cursor.execute("DELETE FROM public.workflows WHERE id = %s;", (wf_id,))

def test_create_webhook_trigger_owner_success():
    from app.db import get_db_cursor
    org_a_id = "a1111111-1111-1111-1111-111111111111"
    alice_id = "10000000-0000-0000-0000-000000000001"  # owner in Org A

    with get_db_cursor() as cursor:
        cursor.execute("INSERT INTO public.workflows (org_id, name) VALUES (%s, 'Test Action WF Owner') RETURNING id;", (org_a_id,))
        wf_id = str(cursor.fetchone()["id"])

    try:
        payload = {
            "action": {"name": "createWebhookTrigger"},
            "input": {"workflow_id": wf_id},
            "session_variables": {"x-hasura-user-id": alice_id}
        }
        response = client.post("/actions/create-webhook-trigger", json=payload)
        assert response.status_code == 200
        res_json = response.json()
        assert "webhook_secret" in res_json
        assert res_json["webhook_secret"].startswith("whsec_")
        assert "webhook_url" in res_json
        assert res_json["workflow_id"] == wf_id
    finally:
        with get_db_cursor() as cursor:
            cursor.execute("DELETE FROM public.workflow_triggers WHERE workflow_id = %s;", (wf_id,))
            cursor.execute("DELETE FROM public.workflows WHERE id = %s;", (wf_id,))


