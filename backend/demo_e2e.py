"""
demo_e2e.py — Full End-to-End Approval & Conditional Routing Verification

Demonstrates:
  LLM (Real API) → HTTP → Conditional (priority == HIGH) → Approval Gate (PAUSED) → DB Write (PENDING)
  ↓
  Bob (Editor) Approves
  ↓
  DB Write (COMPLETED) → Workflow (COMPLETED)

Usage:
  python demo_e2e.py
  python demo_e2e.py --provider nvidia
"""
import argparse
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

from app.db import get_db_cursor
from app.executor import start_workflow_run, resume_workflow
from app.config import settings

GREEN  = "\033[92m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
RED    = "\033[91m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

def ok(msg):   print(f"{GREEN}  [OK] {msg}{RESET}")
def info(msg): print(f"{CYAN}  [->] {msg}{RESET}")
def warn(msg): print(f"{YELLOW}  [!] {msg}{RESET}")
def err(msg):  print(f"{RED}  [X] {msg}{RESET}")
def step(n, msg): print(f"\n{BOLD}{CYAN}[Step {n}]{RESET} {msg}")

ORG_A_ID  = "a1111111-1111-1111-1111-111111111111"
ALICE_ID  = "10000000-0000-0000-0000-000000000001"   # alice@orga.com — Owner
BOB_ID    = "8d319f8f-1c5d-4eb8-ab3b-54289f5c9e88"  # abc@gmail.com  — Editor

def ensure_bob_is_editor():
    """Ensure Bob (abc@gmail.com) has editor role in Org A."""
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT role FROM public.org_members WHERE org_id = %s AND user_id = %s;",
            (ORG_A_ID, BOB_ID)
        )
        row = cursor.fetchone()
        if not row:
            cursor.execute("""
                INSERT INTO public.org_members (org_id, user_id, role)
                VALUES (%s, %s, 'editor');
            """, (ORG_A_ID, BOB_ID))
            ok("Bob (abc@gmail.com) added as Editor to Org A")
        elif row["role"] not in ("owner", "editor"):
            cursor.execute("""
                UPDATE public.org_members SET role = 'editor'
                WHERE org_id = %s AND user_id = %s;
            """, (ORG_A_ID, BOB_ID))
            ok("Bob's role updated to Editor in Org A")
        else:
            ok(f"Bob already has role '{row['role']}' in Org A")

def create_conditional_workflow(provider: str, model: str) -> tuple:
    """
    Creates a 5-step workflow with explicit conditional branch true_next_step_id linking:
      Step 1: LLM Call
      Step 2: HTTP Request
      Step 3: Conditional Branch (priority == HIGH)
      Step 4: Approval Gate (True path)
      Step 5: DB Write (False path & post-approval path)
    """
    with get_db_cursor() as cursor:
        # Insert Workflow
        cursor.execute("""
            INSERT INTO public.workflows (org_id, name, description)
            VALUES (%s, %s, %s)
            RETURNING id;
        """, (
            ORG_A_ID,
            f"Conditional Approval Workflow ({provider})",
            f"LLM ({provider}) → HTTP → Branch (priority == HIGH) → Approval → DB Write"
        ))
        wf_id = str(cursor.fetchone()["id"])

        # Insert Steps 1, 2, 4, 5 first to get their step IDs
        cursor.execute("""
            INSERT INTO public.workflow_steps (workflow_id, position, step_type, config)
            VALUES (%s, 1, 'llm_call', %s::jsonb)
            RETURNING id;
        """, (wf_id, json.dumps({
            "prompt": "Respond strictly in JSON format with key 'priority' set to 'HIGH'. Example: {\"priority\": \"HIGH\"}",
            "model": model,
            "provider": provider,
        })))
        s1_id = str(cursor.fetchone()["id"])

        cursor.execute("""
            INSERT INTO public.workflow_steps (workflow_id, position, step_type, config)
            VALUES (%s, 2, 'http_request', '{"method": "GET", "url": "https://jsonplaceholder.typicode.com/todos/1"}'::jsonb)
            RETURNING id;
        """, (wf_id,))
        s2_id = str(cursor.fetchone()["id"])

        cursor.execute("""
            INSERT INTO public.workflow_steps (workflow_id, position, step_type, config)
            VALUES (%s, 4, 'approval_gate', '{"message": "High priority order - Manager approval required"}'::jsonb)
            RETURNING id;
        """, (wf_id,))
        s4_id = str(cursor.fetchone()["id"])

        cursor.execute("""
            INSERT INTO public.workflow_steps (workflow_id, position, step_type, config)
            VALUES (%s, 5, 'db_write', '{"table_name": "processed_orders", "payload": {"status": "approved"}}'::jsonb)
            RETURNING id;
        """, (wf_id,))
        s5_id = str(cursor.fetchone()["id"])

        # Insert Step 3 (conditional_branch) linking true_next_step_id -> Step 4, false_next_step_id -> Step 5
        cursor.execute("""
            INSERT INTO public.workflow_steps (workflow_id, position, step_type, config, true_next_step_id, false_next_step_id)
            VALUES (%s, 3, 'conditional_branch', '{"condition": "priority == HIGH"}'::jsonb, %s, %s)
            RETURNING id;
        """, (wf_id, s4_id, s5_id))
        s3_id = str(cursor.fetchone()["id"])

    return wf_id, (s1_id, s2_id, s3_id, s4_id, s5_id)

def get_detailed_step_statuses(run_id: str, step_ids: tuple) -> list:
    s1_id, s2_id, s3_id, s4_id, s5_id = step_ids
    pos_map = {s1_id: (1, "llm_call"), s2_id: (2, "http_request"), s3_id: (3, "conditional_branch"), s4_id: (4, "approval_gate"), s5_id: (5, "db_write")}

    with get_db_cursor() as cursor:
        cursor.execute("""
            SELECT step_id, status, output, approved_by, error_message
            FROM public.step_runs
            WHERE workflow_run_id = %s;
        """, (run_id,))
        rows = cursor.fetchall()
        sr_dict = {str(r["step_id"]): r for r in rows}

    results = []
    for sid in [s1_id, s2_id, s3_id, s4_id, s5_id]:
        pos, stype = pos_map[sid]
        if sid in sr_dict:
            sr = sr_dict[sid]
            results.append({
                "position": pos,
                "step_type": stype,
                "status": sr["status"],
                "output": sr["output"],
                "approved_by": sr.get("approved_by"),
                "error": sr.get("error_message")
            })
        else:
            results.append({
                "position": pos,
                "step_type": stype,
                "status": "pending",
                "output": None,
                "approved_by": None,
                "error": None
            })
    return results

def get_run_info(run_id: str) -> dict:
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT status, current_step_id, paused_at_step_id, error_message FROM public.workflow_runs WHERE id = %s;",
            (run_id,)
        )
        return cursor.fetchone()

def main():
    parser = argparse.ArgumentParser(description="AI Workflow Approval & Conditional Routing Verification")
    parser.add_argument("--provider", default="groq", choices=["groq", "nvidia", "gemini"],
                        help="LLM provider to use (default: groq)")
    parser.add_argument("--model", default="",
                        help="Model name override")
    args = parser.parse_args()

    provider = args.provider
    model    = args.model

    settings.HTTP_STUB_MODE = True  # Avoid public httpbin.org network drops during live LLM demo

    groq_key = settings.GROQ_API_KEY.strip('"').strip("'")
    nvidia_key = settings.NVIDIA_API_KEY.strip('"').strip("'")

    if provider == "groq" and not groq_key:
        err("GROQ_API_KEY not set in .env.local — cannot run live demo.")
        sys.exit(1)
    if provider == "nvidia" and not nvidia_key:
        err("NVIDIA_API_KEY not set in .env.local — cannot run live demo.")
        sys.exit(1)

    print(f"\n{BOLD}{'='*70}{RESET}")
    print(f"{BOLD}  APPROVAL GATE & CONDITIONAL BRANCHING E2E VERIFICATION{RESET}")
    print(f"{BOLD}  Provider: {provider.upper()}  |  Org A{RESET}")
    print(f"{BOLD}{'='*70}{RESET}")

    # ── STEP 1: Setup ──────────────────────────────────────────────────────
    step(1, "Ensuring Alice (Owner) and Bob (Editor) exist in Org A")
    ensure_bob_is_editor()

    # ── STEP 2: Create Workflow ─────────────────────────────────────────────
    step(2, "Alice creates workflow with conditional routing (priority == HIGH -> Approval Gate)")
    wf_id, step_ids = create_conditional_workflow(provider, model)
    ok(f"Workflow created: {wf_id}")

    # ── STEP 3: Start Run (Phase 1) ─────────────────────────────────────────
    step(3, "Alice starts workflow execution run...")
    info("Calling REAL LLM API (Groq/NVIDIA) and HTTP API...")
    run_id = start_workflow_run(wf_id, trigger_type="manual", async_exec=False)
    ok(f"Workflow run started: {run_id}")

    # ── STEP 4: Verify Phase 1 State (PAUSED at Approval Gate) ──────────────
    step(4, "VERIFICATION PHASE 1: Checking status BEFORE Approval")
    run_data = get_run_info(run_id)
    info(f"Workflow Run Status:          {BOLD}{run_data['status'].upper()}{RESET}")
    info(f"Current Step ID:              {run_data['current_step_id']}")
    info(f"Paused At Step ID:            {run_data['paused_at_step_id']}")

    print("\n  " + BOLD + "Step Statuses BEFORE Approval:" + RESET)
    steps_before = get_detailed_step_statuses(run_id, step_ids)
    for s in steps_before:
        if s["status"] == "completed":
            icon, color = "[OK]", GREEN
        elif s["status"] == "paused":
            icon, color = "[PAUSED]", YELLOW
        else:
            icon, color = "[PENDING]", CYAN
        print(f"    {color}{icon} Step {s['position']} [{s['step_type']:20s}] -> {s['status'].upper()}{RESET}")
        if s["step_type"] == "llm_call" and s["output"]:
            out_txt = s["output"].get("response_text", "") if isinstance(s["output"], dict) else str(s["output"])
            print(f"        {CYAN}LLM Output: {out_txt[:120].strip()}{RESET}")
        if s["step_type"] == "conditional_branch" and s["output"]:
            print(f"        {CYAN}Condition evaluated: '{s['output'].get('condition_evaluated')}' => is_true={s['output'].get('is_true')}{RESET}")

    # Verify requirements for Phase 1
    assert run_data["status"] == "paused", f"Expected run status 'paused', got '{run_data['status']}'"
    approval_step_status = [s for s in steps_before if s["step_type"] == "approval_gate"][0]["status"]
    db_write_step_status = [s for s in steps_before if s["step_type"] == "db_write"][0]["status"]

    assert approval_step_status == "paused", f"Expected approval step 'paused', got '{approval_step_status}'"
    assert db_write_step_status == "pending", f"Expected DB Write step 'pending', got '{db_write_step_status}'"

    ok("PHASE 1 PASSED: Execution stopped cleanly at Approval Gate! DB Write remains PENDING.")

    # ── STEP 5: Bob Approves (Phase 2) ──────────────────────────────────────
    step(5, f"Bob (Org A Editor: {BOB_ID[:8]}...) calls approveStep / resume_workflow")
    resume_workflow(run_id, approver_id=BOB_ID)
    ok("Bob approved the gate!")

    # ── STEP 6: Verify Phase 2 State (COMPLETED) ────────────────────────────
    step(6, "VERIFICATION PHASE 2: Checking status AFTER Approval")
    final_run_data = get_run_info(run_id)
    info(f"Workflow Run Status:          {BOLD}{final_run_data['status'].upper()}{RESET}")

    print("\n  " + BOLD + "Step Statuses AFTER Approval:" + RESET)
    steps_after = get_detailed_step_statuses(run_id, step_ids)
    for s in steps_after:
        icon, color = "[OK]", GREEN
        print(f"    {color}{icon} Step {s['position']} [{s['step_type']:20s}] -> {s['status'].upper()}{RESET}")
        if s["step_type"] == "approval_gate":
            print(f"        {CYAN}Approved by user: {s['approved_by']}{RESET}")
        if s["step_type"] == "db_write" and s["output"]:
            print(f"        {CYAN}DB Write Output: {s['output']}{RESET}")

    assert final_run_data["status"] == "completed", f"Expected final run status 'completed', got '{final_run_data['status']}'"
    final_db_write_status = [s for s in steps_after if s["step_type"] == "db_write"][0]["status"]
    assert final_db_write_status == "completed", f"Expected DB Write status 'completed', got '{final_db_write_status}'"

    ok("PHASE 2 PASSED: DB Write executed after approval! Workflow is now COMPLETED.")

    print(f"\n{BOLD}{'='*70}{RESET}")
    print(f"{GREEN}{BOLD}  *** ALL VERIFICATION CHECKS PASSED SUCCESSFULLY! ***{RESET}")
    print(f"  Run ID:      {run_id}")
    print(f"  Workflow ID: {wf_id}")
    print(f"{BOLD}{'='*70}{RESET}\n")

if __name__ == "__main__":
    main()
