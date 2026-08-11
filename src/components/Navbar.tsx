'use client';

import React from 'react';
import { useUserData, useSignOut } from '@nhost/nextjs';

interface NavbarProps {
  currentOrgName?: string;
  userRole?: string;
}

export function Navbar({ currentOrgName, userRole }: NavbarProps) {
  const user = useUserData();
  const { signOut } = useSignOut();

  const getRoleBadgeStyle = (role?: string) => {
    switch (role) {
      case 'owner':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'editor':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'viewer':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
        {/* Brand Title */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-bold text-slate-950 text-base shadow-lg shadow-emerald-500/20">
            ⚡
          </div>
          <div>
            <h1 className="font-bold text-slate-100 text-base tracking-tight leading-none">
              AI Agent Workflow Builder
            </h1>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5">
              Next.js • Hasura • FastAPI Engine
            </p>
          </div>
        </div>

        {/* User & Org Context */}
        <div className="flex items-center gap-4">
          {currentOrgName && (
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
              <span className="text-xs text-slate-400">Org:</span>
              <span className="text-xs font-semibold text-slate-200">
                {currentOrgName}
              </span>
              {userRole && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase ${getRoleBadgeStyle(
                    userRole
                  )}`}
                >
                  {userRole}
                </span>
              )}
            </div>
          )}

          {user && (
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-medium text-slate-200">
                  {user.email}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  ID: {user.id.slice(0, 8)}...
                </div>
              </div>
              <button
                onClick={() => signOut()}
                className="bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 text-xs px-3.5 py-1.5 rounded-lg transition-all font-medium"
              >
                Log Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
