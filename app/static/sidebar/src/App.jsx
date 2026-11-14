import React, { useEffect, useState, useCallback } from 'react';
import { view, invoke, events } from '@forge/bridge';
import Panel from './Panel.jsx';
import Context from './Context.jsx';

// One bundle serves both modules. The module key tells us which view to draw.
export default function App() {
  const [moduleKey, setModuleKey] = useState(null);
  const [review, setReview] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async (force = false) => {
    try {
      setError(null);
      const r = await invoke('getReview', { force });
      setReview(r);
    } catch (e) {
      setError(String(e?.message || e));
    }
  }, []);

  useEffect(() => {
    view.getContext().then((c) => setModuleKey(c.moduleKey));
    load();
    // Re-run when the issue changes (new attachment, new comment, status).
    const sub = events.on('JIRA_ISSUE_CHANGED', () => load());
    const sub2 = events.on('sidebar.reload', () => load());
    return () => {
      sub.then((s) => s.unsubscribe());
      sub2.then((s) => s.unsubscribe());
    };
  }, [load]);

  if (error) return <div className="sb-empty">Sidebar could not load: {error}</div>;
  if (!review || !moduleKey) return <div className="sb-empty">Reading the contract…</div>;
  if (review.state === 'working') return <Working review={review} reload={load} />;
  if (moduleKey === 'sidebar-context') return <Context review={review} reload={load} />;
  return <Panel review={review} reload={load} />;
}

// While the queue job runs, show progress and check again every 3 seconds.
function Working({ review, reload }) {
  useEffect(() => {
    const t = setInterval(() => reload(), 3000);
    return () => clearInterval(t);
  }, [reload]);
  const v = review.versions?.[review.versions.length - 1];
  return (
    <div className="sb-empty">
      Reviewing {v ? <b>{v.name}</b> : 'the contract'} against your playbook…
    </div>
  );
}
