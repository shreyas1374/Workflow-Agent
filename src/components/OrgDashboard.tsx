'use client';

import React, { useState } from 'react';
import { useUserData } from '@nhost/nextjs';
import { useQuery, useMutation } from '@apollo/client/react';
import {
  GET_USER_ORGS,
  GET_ORG_WORKFLOWS,
  CREATE_WORKFLOW_MUTATION,
  DELETE_WORKFLOW_MUTATION,
  TRIGGER_WORKFLOW_RUN_ACTION,
  CREATE_ORGANIZATION_ACTION,
} from '../graphql/queries';
import { WorkflowBuilderModal } from './WorkflowBuilderModal';
import { ExecutionMonitorModal } from './ExecutionMonitorModal';
import { OrgMembersManager } from './OrgMembersManager';
import { OrgOnboarding } from './OrgOnboarding';

interface OrgDashboardProps {
  onOrgLoaded?: (orgName: string, role: string) => void;
}

export function OrgDashboard({ onOrgLoaded }: OrgDashboardProps) {
  const user = useUserData();
  const userId = user?.id;

  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [newWorkflowDesc, setNewWorkflowDesc] = useState('');
  const [newOrgName, setNewOrgName] = useState('');

  // 1. Fetch User Organization & Role
  const { data: orgData, loading: orgLoading, refetch: refetchOrg } = useQuery<{ org_members: any[] }>(GET_USER_ORGS, {
    variables: { user_id: userId },
    skip: !userId,
    pollInterval: 3000,
    fetchPolicy: 'network-only',
  });

  const [createOrgMutation, { loading: creatingOrg }] = useMutation(CREATE_ORGANIZATION_ACTION);

  const member = orgData?.org_members?.[0];
  const org = member?.organization;
  const role = member?.role;
  const orgId = org?.id;
  const orgName = org?.name;

  const onOrgLoadedRef = React.useRef(onOrgLoaded);
  React.useEffect(() => {
    onOrgLoadedRef.current = onOrgLoaded;
  });

  React.useEffect(() => {
    if (orgName && role && onOrgLoadedRef.current) {
      onOrgLoadedRef.current(orgName, role);
    }
  }, [orgName, role]);

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    try {
      await createOrgMutation({
        variables: { name: newOrgName.trim() },
      });
      setNewOrgName('');
      refetchOrg();
    } catch (err: any) {
      alert(`Create Organization Failed: ${err.message}`);
    }
  };

  // 2. Fetch Workflows for Active Org
  const { data: workflowsData, loading: workflowsLoading, refetch: refetchWorkflows } = useQuery<{ workflows: any[] }>(
    GET_ORG_WORKFLOWS,
    {
      variables: { org_id: orgId },
      skip: !orgId,
      fetchPolicy: 'network-only',
    }
  );

  const [createWorkflowMutation, { loading: creating }] = useMutation<{ insert_workflows_one: { id: string } }>(CREATE_WORKFLOW_MUTATION);
  const [deleteWorkflowMutation] = useMutation(DELETE_WORKFLOW_MUTATION);
  const [triggerRunMutation, { loading: triggering }] = useMutation<{ triggerWorkflowRun: { id: string } }>(TRIGGER_WORKFLOW_RUN_ACTION);

  const handleCreateWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = newWorkflowName.trim() || 'Untitled Workflow';
    if (!orgId) return;
    try {
      const res = await createWorkflowMutation({
        variables: {
          org_id: orgId,
          name: finalName,
          description: newWorkflowDesc.trim(),
        },
      });
      setShowCreateModal(false);
      setNewWorkflowName('');
      setNewWorkflowDesc('');
      refetchWorkflows();
      if (res.data?.insert_workflows_one?.id) {
        setActiveWorkflowId(res.data.insert_workflows_one.id);
      }
    } catch (err: any) {
      alert(`Create Failed: ${err.message}`);
    }
  };

  const handleRunWorkflow = async (workflowId: string) => {
    try {
      const res = await triggerRunMutation({
        variables: { workflow_id: workflowId },
      });
      refetchOrg();
      if (res.data?.triggerWorkflowRun?.id) {
        setActiveRunId(res.data.triggerWorkflowRun.id);
      }
    } catch (err: any) {
      alert(`Trigger Failed: ${err.message}`);
    }
  };

  const handleDeleteWorkflow = async (workflowId: string) => {
    if (!confirm('Are you sure you want to delete this workflow?')) return;
    try {
      await deleteWorkflowMutation({ variables: { id: workflowId } });
      refetchWorkflows();
    } catch (err: any) {
      alert(`Delete Failed: ${err.message}`);
    }
  };

  if (orgLoading && !orgData) {
    return (
      <div className="p-8 text-center text-xs text-slate-400 font-mono">
        Fetching Organization & Permissions from Hasura...
      </div>
    );
  }

  if (!member) {
    return (
      <OrgOnboarding
        userId={userId || ''}
        onOrgCreatedOrJoined={refetchOrg}
      />
    );
  }

  const workflows = workflowsData?.workflows || [];
  const totalUsage = (org.current_usage || 0) + (org.active_running_count || 0);
  const quotaPercent = Math.min(100, Math.round((totalUsage / (org.usage_quota || 100)) * 100));

  const isReadOnly = role === 'viewer';

  return (
    <div className="w-full space-y-6">
      {/* Top Organization Header & Quota Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-100">{org.name}</h2>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full border font-bold uppercase ${
                role === 'owner'
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  : role === 'editor'
                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                  : 'bg-purple-500/10 text-purple-400 border-purple-500/30'
              }`}
            >
              {role} Role
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 font-mono">
            Multi-Tenant Isolated Organization Dashboard
          </p>
        </div>

        {/* Quota Progress */}
        <div className="w-full md:w-64 bg-slate-950 p-3.5 rounded-lg border border-slate-800">
          <div className="flex justify-between text-xs font-semibold mb-1.5">
            <span className="text-slate-400">Execution Quota</span>
            <span className="text-emerald-400">{totalUsage} / {org.usage_quota}</span>
          </div>
          <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
            <div
              className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-500"
              style={{ width: `${quotaPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Workflows List Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-100">Workflows</h3>
            <p className="text-xs text-slate-400">Manage, edit steps, and trigger live executions</p>
          </div>
          {!isReadOnly && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-4 py-2 rounded-lg font-bold transition-all shadow-lg shadow-emerald-600/20"
            >
              + Create Workflow
            </button>
          )}
        </div>

        {workflowsLoading ? (
          <div className="text-xs text-slate-400 italic py-8 text-center">Loading workflows from Hasura...</div>
        ) : workflows.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg">
            No workflows created yet. Click "+ Create Workflow" to build your first workflow.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {workflows.map((wf: any) => {
              const stepCount = wf.workflow_steps?.length || 0;
              const latestRun = wf.workflow_runs?.[0];

              return (
                <div
                  key={wf.id}
                  className="bg-slate-950 border border-slate-800/90 hover:border-slate-700 rounded-xl p-5 flex flex-col justify-between transition-all shadow-md hover:shadow-lg"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <h4 className="font-bold text-slate-100 text-sm">
                        {wf.name && wf.name.trim() ? wf.name.trim() : 'Untitled Workflow'}
                      </h4>
                      <span className="text-[10px] bg-slate-900 border border-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono">
                        {stepCount} Steps
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-2">
                      {wf.description || 'No description provided.'}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-900 flex items-center justify-between">
                    <div className="text-[11px] text-slate-500">
                      {latestRun ? (
                        <span className="flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              latestRun.status === 'completed'
                                ? 'bg-emerald-500'
                                : latestRun.status === 'paused'
                                ? 'bg-amber-500'
                                : latestRun.status === 'failed'
                                ? 'bg-red-500'
                                : 'bg-blue-500'
                            }`}
                          />
                          <span className="capitalize text-slate-300 font-medium">
                            {latestRun.status}
                          </span>
                        </span>
                      ) : (
                        'No runs yet'
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setActiveWorkflowId(wf.id)}
                        className="text-xs bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 px-3 py-1.5 rounded-lg font-medium transition-all"
                      >
                        {isReadOnly ? 'View Steps' : 'Edit Steps'}
                      </button>

                      {!isReadOnly && (
                        <button
                          disabled={triggering}
                          onClick={() => handleRunWorkflow(wf.id)}
                          className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg transition-all shadow-md shadow-emerald-600/20"
                        >
                          Run ▶
                        </button>
                      )}

                      {!isReadOnly && (role === 'owner' || role === 'editor') && (
                        <button
                          onClick={() => handleDeleteWorkflow(wf.id)}
                          className="text-xs text-red-400 hover:text-red-300 p-1.5"
                          title="Delete Workflow"
                        >
                          🗑
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Organization Member Management Section */}
      {orgId && (
        <OrgMembersManager
          orgId={orgId}
          currentUserRole={role}
          currentUserId={userId}
          onMembersChanged={refetchOrg}
        />
      )}

      {/* Modal: Create Workflow */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateWorkflow}
            className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-md space-y-4 shadow-2xl"
          >
            <h3 className="font-bold text-slate-100 text-base">Create New Workflow</h3>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Workflow Name</label>
              <input
                type="text"
                required
                value={newWorkflowName}
                onChange={(e) => setNewWorkflowName(e.target.value)}
                placeholder="e.g. Customer Support AI Pipeline"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Description</label>
              <textarea
                rows={3}
                value={newWorkflowDesc}
                onChange={(e) => setNewWorkflowDesc(e.target.value)}
                placeholder="Briefly describe what this workflow accomplishes"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-1.5 rounded-lg shadow-md"
              >
                {creating ? 'Creating...' : 'Create Workflow'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Workflow Builder */}
      {activeWorkflowId && (
        <WorkflowBuilderModal
          workflowId={activeWorkflowId}
          userRole={role}
          onClose={() => {
            setActiveWorkflowId(null);
            refetchWorkflows();
          }}
        />
      )}

      {/* Modal: Live Execution Monitor */}
      {activeRunId && (
        <ExecutionMonitorModal
          runId={activeRunId}
          userRole={role}
          onClose={() => {
            setActiveRunId(null);
            refetchOrg();
          }}
        />
      )}
    </div>
  );
}
