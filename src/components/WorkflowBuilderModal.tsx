'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@apollo/client/react';
import {
  GET_WORKFLOW_DETAILS,
  SAVE_WORKFLOW_STEPS_MUTATION,
  UPDATE_WORKFLOW_DETAILS_MUTATION,
  SAVE_WORKFLOW_TRIGGER_MUTATION,
  CREATE_WEBHOOK_TRIGGER_ACTION,
} from '../graphql/queries';

interface StepItem {
  id: string;
  position: number;
  step_type: string;
  config: any;
  true_next_step_id?: string | null;
  false_next_step_id?: string | null;
}

interface WorkflowBuilderModalProps {
  workflowId: string;
  userRole?: string;
  onClose: () => void;
}

export function WorkflowBuilderModal({ workflowId, userRole, onClose }: WorkflowBuilderModalProps) {
  const isOwner = userRole === 'owner';
  const isReadOnly = userRole === 'viewer';

  const [activeTab, setActiveTab] = useState<'steps' | 'triggers'>('steps');

  const { data, loading, refetch } = useQuery<{ workflows_by_pk: any }>(GET_WORKFLOW_DETAILS, {
    variables: { id: workflowId },
    fetchPolicy: 'network-only',
  });

  const [saveStepsMutation, { loading: savingSteps }] = useMutation(SAVE_WORKFLOW_STEPS_MUTATION);
  const [updateDetailsMutation, { loading: savingDetails }] = useMutation(UPDATE_WORKFLOW_DETAILS_MUTATION);
  const [saveTriggerMutation, { loading: savingTrigger }] = useMutation(SAVE_WORKFLOW_TRIGGER_MUTATION);
  const [createWebhookTriggerMutation, { loading: creatingWebhookTrigger }] = useMutation<{ createWebhookTrigger: { id: string; webhook_secret: string; webhook_url: string; message: string } }>(CREATE_WEBHOOK_TRIGGER_ACTION);

  const [workflowName, setWorkflowName] = useState('');
  const [workflowDesc, setWorkflowDesc] = useState('');
  const [steps, setSteps] = useState<StepItem[]>([]);
  const [selectedStepIdx, setSelectedStepIdx] = useState<number | null>(null);

  // Trigger state
  const [triggerType, setTriggerType] = useState<'manual' | 'webhook' | 'scheduled' | 'db_event'>('manual');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [cronExpr, setCronExpr] = useState('*/5 * * * *');
  const [scheduleEnabled, setScheduleEnabled] = useState(true);

  useEffect(() => {
    if (data?.workflows_by_pk) {
      const wf = data.workflows_by_pk;
      setWorkflowName(wf.name || '');
      setWorkflowDesc(wf.description || '');

      if (wf.workflow_steps) {
        setSteps(
          wf.workflow_steps.map((s: any) => ({
            id: s.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)),
            position: s.position,
            step_type: s.step_type,
            config: s.config || {},
            true_next_step_id: s.true_next_step_id || null,
            false_next_step_id: s.false_next_step_id || null,
          }))
        );
      }

      if (wf.workflow_triggers && wf.workflow_triggers.length > 0) {
        const trg = wf.workflow_triggers[0];
        setTriggerType(trg.trigger_type === 'webhook' ? 'webhook' : 'manual');
        if (trg.webhook_secret) {
          setWebhookSecret(trg.webhook_secret);
        }
      }
    }
  }, [data]);

  const addStep = (stepType: string) => {
    if (isReadOnly) return;
    if ((stepType === 'db_write' || stepType === 'notify') && !isOwner) {
      alert('Only Organization Owners can add db_write or notify steps.');
      return;
    }

    const newId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `step-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

    const defaultConfig: Record<string, any> = {
      llm_call: { prompt: 'Summarize inquiry', model: 'gemini-2.0-flash' },
      http_request: { method: 'GET', url: 'https://jsonplaceholder.typicode.com/todos/1', headers: {} },
      conditional_branch: { condition: 'status_code == 200' },
      approval_gate: { message: 'Manager sign-off required' },
      db_write: { table_name: 'custom_records', payload: { status: 'processed' } },
      notify: { channel: 'email', recipient: 'admin@organization.com', message: 'Workflow run completed' },
    };

    const newStep: StepItem = {
      id: newId,
      position: steps.length + 1,
      step_type: stepType,
      config: defaultConfig[stepType] || {},
    };

    const updatedSteps = [...steps, newStep];
    setSteps(updatedSteps);
    setSelectedStepIdx(updatedSteps.length - 1);
  };

  const removeStep = (idx: number) => {
    if (isReadOnly) return;
    const removedStepId = steps[idx]?.id;
    const updated = steps
      .filter((_, i) => i !== idx)
      .map((s, i) => ({
        ...s,
        position: i + 1,
        true_next_step_id: s.true_next_step_id === removedStepId ? null : s.true_next_step_id,
        false_next_step_id: s.false_next_step_id === removedStepId ? null : s.false_next_step_id,
      }));

    setSteps(updated);
    if (selectedStepIdx === idx) {
      setSelectedStepIdx(null);
    } else if (selectedStepIdx !== null && selectedStepIdx > idx) {
      setSelectedStepIdx(selectedStepIdx - 1);
    }
  };

  const moveStep = (idx: number, dir: 'up' | 'down') => {
    if (isReadOnly) return;
    if ((dir === 'up' && idx === 0) || (dir === 'down' && idx === steps.length - 1)) return;
    const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
    const updated = [...steps];
    const temp = updated[idx];
    updated[idx] = updated[targetIdx];
    updated[targetIdx] = temp;
    setSteps(updated.map((s, i) => ({ ...s, position: i + 1 })));
    setSelectedStepIdx(targetIdx);
  };

  const handleGenerateSecret = async () => {
    if (!isOwner) {
      alert('Only Owners can generate webhook triggers.');
      return;
    }
    try {
      const res = await createWebhookTriggerMutation({ variables: { workflow_id: workflowId } });
      if (res.data?.createWebhookTrigger?.webhook_secret) {
        setWebhookSecret(res.data.createWebhookTrigger.webhook_secret);
        alert('Webhook trigger created server-side! Store the secret securely.');
      }
    } catch (err: any) {
      alert(`Webhook Trigger Creation Failed: ${err.message}`);
    }
  };

  const handleSaveAll = async () => {
    if (isReadOnly) return;
    try {
      // 1. Update workflow details
      await updateDetailsMutation({
        variables: {
          id: workflowId,
          name: workflowName,
          description: workflowDesc,
        },
      });

      // 2. Save workflow steps
      const stepPayload = steps.map((s, i) => ({
        workflow_id: workflowId,
        position: i + 1,
        step_type: s.step_type,
        config: s.config,
        true_next_step_id: s.true_next_step_id || null,
        false_next_step_id: s.false_next_step_id || null,
      }));

      await saveStepsMutation({
        variables: {
          workflow_id: workflowId,
          steps: stepPayload,
        },
      });

      // 3. Save trigger config
      if (triggerType === 'webhook') {
        if (!isOwner) {
          alert('Only Owners can create webhook triggers.');
          return;
        }
        const res = await createWebhookTriggerMutation({
          variables: { workflow_id: workflowId },
        });
        if (res.data?.createWebhookTrigger?.webhook_secret) {
          setWebhookSecret(res.data.createWebhookTrigger.webhook_secret);
        }
      } else {
        let triggerConfig: Record<string, any> = {};
        if (triggerType === 'scheduled') {
          triggerConfig = { cron: cronExpr, enabled: scheduleEnabled };
        } else if (triggerType === 'db_event') {
          triggerConfig = { table_name: 'custom_db_records', event: 'INSERT' };
        }

        await saveTriggerMutation({
          variables: {
            workflow_id: workflowId,
            trigger_type: triggerType,
            config: triggerConfig,
          },
        });
      }

      alert('Workflow saved successfully! ✓');
      refetch();
    } catch (err: any) {
      alert(`Save Failed: ${err.message}`);
    }
  };

  const isSaving = savingSteps || savingDetails || savingTrigger || creatingWebhookTrigger;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={workflowName}
                disabled={isReadOnly}
                onChange={(e) => setWorkflowName(e.target.value)}
                placeholder="Workflow Name"
                className="bg-transparent font-bold text-slate-100 text-base focus:outline-none focus:border-b border-emerald-500"
              />
              {isReadOnly && (
                <span className="text-[10px] bg-slate-800 text-slate-400 font-mono px-2 py-0.5 rounded border border-slate-700">
                  Read Only (Viewer)
                </span>
              )}
            </div>
            <input
              type="text"
              value={workflowDesc}
              disabled={isReadOnly}
              onChange={(e) => setWorkflowDesc(e.target.value)}
              placeholder="Add description..."
              className="bg-transparent text-xs text-slate-400 focus:outline-none w-full mt-0.5"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-slate-900 border border-slate-800 p-1 rounded-lg flex items-center gap-1">
              <button
                onClick={() => setActiveTab('steps')}
                className={`px-3 py-1 text-xs rounded font-semibold transition-all ${
                  activeTab === 'steps' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Steps ({steps.length})
              </button>
              <button
                onClick={() => setActiveTab('triggers')}
                className={`px-3 py-1 text-xs rounded font-semibold transition-all ${
                  activeTab === 'triggers' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Triggers ({triggerType})
              </button>
            </div>

            {!isReadOnly && (
              <button
                disabled={isSaving}
                onClick={handleSaveAll}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-4 py-1.5 rounded-lg font-semibold transition-all shadow-md shadow-emerald-600/20"
              >
                {isSaving ? 'Saving...' : 'Save Workflow ✓'}
              </button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-white text-xs px-2.5 py-1.5 rounded bg-slate-800">
              Close ✕
            </button>
          </div>
        </div>

        {/* Content Body */}
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400 italic">Loading workflow details...</div>
        ) : activeTab === 'triggers' ? (
          /* Triggers Tab */
          <div className="p-6 space-y-6 overflow-y-auto flex-1 bg-slate-950">
            <div>
              <h3 className="text-sm font-bold text-slate-200 mb-1">Execution Trigger Configuration</h3>
              <p className="text-xs text-slate-400">
                Choose how this workflow is triggered (Manual UI, Webhook POST, Scheduled Cron, or Database Event).
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 1. Manual Execution Option */}
              <div
                onClick={() => !isReadOnly && setTriggerType('manual')}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  triggerType === 'manual'
                    ? 'bg-slate-900 border-emerald-500 shadow-md ring-1 ring-emerald-500/30'
                    : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-xs text-slate-200 uppercase tracking-wider">⚡ Manual Execution</span>
                  {triggerType === 'manual' && <span className="text-emerald-400 text-xs font-bold">Active ✓</span>}
                </div>
                <p className="text-xs text-slate-400">
                  Triggered manually on demand from the dashboard by Owners & Editors.
                </p>
              </div>

              {/* 2. Webhook Trigger Option (Owner Only) */}
              <div
                onClick={() => {
                  if (!isOwner) {
                    alert('Webhook trigger configuration is restricted to Organization Owners.');
                    return;
                  }
                  setTriggerType('webhook');
                  if (!webhookSecret) handleGenerateSecret();
                }}
                className={`p-4 rounded-xl border transition-all ${
                  !isOwner ? 'opacity-60 cursor-not-allowed bg-slate-950 border-slate-900' : 'cursor-pointer'
                } ${
                  triggerType === 'webhook'
                    ? 'bg-slate-900 border-emerald-500 shadow-md ring-1 ring-emerald-500/30'
                    : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-xs text-slate-200 uppercase tracking-wider">🔗 Webhook Trigger</span>
                  {!isOwner ? (
                    <span className="text-[10px] text-amber-400 font-mono uppercase bg-amber-950/60 px-2 py-0.5 rounded border border-amber-900/50">
                      Owner Only
                    </span>
                  ) : triggerType === 'webhook' ? (
                    <span className="text-emerald-400 text-xs font-bold">Active ✓</span>
                  ) : null}
                </div>
                <p className="text-xs text-slate-400">
                  Triggered externally via HTTP POST request with a secure webhook secret.
                </p>
              </div>

              {/* 3. Scheduled Trigger Option */}
              <div
                onClick={() => !isReadOnly && setTriggerType('scheduled')}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  triggerType === 'scheduled'
                    ? 'bg-slate-900 border-emerald-500 shadow-md ring-1 ring-emerald-500/30'
                    : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-xs text-slate-200 uppercase tracking-wider">⏰ Scheduled Trigger</span>
                  {triggerType === 'scheduled' && <span className="text-emerald-400 text-xs font-bold">Active ✓</span>}
                </div>
                <p className="text-xs text-slate-400">
                  Triggered automatically on a recurring cron schedule by the engine background runner.
                </p>
              </div>

              {/* 4. Database Event Trigger Option */}
              <div
                onClick={() => !isReadOnly && setTriggerType('db_event')}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  triggerType === 'db_event'
                    ? 'bg-slate-900 border-emerald-500 shadow-md ring-1 ring-emerald-500/30'
                    : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-xs text-slate-200 uppercase tracking-wider">🗄️ Database Event Trigger</span>
                  {triggerType === 'db_event' && <span className="text-emerald-400 text-xs font-bold">Active ✓</span>}
                </div>
                <p className="text-xs text-slate-400">
                  Triggered automatically when a new row is inserted into <code className="text-emerald-400">custom_db_records</code>.
                </p>
              </div>
            </div>

            {/* Webhook Details Panel */}
            {triggerType === 'webhook' && isOwner && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                <h4 className="text-xs uppercase font-bold text-slate-300 tracking-wider">
                  Webhook Secret Configuration
                </h4>

                <div>
                  <label className="text-xs text-slate-400 block mb-1 font-mono">Webhook Secret</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={webhookSecret || 'Click Generate Secret'}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs font-mono text-emerald-400 focus:outline-none"
                    />
                    <button
                      onClick={handleGenerateSecret}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-2 rounded font-semibold border border-slate-700"
                    >
                      Generate New Secret
                    </button>
                  </div>
                </div>

                {webhookSecret && (
                  <div className="space-y-2">
                    <label className="text-xs text-slate-400 block font-mono">HTTP POST Webhook Endpoint</label>
                    <div className="bg-slate-950 border border-slate-800/80 rounded p-3 font-mono text-[11px] text-slate-300 space-y-1">
                      <div className="text-emerald-400 font-bold">POST /actions/trigger-webhook-run</div>
                      <div className="text-slate-400 text-[10px]">
                        Header: <span className="text-slate-200">Content-Type: application/json</span>
                      </div>
                      <pre className="text-[10px] bg-slate-900 p-2 rounded text-slate-300 mt-2 border border-slate-800">
{`{
  "webhook_secret": "${webhookSecret}",
  "payload": { "key": "value" }
}`}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Scheduled Details Panel */}
            {triggerType === 'scheduled' && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                <h4 className="text-xs uppercase font-bold text-slate-300 tracking-wider">
                  Cron Schedule Configuration
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Cron Expression</label>
                    <input
                      type="text"
                      value={cronExpr}
                      disabled={isReadOnly}
                      onChange={(e) => setCronExpr(e.target.value)}
                      placeholder="e.g. */5 * * * *"
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-[10px] text-slate-500 block mt-1">
                      Standard 5-part cron syntax (minute hour day month day-of-week).
                    </span>
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Schedule Status</label>
                    <button
                      type="button"
                      disabled={isReadOnly}
                      onClick={() => setScheduleEnabled(!scheduleEnabled)}
                      className={`w-full p-2.5 rounded text-xs font-bold transition-all border ${
                        scheduleEnabled
                          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                          : 'bg-slate-950 text-slate-500 border-slate-800'
                      }`}
                    >
                      {scheduleEnabled ? '🟢 Enabled (Running)' : '⚪ Disabled (Paused)'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Database Event Details Panel */}
            {triggerType === 'db_event' && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                <h4 className="text-xs uppercase font-bold text-slate-300 tracking-wider">
                  Database Event Trigger Setup
                </h4>
                <p className="text-xs text-slate-400">
                  This workflow will automatically execute whenever a new row is inserted into PostgreSQL table <code className="text-emerald-400">public.custom_db_records</code> within your organization.
                </p>
                <div className="p-3 bg-slate-950 border border-slate-800/80 rounded font-mono text-[11px] text-slate-400">
                  Watched Table: <span className="text-slate-200">public.custom_db_records</span> | Event: <span className="text-emerald-400 font-bold">INSERT</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Steps Tab */
          <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
            {/* Step Palette & Vertical Sequence */}
            <div className="w-full md:w-1/2 p-5 border-r border-slate-800 overflow-y-auto space-y-4">
              {!isReadOnly && (
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">
                    Add Step To Builder
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {['llm_call', 'http_request', 'conditional_branch', 'approval_gate', 'db_write', 'notify'].map(
                      (type) => {
                        const isOwnerOnly = type === 'db_write' || type === 'notify';
                        const disabled = isOwnerOnly && !isOwner;
                        return (
                          <button
                            key={type}
                            disabled={disabled}
                            onClick={() => addStep(type)}
                            className={`p-2.5 rounded-lg text-xs font-semibold text-left border transition-all ${
                              disabled
                                ? 'bg-slate-950 text-slate-600 border-slate-900 cursor-not-allowed opacity-50'
                                : 'bg-slate-950 hover:bg-slate-800 text-slate-200 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <span className="block font-bold capitalize">{type.replace('_', ' ')}</span>
                            {isOwnerOnly && (
                              <span className="text-[9px] text-amber-400/80 uppercase font-mono block mt-0.5">
                                Owner Only
                              </span>
                            )}
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>
              )}

              {/* Step Sequence List */}
              <div className="space-y-2">
                <h4 className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                  Vertical Execution Sequence ({steps.length})
                </h4>

                {steps.length === 0 && (
                  <div className="p-4 bg-slate-950 border border-slate-800/60 rounded-lg text-xs text-slate-500 text-center italic">
                    No steps added. Click a step type above to build your sequence.
                  </div>
                )}

                {steps.map((step, idx) => (
                  <div
                    key={step.id || idx}
                    onClick={() => setSelectedStepIdx(idx)}
                    className={`p-3 rounded-lg border cursor-pointer flex items-center justify-between transition-all ${
                      selectedStepIdx === idx
                        ? 'bg-slate-800 border-emerald-500/80 shadow-md'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-slate-900 text-emerald-400 text-[11px] font-mono font-bold flex items-center justify-center border border-slate-800">
                        {idx + 1}
                      </span>
                      <div>
                        <span className="text-xs font-bold text-slate-200 capitalize block">
                          {step.step_type.replace('_', ' ')}
                        </span>
                        {step.step_type === 'conditional_branch' && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            Cond: {step.config?.condition || 'default'}
                          </span>
                        )}
                      </div>
                    </div>

                    {!isReadOnly && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); moveStep(idx, 'up'); }}
                          className="text-slate-400 hover:text-slate-200 px-1 text-xs"
                          title="Move Up"
                        >
                          ▲
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); moveStep(idx, 'down'); }}
                          className="text-slate-400 hover:text-slate-200 px-1 text-xs"
                          title="Move Down"
                        >
                          ▼
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeStep(idx); }}
                          className="text-red-400 hover:text-red-300 px-1 text-xs font-bold ml-1"
                          title="Remove Step"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Step Config Panel */}
            <div className="w-full md:w-1/2 p-5 bg-slate-950 overflow-y-auto">
              <h4 className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-3">
                Step Configuration
              </h4>

              {selectedStepIdx !== null && steps[selectedStepIdx] ? (
                <div className="space-y-4">
                  <div className="text-xs font-mono text-emerald-400 bg-slate-900 p-2 rounded border border-slate-800">
                    Configuring Step #{selectedStepIdx + 1} ({steps[selectedStepIdx].step_type})
                  </div>

                  {steps[selectedStepIdx].step_type === 'llm_call' && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">LLM Model</label>
                        <select
                          value={steps[selectedStepIdx].config.model || 'gemini-2.0-flash'}
                          disabled={isReadOnly}
                          onChange={(e) => {
                            const copy = [...steps];
                            copy[selectedStepIdx].config.model = e.target.value;
                            setSteps(copy);
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                        >
                          <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                          <option value="groq-llama-3">Groq Llama 3</option>
                          <option value="gpt-4o-mini">GPT-4o Mini</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Prompt Template</label>
                        <textarea
                          rows={3}
                          value={steps[selectedStepIdx].config.prompt || ''}
                          disabled={isReadOnly}
                          onChange={(e) => {
                            const copy = [...steps];
                            copy[selectedStepIdx].config.prompt = e.target.value;
                            setSteps(copy);
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  )}

                  {steps[selectedStepIdx].step_type === 'http_request' && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">HTTP Method</label>
                        <select
                          value={steps[selectedStepIdx].config.method || 'GET'}
                          disabled={isReadOnly}
                          onChange={(e) => {
                            const copy = [...steps];
                            copy[selectedStepIdx].config.method = e.target.value;
                            setSteps(copy);
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                        >
                          <option value="GET">GET</option>
                          <option value="POST">POST</option>
                          <option value="PUT">PUT</option>
                          <option value="DELETE">DELETE</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">URL Endpoint</label>
                        <input
                          type="text"
                          value={steps[selectedStepIdx].config.url || ''}
                          disabled={isReadOnly}
                          onChange={(e) => {
                            const copy = [...steps];
                            copy[selectedStepIdx].config.url = e.target.value;
                            setSteps(copy);
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                        />
                      </div>
                    </div>
                  )}

                  {steps[selectedStepIdx].step_type === 'conditional_branch' && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Safe Condition Expression</label>
                        <input
                          type="text"
                          value={steps[selectedStepIdx].config.condition || ''}
                          disabled={isReadOnly}
                          onChange={(e) => {
                            const copy = [...steps];
                            copy[selectedStepIdx].config.condition = e.target.value;
                            setSteps(copy);
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                          placeholder="e.g. status_code == 200"
                        />
                      </div>

                      {/* True Next Step Selector */}
                      <div>
                        <label className="text-xs text-emerald-400 block mb-1 font-semibold">
                          True Branch Next Step
                        </label>
                        <select
                          value={steps[selectedStepIdx].true_next_step_id || ''}
                          disabled={isReadOnly}
                          onChange={(e) => {
                            const copy = [...steps];
                            copy[selectedStepIdx].true_next_step_id = e.target.value || null;
                            setSteps(copy);
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                        >
                          <option value="">-- Sequential Next Step (Default) --</option>
                          {steps
                            .filter((_, i) => i !== selectedStepIdx)
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                Step #{s.position} ({s.step_type})
                              </option>
                            ))}
                        </select>
                      </div>

                      {/* False Next Step Selector */}
                      <div>
                        <label className="text-xs text-red-400 block mb-1 font-semibold">
                          False Branch Next Step
                        </label>
                        <select
                          value={steps[selectedStepIdx].false_next_step_id || ''}
                          disabled={isReadOnly}
                          onChange={(e) => {
                            const copy = [...steps];
                            copy[selectedStepIdx].false_next_step_id = e.target.value || null;
                            setSteps(copy);
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                        >
                          <option value="">-- Sequential Next Step (Default) --</option>
                          {steps
                            .filter((_, i) => i !== selectedStepIdx)
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                Step #{s.position} ({s.step_type})
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {steps[selectedStepIdx].step_type === 'approval_gate' && (
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Approval Prompt Message</label>
                      <input
                        type="text"
                        value={steps[selectedStepIdx].config.message || ''}
                        disabled={isReadOnly}
                        onChange={(e) => {
                          const copy = [...steps];
                          copy[selectedStepIdx].config.message = e.target.value;
                          setSteps(copy);
                        }}
                        className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  )}

                  {steps[selectedStepIdx].step_type === 'db_write' && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Target Table Name</label>
                        <input
                          type="text"
                          value={steps[selectedStepIdx].config.table_name || 'custom_records'}
                          disabled={isReadOnly || !isOwner}
                          onChange={(e) => {
                            const copy = [...steps];
                            copy[selectedStepIdx].config.table_name = e.target.value;
                            setSteps(copy);
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  )}

                  {steps[selectedStepIdx].step_type === 'notify' && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Notification Channel</label>
                        <input
                          type="text"
                          value={steps[selectedStepIdx].config.channel || 'email'}
                          disabled={isReadOnly || !isOwner}
                          onChange={(e) => {
                            const copy = [...steps];
                            copy[selectedStepIdx].config.channel = e.target.value;
                            setSteps(copy);
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Recipient</label>
                        <input
                          type="text"
                          value={steps[selectedStepIdx].config.recipient || 'admin@organization.com'}
                          disabled={isReadOnly || !isOwner}
                          onChange={(e) => {
                            const copy = [...steps];
                            copy[selectedStepIdx].config.recipient = e.target.value;
                            setSteps(copy);
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-slate-500 italic p-6 text-center">
                  Select a step from the list to edit its configuration.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

