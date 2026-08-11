'use client';

import React, { useState, useEffect } from 'react';
import { useAuthenticationStatus } from '@nhost/nextjs';
import { Navbar } from '../components/Navbar';
import { AuthCard } from '../components/AuthCard';
import { OrgDashboard } from '../components/OrgDashboard';
import { NhostStatus } from '../components/NhostStatus';

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const { isAuthenticated, isLoading } = useAuthenticationStatus();
  const [currentOrgName, setCurrentOrgName] = useState<string | undefined>();
  const [userRole, setUserRole] = useState<string | undefined>();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleOrgLoaded = React.useCallback((orgName: string, role: string) => {
    setCurrentOrgName((prev) => (prev !== orgName ? orgName : prev));
    setUserRole((prev) => (prev !== role ? role : prev));
  }, []);

  if (!mounted || isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center font-mono text-xs">
        Loading AI Agent Workflow Application...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar currentOrgName={currentOrgName} userRole={userRole} />

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-8">
        {isAuthenticated ? (
          <OrgDashboard onOrgLoaded={handleOrgLoaded} />
        ) : (
          <div className="max-w-xl mx-auto py-8 space-y-8 flex flex-col items-center">
            <div className="text-center">
              <span className="inline-block px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-mono mb-3">
                Full-Stack Mini-n8n AI Workflow Platform
              </span>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-2">
                Sign In to Access Your Workflows
              </h2>
              <p className="text-slate-400 text-xs md:text-sm">
                Authenticates via Nhost Auth, queries Hasura multi-tenant RBAC permissions, and executes via FastAPI engine.
              </p>
            </div>

            <AuthCard />
            <NhostStatus />
          </div>
        )}
      </main>
    </div>
  );
}
