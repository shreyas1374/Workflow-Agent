'use client';

import React, { useState, useEffect } from 'react';
import {
  useSignInEmailPassword,
  useSignUpEmailPassword,
  useSignOut,
  useAuthenticationStatus,
  useUserData,
} from '@nhost/nextjs';
import { nhost } from '../lib/nhost';
import { LogOut, UserCheck, KeyRound, ShieldAlert, CheckCircle2, Server, Database, Activity } from 'lucide-react';

export function AuthCard() {
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  const { isAuthenticated, isLoading } = useAuthenticationStatus();
  const rawUser = useUserData();
  const user = rawUser || nhost.auth.getUser();

  const [customError, setCustomError] = useState<string | null>(null);

  const { signInEmailPassword, isLoading: isSigningIn, error: signInError } = useSignInEmailPassword();
  const { signUpEmailPassword, isLoading: isSigningUp, error: signUpError, isSuccess: isSignUpSuccess } = useSignUpEmailPassword();
  const { signOut } = useSignOut();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustomError(null);
    if (!email || !password) return;

    try {
      if (mode === 'signin') {
        const res = await signInEmailPassword(email, password);
        console.log('Nhost SignIn Result:', res);
        if (res?.isError && res?.error) {
          setCustomError(res.error.message || 'Sign in failed. Check your credentials.');
        } else if (res?.needsEmailVerification) {
          setCustomError('Email not verified. Please verify your email or disable email verification in Nhost Dashboard.');
        }
      } else {
        const res = await signUpEmailPassword(email, password);
        console.log('Nhost SignUp Result:', res);
        if (res?.isError && res?.error) {
          setCustomError(res.error.message || 'Sign up failed.');
        }
      }
    } catch (err: any) {
      console.error('Auth Exception:', err);
      setCustomError(err.message || 'An unexpected error occurred during authentication.');
    }
  };

  const currentErrorMsg = customError || (mode === 'signin' ? signInError?.message : signUpError?.message);

  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'Not set';
  const region = process.env.NEXT_PUBLIC_NHOST_REGION || 'Not set';
  const hasuraGraphqlUrl = process.env.NEXT_PUBLIC_NHOST_BACKEND_URL
    ? `${process.env.NEXT_PUBLIC_NHOST_BACKEND_URL}/v1/graphql`
    : `https://${subdomain}.hasura.${region || 'us-east-1'}.nhost.run/v1/graphql`;

  if (!mounted || isLoading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-xl max-w-md w-full flex justify-center items-center text-slate-400">
        <Activity className="w-6 h-6 animate-spin mr-2 text-blue-400" />
        <span className="text-sm font-medium">Initializing authentication...</span>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl max-w-2xl w-full">
        <div className="flex items-center space-x-3 mb-6 pb-4 border-b border-slate-800">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Authenticated Session Active</h2>
            <p className="text-sm text-slate-400">Verified via Nhost Auth SDK</p>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
            <label className="text-xs font-mono uppercase tracking-wider text-slate-500 block mb-1">User ID</label>
            <div className="text-sm font-mono text-emerald-400 break-all">{user?.id || 'Authenticated Session'}</div>
          </div>

          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
            <label className="text-xs font-mono uppercase tracking-wider text-slate-500 block mb-1">Email Address</label>
            <div className="text-sm font-mono text-slate-200">{user?.email || email || 'N/A'}</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
              <label className="text-xs font-mono uppercase tracking-wider text-slate-500 block mb-1">Email Verified</label>
              <div className="text-sm text-slate-300 flex items-center">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 mr-2" />
                {user?.emailVerified ? 'Verified' : 'Pending / Active'}
              </div>
            </div>
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
              <label className="text-xs font-mono uppercase tracking-wider text-slate-500 block mb-1">Default Role</label>
              <div className="text-sm text-slate-300 font-mono">{user?.defaultRole || 'user'}</div>
            </div>
          </div>
        </div>

        <button
          onClick={() => signOut()}
          className="w-full flex justify-center items-center space-x-2 bg-rose-600/20 text-rose-300 hover:bg-rose-600/30 border border-rose-500/30 py-2.5 rounded-lg font-medium transition"
        >
          <LogOut className="w-4 h-4" />
          <span>Log Out</span>
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl max-w-md w-full">
      <div className="flex items-center space-x-3 mb-6 pb-4 border-b border-slate-800">
        <div className="p-3 bg-blue-500/10 text-blue-400 rounded-lg">
          <KeyRound className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">Nhost Authentication</h2>
          <p className="text-sm text-slate-400">Phase 1 Foundation Setup</p>
        </div>
      </div>

      <div className="flex border-b border-slate-800 mb-6">
        <button
          type="button"
          onClick={() => setMode('signin')}
          className={`flex-1 py-2 text-sm font-medium border-b-2 text-center transition ${
            mode === 'signin'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => setMode('signup')}
          className={`flex-1 py-2 text-sm font-medium border-b-2 text-center transition ${
            mode === 'signup'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Sign Up
        </button>
      </div>

      {currentErrorMsg && (
        <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-lg text-sm flex items-start space-x-2">
          <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Authentication Error</div>
            <div className="text-xs text-rose-300/90 mt-0.5">{currentErrorMsg}</div>
          </div>
        </div>
      )}

      {isSignUpSuccess && mode === 'signup' && (
        <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg text-sm flex items-center space-x-2">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>Account created! Please check your email if confirmation is required, or sign in now.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Email Address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            required
            className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none transition"
          />
        </div>

        <div>
          <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            required
            className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none transition"
          />
        </div>

        <button
          type="submit"
          disabled={isSigningIn || isSigningUp}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 rounded-lg text-sm transition flex justify-center items-center space-x-2 disabled:opacity-50"
        >
          {(isSigningIn || isSigningUp) ? (
            <>
              <Activity className="w-4 h-4 animate-spin" />
              <span>Processing...</span>
            </>
          ) : (
            <span>{mode === 'signin' ? 'Sign In with Nhost' : 'Create Nhost Account'}</span>
          )}
        </button>
      </form>
    </div>
  );
}
