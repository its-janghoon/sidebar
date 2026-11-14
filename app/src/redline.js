// Redline: compare two versions paragraph by paragraph, then word by word
// inside paragraphs that changed. Output is a flat list of display blocks.
import { diffArrays, diffWords } from 'diff';

const HEADING = /^(\d+)\.\s+[^.]{2,60}\.?$/;
const CLAUSE = /^(\d+(?:\.\d+)*)\.?\s/;

const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Which clause number a paragraph belongs to, e.g. "9.2". */
export function clauseIds(paras) {
  let cur = null;
  return paras.map((p) => {
    const m = p.match(CLAUSE);
    if (m) cur = m[1];
    return cur;
  });
}

/**
 * Build the redline.
 * Returns { lines, changed } where each line is
 * { no, type: 'same'|'add'|'rem', segs, heading, clause } and `no` is the
 * paragraph number in the version that line belongs to (new for same/add).
 */
export function redline(oldParas, newParas) {
  const parts = diffArrays(oldParas, newParas, { comparator: (a, b) => norm(a) === norm(b) });
  const lines = [];
  let o = 0;
  let n = 0;
  let changed = 0;
  const newClause = clauseIds(newParas);
  const oldClause = clauseIds(oldParas);

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p.added && !p.removed) {
      for (const t of p.value) {
        lines.push(line(++n, 'same', [{ t }], t, newClause[n - 1]));
        o++;
      }
      continue;
    }
    // A removed run directly followed by an added run is an edit: pair them.
    if (p.removed && parts[i + 1]?.added) {
      const rem = p.value;
      const add = parts[i + 1].value;
      const k = Math.max(rem.length, add.length);
      for (let j = 0; j < k; j++) {
        if (j < rem.length && j < add.length) {
          const w = diffWords(rem[j], add[j]);
          lines.push(line(++o, 'rem', w.filter((x) => !x.added).map(seg('del')), rem[j], oldClause[o - 1]));
          lines.push(line(++n, 'add', w.filter((x) => !x.removed).map(seg('ins')), add[j], newClause[n - 1]));
          changed += 1;
        } else if (j < rem.length) {
          lines.push(line(++o, 'rem', [{ t: rem[j] }], rem[j], oldClause[o - 1]));
          changed += 1;
        } else {
          lines.push(line(++n, 'add', [{ t: add[j] }], add[j], newClause[n - 1]));
          changed += 1;
        }
      }
      i++;
      continue;
    }
    for (const t of p.value) {
      if (p.removed) lines.push(line(++o, 'rem', [{ t }], t, oldClause[o - 1]));
      else lines.push(line(++n, 'add', [{ t }], t, newClause[n - 1]));
      changed += 1;
    }
  }
  return { lines, changed };
}

function seg(kind) {
  return (x) => ({ t: x.value, k: x.added || x.removed ? kind : undefined });
}

function line(no, type, segs, text, clause) {
  return { no, type, segs, heading: HEADING.test(text), clause, text };
}

/** The whole latest version as "same" lines (for a single version or full view). */
export function plain(paras) {
  const ids = clauseIds(paras);
  return paras.map((t, i) => line(i + 1, 'same', [{ t }], t, ids[i]));
}

/**
 * Turn lines into display blocks. Findings attach a note after their line.
 * With `collapse`, unchanged runs fold into "N unchanged lines" except the
 * clause heading and lines that carry a finding.
 */
export function toBlocks(lines, findings, collapse) {
  const noteAt = new Map();
  for (const f of findings) {
    const idx = locate(lines, f);
    if (idx >= 0) {
      if (!noteAt.has(idx)) noteAt.set(idx, []);
      noteAt.get(idx).push(f.id);
      f.line = lines[idx].no;
    }
  }
  const keep = lines.map((l, i) => !collapse || l.type !== 'same' || noteAt.has(i));
  if (collapse) {
    // Keep the heading of every clause that shows something.
    lines.forEach((l, i) => {
      if (!keep[i] || l.heading) return;
      for (let j = i - 1; j >= 0 && j >= i - 8; j--) {
        if (lines[j].heading && lines[j].clause === (l.clause || '').split('.')[0]) {
          keep[j] = true;
          break;
        }
        if (lines[j].heading) break;
      }
    });
  }
  const blocks = [];
  let gap = 0;
  lines.forEach((l, i) => {
    if (!keep[i]) {
      gap++;
      return;
    }
    if (gap) blocks.push({ kind: 'gap', count: gap });
    gap = 0;
    const ids = noteAt.get(i) || [];
    blocks.push({ kind: 'line', no: l.no, type: l.type === 'same' ? '' : l.type, segs: l.segs, heading: l.heading, mark: ids.length > 0 });
    for (const id of ids) blocks.push({ kind: 'note', id });
  });
  if (gap) blocks.push({ kind: 'gap', count: gap });
  return blocks;
}

/** Find the line a finding points at: exact paragraph number, then clause id. */
function locate(lines, f) {
  // Prefer the newest text (same/add) for the clause.
  const live = (l) => l.type !== 'rem';
  if (f.quote) {
    const q = norm(f.quote).slice(0, 60);
    const i = lines.findIndex((l) => live(l) && norm(l.text).includes(q));
    if (i >= 0) return i;
  }
  if (f.clauseRef) {
    const i = lines.findIndex((l) => live(l) && l.clause === f.clauseRef && !l.heading);
    if (i >= 0) return i;
    const j = lines.findIndex((l) => live(l) && (l.clause || '').startsWith(f.clauseRef.split('.')[0] + '.') && !l.heading);
    if (j >= 0) return j;
  }
  return -1;
}
