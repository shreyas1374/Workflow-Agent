const fs = require('fs');
const path = require('path');

const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'lvxtjinpxcgopdtpnlop';
const region = process.env.NEXT_PUBLIC_NHOST_REGION || 'ap-south-1';
const metadataUrl = process.env.NEXT_PUBLIC_NHOST_BACKEND_URL
  ? `${process.env.NEXT_PUBLIC_NHOST_BACKEND_URL}/v1/metadata`
  : `https://${subdomain}.hasura.${region}.nhost.run/v1/metadata`;

const adminSecret = process.env.NHOST_ADMIN_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET || "kPpLhRGkZMdNENKJH#'04%xq&zQnJhQY";

async function applyPermissionsMetadata() {
  if (!adminSecret) {
    console.log('NHOST_ADMIN_SECRET or HASURA_GRAPHQL_ADMIN_SECRET not set in environment.');
    console.log('You can configure the metadata manually via the Hasura Console or set NHOST_ADMIN_SECRET to apply automatically.');
    return;
  }

  const tablesMetadataPath = path.join(__dirname, '../hasura/metadata/tables.json');
  const tablesMetadata = JSON.parse(fs.readFileSync(tablesMetadataPath, 'utf8'));

  console.log(`Applying Hasura Metadata permissions to: ${metadataUrl}`);

  for (const tableConfig of tablesMetadata) {
    const tableName = tableConfig.table.name;

    // Track table if not tracked
    try {
      await fetch(metadataUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hasura-admin-secret': adminSecret,
        },
        body: JSON.stringify({
          type: 'pg_track_table',
          args: {
            source: 'default',
            table: { schema: 'public', name: tableName },
          },
        }),
      });
    } catch (e) {}

    // Apply Select Permissions
    if (tableConfig.select_permissions) {
      for (const perm of tableConfig.select_permissions) {
        const payload = {
          type: 'pg_create_select_permission',
          args: {
            source: 'default',
            table: { schema: 'public', name: tableName },
            role: perm.role,
            permission: perm.permission,
          },
        };
        const res = await fetch(metadataUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': adminSecret },
          body: JSON.stringify(payload),
        });
        console.log(`Select Perm [${tableName}]:`, await res.json());
      }
    }

    // Apply Insert Permissions
    if (tableConfig.insert_permissions) {
      for (const perm of tableConfig.insert_permissions) {
        const payload = {
          type: 'pg_create_insert_permission',
          args: {
            source: 'default',
            table: { schema: 'public', name: tableName },
            role: perm.role,
            permission: perm.permission,
          },
        };
        const res = await fetch(metadataUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': adminSecret },
          body: JSON.stringify(payload),
        });
        console.log(`Insert Perm [${tableName}]:`, await res.json());
      }
    }

    // Apply Update Permissions
    if (tableConfig.update_permissions) {
      for (const perm of tableConfig.update_permissions) {
        const payload = {
          type: 'pg_create_update_permission',
          args: {
            source: 'default',
            table: { schema: 'public', name: tableName },
            role: perm.role,
            permission: perm.permission,
          },
        };
        const res = await fetch(metadataUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': adminSecret },
          body: JSON.stringify(payload),
        });
        console.log(`Update Perm [${tableName}]:`, await res.json());
      }
    }

    // Apply Delete Permissions
    if (tableConfig.delete_permissions) {
      for (const perm of tableConfig.delete_permissions) {
        const payload = {
          type: 'pg_create_delete_permission',
          args: {
            source: 'default',
            table: { schema: 'public', name: tableName },
            role: perm.role,
            permission: perm.permission,
          },
        };
        const res = await fetch(metadataUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': adminSecret },
          body: JSON.stringify(payload),
        });
        console.log(`Delete Perm [${tableName}]:`, await res.json());
      }
    }
  }

  console.log('Metadata permissions applied successfully!');
}

applyPermissionsMetadata().catch(console.error);
