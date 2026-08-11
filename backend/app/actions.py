import logging
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional
from app.db import get_db_cursor
from app.executor import start_workflow_run, resume_workflow

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/actions", tags=["Hasura Actions"])

class HasuraActionPayload(BaseModel):
    action: Optional[Dict[str, Any]] = None
    input: Optional[Dict[str, Any]] = Field(default_factory=dict)
    session_variables: Optional[Dict[str, Any]] = Field(default_factory=dict)

@router.post("/trigger-workflow-run")
def action_trigger_workflow_run(payload: HasuraActionPayload):
    """
    Hasura Action Webhook: triggerWorkflowRun(workflow_id: UUID!)
    1. Authenticates X-Hasura-User-Id
    2. Verifies caller role is owner/editor in the workflow's org
    3. Performs atomic quota reservation
    4. Triggers workflow execution
    """
    session_vars = payload.session_variables or {}
    user_id = session_vars.get("x-hasura-user-id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized: X-Hasura-User-Id missing from session variables")

    input_data = payload.input or {}
    workflow_id = input_data.get("workflow_id")
    if not workflow_id:
        raise HTTPException(status_code=400, detail="Missing workflow_id input")

    with get_db_cursor() as cursor:
        # 1. Fetch workflow and org details
        cursor.execute("SELECT id, org_id FROM public.workflows WHERE id = %s;", (workflow_id,))
        workflow = cursor.fetchone()
        if not workflow:
            raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found.")

        org_id = str(workflow["org_id"])

        # 2. Check caller role in org
        cursor.execute("SELECT role FROM public.org_members WHERE org_id = %s AND user_id = %s;", (org_id, user_id))
        member = cursor.fetchone()
        if not member or member["role"] not in ("owner", "editor"):
            raise HTTPException(status_code=403, detail="Forbidden: User does not have owner/editor role in this organization")

        # 3. Atomic Quota Check & Reservation
        cursor.execute(
            """
            UPDATE public.organizations
            SET active_running_count = active_running_count + 1
            WHERE id = %s AND (current_usage + active_running_count) < usage_quota
            RETURNING usage_quota, current_usage, active_running_count;
            """,
            (org_id,)
        )
        quota_record = cursor.fetchone()
        if not quota_record:
            raise HTTPException(status_code=400, detail="Organization execution quota limit exceeded.")

    # 4. Launch Workflow Execution
    try:
        run_id = start_workflow_run(workflow_id, trigger_type="manual")
        return {
            "id": run_id,
            "workflow_id": workflow_id,
            "status": "running"
        }
    except Exception as e:
        # Release active count if start failed
        with get_db_cursor() as cursor:
            cursor.execute(
                "UPDATE public.organizations SET active_running_count = GREATEST(0, active_running_count - 1) WHERE id = %s;",
                (org_id,)
            )
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/approve-step")
def action_approve_step(payload: HasuraActionPayload):
    """
    Hasura Action Webhook: approveStep(step_run_id: UUID!)
    1. Authenticates X-Hasura-User-Id
    2. Identifies step_run -> workflow_run -> workflow -> org
    3. Verifies caller is owner/editor
    4. Resumes paused workflow execution
    """
    session_vars = payload.session_variables or {}
    user_id = session_vars.get("x-hasura-user-id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized: X-Hasura-User-Id missing from session variables")

    input_data = payload.input or {}
    step_run_id = input_data.get("step_run_id")
    if not step_run_id:
        raise HTTPException(status_code=400, detail="Missing step_run_id input")

    with get_db_cursor() as cursor:
        cursor.execute(
            """
            SELECT sr.id, sr.workflow_run_id, sr.status, wr.workflow_id, w.org_id
            FROM public.step_runs sr
            JOIN public.workflow_runs wr ON wr.id = sr.workflow_run_id
            JOIN public.workflows w ON w.id = wr.workflow_id
            WHERE sr.id = %s;
            """,
            (step_run_id,)
        )
        step_data = cursor.fetchone()
        if not step_data:
            raise HTTPException(status_code=404, detail=f"Step run '{step_run_id}' not found.")

        if step_data["status"] != "paused":
            raise HTTPException(status_code=400, detail=f"Step run is not currently paused (status: {step_data['status']}).")

        org_id = str(step_data["org_id"])
        workflow_run_id = str(step_data["workflow_run_id"])

        # Check caller permissions
        cursor.execute("SELECT role FROM public.org_members WHERE org_id = %s AND user_id = %s;", (org_id, user_id))
        member = cursor.fetchone()
        if not member or member["role"] not in ("owner", "editor"):
            raise HTTPException(status_code=403, detail="Forbidden: User does not have owner/editor role in this organization")

    # Resume workflow run
    try:
        resume_workflow(workflow_run_id, user_id)
        return {
            "workflow_run_id": workflow_run_id,
            "status": "resumed",
            "approved_by": user_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/trigger-webhook-run")
def action_trigger_webhook_run(payload: Dict[str, Any] = Body(...)):
    """
    Hasura Action Webhook & REST Webhook: triggerWebhookRun(webhook_secret: String!, payload: jsonb)
    1. Finds workflow_trigger by webhook_secret
    2. Validates secret & verifies trigger type is 'webhook'
    3. Performs atomic quota reservation
    4. Launches workflow execution
    """
    webhook_secret = None
    if isinstance(payload, dict):
        if "input" in payload and isinstance(payload["input"], dict):
            webhook_secret = payload["input"].get("webhook_secret")
        if not webhook_secret:
            webhook_secret = payload.get("webhook_secret")

    if not webhook_secret:
        raise HTTPException(status_code=400, detail="Missing webhook_secret input")

    with get_db_cursor() as cursor:
        cursor.execute(
            """
            SELECT wt.id, wt.workflow_id, wt.trigger_type, w.org_id
            FROM public.workflow_triggers wt
            JOIN public.workflows w ON w.id = wt.workflow_id
            WHERE wt.webhook_secret = %s AND wt.trigger_type = 'webhook';
            """,
            (webhook_secret,)
        )
        trigger = cursor.fetchone()
        if not trigger:
            raise HTTPException(status_code=404, detail="Invalid webhook secret or trigger not found.")

        workflow_id = str(trigger["workflow_id"])
        org_id = str(trigger["org_id"])

        # Atomic Quota Check & Reservation
        cursor.execute(
            """
            UPDATE public.organizations
            SET active_running_count = active_running_count + 1
            WHERE id = %s AND (current_usage + active_running_count) < usage_quota
            RETURNING usage_quota, current_usage, active_running_count;
            """,
            (org_id,)
        )
        quota_record = cursor.fetchone()
        if not quota_record:
            raise HTTPException(status_code=400, detail="Organization execution quota limit exceeded.")

    # Launch workflow run
    try:
        run_id = start_workflow_run(workflow_id, trigger_type="webhook")
        return {
            "id": run_id,
            "workflow_id": workflow_id,
            "status": "running",
            "trigger_type": "webhook"
        }
    except Exception as e:
        with get_db_cursor() as cursor:
            cursor.execute(
                "UPDATE public.organizations SET active_running_count = GREATEST(0, active_running_count - 1) WHERE id = %s;",
                (org_id,)
            )
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/create-webhook-trigger")
def action_create_webhook_trigger(payload: HasuraActionPayload):
    """
    Hasura Action Webhook: createWebhookTrigger(workflow_id: UUID!)
    1. Authenticates X-Hasura-User-Id
    2. Identifies target workflow and org_id
    3. Verifies caller is an 'owner' of target org_id (Forbidden for editor/viewer)
    4. Generates a secure random webhook_secret server-side
    5. Stores secret in public.workflow_triggers.webhook_secret
    6. Returns trigger ID, workflow_id, webhook_url, and webhook_secret (ONCE)
    """
    import secrets
    session_vars = payload.session_variables or {}
    caller_user_id = session_vars.get("x-hasura-user-id")
    if not caller_user_id:
        raise HTTPException(status_code=401, detail="Unauthorized: X-Hasura-User-Id missing from session variables")

    input_data = payload.input or {}
    workflow_id = input_data.get("workflow_id")
    if not workflow_id:
        raise HTTPException(status_code=400, detail="Missing workflow_id input")

    with get_db_cursor() as cursor:
        cursor.execute("SELECT id, org_id FROM public.workflows WHERE id = %s;", (workflow_id,))
        workflow = cursor.fetchone()
        if not workflow:
            raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found.")

        org_id = str(workflow["org_id"])

        cursor.execute("SELECT role FROM public.org_members WHERE org_id = %s AND user_id = %s;", (org_id, caller_user_id))
        caller_member = cursor.fetchone()
        if not caller_member or caller_member["role"] != "owner":
            raise HTTPException(status_code=403, detail="Forbidden: Only Organization Owners can create webhook triggers")

        webhook_secret = f"whsec_{secrets.token_hex(16)}"

        cursor.execute("DELETE FROM public.workflow_triggers WHERE workflow_id = %s;", (workflow_id,))
        cursor.execute(
            """
            INSERT INTO public.workflow_triggers (workflow_id, trigger_type, webhook_secret, config)
            VALUES (%s, 'webhook', %s, '{}'::jsonb)
            RETURNING id;
            """,
            (workflow_id, webhook_secret)
        )
        trg = cursor.fetchone()
        trigger_id = str(trg["id"])

    webhook_url = f"/actions/webhook/{webhook_secret}"
    return {
        "id": trigger_id,
        "workflow_id": workflow_id,
        "webhook_url": webhook_url,
        "webhook_secret": webhook_secret,
        "message": "Webhook trigger created successfully."
    }


@router.api_route("/webhook/{webhook_secret}", methods=["GET", "POST"])
def direct_webhook_endpoint(webhook_secret: str, payload: Optional[Dict[str, Any]] = Body(None)):
    """
    Direct REST Webhook Endpoint: /actions/webhook/{webhook_secret}
    Allows external third-party services (e.g. GitHub, Stripe, webhooks) to trigger workflows directly.
    """
    body_data = payload or {}
    body_data["webhook_secret"] = webhook_secret
    return action_trigger_webhook_run(body_data)


@router.post("/add-org-member-by-email")
def action_add_org_member_by_email(payload: HasuraActionPayload):
    """
    Hasura Action Webhook: addOrgMemberByEmail(org_id: UUID!, email: String!, role: String!)
    1. Authenticates X-Hasura-User-Id from session variables
    2. Verifies caller is an 'owner' of target org_id
    3. Validates requested role is one of ('owner', 'editor', 'viewer')
    4. Queries auth.users by email to resolve user_id
    5. If user email does not exist, returns clear invitation requirement message
    6. Inserts or updates org_members record
    """
    session_vars = payload.session_variables or {}
    caller_user_id = session_vars.get("x-hasura-user-id")
    if not caller_user_id:
        raise HTTPException(status_code=401, detail="Unauthorized: X-Hasura-User-Id missing from session variables")

    input_data = payload.input or {}
    org_id = input_data.get("org_id")
    email = input_data.get("email")
    role = input_data.get("role", "editor")

    if not org_id or not email:
        raise HTTPException(status_code=400, detail="Missing org_id or email input")

    if role not in ("owner", "editor", "viewer"):
        raise HTTPException(status_code=400, detail="Invalid role. Must be 'owner', 'editor', or 'viewer'")

    email_clean = email.strip().lower()

    with get_db_cursor() as cursor:
        # 1. Verify caller is owner of org_id
        cursor.execute("SELECT role FROM public.org_members WHERE org_id = %s AND user_id = %s;", (org_id, caller_user_id))
        caller_member = cursor.fetchone()
        if not caller_member or caller_member["role"] != "owner":
            raise HTTPException(status_code=403, detail="Forbidden: Only Organization Owners can add or manage members")

        # 2. Resolve user by email from auth.users
        cursor.execute("SELECT id, email FROM auth.users WHERE LOWER(email) = %s;", (email_clean,))
        target_user = cursor.fetchone()
        if not target_user:
            return {
                "success": False,
                "message": f"User with email '{email}' was not found in Nhost Auth. An invitation flow is required before adding them to the organization.",
                "member_id": None
            }

        target_user_id = str(target_user["id"])

        # 3. Check existing membership
        cursor.execute("SELECT id, role FROM public.org_members WHERE org_id = %s AND user_id = %s;", (org_id, target_user_id))
        existing_member = cursor.fetchone()

        if existing_member:
            member_id = str(existing_member["id"])
            cursor.execute("UPDATE public.org_members SET role = %s WHERE id = %s;", (role, member_id))
            return {
                "success": True,
                "message": f"Updated existing member role to '{role}'.",
                "member_id": member_id
            }
        else:
            cursor.execute(
                "INSERT INTO public.org_members (org_id, user_id, role) VALUES (%s, %s, %s) RETURNING id;",
                (org_id, target_user_id, role)
            )
            new_row = cursor.fetchone()
            return {
                "success": True,
                "message": f"User '{email}' added as '{role}' successfully.",
                "member_id": str(new_row["id"])
            }


@router.post("/create-organization")
def action_create_organization(payload: HasuraActionPayload):
    """
    Hasura Action Webhook: createOrganization(name: String!)
    1. Authenticates X-Hasura-User-Id from session variables
    2. Creates a new organization in public.organizations
    3. Adds the creator as 'owner' in public.org_members
    """
    session_vars = payload.session_variables or {}
    caller_user_id = session_vars.get("x-hasura-user-id")
    if not caller_user_id:
        raise HTTPException(status_code=401, detail="Unauthorized: X-Hasura-User-Id missing from session variables")

    input_data = payload.input or {}
    name = input_data.get("name")
    if not name or not name.strip():
        raise HTTPException(status_code=400, detail="Missing or invalid organization name")

    org_name = name.strip()

    with get_db_cursor() as cursor:
        cursor.execute(
            "INSERT INTO public.organizations (name, usage_quota) VALUES (%s, 100) RETURNING id, name, usage_quota;",
            (org_name,)
        )
        org = cursor.fetchone()
        org_id = str(org["id"])

        cursor.execute(
            "INSERT INTO public.org_members (org_id, user_id, role) VALUES (%s, %s, 'owner') RETURNING id;",
            (org_id, caller_user_id)
        )

        return {
            "id": org_id,
            "name": org["name"],
            "role": "owner"
        }


@router.post("/review-join-request")
def action_review_join_request(payload: HasuraActionPayload):
    """
    Hasura Action Webhook: reviewJoinRequest(request_id: UUID!, action: String!)
    1. Authenticates X-Hasura-User-Id
    2. Verifies caller is an 'owner' of the requested org
    3. If action == 'accept': updates status to 'accepted' and inserts user into org_members as 'viewer'
    4. If action == 'reject': updates status to 'rejected'
    """
    session_vars = payload.session_variables or {}
    caller_user_id = session_vars.get("x-hasura-user-id")
    if not caller_user_id:
        raise HTTPException(status_code=401, detail="Unauthorized: X-Hasura-User-Id missing from session variables")

    input_data = payload.input or {}
    request_id = input_data.get("request_id")
    action_type = input_data.get("action")

    if not request_id or action_type not in ("accept", "reject"):
        raise HTTPException(status_code=400, detail="Missing or invalid request_id / action input (must be 'accept' or 'reject')")

    with get_db_cursor() as cursor:
        # Fetch join request
        cursor.execute(
            "SELECT id, org_id, user_id, status FROM public.organization_join_requests WHERE id = %s;",
            (request_id,)
        )
        req = cursor.fetchone()
        if not req:
            raise HTTPException(status_code=404, detail="Organization join request not found.")

        if req["status"] != "pending":
            raise HTTPException(status_code=400, detail=f"Join request has already been reviewed (current status: {req['status']}).")

        org_id = str(req["org_id"])
        target_user_id = str(req["user_id"])

        # Check caller is owner in org
        cursor.execute("SELECT role FROM public.org_members WHERE org_id = %s AND user_id = %s;", (org_id, caller_user_id))
        caller_member = cursor.fetchone()
        if not caller_member or caller_member["role"] != "owner":
            raise HTTPException(status_code=403, detail="Forbidden: Only Organization Owners can accept or reject join requests")

        if action_type == "accept":
            cursor.execute(
                """
                UPDATE public.organization_join_requests
                SET status = 'accepted', reviewed_by = %s, reviewed_at = now()
                WHERE id = %s;
                """,
                (caller_user_id, request_id)
            )
            # Create org_members entry with initial role 'viewer' if not already present
            cursor.execute(
                """
                INSERT INTO public.org_members (org_id, user_id, role)
                VALUES (%s, %s, 'viewer')
                ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role;
                """,
                (org_id, target_user_id)
            )
            return {
                "success": True,
                "message": "Join request accepted. User added to organization as 'viewer'.",
                "status": "accepted"
            }
        else:
            cursor.execute(
                """
                UPDATE public.organization_join_requests
                SET status = 'rejected', reviewed_by = %s, reviewed_at = now()
                WHERE id = %s;
                """,
                (caller_user_id, request_id)
            )
            return {
                "success": True,
                "message": "Join request rejected.",
                "status": "rejected"
            }


@router.post("/update-member-role")
def action_update_member_role(payload: HasuraActionPayload):
    """
    Hasura Action Webhook: updateMemberRole(member_id: UUID!, role: String!)
    1. Authenticates X-Hasura-User-Id
    2. Verifies caller is an 'owner' in the target org
    3. Last Owner Protection: Prevents demoting the last remaining owner
    """
    session_vars = payload.session_variables or {}
    caller_user_id = session_vars.get("x-hasura-user-id")
    if not caller_user_id:
        raise HTTPException(status_code=401, detail="Unauthorized: X-Hasura-User-Id missing from session variables")

    input_data = payload.input or {}
    member_id = input_data.get("member_id")
    new_role = input_data.get("role")

    if not member_id or new_role not in ("owner", "editor", "viewer"):
        raise HTTPException(status_code=400, detail="Invalid member_id or role input")

    with get_db_cursor() as cursor:
        cursor.execute("SELECT id, org_id, user_id, role FROM public.org_members WHERE id = %s;", (member_id,))
        target_member = cursor.fetchone()
        if not target_member:
            raise HTTPException(status_code=404, detail="Organization member not found.")

        org_id = str(target_member["org_id"])
        current_role = target_member["role"]

        # Check caller is owner
        cursor.execute("SELECT role FROM public.org_members WHERE org_id = %s AND user_id = %s;", (org_id, caller_user_id))
        caller_member = cursor.fetchone()
        if not caller_member or caller_member["role"] != "owner":
            raise HTTPException(status_code=403, detail="Forbidden: Only Organization Owners can change member roles")

        # Last Owner Protection
        if current_role == "owner" and new_role != "owner":
            cursor.execute("SELECT COUNT(*) as cnt FROM public.org_members WHERE org_id = %s AND role = 'owner';", (org_id,))
            owner_count = cursor.fetchone()["cnt"]
            if owner_count <= 1:
                raise HTTPException(status_code=400, detail="Cannot demote the last remaining Owner of the organization.")

        cursor.execute("UPDATE public.org_members SET role = %s WHERE id = %s;", (new_role, member_id))
        return {
            "success": True,
            "message": f"Member role updated to '{new_role}'.",
            "member_id": member_id,
            "role": new_role
        }


@router.post("/remove-org-member")
def action_remove_org_member(payload: HasuraActionPayload):
    """
    Hasura Action Webhook: removeOrgMember(member_id: UUID!)
    1. Authenticates X-Hasura-User-Id
    2. Verifies caller is an 'owner' in the target org
    3. Last Owner Protection: Prevents removing the last remaining owner
    """
    session_vars = payload.session_variables or {}
    caller_user_id = session_vars.get("x-hasura-user-id")
    if not caller_user_id:
        raise HTTPException(status_code=401, detail="Unauthorized: X-Hasura-User-Id missing from session variables")

    input_data = payload.input or {}
    member_id = input_data.get("member_id")

    if not member_id:
        raise HTTPException(status_code=400, detail="Missing member_id input")

    with get_db_cursor() as cursor:
        cursor.execute("SELECT id, org_id, user_id, role FROM public.org_members WHERE id = %s;", (member_id,))
        target_member = cursor.fetchone()
        if not target_member:
            raise HTTPException(status_code=404, detail="Organization member not found.")

        org_id = str(target_member["org_id"])
        current_role = target_member["role"]

        # Check caller is owner
        cursor.execute("SELECT role FROM public.org_members WHERE org_id = %s AND user_id = %s;", (org_id, caller_user_id))
        caller_member = cursor.fetchone()
        if not caller_member or caller_member["role"] != "owner":
            raise HTTPException(status_code=403, detail="Forbidden: Only Organization Owners can remove members")

        # Last Owner Protection
        if current_role == "owner":
            cursor.execute("SELECT COUNT(*) as cnt FROM public.org_members WHERE org_id = %s AND role = 'owner';", (org_id,))
            owner_count = cursor.fetchone()["cnt"]
            if owner_count <= 1:
                raise HTTPException(status_code=400, detail="Cannot remove the last remaining Owner of the organization.")

        cursor.execute("DELETE FROM public.org_members WHERE id = %s;", (member_id,))
        return {
            "success": True,
            "message": "Member removed successfully.",
            "member_id": member_id
        }


@router.post("/events/db-record-inserted")
def handle_db_record_inserted_event(payload: Dict[str, Any] = Body(...)):
    """
    Hasura Event Trigger Endpoint: on_custom_record_inserted
    Triggered when a row is inserted into public.custom_db_records.
    1. Extracts inserted record and org_id
    2. Enforces organization isolation
    3. Triggers matching active 'db_event' workflows in the SAME organization
    """
    event_data = payload.get("event", {}).get("data", {}).get("new", {})
    if not event_data:
        return {"status": "ignored", "reason": "No new row data found in event payload"}

    record_id = event_data.get("id")
    org_id = event_data.get("org_id")

    if not org_id:
        return {"status": "ignored", "reason": "Missing org_id in inserted record"}

    executed_runs = []

    with get_db_cursor() as cursor:
        # Find active db_event workflows strictly scoped to the same organization
        cursor.execute(
            """
            SELECT wt.workflow_id
            FROM public.workflow_triggers wt
            JOIN public.workflows w ON w.id = wt.workflow_id
            WHERE w.org_id = %s AND wt.trigger_type = 'db_event';
            """,
            (org_id,)
        )
        triggers = cursor.fetchall()

        for trg in triggers:
            wf_id = str(trg["workflow_id"])

            # Check Quota before triggering
            cursor.execute(
                """
                UPDATE public.organizations
                SET active_running_count = active_running_count + 1
                WHERE id = %s AND (current_usage + active_running_count) < usage_quota
                RETURNING usage_quota, current_usage, active_running_count;
                """,
                (org_id,)
            )
            quota = cursor.fetchone()
            if not quota:
                logger.warning(f"Org '{org_id}' quota limit reached for db_event trigger")
                continue

            try:
                run_id = start_workflow_run(wf_id, trigger_type="db_event")
                executed_runs.append(run_id)
            except Exception as e:
                cursor.execute(
                    "UPDATE public.organizations SET active_running_count = GREATEST(0, active_running_count - 1) WHERE id = %s;",
                    (org_id,)
                )
                logger.error(f"Failed to run workflow '{wf_id}' from DB event: {e}")

    return {
        "status": "processed",
        "record_id": record_id,
        "org_id": org_id,
        "executed_runs_count": len(executed_runs),
        "run_ids": executed_runs
    }


@router.post("/events/notification-inserted")
def handle_notification_inserted_event(payload: Dict[str, Any] = Body(...)):
    """
    Hasura Event Trigger Endpoint: on_notification_inserted
    Triggered when a row is inserted into public.notifications.
    Dispatches notification (Slack/Email stub) safely scoped to recipient/org.
    """
    event_data = payload.get("event", {}).get("data", {}).get("new", {})
    if not event_data:
        return {"status": "ignored", "reason": "No new row data found in event payload"}

    notification_id = event_data.get("id")
    recipient_id = event_data.get("recipient_id")
    title = event_data.get("title")
    message = event_data.get("message")

    logger.info(f"[NOTIFY EVENT STUB] Dispatched notification '{notification_id}' to recipient '{recipient_id}': Title='{title}', Message='{message}'")

    return {
        "status": "dispatched",
        "notification_id": notification_id,
        "recipient_id": recipient_id,
        "title": title
    }





