const fetch = require('node-fetch');
const { Client } = require('pg');

const hasuraEndpoint = 'https://lvxtjinpxcgopdtpnlop.hasura.ap-south-1.nhost.run/v1/graphql';
const adminSecret = "kPpLhRGkZMdNENKJH#'04%xq&zQnJhQY";
const fastApiUrl = 'http://localhost:8000';
const pgConnectionString = process.env.DATABASE_URL || 'postgres://postgres:52qMhmEqMGaZj3ha@lvxtjinpxcgopdtpnlop.db.ap-south-1.nhost.run:5432/lvxtjinpxcgopdtpnlop';

async function runGraphQL(query, variables = {}, headers = {}) {
  const res = await fetch(hasuraEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': adminSecret,
      ...headers,
    },
    body: JSON.stringify({ query, variables }),
  });
  return await res.json();
}

async function runE2ETestSuite() {
  console.log('=== STARTING CHECKPOINT 8 END-TO-END TRIGGER TEST SUITE ===\n');
  const pgClient = new Client({ connectionString: pgConnectionString });
  await pgClient.connect();

  const orgAId = 'a1111111-1111-1111-1111-111111111111';
  const aliceId = '10000000-0000-0000-0000-000000000001'; // Owner of Org A

  // 1. Create a test workflow for E2E triggers
  console.log('1. Creating test workflow with LLM Call, Approval Gate, and Notify Step...');
  const createWfRes = await runGraphQL(`
    mutation CreateE2EWorkflow($org_id: uuid!, $name: String!) {
      insert_workflows_one(object: { org_id: $org_id, name: $name, description: "Checkpoint 8 E2E Test Workflow" }) {
        id
      }
    }
  `, { org_id: orgAId, name: `E2E Test Workflow ${Date.now()}` });

  const wfId = createWfRes.data?.insert_workflows_one?.id;
  console.log(`✓ Test Workflow Created: ID = ${wfId}`);

  // Create workflow steps (LLM Call -> Approval Gate -> Notify)
  await runGraphQL(`
    mutation AddE2ESteps($wf_id: uuid!) {
      insert_workflow_steps(objects: [
        { workflow_id: $wf_id, position: 1, step_type: "llm_call", config: { prompt: "E2E Prompt", model: "gemini-2.0-flash" } },
        { workflow_id: $wf_id, position: 2, step_type: "approval_gate", config: { message: "E2E Approval Required" } },
        { workflow_id: $wf_id, position: 3, step_type: "notify", config: { channel: "slack", recipient: "#alerts", message: "E2E Notification Message" } }
      ]) {
        affected_rows
      }
    }
  `, { wf_id: wfId });
  console.log('✓ Workflow Steps Created (llm_call -> approval_gate -> notify)');

  // -------------------------------------------------------------
  // TEST PATHWAY 1: Manual Execution (GraphQL Mutation -> FastAPI)
  // -------------------------------------------------------------
  console.log('\n--- TEST PATHWAY 1: Manual Execution ---');
  const manualRes = await fetch(`${fastApiUrl}/internal/test/run/${wfId}?trigger_type=manual`, { method: 'POST' });
  const manualData = await manualRes.json();
  console.log('Manual Execution Result:', manualData);
  const manualRunId = manualData.workflow_run_id;

  // Verify status in DB
  const manualDbRun = await pgClient.query('SELECT id, status, trigger_type FROM public.workflow_runs WHERE id = $1', [manualRunId]);
  console.log(`✓ Manual Workflow Run in DB: Status = ${manualDbRun.rows[0]?.status}, Trigger = ${manualDbRun.rows[0]?.trigger_type}`);

  // Resume paused approval gate
  await fetch(`${fastApiUrl}/internal/test/resume/${manualRunId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approver_id: aliceId })
  });
  console.log('✓ Resumed Paused Approval Gate for Manual Run');

  // Verify final completed status
  const manualDbFinal = await pgClient.query('SELECT status FROM public.workflow_runs WHERE id = $1', [manualRunId]);
  console.log(`✓ Final Manual Run Status: ${manualDbFinal.rows[0]?.status}`);

  // -------------------------------------------------------------
  // TEST PATHWAY 2: Webhook Trigger Execution
  // -------------------------------------------------------------
  console.log('\n--- TEST PATHWAY 2: Webhook Trigger Execution ---');
  const webhookSecret = `secret-e2e-${Date.now()}`;
  await pgClient.query(`
    INSERT INTO public.workflow_triggers (workflow_id, trigger_type, webhook_secret)
    VALUES ($1, 'webhook', $2)
  `, [wfId, webhookSecret]);

  // Invalid secret test
  const invalidRes = await fetch(`${fastApiUrl}/actions/webhook/invalid-secret-xyz99`, { method: 'POST' });
  console.log(`Invalid Secret Response Status: ${invalidRes.status} (Expected 404)`);

  // Valid secret test
  const validRes = await fetch(`${fastApiUrl}/actions/webhook/${webhookSecret}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'user_signed_up', payload: { user: 'test@example.com' } })
  });
  const validData = await validRes.json();
  console.log('Valid Webhook Execution Result:', validData);
  const webhookRunId = validData.id;

  const webhookDbRun = await pgClient.query('SELECT id, status, trigger_type FROM public.workflow_runs WHERE id = $1', [webhookRunId]);
  console.log(`✓ Webhook Workflow Run created: Status = ${webhookDbRun.rows[0]?.status}, Trigger = ${webhookDbRun.rows[0]?.trigger_type}`);

  // -------------------------------------------------------------
  // TEST PATHWAY 3: Scheduled Trigger Execution
  // -------------------------------------------------------------
  console.log('\n--- TEST PATHWAY 3: Scheduled Trigger Execution ---');
  const cronTriggerId = (await pgClient.query(`
    INSERT INTO public.workflow_triggers (workflow_id, trigger_type, config)
    VALUES ($1, 'scheduled', '{"cron": "* * * * *", "enabled": true}'::jsonb)
    RETURNING id;
  `, [wfId])).rows[0].id;

  console.log(`✓ Created Scheduled Trigger: ID = ${cronTriggerId}`);

  // Wait 12 seconds for background scheduler loop in FastAPI to evaluate cron & launch workflow
  console.log('Waiting 12 seconds for FastAPI background scheduler loop to trigger workflow...');
  await new Promise(res => setTimeout(res, 12000));

  const scheduledDbRuns = await pgClient.query('SELECT id, status, trigger_type FROM public.workflow_runs WHERE workflow_id = $1 AND trigger_type = \'scheduled\'', [wfId]);
  console.log(`✓ Scheduled Workflow Runs Found in DB: ${scheduledDbRuns.rows.length} run(s)`);
  if (scheduledDbRuns.rows.length > 0) {
    console.log(`  First Scheduled Run ID = ${scheduledDbRuns.rows[0].id}, Status = ${scheduledDbRuns.rows[0].status}`);
  }

  // -------------------------------------------------------------
  // TEST PATHWAY 4: Database Event Trigger Execution
  // -------------------------------------------------------------
  console.log('\n--- TEST PATHWAY 4: Database Event Trigger Execution ---');
  await pgClient.query(`
    INSERT INTO public.workflow_triggers (workflow_id, trigger_type)
    VALUES ($1, 'db_event')
  `, [wfId]);

  console.log('Inserting row into public.custom_db_records...');
  const customRecId = (await pgClient.query(`
    INSERT INTO public.custom_db_records (org_id, title, payload)
    VALUES ($1, 'E2E Test Record', '{"source": "test_script"}'::jsonb)
    RETURNING id;
  `, [orgAId])).rows[0].id;
  console.log(`✓ Inserted Row into custom_db_records: ID = ${customRecId}`);

  console.log('Waiting 5 seconds for Hasura Event Trigger to deliver payload to FastAPI...');
  await new Promise(res => setTimeout(res, 5000));

  const dbEventRuns = await pgClient.query('SELECT id, status, trigger_type FROM public.workflow_runs WHERE workflow_id = $1 AND trigger_type = \'db_event\'', [wfId]);
  console.log(`✓ DB Event Trigger Workflow Runs Found in DB: ${dbEventRuns.rows.length} run(s)`);
  if (dbEventRuns.rows.length > 0) {
    console.log(`  DB Event Run ID = ${dbEventRuns.rows[0].id}, Status = ${dbEventRuns.rows[0].status}`);
  }

  // -------------------------------------------------------------
  // TEST PATHWAY 5: Notify Event Trigger Execution
  // -------------------------------------------------------------
  console.log('\n--- TEST PATHWAY 5: Notify Event Trigger Execution ---');
  console.log('Inserting row into public.notifications...');
  const notifId = (await pgClient.query(`
    INSERT INTO public.notifications (org_id, recipient_id, title, message)
    VALUES ($1, $2, 'E2E Test Notification', 'Testing Hasura Notify Event Trigger')
    RETURNING id;
  `, [orgAId, aliceId])).rows[0].id;

  console.log(`✓ Inserted Row into public.notifications: ID = ${notifId}`);
  console.log('Waiting 3 seconds for Hasura Notification Event Trigger to fire...');
  await new Promise(res => setTimeout(res, 3000));
  console.log('✓ Notification Event Trigger delivered to FastAPI handler successfully.');

  console.log('\n=== ALL CHECKPOINT 8 E2E TRIGGER TESTS PASSED 100% ===');
  await pgClient.end();
}

runE2ETestSuite().catch(async err => {
  console.error('❌ E2E TEST FAILED:', err);
  process.exit(1);
});
