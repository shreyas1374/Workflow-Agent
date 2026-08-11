import json
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from app.db import get_db_cursor
from app.handlers.llm import execute_llm_step
from app.handlers.http import execute_http_step
from app.handlers.conditional import execute_conditional_step
from app.handlers.db_write import execute_db_write_step
from app.handlers.notify import execute_notify_step
from app.handlers.approval import execute_approval_step

def start_workflow_run(workflow_id: str, trigger_type: str = "manual", async_exec: bool = True) -> str:
    """
    Creates a new workflow run, takes a snapshot of workflow steps, and begins execution.
    If async_exec is True (default for Hasura Actions / Webhooks), launches execute_run_loop
    in a background thread so the HTTP response returns valid JSON immediately (<30ms).
    """
    with get_db_cursor() as cursor:
        # Fetch workflow and organization
        cursor.execute("SELECT id, org_id, name FROM public.workflows WHERE id = %s;", (workflow_id,))
        workflow = cursor.fetchone()
        if not workflow:
            raise ValueError(f"Workflow with ID '{workflow_id}' not found.")

        # Fetch steps ordered by position
        cursor.execute(
            """
            SELECT id, position, step_type, config, true_next_step_id, false_next_step_id
            FROM public.workflow_steps
            WHERE workflow_id = %s
            ORDER BY position ASC;
            """,
            (workflow_id,)
        )
        steps = cursor.fetchall()
        if not steps:
            raise ValueError(f"Workflow '{workflow_id}' contains no steps.")

        # Build snapshot config
        snapshot = [
            {
                "id": str(s["id"]),
                "position": s["position"],
                "step_type": s["step_type"],
                "config": s["config"],
                "true_next_step_id": str(s["true_next_step_id"]) if s.get("true_next_step_id") else None,
                "false_next_step_id": str(s["false_next_step_id"]) if s.get("false_next_step_id") else None,
            }
            for s in steps
        ]

        first_step_id = snapshot[0]["id"]

        # Insert new workflow_run
        cursor.execute(
            """
            INSERT INTO public.workflow_runs (workflow_id, trigger_type, status, current_step_id, snapshot_config)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id;
            """,
            (workflow_id, trigger_type, "running", first_step_id, json.dumps(snapshot))
        )
        run_record = cursor.fetchone()
        run_id = str(run_record["id"])

    # Launch execution loop (background daemon thread if async_exec=True)
    if async_exec:
        import threading
        thread = threading.Thread(target=execute_run_loop, args=(run_id,), daemon=True)
        thread.start()
    else:
        execute_run_loop(run_id)

    return run_id


def execute_run_loop(run_id: str) -> None:
    """
    Executes steps sequentially or via conditional branching for a given workflow run.
    Uses PostgreSQL transaction FOR UPDATE row locking to prevent race conditions.
    """
    with get_db_cursor() as cursor:
        # Row lock workflow_run to prevent concurrent execution
        cursor.execute(
            """
            SELECT r.id, r.workflow_id, r.status, r.current_step_id, r.paused_at_step_id, r.snapshot_config, w.org_id
            FROM public.workflow_runs r
            JOIN public.workflows w ON w.id = r.workflow_id
            WHERE r.id = %s
            FOR UPDATE;
            """,
            (run_id,)
        )
        run_data = cursor.fetchone()
        if not run_data:
            raise ValueError(f"Workflow run '{run_id}' not found.")

        if run_data["status"] not in ("running", "pending"):
            return  # Paused, completed, or failed runs should not execute

        org_id = str(run_data["org_id"])
        steps_snapshot = run_data["snapshot_config"]
        if isinstance(steps_snapshot, str):
            steps_snapshot = json.loads(steps_snapshot)

        # Index snapshot by step ID and build sequence lookup
        step_dict = {s["id"]: s for s in steps_snapshot}
        step_sequence = [s["id"] for s in steps_snapshot]

        current_step_id = str(run_data["current_step_id"]) if run_data.get("current_step_id") else step_sequence[0]
        prev_output: Dict[str, Any] = {}

        # Fetch output from previous completed step if re-entering loop
        curr_idx = step_sequence.index(current_step_id) if current_step_id in step_sequence else 0
        if curr_idx > 0:
            prev_step_id = step_sequence[curr_idx - 1]
            cursor.execute(
                "SELECT output FROM public.step_runs WHERE workflow_run_id = %s AND step_id = %s AND status = 'completed';",
                (run_id, prev_step_id)
            )
            prev_sr = cursor.fetchone()
            if prev_sr and prev_sr["output"]:
                prev_output = prev_sr["output"]
                if isinstance(prev_output, str):
                    try:
                        prev_output = json.loads(prev_output)
                    except Exception:
                        pass
                if isinstance(prev_output, dict) and "payload" in prev_output and isinstance(prev_output["payload"], dict):
                    prev_output = prev_output["payload"]

    # Main Step Loop
    while current_step_id:
        step = step_dict.get(current_step_id)
        if not step:
            break

        step_id = step["id"]
        step_type = step["step_type"]
        config = step.get("config", {})

        # Check existing step_run state
        with get_db_cursor() as cursor:
            cursor.execute(
                "SELECT id, status, output FROM public.step_runs WHERE workflow_run_id = %s AND step_id = %s;",
                (run_id, step_id)
            )
            existing_step_run = cursor.fetchone()

            if existing_step_run:
                if existing_step_run["status"] == "completed":
                    prev_output = existing_step_run["output"] if existing_step_run["output"] else {}
                    if isinstance(prev_output, str):
                        try:
                            prev_output = json.loads(prev_output)
                        except Exception:
                            pass
                    # Determine next step
                    current_step_id = _get_next_step_id(step, prev_output, step_sequence)
                    continue
                elif existing_step_run["status"] == "paused":
                    # Currently awaiting human approval, stop execution loop cleanly
                    return
                else:
                    step_run_id = str(existing_step_run["id"])
            else:
                # Insert running step_run
                cursor.execute(
                    """
                    INSERT INTO public.step_runs (workflow_run_id, step_id, status, input)
                    VALUES (%s, %s, %s, %s)
                    RETURNING id;
                    """,
                    (run_id, step_id, "running", json.dumps(prev_output))
                )
                step_run_record = cursor.fetchone()
                step_run_id = str(step_run_record["id"])

        # Execute Handler
        try:
            attempt_count = 1
            error_msg = ""
            res_output = {}

            if step_type == "llm_call":
                res_output = execute_llm_step(config, prev_output)
            elif step_type == "http_request":
                res_output, attempt_count, error_msg = execute_http_step(config, prev_output)
            elif step_type == "conditional_branch":
                res_output = execute_conditional_step(config, prev_output, step, run_id=run_id)
            elif step_type == "db_write":
                res_output = execute_db_write_step(org_id, config, prev_output)
            elif step_type == "notify":
                res_output = execute_notify_step(org_id, run_id, config, prev_output)
            elif step_type == "approval_gate":
                # Pause workflow execution cleanly
                res_output = execute_approval_step(config, prev_output)
                with get_db_cursor() as cursor:
                    cursor.execute(
                        "UPDATE public.step_runs SET status = %s, output = %s WHERE id = %s;",
                        ("paused", json.dumps(res_output), step_run_id)
                    )
                    cursor.execute(
                        "UPDATE public.workflow_runs SET status = %s, paused_at_step_id = %s WHERE id = %s;",
                        ("paused", step_id, run_id)
                    )
                return  # Stop execution loop immediately at approval gate

            if error_msg:
                # Step failed after retries
                with get_db_cursor() as cursor:
                    cursor.execute(
                        "UPDATE public.step_runs SET status = %s, error_message = %s, attempt_count = %s, completed_at = now() WHERE id = %s;",
                        ("failed", error_msg, attempt_count, step_run_id)
                    )
                    cursor.execute(
                        "UPDATE public.workflow_runs SET status = %s, error_message = %s, completed_at = now() WHERE id = %s;",
                        ("failed", f"Step '{step_type}' failed: {error_msg}", run_id)
                    )
                    cursor.execute(
                        """
                        UPDATE public.organizations
                        SET active_running_count = GREATEST(0, active_running_count - 1),
                            current_usage = current_usage + 1
                        WHERE id = %s;
                        """,
                        (org_id,)
                    )
                return

            # Step completed successfully
            with get_db_cursor() as cursor:
                cursor.execute(
                    "UPDATE public.step_runs SET status = %s, output = %s, attempt_count = %s, completed_at = now() WHERE id = %s;",
                    ("completed", json.dumps(res_output), attempt_count, step_run_id)
                )

            prev_output = res_output
            next_step_id = _get_next_step_id(step, prev_output, step_sequence)

            with get_db_cursor() as cursor:
                cursor.execute(
                    "UPDATE public.workflow_runs SET current_step_id = %s WHERE id = %s;",
                    (next_step_id, run_id)
                )

            current_step_id = next_step_id

        except Exception as err:
            with get_db_cursor() as cursor:
                cursor.execute(
                    "UPDATE public.step_runs SET status = %s, error_message = %s, completed_at = now() WHERE id = %s;",
                    ("failed", str(err), step_run_id)
                )
                cursor.execute(
                    "UPDATE public.workflow_runs SET status = %s, error_message = %s, completed_at = now() WHERE id = %s;",
                    ("failed", str(err), run_id)
                )
                cursor.execute(
                    """
                    UPDATE public.organizations
                    SET active_running_count = GREATEST(0, active_running_count - 1),
                        current_usage = current_usage + 1
                    WHERE id = %s;
                    """,
                    (org_id,)
                )
            return

    # All steps completed successfully
    with get_db_cursor() as cursor:
        cursor.execute(
            "UPDATE public.workflow_runs SET status = %s, completed_at = now() WHERE id = %s;",
            ("completed", run_id)
        )
        cursor.execute(
            """
            UPDATE public.organizations
            SET active_running_count = GREATEST(0, active_running_count - 1),
                current_usage = current_usage + 1
            WHERE id = %s;
            """,
            (org_id,)
        )


def _get_next_step_id(step: Dict[str, Any], output: Dict[str, Any], sequence: list) -> Optional[str]:
    """
    Determines the next step ID based on step routing (conditional branch or standard position order).
    """
    if step["step_type"] == "conditional_branch":
        selected_id = output.get("selected_next_step_id")
        if selected_id:
            return selected_id

    # Fallback to standard sequential position
    curr_idx = sequence.index(step["id"]) if step["id"] in sequence else -1
    if curr_idx != -1 and curr_idx + 1 < len(sequence):
        return sequence[curr_idx + 1]

    return None


def resume_workflow(run_id: str, approver_id: str) -> None:
    """
    Resumes a paused workflow run after verifying approver permissions.
    """
    with get_db_cursor() as cursor:
        # Fetch workflow run
        cursor.execute(
            """
            SELECT r.id, r.workflow_id, r.status, r.paused_at_step_id, r.snapshot_config, w.org_id
            FROM public.workflow_runs r
            JOIN public.workflows w ON w.id = r.workflow_id
            WHERE r.id = %s;
            """,
            (run_id,)
        )
        run_data = cursor.fetchone()
        if not run_data:
            raise ValueError(f"Workflow run '{run_id}' not found.")

        if run_data["status"] != "paused":
            raise ValueError(f"Workflow run '{run_id}' is not currently paused (status: {run_data['status']}).")

        org_id = str(run_data["org_id"])
        paused_step_id = str(run_data["paused_at_step_id"])

        # 1. Validate organization membership and role
        cursor.execute(
            "SELECT role FROM public.org_members WHERE org_id = %s AND user_id = %s;",
            (org_id, approver_id)
        )
        member = cursor.fetchone()
        if not member:
            raise PermissionError(f"Approver must belong to the organization '{org_id}' to approve this workflow.")
        if member["role"] not in ("owner", "editor"):
            raise PermissionError(f"User '{approver_id}' does not have owner/editor role in organization '{org_id}'.")

        # 2. Verify the step_run is actually paused & 3. Mark approval step completed
        cursor.execute(
            """
            UPDATE public.step_runs
            SET status = 'completed', approved_by = %s, approved_at = now(), completed_at = now()
            WHERE workflow_run_id = %s AND step_id = %s AND status = 'paused'
            RETURNING id;
            """,
            (approver_id, run_id, paused_step_id)
        )
        updated_sr = cursor.fetchone()
        if not updated_sr:
            raise ValueError(f"Step run for step '{paused_step_id}' in run '{run_id}' is not in paused state.")

        # Parse snapshot config
        steps_snapshot = run_data["snapshot_config"]
        if isinstance(steps_snapshot, str):
            steps_snapshot = json.loads(steps_snapshot)

        step_sequence = [s["id"] for s in steps_snapshot]
        step_dict = {s["id"]: s for s in steps_snapshot}
        paused_step = step_dict.get(paused_step_id, {})

        # 5. Determine next step
        next_step_id = _get_next_step_id(paused_step, {}, step_sequence)

        # 4. Set workflow_run.status = 'running' & 5. Set current_step_id to next_step_id
        cursor.execute(
            """
            UPDATE public.workflow_runs
            SET status = 'running', current_step_id = %s, paused_at_step_id = NULL
            WHERE id = %s;
            """,
            (next_step_id, run_id)
        )

    # 6. Resume execution
    execute_run_loop(run_id)
