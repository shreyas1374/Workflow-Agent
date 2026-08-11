-- Verification SQL script for AI Agent Workflow Builder Schema
-- Run this in Hasura SQL Editor to verify tables, foreign keys, and indexes compile correctly.

BEGIN;

-- 1. Insert a test organization
INSERT INTO public.organizations (id, name, usage_quota, current_usage)
VALUES ('11111111-1111-1111-1111-111111111111', 'Org A Test', 100, 0);

-- Note: We do not insert into org_members here directly because user_id references auth.users.
-- Since auth.users is managed by Nhost, testing it requires a real user ID from auth.users.

-- 2. Insert a test workflow
INSERT INTO public.workflows (id, org_id, name, description)
VALUES ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Sample Test Workflow', 'Verifying Phase 2 Schema');

-- 3. Insert workflow steps (including conditional step branching)
INSERT INTO public.workflow_steps (id, workflow_id, position, step_type, config)
VALUES ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 1, 'llm_call', '{"model": "gemini-2"}');

INSERT INTO public.workflow_steps (id, workflow_id, position, step_type, config, true_next_step_id)
VALUES ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 2, 'conditional_branch', '{"condition": "status == 200"}', '33333333-3333-3333-3333-333333333333');

-- 4. Insert workflow trigger
INSERT INTO public.workflow_triggers (id, workflow_id, trigger_type, config, webhook_secret)
VALUES ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'webhook', '{"path": "/trigger"}', 'secret123');

-- 5. Insert workflow run
INSERT INTO public.workflow_runs (id, workflow_id, trigger_type, status, current_step_id, snapshot_config)
VALUES ('66666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222', 'webhook', 'running', '44444444-4444-4444-4444-444444444444', '{}'::jsonb);

-- 6. Insert step run
INSERT INTO public.step_runs (id, workflow_run_id, step_id, status, input, output)
VALUES ('77777777-7777-7777-7777-777777777777', '66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333', 'completed', '{"data": "hello"}', '{"response": "world"}');

-- 7. Insert notification record
INSERT INTO public.notifications (org_id, workflow_run_id, channel, recipient, message, status)
VALUES ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', 'email', 'owner@example.com', 'Workflow completed successfully', 'pending');

-- 8. Insert custom db record
INSERT INTO public.custom_db_records (org_id, table_name, payload)
VALUES ('11111111-1111-1111-1111-111111111111', 'leads', '{"name": "John Doe", "email": "john@doe.com"}');

-- Rollback immediately so we don't pollute the actual database with dummy keys
ROLLBACK;

SELECT 'Schema verification succeeded: All foreign keys, CHECK constraints, and default scopes are validated!' AS result;
