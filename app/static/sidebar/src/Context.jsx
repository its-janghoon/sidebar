import React, { useState } from 'react';
import { invoke, events } from '@forge/bridge';

// The right-hand context panel: verdict, the list of findings (click jumps to
// the line in the redline) and a small "ask about this contract" box.

const ORDER = { high: 0, medium: 1, low: 2 };

export default function Context({ review }) {
  const [q, setQ] = useState('');
  const [chat, setChat] = useState([]);
  const [busy, setBusy] = useState(false);

  const findings = [...(review.findings || [])].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  const open = findings.filter((f) => !f.decision);
  const v = review.verdict || { level: 'ok', title: 'Nothing to review', text: '' };
  // The bar shows what is still open; decided findings drop out of it.
  const total = Math.max(findings.length, 1);
  const count = (s) => open.filter((f) => f.severity === s).length;

  async function ask(e) {
    e.preventDefault();
    const question = q.trim();
    if (!question) return;
    setQ('');
    setChat((c) => [...c, { me: true, text: question }]);
    setBusy(true);
    try {
      const r = await invoke('ask', { question });
      setChat((c) => [...c, { me: false, text: r.answer, refs: r.refs }]);
    } catch (err) {
      setChat((c) => [...c, { me: false, text: 'Sorry, that failed: ' + (err?.message || err) }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sb-ctx">
      <div className="sb-ctx-head">
        <span className="sb-muted">
          {review.to ? `v${review.to} · ${review.versions?.[review.to - 1]?.ago || ''}` : 'No versions yet'}
        </span>
      </div>
      <div className={'verdict ' + v.level}>
        <b>{v.title}</b>
        <div>{v.text}</div>
        {findings.length > 0 && (
          <div className="meter" title={`${open.length} of ${findings.length} open`}>
            <div style={{ width: (count('high') / total) * 100 + '%' }} className="m-high" />
            <div style={{ width: (count('medium') / total) * 100 + '%' }} className="m-medium" />
            <div style={{ width: (count('low') / total) * 100 + '%' }} className="m-low" />
          </div>
        )}
      </div>
      <div className="sb-list">
        {findings.map((f) => (
          <button
            type="button"
            key={f.id}
            aria-label={`Go to ${f.clause}`}
            className={'it' + (f.decision ? ' done' : '')}
            onClick={() => events.emit('sidebar.focus', { id: f.id })}
          >
            <span className={'lz ' + f.severity}>{f.severity}</span>
            <b>{f.clause}</b>
            <span className="g">{f.decision ? f.decision : f.line ? 'line ' + f.line : ''}</span>
          </button>
        ))}
      </div>
      {review.meta && (
        <div className="mini">
          {open.length} open · Past matters {review.meta.pastCount} with {review.meta.counterparty || 'this party'}
        </div>
      )}
      <div className="chat">
        {chat.map((m, i) => (
          <div key={i} className={'bub ' + (m.me ? 'me' : 'ro')}>
            {!m.me && <b>Sidebar</b>}
            {!m.me && <br />}
            {m.text}
          </div>
        ))}
        {busy && <div className="bub ro sb-muted">Looking at past matters…</div>}
        <form onSubmit={ask}>
          <input
            className="in"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ask about this contract…"
          />
        </form>
      </div>
    </div>
  );
}
