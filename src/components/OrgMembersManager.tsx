'use client';

import React, { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client/react';
import {
  GET_ORG_MEMBERS,
  GET_PENDING_JOIN_REQUESTS,
  ADD_ORG_MEMBER_BY_EMAIL_ACTION,
  REVIEW_JOIN_REQUEST_ACTION,
  UPDATE_MEMBER_ROLE_ACTION,
  REMOVE_ORG_MEMBER_ACTION,
} from '../graphql/queries';

interface OrgMembersManagerProps {
  orgId: string;
  currentUserRole?: string;
  currentUserId?: string;
  onMembersChanged?: () => void;
}

export function OrgMembersManager({
  orgId,
  currentUserRole,
  currentUserId,
  onMembersChanged,
}: OrgMembersManagerProps) {
  const isOwner = currentUserRole === 'owner';

  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'owner' | 'editor' | 'viewer'>('editor');
  const [showAddForm, setShowAddForm] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null);

  // Fetch active org members
  const { data: membersData, loading: membersLoading, refetch: refetchMembers } = useQuery<{ org_members: any[] }>(
    GET_ORG_MEMBERS,
    {
      variables: { org_id: orgId },
      skip: !orgId,
      fetchPolicy: 'network-only',
    }
  );

  // Fetch pending join requests for Owners
  const { data: pendingReqsData, loading: pendingReqsLoading, refetch: refetchPending } = useQuery<{
    organization_join_requests: any[];
  }>(GET_PENDING_JOIN_REQUESTS, {
    variables: { org_id: orgId },
    skip: !orgId || !isOwner,
    fetchPolicy: 'network-only',
  });

  const [addMemberByEmailMutation, { loading: adding }] = useMutation<{
    addOrgMemberByEmail: { success: boolean; message: string; member_id?: string };
  }>(ADD_ORG_MEMBER_BY_EMAIL_ACTION);

  const [reviewJoinReqMutation, { loading: reviewing }] = useMutation<{
    reviewJoinRequest: { success: boolean; message: string; status: string };
  }>(REVIEW_JOIN_REQUEST_ACTION);

  const [updateMemberRoleMutation] = useMutation<{
    updateMemberRole: { success: boolean; message: string; member_id: string; role: string };
  }>(UPDATE_MEMBER_ROLE_ACTION);

  const [removeOrgMemberMutation] = useMutation<{
    removeOrgMember: { success: boolean; message: string; member_id: string };
  }>(REMOVE_ORG_MEMBER_ACTION);

  const members = membersData?.org_members || [];
  const pendingRequests = pendingReqsData?.organization_join_requests || [];

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!isOwner) {
      setFeedback({ message: 'Only Organization Owners can add new members.', isError: true });
      return;
    }
    if (!newEmail.trim()) {
      setFeedback({ message: 'Please enter a valid user email address.', isError: true });
      return;
    }

    try {
      const res = await addMemberByEmailMutation({
        variables: {
          org_id: orgId,
          email: newEmail.trim(),
          role: newRole,
        },
      });

      const result = res.data?.addOrgMemberByEmail;
      if (result) {
        if (result.success) {
          setNewEmail('');
          setFeedback({ message: result.message, isError: false });
          refetchMembers();
          if (onMembersChanged) onMembersChanged();
        } else {
          setFeedback({ message: result.message, isError: true });
        }
      }
    } catch (err: any) {
      setFeedback({ message: `Add Member Failed: ${err.message}`, isError: true });
    }
  };

  const handleReviewRequest = async (requestId: string, action: 'accept' | 'reject') => {
    if (!isOwner) return;

    try {
      const res = await reviewJoinReqMutation({
        variables: {
          request_id: requestId,
          action: action,
        },
      });

      const result = res.data?.reviewJoinRequest;
      if (result?.success) {
        refetchMembers();
        refetchPending();
        if (onMembersChanged) onMembersChanged();
      } else if (result?.message) {
        alert(result.message);
      }
    } catch (err: any) {
      alert(`Review Failed: ${err.message}`);
    }
  };

  const handleRoleChange = async (memberId: string, role: string) => {
    if (!isOwner) {
      alert('Only Organization Owners can change member roles.');
      return;
    }

    try {
      const res = await updateMemberRoleMutation({
        variables: {
          member_id: memberId,
          role: role,
        },
      });
      if (res.data?.updateMemberRole?.success) {
        refetchMembers();
        if (onMembersChanged) onMembersChanged();
      }
    } catch (err: any) {
      alert(`Role Update Blocked: ${err.message}`);
      refetchMembers();
    }
  };

  const handleRemoveMember = async (memberId: string, memberUserId: string) => {
    if (!isOwner) {
      alert('Only Organization Owners can remove members.');
      return;
    }

    if (memberUserId === currentUserId) {
      if (!confirm('Warning: You are removing yourself from this organization. Proceed?')) {
        return;
      }
    } else {
      if (!confirm('Are you sure you want to remove this member from the organization?')) {
        return;
      }
    }

    try {
      const res = await removeOrgMemberMutation({
        variables: { member_id: memberId },
      });
      if (res.data?.removeOrgMember?.success) {
        refetchMembers();
        if (onMembersChanged) onMembersChanged();
      }
    } catch (err: any) {
      alert(`Remove Member Blocked: ${err.message}`);
      refetchMembers();
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-100">Organization Members</h3>
            <span className="text-xs bg-slate-800 text-slate-300 font-mono px-2 py-0.5 rounded-full border border-slate-700 font-semibold">
              {members.length} Members
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage team access, review join requests, and assign roles.
          </p>
        </div>

        {isOwner && (
          <button
            onClick={() => {
              setShowAddForm(!showAddForm);
              setFeedback(null);
            }}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3.5 py-2 rounded-lg font-semibold transition-all shadow-md shadow-emerald-600/20 self-start sm:self-auto"
          >
            {showAddForm ? 'Cancel ✕' : '+ Add Member'}
          </button>
        )}
      </div>

      {/* Pending Join Requests Section (Owner Only) */}
      {isOwner && pendingRequests.length > 0 && (
        <div className="bg-amber-950/30 border border-amber-900/50 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
              <span>⏳</span> Pending Join Requests ({pendingRequests.length})
            </h4>
            <span className="text-[10px] text-amber-400 font-mono">
              Owners can Accept (as Viewer) or Reject
            </span>
          </div>

          <div className="space-y-2">
            {pendingRequests.map((req) => {
              const reqUser = req.user;
              const displayEmail = reqUser?.email || reqUser?.displayName || 'Requesting User';

              return (
                <div
                  key={req.id}
                  className="p-3 bg-slate-950 border border-amber-900/40 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-amber-900/50 text-amber-300 font-bold text-xs flex items-center justify-center border border-amber-800 font-mono">
                      {displayEmail[0].toUpperCase()}
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-200 block">{displayEmail}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Requested: {new Date(req.requested_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      disabled={reviewing}
                      onClick={() => handleReviewRequest(req.id, 'accept')}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-1 rounded-lg font-semibold transition-all shadow"
                    >
                      Accept (as Viewer) ✓
                    </button>
                    <button
                      disabled={reviewing}
                      onClick={() => handleReviewRequest(req.id, 'reject')}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs px-3 py-1 rounded-lg font-semibold transition-all border border-slate-700"
                    >
                      Reject ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Member Form (Owner Only) */}
      {showAddForm && isOwner && (
        <form onSubmit={handleAddMember} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4">
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Add Existing Nhost Auth User By Email</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="text-[11px] text-slate-400 block mb-1">User Email Address</label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="e.g. member@organization.com"
                className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-sans"
              />
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Assigned Role</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as any)}
                className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="owner">Owner (Full Permissions)</option>
                <option value="editor">Editor (Manual Workflows)</option>
                <option value="viewer">Viewer (Read-Only)</option>
              </select>
            </div>
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

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={adding}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-4 py-2 rounded-lg font-semibold transition-all shadow-md"
            >
              {adding ? 'Resolving Email & Adding...' : 'Add Member by Email ✓'}
            </button>
          </div>
        </form>
      )}

      {/* Members List */}
      {membersLoading ? (
        <div className="p-8 text-center text-xs text-slate-400 italic">
          Loading organization members...
        </div>
      ) : members.length === 0 ? (
        <div className="p-6 bg-slate-950 border border-slate-800 rounded-lg text-center text-xs text-slate-500">
          No members found in this organization.
        </div>
      ) : (
        <div className="space-y-2.5">
          {members.map((m) => {
            const userObj = m.user;
            const isSelf = m.user_id === currentUserId;
            const displayEmail = userObj?.email || userObj?.displayName || 'Registered User';

            return (
              <div
                key={m.id}
                className="p-3.5 bg-slate-950 border border-slate-800/80 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-700 transition-all"
              >
                {/* User Info */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-800 text-emerald-400 font-bold text-xs flex items-center justify-center border border-slate-700 font-mono">
                    {displayEmail[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-200">
                        {displayEmail}
                      </span>
                      {isSelf && (
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded font-mono font-semibold">
                          You
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      Joined: {new Date(m.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Role Switcher & Controls */}
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  {isOwner ? (
                    <select
                      value={m.role}
                      onChange={(e) => handleRoleChange(m.id, e.target.value)}
                      className={`text-xs px-2.5 py-1 rounded-lg border font-semibold focus:outline-none transition-all ${
                        m.role === 'owner'
                          ? 'bg-amber-950/60 text-amber-300 border-amber-800'
                          : m.role === 'editor'
                          ? 'bg-blue-950/60 text-blue-300 border-blue-800'
                          : 'bg-purple-950/60 text-purple-300 border-purple-800'
                      }`}
                    >
                      <option value="owner">Owner</option>
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  ) : (
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full border font-bold uppercase ${
                        m.role === 'owner'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : m.role === 'editor'
                          ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                          : 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                      }`}
                    >
                      {m.role}
                    </span>
                  )}

                  {isOwner && (
                    <button
                      onClick={() => handleRemoveMember(m.id, m.user_id)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-950/40 p-1.5 rounded text-xs font-bold transition-all"
                      title="Remove Member"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
