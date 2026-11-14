// Contract versions = the .docx / .txt attachments on the issue, oldest first.
// Text is extracted once per attachment and cached in Forge storage.
import api, { route } from '@forge/api';
import { kvs } from '@forge/kvs';
import JSZip from 'jszip';

const CONTRACT = /\.(docx|txt|md)$/i;

/** Read the issue fields Sidebar needs. */
export async function readIssue(issueKey) {
  const res = await api
    .asApp()
    .requestJira(route`/rest/api/3/issue/${issueKey}?fields=*all&expand=names`);
  if (!res.ok) throw new Error(`Could not read ${issueKey} (${res.status})`);
  const issue = await res.json();
  // JSM legal request types ask "What is the name of the other party?".
  const partyField = Object.entries(issue.names || {}).find(([, n]) => /other party|counterparty/i.test(n))?.[0];
  issue.counterparty = partyField ? issue.fields[partyField] || null : null;
  return issue;
}

/** List contract versions on an issue, oldest first. */
export function listVersions(issue) {
  const files = (issue.fields.attachment || []).filter((a) => CONTRACT.test(a.filename));
  files.sort((a, b) => new Date(a.created) - new Date(b.created));
  return files.map((a, i) => ({
    n: i + 1,
    id: String(a.id),
    name: a.filename,
    created: a.created,
    author: a.author?.displayName || '',
    size: a.size,
  }));
}

/** Get the plain text of one version, as an array of paragraphs. */
export async function versionText(v) {
  const key = `text:${v.id}`;
  const cached = await kvs.get(key);
  if (cached) return cached;

  const res = await api.asApp().requestJira(route`/rest/api/3/attachment/content/${v.id}`);
  if (!res.ok) throw new Error(`Could not download ${v.name} (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());

  const paragraphs = /\.docx$/i.test(v.name) ? await docxParagraphs(buf) : textParagraphs(buf.toString('utf8'));
  await kvs.set(key, paragraphs);
  return paragraphs;
}

/** Split a plain-text contract into paragraphs (blank lines or single lines). */
function textParagraphs(s) {
  return s
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Pull paragraph text out of word/document.xml without a heavy library. */
async function docxParagraphs(buf) {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml').async('string');
  const out = [];
  for (const p of xml.split(/<\/w:p>/)) {
    let t = '';
    // Keep text runs, tabs and line breaks in document order.
    const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g;
    let m;
    while ((m = re.exec(p))) t += m[1] !== undefined ? m[1] : ' ';
    t = decode(t).replace(/\s+/g, ' ').trim();
    if (t) out.push(t);
  }
  return out;
}

function decode(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Human "2 min ago" text for the context panel. */
export function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
