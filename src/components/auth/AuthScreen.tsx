import React, { FormEvent, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  sendPasswordReset,
  signIn,
  signOut,
  signUp,
  updatePassword,
} from '../../services/auth/supabaseAuth';

interface AuthScreenProps {
  session: Session | null;
  recoveryMode: boolean;
  onSignedOut: () => void;
  initialError?: string;
}
type AuthMode = 'login' | 'signup' | 'reset';

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Authentication failed. Please try again.';

export const AuthScreen: React.FC<AuthScreenProps> = ({ session, recoveryMode, onSignedOut, initialError = '' }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);

  const run = async (operation: () => Promise<{ error: Error | null }>): Promise<void> => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await operation();
      if (result.error) throw result.error;
    } catch (operationError) {
      setError(errorMessage(operationError));
    } finally {
      setBusy(false);
    }
  };

  const submitCredentials = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (mode === 'reset') {
      await run(async () => {
        const result = await sendPasswordReset(email);
        if (!result.error) setMessage('If an account exists for that email, a reset link has been sent.');
        return result;
      });
      return;
    }
    await run(async () => {
      if (mode === 'signup') {
        const result = await signUp(email, password);
        if (!result.error && !result.data.session) setMessage('Check your email to verify your account before signing in.');
        return result;
      }
      return signIn(email, password);
    });
  };

  const submitPasswordUpdate = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    await run(async () => {
      const result = await updatePassword(newPassword);
      if (!result.error) setMessage('Password updated successfully.');
      return result;
    });
  };

  const handleLogout = async (): Promise<void> => {
    await run(async () => {
      const result = await signOut();
      if (!result.error) onSignedOut();
      return result;
    });
  };

  const title = recoveryMode ? 'UPDATE PASSWORD' : session && !session.user.email_confirmed_at ? 'VERIFY EMAIL' : 'MPC ACCESS';
  return (
    <div className="min-h-[600px] w-full flex items-center justify-center p-6 bg-[#0b0c10] font-mono">
      <div className="w-full max-w-md bg-metal-pattern rounded-xl border border-[#2b2e38] shadow-2xl p-6 md:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-2 h-8 bg-orange-500 rounded-sm shadow-[0_0_12px_rgba(255,102,0,0.65)]" />
          <div>
            <p className="text-orange-500 text-xs tracking-[0.3em] font-black">MPC-2026</p>
            <h1 className="text-xl font-black tracking-[0.16em] text-gray-100">{title}</h1>
          </div>
        </div>

        {recoveryMode ? (
          <form onSubmit={submitPasswordUpdate} className="space-y-4">
            <p className="text-sm text-gray-400">Choose a new password for your account.</p>
            <label className="block text-xs tracking-wider text-gray-400">NEW PASSWORD
              <input required minLength={8} type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="auth-input" autoComplete="new-password" />
            </label>
            <button disabled={busy} className="auth-button" type="submit">{busy ? 'UPDATING...' : 'UPDATE PASSWORD'}</button>
          </form>
        ) : session && !session.user.email_confirmed_at ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-300">Verify your email address before entering the workstation.</p>
            <p className="text-xs text-gray-500 break-all">{session.user.email}</p>
            <button disabled={busy} className="auth-button" type="button" onClick={handleLogout}>SIGN OUT</button>
          </div>
        ) : (
          <>
            <form onSubmit={submitCredentials} className="space-y-4">
              {mode !== 'reset' && <label className="block text-xs tracking-wider text-gray-400">EMAIL
                <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="auth-input" autoComplete="email" />
              </label>}
              {mode !== 'reset' && <label className="block text-xs tracking-wider text-gray-400">PASSWORD
                <input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="auth-input" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
              </label>}
              {mode === 'reset' && <label className="block text-xs tracking-wider text-gray-400">ACCOUNT EMAIL
                <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="auth-input" autoComplete="email" />
              </label>}
              <button disabled={busy} className="auth-button" type="submit">
                {busy ? 'PLEASE WAIT...' : mode === 'login' ? 'LOG IN' : mode === 'signup' ? 'CREATE ACCOUNT' : 'SEND RESET LINK'}
              </button>
            </form>
            <div className="mt-5 flex flex-wrap gap-3 text-[11px] tracking-wider text-gray-500">
              {mode !== 'login' && <button type="button" onClick={() => setMode('login')} className="auth-link">LOG IN</button>}
              {mode !== 'signup' && <button type="button" onClick={() => setMode('signup')} className="auth-link">SIGN UP</button>}
              {mode !== 'reset' && <button type="button" onClick={() => setMode('reset')} className="auth-link">FORGOT PASSWORD?</button>}
            </div>
          </>
        )}
        {message && <p className="mt-4 text-sm text-green-400" role="status">{message}</p>}
        {error && <p className="mt-4 text-sm text-red-400" role="alert">{error}</p>}
      </div>
    </div>
  );
};
