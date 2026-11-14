import React, { useEffect, useRef, useState } from 'react';
import { invoke, events } from '@forge/bridge';

// The issue panel: a redline of two contract versions with a note under
// every line that breaks the playbook. A note opens into a 3-column compare.

const LABEL = { high: 'high', medium: 'medium', low: 'low' };

export default function Panel({ review, reload }) {
  const [full, setFull] = useState(false);
  const [open, setOpen] = useState(() => {
    const open = (review.findings || []).filter((f) => !f.decision);
    const first = open.find((f) => f.severity === 'high') || open[0];
    return first ? { [first.id]: true } : {};
  });
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);
  const refs = useRef({});

  // The side panel asks us to jump to a finding.
  useEffect(() => {
    const sub = events.on('sidebar.focus', ({ id }) => {
      setOpen((o) => ({ ...o, [id]: true }));
      setTimeout(() => refs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    });
    return () => sub.then((s) => s.unsubscribe());
  }, []);

  if (review.state !== 'ready') return <Empty review={review} />;

  const byId = Object.fromEntries(review.findings.map((f) => [f.id, f]));
  const blocks = full ? review.fullBlocks : review.blocks;

  async function act(action, f) {
    setBusy(f.id + action);
    try {
      const r = await invoke('decide', { action, findingId: f.id });
      setToast(r?.message || 'Saved');
      events.emit('sidebar.reload', {});
      await reload();
    } catch (e) {
      setToast('Failed: ' + (e?.message || e));
    } finally {
      setBusy(null);
      setTimeout(() => setToast(null), 3000);
    }
  }

  async function sendRedline() {
    setBusy('send');
    try {
      const r = await invoke('sendRedline', {});
      setToast(r?.message || 'Redline sent');
    } catch (e) {
      setToast('Failed: ' + (e?.message || e));
    } finally {
      setBusy(null);
      setTimeout(() => setToast(null), 3000);
    }
  }

  return (
    <div className="sb-panel">
      <div className="sb-bar">
        <b>{review.from === review.to ? `v${review.to}` : `v${review.from} → v${review.to}`}</b>
        <span className="sb-vers">
          {(review.versions || []).map((v) => (
            <span key={v.id} className={'sb-ver' + (v.n === review.to ? ' on' : '')} title={`${v.name} · ${v.author} · ${v.ago}`}>
              v{v.n}
            </span>
          ))}
        </span>
        <span className="sb-muted">
          {review.from === review.to ? 'first version' : `${review.changedLines} lines changed`} · {review.findings.length} notes
        </span>
        <div className="sb-right">
          <button className={'sb-btn' + (!full ? ' on' : '')} onClick={() => setFull(false)}>{review.from === review.to ? 'Only issues' : 'Only changes'}</button>
          <button className={'sb-btn' + (full ? ' on' : '')} onClick={() => setFull(true)}>Full contract</button>
          <button className="sb-btn p" disabled={busy === 'send'} onClick={sendRedline}>Send redline</button>
        </div>
      </div>
      <div className="sb-text">
        {blocks.map((b, i) => {
          if (b.kind === 'gap') {
            return (
              <div className="ln" key={i}>
                <span className="n">⋯</span>
                <span className="c sb-muted sb-ui">{b.count} unchanged lines</span>
              </div>
            );
          }
          if (b.kind === 'note') {
            const f = byId[b.id];
            if (!f) return null;
            return (
              <Note
                key={i}
                f={f}
                open={!!open[f.id]}
                busy={busy}
                refFn={(el) => (refs.current[f.id] = el)}
                toggle={() => setOpen((o) => ({ ...o, [f.id]: !o[f.id] }))}
                act={act}
              />
            );
          }
          return (
            <div className={'ln ' + (b.type || '')} key={i}>
              <span className="n">{b.no}</span>
              <span className={'c' + (b.mark ? ' mark' : '')}>
                {b.heading ? <b>{renderSegs(b.segs)}</b> : renderSegs(b.segs)}
              </span>
            </div>
          );
        })}
      </div>
      {toast && <div className="sb-toast">{toast}</div>}
    </div>
  );
}

function renderSegs(segs) {
  return segs.map((s, i) =>
    s.k === 'ins' ? <ins key={i}>{s.t}</ins> : s.k === 'del' ? <del key={i}>{s.t}</del> : <span key={i}>{s.t}</span>
  );
}

function Note({ f, open, toggle, act, busy, refFn }) {
  const done = f.decision;
  return (
    <div ref={refFn} className={'note ' + f.severity + (done ? ' done' : '')}>
      <button type="button" className="h" onClick={toggle} aria-expanded={open} aria-label={`${f.title} details`}>
        <span className={'lz ' + f.severity}>{LABEL[f.severity]}</span>
        <b>{f.title}</b>
        <span className="sb-muted">{f.short}</span>
        {done && <span className="lz ok">{done === 'replied' ? 'replied' : 'accepted'}</span>}
        <span className="a">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <>
          {f.why && <div className="why">{f.why}</div>}
          <div className="cols">
            <div className="col">
              <div className="l">Their text (v{f.version})</div>
              {f.theirs}
            </div>
            <div className="col">
              <div className="l">Your playbook</div>
              {f.playbook}
            </div>
            <div className="col sug">
              <div className="l">Suggested reply</div>
              {f.suggested}
            </div>
          </div>
          {!done && (
            <div className="act">
              <button className="sb-btn p" disabled={!!busy} onClick={() => act('reply', f)}>
                Reply with this wording
              </button>
              <button className="sb-btn" disabled={!!busy} onClick={() => act('accept', f)}>
                Accept their text
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Empty({ review }) {
  if (review.state === 'one-version') {
    return (
      <div className="sb-empty">
        <b>v1 received.</b> {review.findings?.length || 0} clauses differ from your playbook. Sidebar shows a redline
        when the next version arrives.
        {review.findings?.length ? <OneVersion review={review} /> : null}
      </div>
    );
  }
  if (review.state === 'no-playbook') {
    return <div className="sb-empty">Create a Confluence page titled <b>Sidebar Playbook</b> to start reviewing.</div>;
  }
  return (
    <div className="sb-empty">
      Attach a contract (.docx or .txt) to this request. Sidebar keeps each upload as a version.
    </div>
  );
}

function OneVersion({ review }) {
  return (
    <div style={{ marginTop: 10 }}>
      {review.findings.map((f) => (
        <Note key={f.id} f={f} open={false} toggle={() => {}} act={() => {}} busy={null} refFn={() => {}} />
      ))}
    </div>
  );
}
