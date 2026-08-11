'use client';

import React, { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client/react';
import {
  GET_ALL_ORGANIZATIONS,
  GET_USER_JOIN_REQUESTS,
  CREATE_JOIN_REQUEST_MUTATION,
  CREATE_ORGANIZATION_ACTION,
} from '../graphql/queries';

interface OrgOnboardingProps {
  userId: string;
  onOrgCreatedOrJoined: () => void;
}

export function OrgOnboarding({ userId, onOrgCreatedOrJoined }: OrgOnboardingProps) {
  const [activeTab, setActiveTab] = useState<'join' | 'create'>('join');
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [newOrgName, setNewOrgName] = useState('');
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null);

  // Fetch list of all existing organizations
  const { data: orgsData, loading: loadingOrgs } = useQuery<{ organizations: any[] }>(GET_ALL_ORGANIZATIONS, {
    fetchPolicy: 'network-only',
  });

  // Fetch current user's submitted join requests
  const { data: userReqsData, loading: loadingReqs, refetch: refetchReqs } = useQuery<{
    organization_join_requests: any[];
  }>(GET_USER_JOIN_REQUESTS, {
    variables: { user_id: userId },
    skip: !userId,
    fetchPolicy: 'network-only',
  });

  const [createJoinReqMutation, { loading: submittingReq }] = useMutation(CREATE_JOIN_REQUEST_MUTATION);
  const [createOrgMutation, { loading: creatingOrg }] = useMutation(CREATE_ORGANIZATION_ACTION);

  const orgs = orgsData?.organizations || [];
  const userRequests = userReqsData?.organization_join_requests || [];

  // Auto-transition to dashboard when a join request is accepted by an Owner
  React.useEffect(() => {
    const hasAcceptedRequest = userRequests.some((req) => req.status === 'accepted');
    if (hasAcceptedRequest) {
      onOrgCreatedOrJoined();
    }
  }, [userRequests, onOrgCreatedOrJoined]);

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!selectedOrgId) {
      setFeedback({ message: 'Please select an organization from the list.', isError: true });
      return;
    }

    try {
      await createJoinReqMutation({
        variables: {
          org_id: selectedOrgId,
          user_id: userId,
        },
      });
      setFeedback({
        message: 'Join request submitted successfully! An organization Owner must approve your request.',
        isError: false,
      });
      setSelectedOrgId('');
      refetchReqs();
    } catch (err: any) {
      setFeedback({
        message: err.message.includes('Uniqueness violation') || err.message.includes('unique')
          ? 'You already have a pending join request for this organization.'
          : `Join Request Failed: ${err.message}`,
        isError: true,
      });
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!newOrgName.trim()) {
      setFeedback({ message: 'Please enter a valid organization name.', isError: true });
      return;
    }

    try {
      await createOrgMutation({
        variables: { name: newOrgName.trim() },
      });
      setNewOrgName('');
      onOrgCreatedOrJoined();
    } catch (err: any) {
      setFeedback({ message: `Create Organization Failed: ${err.message}`, isError: true });
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6 md:p-8 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl space-y-6 my-8">
      <div className="text-center space-y-2">
        <span className="inline-block px-3 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full text-xs font-mono">
          Organization Onboarding
        </span>
        <h3 className="text-xl font-bold text-slate-100">Welcome to AI Agent Workflows</h3>
        <p className="text-xs text-slate-400">
          Request to join an existing organization or create a new organization as Owner.
        </p>
      </div>

      {/* Tab Switcher */}
      <div className="bg-slate-950 p-1 border border-slate-800 rounded-lg flex gap-1">
        <button
          onClick={() => {
            setActiveTab('join');
            setFeedback(null);
          }}
          className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all ${
            activeTab === 'join' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          🔗 Request to Join Organization
        </button>
        <button
          onClick={() => {
            setActiveTab('create');
            setFeedback(null);
          }}
          className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all ${
            activeTab === 'create' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          ➕ Create New Organization
        </button>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-lg border text-xs font-semibold ${
            feedback.isError
              ? 'bg-amber-950/80 border-amber-800 text-amber-300'
              : 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Tab 1: Join Existing Org */}
      {activeTab === 'join' && (
        <form onSubmit={handleJoinSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Select Existing Organization
            </label>
            {loadingOrgs ? (
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-500 italic">
                Loading organizations...
              </div>
            ) : orgs.length === 0 ? (
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-500 italic">
                No organizations exist yet. Switch to "Create New Organization" tab.
              </div>
            ) : (
              <select
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="">-- Choose an Organization --</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <button
            type="submit"
            disabled={submittingReq || !selectedOrgId}
            className={`w-full text-xs font-bold py-3 rounded-lg transition-all shadow-md ${
              !selectedOrgId
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
            }`}
          >
            {submittingReq ? 'Submitting Request...' : 'Submit Join Request ✓'}
          </button>
        </form>
      )}

      {/* Tab 2: Create New Org */}
      {activeTab === 'create' && (
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Organization Name
            </label>
            <input
              type="text"
              required
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder="e.g. Acme AI Innovations"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-sans"
            />
          </div>

          <button
            type="submit"
            disabled={creatingOrg}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-3 rounded-lg transition-all shadow-md shadow-emerald-600/20"
          >
            {creatingOrg ? 'Creating Organization...' : 'Create Organization & Become Owner ✓'}
          </button>
        </form>
      )}

      {/* User's Submitted Join Requests */}
      {userRequests.length > 0 && (
        <div className="pt-4 border-t border-slate-800 space-y-3">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Your Submitted Join Requests</h4>
          <div className="space-y-2">
            {userRequests.map((req) => (
              <div
                key={req.id}
                className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-bold text-slate-200 block">{req.organization?.name || 'Organization'}</span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Requested: {new Date(req.requested_at).toLocaleDateString()}
                  </span>
                </div>

                <span
                  className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase ${
                    req.status === 'accepted'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : req.status === 'rejected'
                      ? 'bg-red-950 text-red-300 border border-red-800'
                      : 'bg-amber-950 text-amber-300 border border-amber-800 animate-pulse'
                  }`}
                >
                  {req.status === 'pending' ? '⏳ Pending Approval' : req.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
