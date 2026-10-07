import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getPendingRequests, subscribeToLoading } from '../lib/loading';

const ENTER_DELAY_MS = 240;
const MINIMUM_VISIBLE_MS = 720;
const QUIET_WINDOW_MS = 180;
const EXIT_TRANSITION_MS = 320;
type LoadingPhase = 'hidden' | 'visible' | 'leaving';

export default function GlobalLoading() {
  const pending = useSyncExternalStore(subscribeToLoading, getPendingRequests, () => 0);
  const [phase, setPhase] = useState<LoadingPhase>('hidden');
  const phaseRef = useRef<LoadingPhase>('hidden');
  const shownAt = useRef(0);
  const busy = pending > 0;

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => {
    let enterTimer: number | undefined;
    let leaveTimer: number | undefined;
    let unmountTimer: number | undefined;

    if (busy) {
      if (phaseRef.current !== 'hidden') setPhase('visible');
      else enterTimer = window.setTimeout(() => {
        shownAt.current = Date.now();
        setPhase('visible');
      }, ENTER_DELAY_MS);
    } else if (phaseRef.current !== 'hidden') {
      const remaining = Math.max(0, MINIMUM_VISIBLE_MS - (Date.now() - shownAt.current));
      leaveTimer = window.setTimeout(() => {
        setPhase('leaving');
        unmountTimer = window.setTimeout(() => setPhase('hidden'), EXIT_TRANSITION_MS);
      }, Math.max(QUIET_WINDOW_MS, remaining));
    }

    return () => {
      if (enterTimer) window.clearTimeout(enterTimer);
      if (leaveTimer) window.clearTimeout(leaveTimer);
      if (unmountTimer) window.clearTimeout(unmountTimer);
    };
  }, [busy]);
  if (phase === 'hidden') return null;
  return <div className={`global-loading-backdrop is-${phase}`}><div className="global-loading" role="status" aria-live="polite" aria-atomic="true">
    <span className="global-loading-symbol" aria-hidden="true"><span /><b>M</b></span>
    <div><strong>Preparing your store</strong><small>Bringing everything together…</small><i aria-hidden="true" /></div>
  </div></div>;
}
