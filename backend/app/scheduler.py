import asyncio
import logging
from datetime import datetime, timezone
from croniter import croniter
from app.db import get_db_cursor
from app.executor import start_workflow_run

logger = logging.getLogger("scheduler")
logger.setLevel(logging.INFO)

_scheduler_task = None

async def _scheduler_loop():
    """
    Lightweight Asyncio Background Scheduler for Scheduled Triggers.
    Intended for single-worker deployment in this assignment context.
    Evaluates cron expressions and launches workflow runs via existing execution engine.
    Atomically updates last_run_at in PostgreSQL to prevent duplicate runs.
    """
    logger.info("Starting lightweight scheduled trigger background runner...")
    while True:
        try:
            now = datetime.now(timezone.utc)
            current_minute_str = now.strftime("%Y-%m-%d %H:%M:00")

            triggers_to_run = []

            with get_db_cursor() as cursor:
                cursor.execute(
                    """
                    SELECT wt.id, wt.workflow_id, wt.config, w.org_id
                    FROM public.workflow_triggers wt
                    JOIN public.workflows w ON w.id = wt.workflow_id
                    WHERE wt.trigger_type = 'scheduled';
                    """
                )
                scheduled_triggers = cursor.fetchall()

                for trg in scheduled_triggers:
                    config = trg["config"] or {}
                    enabled = config.get("enabled", True)
                    cron_expr = config.get("cron")
                    last_run_at = config.get("last_run_at")

                    if not enabled or not cron_expr:
                        continue

                    # If already executed for this minute, skip to prevent duplicates
                    if last_run_at == current_minute_str:
                        continue

                    try:
                        # Check if cron matches current minute
                        if croniter.match(cron_expr, now):
                            triggers_to_run.append((str(trg["id"]), str(trg["workflow_id"]), current_minute_str))
                    except Exception as ce:
                        logger.warning(f"Invalid cron expression '{cron_expr}' for trigger '{trg['id']}': {ce}")

                # Atomic updates to prevent duplicate execution across poll iterations
                actual_runs = []
                for trg_id, wf_id, minute_str in triggers_to_run:
                    cursor.execute(
                        """
                        UPDATE public.workflow_triggers
                        SET config = jsonb_set(COALESCE(config, '{}'::jsonb), '{last_run_at}', %s::jsonb),
                            updated_at = now()
                        WHERE id = %s AND (config->>'last_run_at') IS DISTINCT FROM %s
                        RETURNING id;
                        """,
                        (f'"{minute_str}"', trg_id, minute_str)
                    )
                    if cursor.fetchone():
                        actual_runs.append(wf_id)

            # Trigger executions via existing execution engine
            for wf_id in actual_runs:
                try:
                    run_id = start_workflow_run(wf_id, trigger_type="scheduled")
                    logger.info(f"[Scheduled Trigger] Launched workflow run '{run_id}' for workflow '{wf_id}'")
                except Exception as ex:
                    logger.error(f"[Scheduled Trigger] Execution failed for workflow '{wf_id}': {ex}")

        except Exception as e:
            logger.error(f"[Scheduler Loop Error]: {e}")

        # Poll every 10 seconds
        await asyncio.sleep(10)


def start_scheduler():
    global _scheduler_task
    if _scheduler_task is None or _scheduler_task.done():
        _scheduler_task = asyncio.create_task(_scheduler_loop())


def stop_scheduler():
    global _scheduler_task
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
        _scheduler_task = None
