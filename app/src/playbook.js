// The playbook is a Confluence page titled "Sidebar Playbook".
// Each clause is an <h2> followed by labelled paragraphs:
//   Match: liability, limitation of liability
//   Risk: high | medium | low
//   Standard: ...   Allowed: ...   Fallback: ...   Red flags: unlimited; uncapped
import api, { route } from '@forge/api';
import { kvs } from '@forge/kvs';

export const PLAYBOOK_TITLE = 'Sidebar Playbook';
const FIELDS = ['match', 'risk', 'standard', 'allowed', 'fallback', 'red flags'];

/** Load and parse the playbook. Cached by page version for 10 minutes. */
export async function loadPlaybook() {
  const cql = `type=page and title="${PLAYBOOK_TITLE}"`;
  const path = route`/wiki/rest/api/content/search?cql=${cql}&expand=body.storage,version,space&limit=1`;
  // Try as the app first; fall back to the viewing user's own access.
  let data = null;
  for (const who of ['asApp', 'asUser']) {
    try {
      const res = await api[who]().requestConfluence(path);
      if (res.ok) {
        data = await res.json();
        if (data.results?.length) break;
      } else {
        console.warn('playbook search', who, res.status);
      }
    } catch (e) {
      console.warn('playbook search', who, String(e));
    }
  }
  const page = data?.results?.[0];
  // Queue jobs run without a user, so keep the last playbook we could read.
  if (!page) return (await kvs.get('playbook:last')) || null;

  const cacheKey = `playbook:${page.id}:${page.version?.number}`;
  const cached = await kvs.get(cacheKey);
  if (cached) {
    await kvs.set('playbook:last', cached);
    return cached;
  }

  const pb = {
    id: page.id,
    version: page.version?.number,
    url: page._links?.webui ? `${data._links?.base || ''}${page._links.webui}` : null,
    clauses: parse(page.body?.storage?.value || ''),
  };
  await kvs.set(cacheKey, pb);
  await kvs.set('playbook:last', pb);
  return pb;
}

export function parse(html) {
  const out = [];
  const sections = html.split(/<h2[^>]*>/i).slice(1);
  for (const s of sections) {
    const [titleHtml, rest = ''] = s.split(/<\/h2>/i);
    const c = { title: text(titleHtml) };
    for (const p of rest.split(/<\/p>|<\/li>/i)) {
      const t = text(p);
      const m = t.match(/^([A-Za-z ]+):\s*(.*)$/);
      if (!m) continue;
      const k = m[1].trim().toLowerCase();
      if (FIELDS.includes(k)) c[k === 'red flags' ? 'redFlags' : k] = m[2].trim();
    }
    c.risk = ['high', 'medium', 'low'].includes((c.risk || '').toLowerCase()) ? c.risk.toLowerCase() : 'medium';
    c.match = (c.match || c.title)
      .split(/[,;]/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
    c.redFlags = (c.redFlags || '')
      .split(/;/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
    out.push(c);
  }
  return out;
}

function text(h) {
  return h
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
