// Hide sensitive values before any text goes to the model, and put them back
// in the answer. Same idea as a privacy firewall: the model sees [PARTY_1],
// [AMOUNT_2], [EMAIL_1] and so on, never the real values.

const PATTERNS = [
  ['EMAIL', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi],
  ['PHONE', /\+?\d[\d\s().-]{8,}\d/g],
  ['IBAN', /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g],
  ['AMOUNT', /(?:US\$|\$|€|£|USD\s?|EUR\s?)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|m|million|thousand))?/gi],
];

export function makeMasker(names = []) {
  const map = new Map(); // real -> token
  const back = new Map(); // token -> real
  const counts = {};
  const token = (kind, real) => {
    if (map.has(real)) return map.get(real);
    counts[kind] = (counts[kind] || 0) + 1;
    const t = `[${kind}_${counts[kind]}]`;
    map.set(real, t);
    back.set(t, real);
    return t;
  };
  // Longest names first so "Northwind Supply Co." wins over "Northwind".
  const people = [...new Set(names.filter((n) => n && n.length > 2))].sort((a, b) => b.length - a.length);

  return {
    mask(s) {
      if (!s) return s;
      let out = s;
      for (const n of people) {
        const re = new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        out = out.replace(re, (m) => token('PARTY', n));
      }
      for (const [kind, re] of PATTERNS) out = out.replace(re, (m) => token(kind, m));
      return out;
    },
    unmask(s) {
      if (typeof s !== 'string') return s;
      return s.replace(/\[(?:PARTY|EMAIL|PHONE|IBAN|AMOUNT)_\d+\]/g, (t) => back.get(t) || t);
    },
    count: () => map.size,
  };
}
