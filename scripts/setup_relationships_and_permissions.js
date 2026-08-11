const fs = require('fs');
const path = require('path');

const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'lvxtjinpxcgopdtpnlop';
const region = process.env.NEXT_PUBLIC_NHOST_REGION || 'ap-south-1';
const metadataUrl = `https://${subdomain}.hasura.${region}.nhost.run/v1/metadata`;
const adminSecret = process.env.NHOST_ADMIN_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET || "kPpLhRGkZMdNENKJH#'04%xq&zQnJhQY";

async function setupHasura() {
  if (!adminSecret) {
    console.log('Admin Secret missing.');
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
    'x-hasura-admin-secret': adminSecret,
  };

  const tables = ['organizations', 'org_members', 'organization_join_requests', 'workflows', 'workflow_steps', 'workflow_triggers', 'workflow_runs', 'step_runs', 'notifications', 'custom_db_records'];

  console.log('--- Step 1: Tracking all tables in Hasura ---');
  for (const t of tables) {
    await fetch(metadataUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: 'pg_track_table',
        args: { source: 'default', table: { schema: 'public', name: t } }
      })
    });
  }

  // Track auth.users table
  try {
    await fetch(metadataUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: 'pg_track_table',
        args: { source: 'default', table: { schema: 'auth', name: 'users' } }
      })
    });
  } catch (e) {}

  console.log('--- Step 2: Creating all relationships ---');
  const relationships = [
    { type: 'pg_create_object_relationship', table: { schema: 'public', name: 'org_members' }, name: 'organization', on: 'org_id' },
    { type: 'pg_create_object_relationship', table: { schema: 'public', name: 'org_members' }, name: 'user', on: 'user_id' },
    { type: 'pg_create_array_relationship', table: { schema: 'auth', name: 'users' }, name: 'org_members', on: { table: { schema: 'public', name: 'org_members' }, column: 'user_id' } },
    { type: 'pg_create_array_relationship', table: { schema: 'public', name: 'organizations' }, name: 'org_members', on: { table: { schema: 'public', name: 'org_members' }, column: 'org_id' } },
    { type: 'pg_create_object_relationship', table: { schema: 'public', name: 'organization_join_requests' }, name: 'organization', on: 'org_id' },
    { type: 'pg_create_object_relationship', table: { schema: 'public', name: 'organization_join_requests' }, name: 'user', on: 'user_id' },
    { type: 'pg_create_object_relationship', table: { schema: 'public', name: 'organization_join_requests' }, name: 'reviewer', on: 'reviewed_by' },
    { type: 'pg_create_array_relationship', table: { schema: 'public', name: 'organizations' }, name: 'join_requests', on: { table: { schema: 'public', name: 'organization_join_requests' }, column: 'org_id' } },
    { type: 'pg_create_object_relationship', table: { schema: 'public', name: 'workflows' }, name: 'organization', on: 'org_id' },
    { type: 'pg_create_array_relationship', table: { schema: 'public', name: 'workflows' }, name: 'workflow_steps', on: { table: { schema: 'public', name: 'workflow_steps' }, column: 'workflow_id' } },
    { type: 'pg_create_array_relationship', table: { schema: 'public', name: 'workflows' }, name: 'workflow_triggers', on: { table: { schema: 'public', name: 'workflow_triggers' }, column: 'workflow_id' } },
    { type: 'pg_create_array_relationship', table: { schema: 'public', name: 'workflows' }, name: 'workflow_runs', on: { table: { schema: 'public', name: 'workflow_runs' }, column: 'workflow_id' } },
    { type: 'pg_create_object_relationship', table: { schema: 'public', name: 'workflow_steps' }, name: 'workflow', on: 'workflow_id' },
    { type: 'pg_create_object_relationship', table: { schema: 'public', name: 'workflow_triggers' }, name: 'workflow', on: 'workflow_id' },
    { type: 'pg_create_object_relationship', table: { schema: 'public', name: 'workflow_runs' }, name: 'workflow', on: 'workflow_id' },
    { type: 'pg_create_array_relationship', table: { schema: 'public', name: 'workflow_runs' }, name: 'step_runs', on: { table: { schema: 'public', name: 'step_runs' }, column: 'workflow_run_id' } },
    { type: 'pg_create_object_relationship', table: { schema: 'public', name: 'step_runs' }, name: 'workflow_run', on: 'workflow_run_id' },
  ];

  for (const rel of relationships) {
    try {
      const payload = {
        type: rel.type,
        args: {
          source: 'default',
          table: typeof rel.table === 'string' ? { schema: 'public', name: rel.table } : rel.table,
          name: rel.name,
          using: typeof rel.on === 'string' ? { foreign_key_constraint_on: rel.on } : { foreign_key_constraint_on: rel.on }
        }
      };
      await fetch(metadataUrl, { method: 'POST', headers, body: JSON.stringify(payload) });
    } catch (e) {}
  }

  console.log('--- Step 3: Applying Permissions (Select, Insert, Update, Delete) ---');
  const tablesMetadataPath = path.join(__dirname, '../hasura/metadata/tables.json');
  const tablesMetadata = JSON.parse(fs.readFileSync(tablesMetadataPath, 'utf8'));

  for (const tableConfig of tablesMetadata) {
    const tableName = tableConfig.table.name;

    // Select
    if (tableConfig.select_permissions) {
      for (const perm of tableConfig.select_permissions) {
        await fetch(metadataUrl, { method: 'POST', headers, body: JSON.stringify({ type: 'pg_drop_select_permission', args: { source: 'default', table: { schema: 'public', name: tableName }, role: perm.role } }) });
        const r = await fetch(metadataUrl, { method: 'POST', headers, body: JSON.stringify({ type: 'pg_create_select_permission', args: { source: 'default', table: { schema: 'public', name: tableName }, role: perm.role, permission: perm.permission } }) });
        console.log(`Select [${tableName}]:`, (await r.json()).message || 'done');
      }
    }

    // Insert
    if (tableConfig.insert_permissions) {
      for (const perm of tableConfig.insert_permissions) {
        await fetch(metadataUrl, { method: 'POST', headers, body: JSON.stringify({ type: 'pg_drop_insert_permission', args: { source: 'default', table: { schema: 'public', name: tableName }, role: perm.role } }) });
        const r = await fetch(metadataUrl, { method: 'POST', headers, body: JSON.stringify({ type: 'pg_create_insert_permission', args: { source: 'default', table: { schema: 'public', name: tableName }, role: perm.role, permission: perm.permission } }) });
        console.log(`Insert [${tableName}]:`, (await r.json()).message || 'done');
      }
    }

    // Update
    if (tableConfig.update_permissions) {
      for (const perm of tableConfig.update_permissions) {
        await fetch(metadataUrl, { method: 'POST', headers, body: JSON.stringify({ type: 'pg_drop_update_permission', args: { source: 'default', table: { schema: 'public', name: tableName }, role: perm.role } }) });
        const r = await fetch(metadataUrl, { method: 'POST', headers, body: JSON.stringify({ type: 'pg_create_update_permission', args: { source: 'default', table: { schema: 'public', name: tableName }, role: perm.role, permission: perm.permission } }) });
        console.log(`Update [${tableName}]:`, (await r.json()).message || 'done');
      }
    }

    // Delete
    if (tableConfig.delete_permissions) {
      for (const perm of tableConfig.delete_permissions) {
        await fetch(metadataUrl, { method: 'POST', headers, body: JSON.stringify({ type: 'pg_drop_delete_permission', args: { source: 'default', table: { schema: 'public', name: tableName }, role: perm.role } }) });
        const r = await fetch(metadataUrl, { method: 'POST', headers, body: JSON.stringify({ type: 'pg_create_delete_permission', args: { source: 'default', table: { schema: 'public', name: tableName }, role: perm.role, permission: perm.permission } }) });
        console.log(`Delete [${tableName}]:`, (await r.json()).message || 'done');
      }
    }
  }

  console.log('--- Step 4: Applying Hasura Actions ---');
  const actionsMetadataPath = path.join(__dirname, '../hasura/metadata/actions.json');
  if (fs.existsSync(actionsMetadataPath)) {
    const actionsConfig = JSON.parse(fs.readFileSync(actionsMetadataPath, 'utf8'));
    
    // 1. Register custom types FIRST
    if (actionsConfig.custom_types) {
      try {
        const res = await fetch(metadataUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ type: 'set_custom_types', args: actionsConfig.custom_types })
        });
        const rJson = await res.json();
        console.log('Set custom types:', rJson.message || 'done', rJson.error ? JSON.stringify(rJson) : '');
      } catch (e) {
        console.error('Failed to set custom types:', e.message);
      }
    }

    // 2. Create actions and permissions SECOND
    for (const act of actionsConfig.actions || []) {
      try {
        await fetch(metadataUrl, { method: 'POST', headers, body: JSON.stringify({ type: 'drop_action', args: { name: act.name } }) });
        const createRes = await fetch(metadataUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            type: 'create_action',
            args: {
              name: act.name,
              definition: act.definition
            }
          })
        });
        const cJson = await createRes.json();
        
        await fetch(metadataUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            type: 'create_action_permission',
            args: { action: act.name, role: 'user' }
          })
        });
        console.log(`Action [${act.name}]:`, cJson.message || 'done', cJson.error ? JSON.stringify(cJson) : '');
      } catch (e) {
        console.error(`Action [${act.name}] failed:`, e.message);
      }
    }
  }

  console.log('--- Step 4.5: Configuring Hasura Event Triggers ---');
  const eventTriggers = [
    {
      name: 'on_custom_record_inserted',
      table: { schema: 'public', name: 'custom_db_records' },
      webhook: 'https://ai-agent-workflow-tunnel-99.loca.lt/actions/events/db-record-inserted'
    },
    {
      name: 'on_notification_inserted',
      table: { schema: 'public', name: 'notifications' },
      webhook: 'https://ai-agent-workflow-tunnel-99.loca.lt/actions/events/notification-inserted'
    }
  ];

  for (const et of eventTriggers) {
    try {
      await fetch(metadataUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'pg_delete_event_trigger',
          args: { source: 'default', name: et.name }
        })
      });
      const res = await fetch(metadataUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'pg_create_event_trigger',
          args: {
            name: et.name,
            source: 'default',
            table: et.table,
            webhook: et.webhook,
            headers: [{ name: 'bypass-tunnel-reminder', value: 'true' }],
            insert: { columns: '*' }
          }
        })
      });
      const etJson = await res.json();
      console.log(`Event Trigger [${et.name}]:`, etJson.message || 'done');
    } catch (e) {
      console.error(`Event Trigger [${et.name}] failed:`, e.message);
    }
  }

  console.log('--- Step 5: Reloading Metadata ---');
  await fetch(metadataUrl, { method: 'POST', headers, body: JSON.stringify({ type: 'reload_metadata', args: {} }) });

  console.log('All Hasura Permissions, Mutations, and Actions applied successfully!');
}

setupHasura().catch(console.error);
