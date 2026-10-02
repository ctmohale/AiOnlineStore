import { useEffect, useState, useSyncExternalStore } from 'react';
import { getPendingRequests, subscribeToLoading } from '../lib/loading';

export default function GlobalLoading() {
  const pending = useSyncExternalStore(subscribeToLoading, getPendingRequests, () => 0);
  const [visible, setVisible] = useState(false);
  const busy = pending > 0;
  useEffect(() => {
    if (!busy) { setVisible(false); return; }
    const timer = window.setTimeout(() => setVisible(true), 200);
    return () => window.clearTimeout(timer);
  }, [busy]);
  if (!busy || !visible) return null;
  return <div className="global-loading-backdrop"><div className="global-loading" role="status" aria-live="polite" aria-atomic="true">
    <span className="global-loading-symbol" aria-hidden="true"><span /><b>M</b></span>
    <div><strong>Loading data</strong><small>Please wait a moment…</small></div>
  </div></div>;
}
