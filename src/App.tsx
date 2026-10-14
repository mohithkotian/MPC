import React, { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AuthScreen } from './components/auth/AuthScreen';
import { Chassis } from './components/layout/Chassis';
import { MainView } from './components/views/MainView';
import { SequencerView } from './components/views/SequencerView';
import { MixerView } from './components/views/MixerView';
import { SamplingView } from './components/views/SamplingView';
import { KitBrowserModal } from './components/views/KitBrowserModal';
import { GestureController } from './components/camera/GestureController';
import { useStore } from './store/useStore';
import { getSession, onAuthStateChange, signOut } from './services/auth/supabaseAuth';
export const App: React.FC = () => {
  const { viewMode, restoreSession } = useStore();
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    let mounted = true;
    void Promise.resolve()
      .then(() => getSession())
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) setAuthError('Unable to restore your session. Please try again.');
        setSession(data.session);
        setAuthLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setAuthError('Unable to restore your session. Please try again.');
        setAuthLoading(false);
      });
    let subscription: ReturnType<typeof onAuthStateChange>['data'] | null = null;
    try {
      subscription = onAuthStateChange((event, nextSession) => {
        if (!mounted) return;
        setSession(nextSession);
        setRecoveryMode(event === 'PASSWORD_RECOVERY');
        setAuthError('');
        setAuthLoading(false);
      }).data;
    } catch {
      if (mounted) {
        setAuthError('Supabase authentication is not configured.');
        setAuthLoading(false);
      }
    }
    return () => {
      mounted = false;
      subscription?.subscription.unsubscribe();
    };
  }, []);

  const restoredRef = React.useRef(false);
  useEffect(() => {
    if (session?.user?.email_confirmed_at) {
      // Restore the last opened kit/project once per sign-in (falls back to the default kit).
      if (restoredRef.current) return;
      restoredRef.current = true;
      void restoreSession();
    } else if (!session) {
      restoredRef.current = false;
    }
  }, [session, restoreSession]);

  if (authLoading) {
    return <div className="min-h-screen bg-[#07080a] flex items-center justify-center text-orange-500 font-mono tracking-[0.25em]">RESTORING SESSION...</div>;
  }
  if (authError) {
    return <AuthScreen session={null} recoveryMode={false} onSignedOut={() => undefined} initialError={authError} />;
  }
  if (!session || recoveryMode || !session.user.email_confirmed_at) {
    return <AuthScreen session={session} recoveryMode={recoveryMode} onSignedOut={() => setSession(null)} />;
  }

  return (
    <Chassis userEmail={session.user.email ?? undefined} onLogout={() => { void signOut(); }}>
      {viewMode === 'MAIN' && <MainView />}
      {viewMode === 'STEP_EDIT' && <SequencerView />}
      {viewMode === 'MIXER' && <MixerView />}
      {viewMode === 'SAMPLING' && <SamplingView />}
      {viewMode === 'KITS' && <KitBrowserModal />}

      <GestureController />
    </Chassis>
  );
};

export default App;
