// Rovo actions. They reuse the same review the Sidebar panels show, so the
// agent and the panel always agree.
import api, { route } from '@forge/api';
import { kvs } from '@forge/kvs';
import { getReview, pastMatters, counterpartyOf } from './review';
import { readIssue } from './versions';

const KEY = /^[A-Z][A-Z0-9_]+-\d+$/;

/** Record the last agent call on the issue so builders can check it over REST. */
async function trace(key, action, out) {
  console.log('rovo action', action, key);
  await api
    .asApp()
    .requestJira(route`/rest/api/3/issue/${key}/properties/sidebar-rovo`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, at: new Date().toISOString(), out: JSON.stringify(out).slice(0, 2000) }),
    })
    .catch(() => {});
  return out;
}

/** Prefer the issue the user is looking at; accept a typed key as fallback. */
async function issueKeyFrom(payload) {
  let key = payload?.context?.jira?.issueKey;
  // On some surfaces the context carries the numeric id instead of the key.
  if (key && !KEY.test(String(key)) && payload?.context?.jira?.issueId) key = payload.context.jira.issueId;
  if (!key || !KEY.test(String(key))) key = String(payload?.issueKey || '').trim().toUpperCase();
  if (!key) throw new Error('Open a contract request or give its key, for example CLSD-7.');
  // Authorization: only answer about issues this user can see.
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/${key}?fields=summary`);
  if (!res.ok) throw new Error(`You cannot see ${key}.`);
  return (await res.json()).key;
}

export async function checkAgainstPlaybook(payload) {
  const key = await issueKeyFrom(payload);
  const r = await getReview(key);
  if (r.state !== 'ready') return { issue: key, status: r.state };
  return trace(key, 'checkAgainstPlaybook', {
    issue: key,
    version: `v${r.to}`,
    verdict: r.verdict?.title,
    findings: r.findings.map((f) => ({
      severity: f.severity,
      clause: f.clause,
      issue: f.short,
      why: f.why,
      theirText: f.theirs,
      playbook: f.playbook,
      suggestedWording: f.suggested,
      decision: f.decision || 'open',
    })),
  });
}

export async function compareVersions(payload) {
  const key = await issueKeyFrom(payload);
  const r = await getReview(key);
  if (r.state !== 'ready') return { issue: key, status: r.state };
  const changes = [];
  for (const b of r.blocks) {
    if (b.kind !== 'line' || !b.type) continue;
    changes.push(`${b.type === 'add' ? 'NEW' : 'OLD'} §${b.no}: ${b.segs.map((s) => s.t).join('')}`);
  }
  return trace(key, 'compareVersions', {
    issue: key,
    from: `v${r.from} ${r.versions[r.from - 1]?.name || ''}`,
    to: `v${r.to} ${r.versions[r.to - 1]?.name || ''}`,
    changedParagraphs: r.changedLines,
    changes,
  });
}

export async function findPastMatters(payload) {
  const key = await issueKeyFrom(payload);
  const issue = await readIssue(key);
  const party = issue.counterparty || counterpartyOf(issue.fields.summary);
  const past = await pastMatters(issue, party);
  return trace(key, 'findPastMatters', {
    issue: key,
    counterparty: party,
    pastMatters: past.map((p) => ({
      key: p.key,
      summary: p.summary,
      status: p.status,
      year: p.created?.slice(0, 4),
      decisions: Object.values(p.decisions || {}).map((d) => `${d.clause}: ${d.action} "${d.text}"`),
    })),
  });
}
