import { NhostClient } from '@nhost/nextjs';

const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || '';
const region = process.env.NEXT_PUBLIC_NHOST_REGION || '';
const backendUrl = process.env.NEXT_PUBLIC_NHOST_BACKEND_URL || '';

export function getNhostConfig() {
  if (backendUrl) {
    return { backendUrl };
  }
  return {
    subdomain: subdomain || 'local',
    region: region || undefined,
  };
}

export const nhost = new NhostClient(getNhostConfig());
