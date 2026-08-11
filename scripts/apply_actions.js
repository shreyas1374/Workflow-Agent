const fs = require('fs');
const path = require('path');

const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'lvxtjinpxcgopdtpnlop';
const region = process.env.NEXT_PUBLIC_NHOST_REGION || 'ap-south-1';
const metadataUrl = `https://${subdomain}.hasura.${region}.nhost.run/v1/metadata`;
const adminSecret = process.env.NHOST_ADMIN_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET || "kPpLhRGkZMdNENKJH#'04%xq&zQnJhQY";

async function applyActions() {
  const headers = {
    'Content-Type': 'application/json',
    'x-hasura-admin-secret': adminSecret,
  };

  const actionsFilePath = path.join(__dirname, '../hasura/metadata/actions.json');
  const actionsData = JSON.parse(fs.readFileSync(actionsFilePath, 'utf8'));

  console.log('--- Step 1: Setting Custom Types in Hasura ---');
  const customTypesRes = await fetch(metadataUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type: 'set_custom_types',
      args: actionsData.custom_types,
    }),
  });
  console.log('Custom Types Response:', await customTypesRes.json());

  console.log('--- Step 2: Creating Actions & Permissions ---');
  for (const actionObj of actionsData.actions) {
    const actionName = actionObj.name;

    // Drop existing action if any
    await fetch(metadataUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: 'drop_action',
        args: { name: actionName, clear_data: true },
      }),
    });

    // Create Action
    const createRes = await fetch(metadataUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: 'create_action',
        args: {
          name: actionName,
          definition: actionObj.definition,
        },
      }),
    });
    console.log(`Create Action [${actionName}]:`, await createRes.json());

    // Create Action Permission for role 'user'
    const permRes = await fetch(metadataUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: 'create_action_permission',
        args: {
          action: actionName,
          role: 'user',
        },
      }),
    });
    console.log(`Action Permission [${actionName}]:`, await permRes.json());
  }

  console.log('--- Step 3: Reloading Hasura Metadata ---');
  await fetch(metadataUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ type: 'reload_metadata', args: {} }),
  });

  console.log('Hasura Actions & Permissions applied successfully!');
}

applyActions().catch(console.error);
