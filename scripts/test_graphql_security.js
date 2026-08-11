const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'lvxtjinpxcgopdtpnlop';
const region = process.env.NEXT_PUBLIC_NHOST_REGION || 'ap-south-1';
const graphqlUrl = process.env.NEXT_PUBLIC_NHOST_BACKEND_URL
  ? `${process.env.NEXT_PUBLIC_NHOST_BACKEND_URL}/v1/graphql`
  : `https://${subdomain}.hasura.${region}.nhost.run/v1/graphql`;

const adminSecret = process.env.NHOST_ADMIN_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET || "kPpLhRGkZMdNENKJH#'04%xq&zQnJhQY";

console.log(`Connecting to Hasura GraphQL Endpoint: ${graphqlUrl}`);

async function runGraphQLQuery(query, variables, userId, role = 'user') {
  const headers = {
    'Content-Type': 'application/json',
    'x-hasura-role': role,
    'x-hasura-user-id': userId,
  };
  if (adminSecret) {
    headers['x-hasura-admin-secret'] = adminSecret;
  }

  const response = await fetch(graphqlUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  return await response.json();
}

async function runSecuritySuite() {
  const aliceId = '10000000-0000-0000-0000-000000000001';   // Alice: Org A Owner
  const bobId = '20000000-0000-0000-0000-000000000002';     // Bob: Org A Editor
  const charlieId = '30000000-0000-0000-0000-000000000003'; // Charlie: Org B Owner
  const viewerId = '40000000-0000-0000-0000-000000000004';  // Viewer: Org A Viewer

  const orgAId = 'a1111111-1111-1111-1111-111111111111';
  const orgAWorkflowId = 'f1111111-1111-1111-1111-111111111111';
  const existingStepId = '33333333-3333-3333-3333-333333333333';
  const existingTriggerId = '55555555-5555-5555-5555-555555555555';

  console.log('\n--- Executing Refined Checkpoint 3 Hasura GraphQL Security Suite ---\n');

  // TEST 1: Same Org Access
  const test1 = await runGraphQLQuery(`query { workflows { id name org_id } }`, {}, aliceId);
  console.log('TEST 1 (Alice querying Org A Workflows):', JSON.stringify(test1));

  // TEST 2: Cross-Org Access (Charlie querying Org A)
  const test2 = await runGraphQLQuery(`query { workflows { id name org_id } }`, {}, charlieId);
  console.log('TEST 2 (Charlie querying Org A Workflows - expect empty array):', JSON.stringify(test2));

  // TEST 3: Direct UUID Guessing (Charlie querying exact Org A workflow UUID)
  const test3 = await runGraphQLQuery(
    `query GetWorkflow($id: uuid!) { workflows_by_pk(id: $id) { id name } }`,
    { id: orgAWorkflowId },
    charlieId
  );
  console.log('TEST 3 (Charlie requesting Org A Workflow UUID directly - expect null):', JSON.stringify(test3));

  // TEST 4: Viewer Mutation Attempt
  const test4 = await runGraphQLQuery(
    `mutation { insert_workflows_one(object: { org_id: "${orgAId}", name: "Unauthorized Workflow" }) { id } }`,
    {},
    viewerId
  );
  console.log('TEST 4 (Viewer attempting mutation - expect GraphQL permission error):', JSON.stringify(test4));

  // TEST 5a: Editor INSERT db_write Attempt
  const test5a = await runGraphQLQuery(
    `mutation { insert_workflow_steps_one(object: { workflow_id: "${orgAWorkflowId}", position: 10, step_type: "db_write" }) { id } }`,
    {},
    bobId
  );
  console.log('TEST 5a (Bob/Editor attempting INSERT db_write - expect permission error):', JSON.stringify(test5a));

  // TEST 5b: Editor UPDATE llm_call -> db_write Attempt
  const test5b = await runGraphQLQuery(
    `mutation { update_workflow_steps_by_pk(pk_columns: { id: "${existingStepId}" }, _set: { step_type: "db_write" }) { id } }`,
    {},
    bobId
  );
  console.log('TEST 5b (Bob/Editor attempting UPDATE step to db_write - expect permission error / zero affected rows):', JSON.stringify(test5b));

  // TEST 5c: Editor INSERT webhook Trigger Attempt
  const test5c = await runGraphQLQuery(
    `mutation { insert_workflow_triggers_one(object: { workflow_id: "${orgAWorkflowId}", trigger_type: "webhook" }) { id } }`,
    {},
    bobId
  );
  console.log('TEST 5c (Bob/Editor attempting INSERT webhook trigger - expect permission error):', JSON.stringify(test5c));

  // TEST 5d: Editor UPDATE manual -> webhook Trigger Attempt
  const test5d = await runGraphQLQuery(
    `mutation { update_workflow_triggers_by_pk(pk_columns: { id: "${existingTriggerId}" }, _set: { trigger_type: "webhook" }) { id } }`,
    {},
    bobId
  );
  console.log('TEST 5d (Bob/Editor attempting UPDATE trigger to webhook - expect permission error / zero affected rows):', JSON.stringify(test5d));

  // TEST 5e: Querying webhook_secret as Editor/Viewer
  const test5e = await runGraphQLQuery(
    `query { workflow_triggers { id trigger_type webhook_secret } }`,
    {},
    bobId
  );
  console.log('TEST 5e (Bob attempting to query webhook_secret - expect field not found error):', JSON.stringify(test5e));

  // TEST 5f: Direct Execution State Modification (workflow_runs INSERT)
  const test5f = await runGraphQLQuery(
    `mutation { insert_workflow_runs_one(object: { workflow_id: "${orgAWorkflowId}", trigger_type: "manual", status: "running" }) { id } }`,
    {},
    bobId
  );
  console.log('TEST 5f (Bob attempting direct workflow_run insertion - expect permission error):', JSON.stringify(test5f));

  // TEST 6: Owner Privileged Operations (Alice creating db_write step)
  const test6 = await runGraphQLQuery(
    `mutation { insert_workflow_steps_one(object: { workflow_id: "${orgAWorkflowId}", position: 100, step_type: "db_write" }) { id } }`,
    {},
    aliceId
  );
  console.log('TEST 6 (Alice/Owner creating db_write step - expect success or schema check):', JSON.stringify(test6));

  // TEST 7a: Bob (Editor) attempting to insert new member into Org A
  const test7a = await runGraphQLQuery(
    `mutation { insert_org_members_one(object: { org_id: "${orgAId}", user_id: "50000000-0000-0000-0000-000000000005", role: "editor" }) { id } }`,
    {},
    bobId
  );
  console.log('TEST 7a (Bob/Editor attempting insert org member - expect permission error):', JSON.stringify(test7a));

  // TEST 7b: Bob (Editor) attempting to update member role in Org A
  const test7b = await runGraphQLQuery(
    `mutation { update_org_members(where: { org_id: { _eq: "${orgAId}" } }, _set: { role: "owner" }) { affected_rows } }`,
    {},
    bobId
  );
  console.log('TEST 7b (Bob/Editor attempting update org member role - expect 0 affected rows or permission error):', JSON.stringify(test7b));

  // TEST 7c: Charlie (Org B Owner) attempting to query Org A members
  const test7c = await runGraphQLQuery(
    `query { org_members(where: { org_id: { _eq: "${orgAId}" } }) { id role user_id } }`,
    {},
    charlieId
  );
  console.log('TEST 7c (Charlie/Org B Owner querying Org A members - expect empty array):', JSON.stringify(test7c));

  // TEST 8: Bob submitting join request for Org A
  const test8 = await runGraphQLQuery(
    `mutation { insert_organization_join_requests_one(object: { org_id: "${orgAId}", user_id: "${bobId}", status: "pending" }) { id status } }`,
    {},
    bobId
  );
  console.log('TEST 8 (Bob creating join request for Org A - expect success or uniqueness constraint):', JSON.stringify(test8));
}

runSecuritySuite().catch(console.error);
