// Review = versions + redline + findings against the playbook.
// The model call is bounded so a review fits in one resolver call.
import api, { route } from '@forge/api';
import { kvs } from '@forge/kvs';
import { readIssue, listVersions, versionText, ago } from './versions';
import { redline, plain, toBlocks, clauseIds } from './redline';
import { loadPlaybook } from './playbook';
import { makeMasker } from './mask';
import { structured } from './llm';

const PROMPT_VERSION = 3;

export function counterpartyOf(summary = '') {
  const m = summary.split(/\s[·|–-]\s/);
  return m.length > 1 ? m[m.length - 1].trim() : null;
}

/** Everything needed to show the panels, computed or from cache. */
export async function getReview(issueKey, { force = false } = {}) {
  const issue = await readIssue(issueKey);
  const versions = listVersions(issue);
  const counterparty = (issue.counterparty || counterpartyOf(issue.fields.summary));
  const decisions = await getDecisions(issueKey);
  const past = await pastMatters(issue, counterparty);
  const meta = { pastCount: past.length, counterparty };

  if (!versions.length) return { state: 'no-versions', versions: [], findings: [], meta, verdict: null };

  const playbook = await loadPlaybook();
  if (!playbook) return { state: 'no-playbook', versions, findings: [], meta };

  const hash = [PROMPT_VERSION, playbook.id, playbook.version, ...versions.map((v) => v.id)].join(':');
  const cached = await kvs.get(`review:${issueKey}`);
  if (cached && cached.hash === hash && !force) return finish(cached.review, decisions, versions, meta);

  // Not computed yet: do it now (the model call is bounded, see modelFindings).
  // Both panels load at once; let one compute while the other waits for it.
  const lock = await kvs.get(`lock:${issueKey}`);
  if (lock && lock.hash === hash && lock.at > Date.now() - 22e3 && !force) {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const c = await kvs.get(`review:${issueKey}`);
      if (c && c.hash === hash) return finish(c.review, decisions, versions, meta);
    }
  }
  await kvs.set(`lock:${issueKey}`, { hash, at: Date.now() });
  await computeReview(issueKey, hash);
  const fresh = await kvs.get(`review:${issueKey}`);
  return finish(fresh.review, decisions, versions, meta);
}

/** Do the full review and cache it. */
export async function computeReview(issueKey, hash) {
  const issue = await readIssue(issueKey);
  const versions = listVersions(issue);
  const playbook = await loadPlaybook();
  if (!versions.length || !playbook) return;

  const latest = versions[versions.length - 1];
  const prev = versions.length > 1 ? versions[versions.length - 2] : null;
  const newParas = await versionText(latest);
  const oldParas = prev ? await versionText(prev) : null;

  const { lines, changed } = oldParas ? redline(oldParas, newParas) : { lines: plain(newParas), changed: 0 };
  let findings;
  let engine = 'model';
  try {
    findings = await modelFindings({ issue, newParas, lines, playbook, prevN: prev?.n, latestN: latest.n });
  } catch (e) {
    console.warn('model review failed, using rules', String(e));
    findings = ruleFindings(newParas, playbook, latest.n);
    engine = 'rules';
  }

  // Two block lists: changes only (default) and the full contract.
  const fullBlocks = toBlocks(lines, findings, false);
  const blocks = toBlocks(lines, findings, true);
  const review = {
    state: oldParas ? 'ready' : 'one-version',
    from: prev ? prev.n : latest.n,
    to: latest.n,
    changedLines: changed,
    blocks,
    fullBlocks,
    findings,
    engine,
    computedAt: new Date().toISOString(),
  };
  // A single version still gets a redline view of the whole text.
  if (!oldParas) review.state = 'ready';
  await kvs.set(`review:${issueKey}`, { hash, review });
}

function withAgo(v) {
  return { ...v, ago: ago(v.created) };
}

function finish(review, decisions, versions, meta) {
  const findings = review.findings.map((f) => ({ ...f, decision: decisions[f.id]?.action || null }));
  const open = findings.filter((f) => !f.decision);
  const sev = (s) => open.filter((f) => f.severity === s).length;
  let verdict;
  if (sev('high')) verdict = { level: 'block', title: 'Not ready to sign', text: `${open.length} ${open.length > 1 ? 'clauses differ' : 'clause differs'} from your playbook.` };
  else if (open.length) verdict = { level: 'warn', title: 'Needs a decision', text: `${open.length} ${open.length > 1 ? 'clauses' : 'clause'} still open.` };
  else verdict = { level: 'ok', title: 'Ready to approve', text: findings.length ? 'Every finding has a decision.' : 'Matches your playbook.' };
  return { ...review, findings, verdict, versions: versions.map(withAgo), meta };
}

// ---------- findings ----------

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          paragraph: { type: 'integer', description: 'P number of the paragraph that breaks the playbook' },
          clauseRef: { type: 'string', description: 'Clause number as written, e.g. "9.2"' },
          playbookClause: { type: 'string', description: 'Playbook clause title this relates to' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          title: { type: 'string', description: 'At most 6 words, start with the section sign, e.g. "§9.2 still unlimited."' },
          short: { type: 'string', description: 'At most 10 words' },
          why: { type: 'string', description: 'One sentence. Say whether the latest change fixed it or not.' },
          theirs: { type: 'string', description: 'Exact quote of their problematic words, at most 30 words' },
          playbook: { type: 'string', description: 'What the playbook requires, at most 20 words' },
          suggested: { type: 'string', description: 'Replacement wording to send back, contract style, 1-2 sentences' },
        },
        required: ['paragraph', 'severity', 'title', 'short', 'why', 'theirs', 'playbook', 'suggested'],
      },
    },
  },
  required: ['findings'],
};

async function modelFindings({ issue, newParas, lines, playbook, prevN, latestN }) {
  const names = [(issue.counterparty || counterpartyOf(issue.fields.summary)), issue.fields.reporter?.displayName].filter(Boolean);
  // Party names written in the contract itself ("Northwind Supply Co.").
  for (const p of newParas.slice(0, 12)) {
    for (const m of p.matchAll(/\b([A-Z][A-Za-z&]+(?:\s[A-Z][A-Za-z&]+)*\s(?:Inc|LLC|Ltd|Co|Corp|GmbH|plc)\.?)/g)) names.push(m[1]);
  }
  const mk = makeMasker(names);
  const ids = clauseIds(newParas);
  // Send only paragraphs under a playbook topic, plus anything that changed.
  const titles = sectionTitles(newParas);
  const keys = playbook.clauses.flatMap((c) => c.match);
  const changedText = new Set(lines.filter((l) => l.type === 'add').map((l) => l.text));
  const numbered = newParas
    .map((p, i) => [p, i])
    .filter(([p, i]) => keys.some((k) => titles[i].includes(k)) || changedText.has(p))
    .map(([p, i]) => `[P${i + 1}]${ids[i] ? ` (clause ${ids[i]})` : ''} ${mk.mask(p)}`)
    .join('\n');
  const changes = lines
    .filter((l) => l.type !== 'same')
    .map((l) => `${l.type === 'add' ? '+' : '-'} ${mk.mask(l.text)}`)
    .join('\n');
  const pb = playbook.clauses
    .map((c) => `## ${c.title} (risk: ${c.risk})\nStandard: ${c.standard || '-'}\nAllowed: ${c.allowed || '-'}\nFallback: ${c.fallback || '-'}\nRed flags: ${c.redFlags.join('; ') || '-'}`)
    .join('\n\n');

  const system =
    'You help an in-house legal team review an incoming contract against their playbook. ' +
    'Report only clauses in the LATEST version that fall outside what the playbook allows, plus clauses the playbook requires that are missing. ' +
    'Do not report things the playbook allows. Keep severities from the playbook risk unless the text is clearly worse. ' +
    'Bracketed tokens like [PARTY_1] or [AMOUNT_2] are masked values: keep them exactly as written. Be concise and specific.';
  const user =
    `PLAYBOOK\n${pb}\n\nLATEST VERSION v${latestN} (paragraphs under playbook topics or changed)\n${numbered}\n\n` +
    (prevN ? `CHANGES FROM v${prevN} TO v${latestN}\n${changes || '(none)'}\n\n` : 'This is the first version.\n\n') +
    'Call report_findings once with every finding, most severe first.';

  const { data } = await withTimeout(17000, structured({
    system,
    user,
    name: 'report_findings',
    description: 'Report every playbook deviation found in the latest contract version',
    schema: FINDINGS_SCHEMA,
    maxTokens: 1800,
  }));

  return (data.findings || []).map((f, i) => {
    const para = newParas[f.paragraph - 1] || '';
    return {
      id: `f${i + 1}-${hashStr(para + f.title)}`,
      version: latestN,
      severity: f.severity,
      clause: f.playbookClause ? `§${(f.clauseRef || ids[f.paragraph - 1] || '').split('.')[0]} ${f.playbookClause}` : mk.unmask(f.title),
      clauseRef: f.clauseRef || ids[f.paragraph - 1] || null,
      quote: para,
      title: mk.unmask(f.title),
      short: mk.unmask(f.short),
      why: mk.unmask(f.why),
      theirs: mk.unmask(f.theirs),
      playbook: mk.unmask(f.playbook),
      suggested: mk.unmask(f.suggested),
    };
  });
}

/** For each paragraph: "<top heading> / <sub-clause title>" in lower case. */
function sectionTitles(paras) {
  const ids = clauseIds(paras);
  const top = {};
  paras.forEach((p) => {
    const m = p.match(/^(\d+)\.\s+(.*)$/);
    if (m && m[2].length < 80) top[m[1]] = m[2].toLowerCase();
  });
  const sub = paras.map((p) => (p.match(/^\d+\.\d+\s+([^.]{2,80})\./) || [])[1]?.toLowerCase() || '');
  return paras.map((p, i) => {
    if (!ids[i]) return '';
    let st = sub[i];
    for (let j = i; !st && j >= 0 && ids[j] === ids[i]; j--) st = sub[j];
    return `${top[ids[i].split('.')[0]] || ''} / ${st || ''}`;
  });
}

/** No-model fallback: red-flag phrases inside the matching clause. */
export function ruleFindings(paras, playbook, latestN) {
  const ids = clauseIds(paras);
  // Title of the top clause ("8. Limitation of Liability") and of the
  // sub-clause ("8.2 Indirect Damages Waiver.") each paragraph belongs to.
  const top = {};
  paras.forEach((p, i) => {
    const m = p.match(/^(\d+)\.\s+(.*)$/);
    if (m && m[2].length < 80) top[m[1]] = m[2].toLowerCase();
  });
  const subTitle = paras.map((p) => (p.match(/^\d+\.\d+\s+([^.]{2,80})\./) || [])[1]?.toLowerCase() || '');
  const out = [];
  playbook.clauses.forEach((c, ci) => {
    paras.forEach((p, i) => {
      if (!ids[i]) return;
      const head = top[ids[i].split('.')[0]] || '';
      let st = subTitle[i];
      for (let j = i; !st && j >= 0 && ids[j] === ids[i]; j--) st = subTitle[j];
      // Sub-clause title wins; fall back to the top heading.
      const where = st || head;
      if (!c.match.some((k) => where.includes(k))) return;
      const flag = c.redFlags.find((r) => p.toLowerCase().includes(r));
      if (!flag || out.some((o) => o.quote === p)) return;
      out.push({
        id: `r${ci}-${hashStr(p)}`,
        version: latestN,
        severity: c.risk,
        clause: `§${ids[i].split('.')[0]} ${c.title}`,
        clauseRef: ids[i],
        quote: p,
        title: `§${ids[i]} ${c.title.toLowerCase()}.`,
        short: `Has "${flag}".`,
        why: `The playbook lists "${flag}" as a red flag for ${c.title.toLowerCase()}.`,
        theirs: p.replace(/^\d+(\.\d+)*\s+[^.]{2,80}\.\s*/, ''),
        playbook: c.standard || c.allowed || '',
        suggested: c.fallback || c.standard || '',
      });
    });
  });
  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

function withTimeout(ms, p) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`model took over ${ms} ms`)), ms))]);
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// ---------- decisions and past matters ----------

const PROP = 'sidebar-decisions';

export async function getDecisions(issueKey) {
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/properties/${PROP}`);
  if (!res.ok) return {};
  return (await res.json()).value || {};
}

export async function setDecision(issueKey, findingId, decision) {
  const cur = await getDecisions(issueKey);
  cur[findingId] = decision;
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/properties/${PROP}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cur),
  });
  if (!res.ok) throw new Error(`Could not save decision (${res.status})`);
  return cur;
}

/** Earlier requests with the same counterparty, with their recorded decisions. */
export async function pastMatters(issue, counterparty) {
  if (!counterparty) return [];
  const word = counterparty.split(/\s+/)[0].replace(/["\\]/g, '');
  // Only matters opened before this one count as history.
  const before = String(issue.fields.created || '').slice(0, 16).replace('T', ' ');
  const jql = `project = ${issue.fields.project.key} AND key != ${issue.key} AND summary ~ "${word}"${before ? ` AND created < "${before}"` : ''} ORDER BY created DESC`;
  const res = await api.asApp().requestJira(route`/rest/api/3/search/jql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jql, maxResults: 10, fields: ['summary', 'status', 'resolutiondate', 'created'], properties: [PROP] }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.issues || []).map((i) => ({
    key: i.key,
    summary: i.fields.summary,
    status: i.fields.status?.name,
    created: i.fields.created,
    decisions: i.properties?.[PROP] || {},
  }));
}
