'use client';

import React from 'react';
import { useSubscription, useMutation } from '@apollo/client/react';
import { WATCH_WORKFLOW_RUN, WATCH_WORKFLOW_RUN_STATUS } from '../graphql/subscriptions';
import { APPROVE_STEP_ACTION } from '../graphql/queries';

interface ExecutionMonitorModalProps {
  runId: string;
  userRole?: string;
  onClose: () => void;
}

export function ExecutionMonitorModal({ runId, userRole, onClose }: ExecutionMonitorModalProps) {
  const [approveStepMutation, { loading: approving }] = useMutation(APPROVE_STEP_ACTION);

  const { data: stepRunsData, loading: stepsLoading } = useSubscription<{ step_runs: any[] }>(
    WATCH_WORKFLOW_RUN,
    { variables: { workflow_run_id: runId } }
  );

  const { data: statusData } = useSubscription<{ workflow_runs_by_pk: any }>(
    WATCH_WORKFLOW_RUN_STATUS,
    { variables: { run_id: runId } }
  );

  const stepRuns = stepRunsData?.step_runs || [];
  const runStatus = statusData?.workflow_runs_by_pk;

  const handleApprove = async (stepRunId: string) => {
    try {
      await approveStepMutation({
        variables: { step_run_id: stepRunId },
      });
    } catch (err: any) {
      alert(`Approval Failed: ${err.message}`);
    }
  };

  const isOwnerOrEditor = userRole === 'owner' || userRole === 'editor';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <h3 className="font-bold text-slate-100 text-sm">Live Workflow Monitor</h3>
            </div>
            <p className="text-[11px] font-mono text-slate-400 mt-0.5">Run ID: {runId}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xs px-2.5 py-1 rounded bg-slate-800"
          >
            Close ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Status Summary Banner */}
          {runStatus && (
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 block uppercase font-semibold">Workflow Status</span>
                <span className="text-sm font-bold text-emerald-400 uppercase tracking-wide">
                  {runStatus.status}
                </span>
              </div>
              {runStatus.error_message && (
                <div className="text-xs text-red-400 bg-red-950/40 px-3 py-1.5 rounded border border-red-900/50">
                  {runStatus.error_message}
                </div>
              )}
            </div>
          )}

          {/* Steps Timeline */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Live Steps Execution ({stepRuns.length})
            </h4>

            {stepsLoading && (
              <div className="text-xs text-slate-400 italic py-6 text-center">
                Subscribing to live execution updates via WebSocket...
              </div>
            )}

            {stepRuns.map((step, idx) => (
              <div
                key={step.id}
                className="p-4 bg-slate-950 border border-slate-800/80 rounded-lg flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-800 text-[10px] font-bold text-slate-300 flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-bold text-slate-200">Step: {step.step_id}</span>
                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase flex items-center gap-1 ${
                        step.status === 'completed'
                          ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                          : step.status === 'paused'
                          ? 'bg-amber-950/80 text-amber-300 border border-amber-800 animate-pulse'
                          : step.status === 'failed'
                          ? 'bg-red-950/80 text-red-300 border border-red-800'
                          : step.status === 'running'
                          ? 'bg-blue-950/80 text-blue-300 border border-blue-800 animate-pulse'
                          : 'bg-slate-900 text-slate-400 border border-slate-800'
                      }`}
                    >
                      {step.status === 'completed' && '✅ Completed'}
                      {step.status === 'running' && '🔄 Running'}
                      {step.status === 'paused' && '⏸ Paused'}
                      {step.status === 'pending' && '⏳ Pending'}
                      {step.status === 'failed' && '❌ Failed'}
                      {!['completed', 'running', 'paused', 'pending', 'failed'].includes(step.status) && step.status}
                    </span>
                  </div>

                  {/* Approval Gate Action Button */}
                  {step.status === 'paused' && (
                    <button
                      disabled={!isOwnerOrEditor || approving}
                      onClick={() => handleApprove(step.id)}
                      className={`text-xs px-3 py-1 rounded-lg font-bold transition-all shadow-md ${
                        isOwnerOrEditor
                          ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {approving ? 'Approving...' : isOwnerOrEditor ? 'Approve Step ✓' : 'Approval Required (Owner/Editor Only)'}
                    </button>
                  )}
                </div>

                {step.output && (
                  <pre className="text-[11px] font-mono bg-slate-900/90 p-2.5 rounded border border-slate-800/80 text-slate-300 overflow-x-auto max-h-40">
                    {JSON.stringify(step.output, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
