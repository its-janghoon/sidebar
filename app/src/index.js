// Resolvers for the Sidebar panels and the
// shared logic that the Rovo actions also use.
import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';
import { kvs } from '@forge/kvs';
import { getReview, setDecision, getDecisions, pastMatters, counterpartyOf } from './review';
import { readIssue } from './versions';
import { loadPlaybook } from './playbook';
import { makeMasker } from './mask';
import { answer } from './llm';


const resolver = new Resolver();
const issueKeyOf = (req) => req.context.extension.issue.key;

/** Only people who can see the issue may use the panel. */
async function assertCanView(issueKey) {
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}?fields=summary`);
  if (!res.ok) throw new Error('You do not have access to this request');
}

resolver.define('getReview', async (req) => {
  const key = issueKeyOf(req);
  await assertCanView(key);
  try {
    const r = await getReview(key, { force: !!req.payload?.force });
    console.log('getReview', key, r.state, (r.findings || []).length);
    // Builder QA: keep the exact payload the panel got (minus the full text).
    // Builder QA: keep the exact payload the panel got (minus the full text).
    await debug(key, { where: 'getReview', state: r.state, engine: r.engine, findings: (r.findings || []).map((f) => ({ s: f.severity, t: f.title, short: f.short, why: f.why, line: f.line, sug: f.suggested, dec: f.decision })) });
    await dump(key, { ...r, fullBlocks: undefined });
    return r;
  } catch (e) {
    console.error('getReview failed', key, String(e?.stack || e));
    // Builder QA: keep the exact payload the panel got (minus the full text).
    await debug(key, { where: 'getReview', error: String(e?.stack || e).slice(0, 1500) });
    throw e;
  }
});

resolver.define('decide', async (req) => {
  const key = issueKeyOf(req);
  await assertCanView(key);
  const { action, findingId } = req.payload;
  const cached = await kvs.get(`review:${key}`);
  const f = cached?.review?.findings?.find((x) => x.id === findingId);
  if (!f) throw new Error('This finding is out of date. Reload the page.');
  const who = req.context.accountId;

  if (action === 'reply') {
    await comment(key, `Proposed change to ${f.title.replace(/\.$/, '')}:\n\n"${f.suggested}"\n\nReason: ${f.playbook}`, true);
  } else {
    await comment(key, `Sidebar: accepted their text for ${f.title.replace(/\.$/, '')}\n\n"${f.theirs}"`, false);
  }
  await setDecision(key, f.id, {
    action: action === 'reply' ? 'replied' : 'accepted',
    clause: f.clause,
    title: f.title,
    text: action === 'reply' ? f.suggested : f.theirs,
    by: who,
    at: new Date().toISOString(),
  });
  return { message: action === 'reply' ? 'Reply sent to the requester' : 'Marked as accepted' };
});

resolver.define('sendRedline', async (req) => {
  const key = issueKeyOf(req);
  await assertCanView(key);
  const cached = await kvs.get(`review:${key}`);
  const r = cached?.review;
  if (!r) throw new Error('Nothing to send yet');
  // Accepted clauses are settled, so the redline asks only for the rest.
  const decisions = await getDecisions(key);
  const ask = r.findings.filter((f) => decisions[f.id]?.action !== 'accepted');
  const lines = ask.map((f, i) => `${i + 1}. ${f.title.replace(/\.$/, '')}: please use "${f.suggested}"`);
  await comment(
    key,
    `Redline for v${r.to}${r.from !== r.to ? ` (changes since v${r.from})` : ''}.\n\n${lines.join('\n') || 'No changes requested.'}`,
    true
  );
  return { message: 'Redline sent to the requester' };
});

resolver.define('ask', async (req) => {
  const key = issueKeyOf(req);
  await assertCanView(key);
  const out = await askAbout(key, String(req.payload?.question || '').slice(0, 500));
  await debug(key, { where: 'ask', answer: out.answer.slice(0, 1500) });
  return out;
});

export const handler = resolver.getDefinitions();


// ---------- shared ----------

/** Exact panel payload for local visual QA (dev only, small enough for a property). */
async function dump(issueKey, value) {
  const body = JSON.stringify(value);
  if (body.length > 30000) return debug(issueKey, { where: 'dump', skipped: body.length });
  const res = await api
    .asApp()
    .requestJira(route`/rest/api/3/issue/${issueKey}/properties/sidebar-dump`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    .catch((e) => ({ ok: false, status: String(e) }));
  if (!res.ok) await debug(issueKey, { where: 'dump', status: res.status, size: body.length });
}

/** Last run status on the issue, so builders can check it over REST. */
async function debug(issueKey, value) {
  try {
    await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/properties/sidebar-debug`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...value, at: new Date().toISOString() }),
    });
  } catch (e) {
    console.warn('debug write failed', String(e));
  }
}

/** Post a comment. Public comments go to the JSM requester. */
export async function comment(issueKey, text, isPublic) {
  if (isPublic) {
    const res = await api.asUser().requestJira(route`/rest/servicedeskapi/request/${issueKey}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text, public: true }),
    });
    if (res.ok) return;
  }
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      body: { type: 'doc', version: 1, content: text.split('\n\n').map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p }] })) },
      properties: [{ key: 'sd.public.comment', value: { internal: !isPublic } }],
    }),
  });
  if (!res.ok) throw new Error(`Could not post comment (${res.status})`);
}

/** Answer a question about this contract using past matters and the playbook. */
export async function askAbout(issueKey, question) {
  const issue = await readIssue(issueKey);
  const counterparty = (issue.counterparty || counterpartyOf(issue.fields.summary));
  const past = await pastMatters(issue, counterparty);
  const playbook = await loadPlaybook();
  const cached = await kvs.get(`review:${issueKey}`);
  const mk = makeMasker([counterparty, issue.fields.reporter?.displayName].filter(Boolean));

  const pastText = past
    .map((p) => {
      const d = Object.values(p.decisions || {})
        .map((x) => `  - ${x.clause || x.title}: ${x.action} "${x.text}"`)
        .join('\n');
      return `${p.key} (${p.created?.slice(0, 4)}, ${p.status}): ${p.summary}\n${d || '  - no recorded decisions'}`;
    })
    .join('\n');
  const findings = (cached?.review?.findings || []).map((f) => `- ${f.title} ${f.short}`).join('\n');
  const pb = (playbook?.clauses || []).map((c) => `- ${c.title}: ${c.standard || ''}`).join('\n');

  const text = await answer({
    system:
      'You answer short questions from an in-house lawyer about one contract request. Use only the facts given. ' +
      'Cite request keys like LEGAL-17 when you use them. Two or three sentences. Keep bracketed tokens as written.',
    user: mk.mask(
      `REQUEST ${issueKey}: ${issue.fields.summary}\n\nOPEN FINDINGS\n${findings || '- none'}\n\nPAST MATTERS WITH THE SAME PARTY\n${pastText || '- none'}\n\nPLAYBOOK\n${pb}\n\nQUESTION\n${question}`
    ),
  });
  return { answer: mk.unmask(text), refs: past.map((p) => p.key) };
}

// ---------- Rovo actions ----------
export { checkAgainstPlaybook, compareVersions, findPastMatters } from './rovo';
