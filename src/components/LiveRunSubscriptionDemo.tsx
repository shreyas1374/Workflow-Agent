'use client';

import React, { useState, useEffect } from 'react';
import { useSubscription } from '@apollo/client/react';
import { WATCH_WORKFLOW_RUN, WATCH_WORKFLOW_RUN_STATUS } from '../graphql/subscriptions';

interface StepRun {
  id: string;
  workflow_run_id: string;
  step_id: string;
  status: string;
  input: any;
  output: any;
  error_message?: string;
  attempt_count: number;
  approved_by?: string;
  approved_at?: string;
  started_at?: string;
  completed_at?: string;
}

export function LiveRunSubscriptionDemo() {
  const [mounted, setMounted] = useState(false);
  const [runId, setRunId] = useState('da556153-fe8b-455b-bc39-5ef78d6cee9e');
  const [inputRunId, setInputRunId] = useState('da556153-fe8b-455b-bc39-5ef78d6cee9e');

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: stepRunsData, loading: stepsLoading, error: stepsError } = useSubscription<{ step_runs: StepRun[] }>(
    WATCH_WORKFLOW_RUN,
    {
      variables: { workflow_run_id: runId },
      skip: !mounted || !runId,
    }
  );

  const { data: statusData, loading: statusLoading, error: statusError } = useSubscription<{ workflow_runs_by_pk: any }>(
    WATCH_WORKFLOW_RUN_STATUS,
    {
      variables: { run_id: runId },
      skip: !mounted || !runId,
    }
  );

  if (!mounted) return null;

  const stepRuns: StepRun[] = stepRunsData?.step_runs || [];
  const runStatus = statusData?.workflow_runs_by_pk;

  return (
    <div className="mt-8 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl text-slate-100 max-w-4xl mx-auto">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-200">
            Real-Time GraphQL Subscription Monitor (Checkpoint 6)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Receiving live execution state via WebSockets (`wss://.../v1/graphql`)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
            Live Connected
          </span>
        </div>
      </div>

      {/* Target Run Input */}
      <div className="flex items-center gap-3 mb-6">
        <label className="text-xs text-slate-400 font-medium">Target Run ID:</label>
        <input
          type="text"
          value={inputRunId}
          onChange={(e) => setInputRunId(e.target.value)}
          placeholder="Enter workflow_run_id UUID"
          className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
        />
        <button
          onClick={() => setRunId(inputRunId)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-4 py-1.5 rounded-lg font-semibold transition-all"
        >
          Subscribe
        </button>
      </div>

      {/* Workflow Run Status Card */}
      {runStatus && (
        <div className="mb-6 p-4 bg-slate-950/80 border border-slate-800 rounded-lg flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400">Workflow Status:</span>
            <div className="text-sm font-bold text-slate-100 uppercase tracking-wide mt-0.5">
              {runStatus.status}
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-400">Current Step:</span>
            <div className="text-xs font-mono text-emerald-400 mt-0.5">
              {runStatus.current_step_id || 'None'}
            </div>
          </div>
        </div>
      )}

      {/* Step Runs Real-Time Table */}
      <div className="space-y-3">
        <h3 className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">
          Live Step Runs ({stepRuns.length})
        </h3>

        {stepsLoading && (
          <div className="text-xs text-slate-400 italic py-4 text-center">
            Connecting to Hasura WebSocket subscription stream...
          </div>
        )}

        {stepsError && (
          <div className="p-3 bg-red-950/50 border border-red-800/50 rounded-lg text-xs text-red-300">
            Subscription Error: {stepsError.message}
          </div>
        )}

        {!stepsLoading && stepRuns.length === 0 && (
          <div className="p-4 bg-slate-950/50 border border-slate-800/50 rounded-lg text-xs text-slate-400 text-center">
            No step runs recorded for run ID `{runId}`. Trigger a run in FastAPI to see live execution updates.
          </div>
        )}

        {stepRuns.map((step) => (
          <div
            key={step.id}
            className="p-4 bg-slate-950 border border-slate-800/80 rounded-lg flex flex-col gap-2 transition-all hover:border-slate-700"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-slate-300">
                  Step: {step.step_id}
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                    step.status === 'completed'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : step.status === 'paused'
                      ? 'bg-amber-950 text-amber-300 border border-amber-800 animate-pulse'
                      : step.status === 'failed'
                      ? 'bg-red-950 text-red-300 border border-red-800'
                      : 'bg-blue-950 text-blue-300 border border-blue-800'
                  }`}
                >
                  {step.status}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">
                Attempts: {step.attempt_count}
              </span>
            </div>

            {step.output && (
              <pre className="text-[11px] font-mono bg-slate-900/90 p-2 rounded border border-slate-800 text-slate-300 overflow-x-auto max-h-32">
                {JSON.stringify(step.output, null, 2)}
              </pre>
            )}

            {step.error_message && (
              <div className="text-xs text-red-400 bg-red-950/30 p-2 rounded border border-red-900/50 font-mono">
                {step.error_message}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
