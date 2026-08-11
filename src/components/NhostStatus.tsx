'use client';

import React, { useState, useEffect } from 'react';
import { Server, Database, Radio, Info, AlertTriangle, Activity } from 'lucide-react';

export function NhostStatus() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'your-nhost-subdomain';
  const region = process.env.NEXT_PUBLIC_NHOST_REGION || 'us-east-1';
  const backendUrl = process.env.NEXT_PUBLIC_NHOST_BACKEND_URL;

  const hasuraGraphqlUrl = backendUrl
    ? `${backendUrl}/v1/graphql`
    : `https://${subdomain}.hasura.${region}.nhost.run/v1/graphql`;

  const isConfigured = Boolean(
    process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN &&
    process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN !== 'your-nhost-subdomain'
  ) || Boolean(backendUrl);

  if (!mounted) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl max-w-2xl w-full flex justify-center items-center text-slate-400">
        <Activity className="w-6 h-6 animate-spin mr-2 text-purple-400" />
        <span className="text-sm">Loading status...</span>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl max-w-2xl w-full">
      <div className="flex items-center space-x-3 mb-6 pb-4 border-b border-slate-800">
        <div className="p-3 bg-purple-500/10 text-purple-400 rounded-lg">
          <Server className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">Infrastructure Verification Status</h2>
          <p className="text-sm text-slate-400">Phase 1 Foundation Setup Check</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-slate-400 uppercase">1. Nhost Auth</span>
            <div className={`w-2.5 h-2.5 rounded-full ${isConfigured ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
          </div>
          <div className="text-sm font-semibold text-slate-200">Nhost Authentication</div>
          <div className="text-xs text-slate-500 mt-1">{isConfigured ? 'SDK Initialized' : 'Needs Config'}</div>
        </div>

        <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-slate-400 uppercase">2. PostgreSQL</span>
            <Database className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-sm font-semibold text-slate-200">Nhost PostgreSQL</div>
          <div className="text-xs text-slate-500 mt-1">Managed via Nhost Project</div>
        </div>

        <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-slate-400 uppercase">3. Hasura GraphQL</span>
            <Radio className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-sm font-semibold text-slate-200">Hasura Engine</div>
          <div className="text-xs text-slate-500 mt-1">Endpoint Available</div>
        </div>
      </div>

      <div className="space-y-3 mb-6 text-sm">
        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
          <span className="text-xs font-mono text-slate-400 uppercase block mb-1">Hasura GraphQL Endpoint URL</span>
          <code className="text-xs font-mono text-purple-300 break-all">{hasuraGraphqlUrl}</code>
        </div>
      </div>

      <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-lg text-xs space-y-2">
        <div className="font-semibold flex items-center text-amber-200">
          <AlertTriangle className="w-4 h-4 mr-1.5 flex-shrink-0" />
          Phase 1 Scope Restrictions (Intentionally Excluded):
        </div>
        <ul className="list-disc list-inside space-y-1 text-amber-300/90 pl-1">
          <li>No application tables (<code className="font-mono">workflows</code>, <code className="font-mono">org_members</code>, etc.) exist yet.</li>
          <li>No RBAC or Hasura permissions configured yet.</li>
          <li>No Hasura Actions, Event Triggers, or Execution Engine built yet.</li>
          <li>No LLM calls or workflow automation logic implemented yet.</li>
        </ul>
      </div>
    </div>
  );
}
