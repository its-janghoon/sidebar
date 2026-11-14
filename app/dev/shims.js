// Local stand-ins for Forge runtime packages, so the backend code can run
// on this machine against the real demo site with basic auth.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SITE = 'https://one-atlas-fczx.atlassian.net';
const dir = path.join(os.homedir(), '.atlassian');
const AUTH =
  'Basic ' +
  Buffer.from(
    fs.readFileSync(path.join(dir, 'forge_email'), 'utf8').trim() + ':' + fs.readFileSync(path.join(dir, 'forge_token'), 'utf8').trim()
  ).toString('base64');

const req = (base) => (p, init = {}) =>
  fetch(base + p, { ...init, headers: { Authorization: AUTH, Accept: 'application/json', ...(init.headers || {}) } });

const client = { requestJira: req(SITE), requestConfluence: req(SITE) };
export const route = (strings, ...vals) =>
  strings.reduce((s, str, i) => s + str + (i < vals.length ? encodeURIComponent(String(vals[i])).replace(/%2F/g, '/') : ''), '');
const api = { asApp: () => client, asUser: () => client };
export default api;

const store = new Map();
export const kvs = {
  get: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : undefined),
  set: async (k, v) => void store.set(k, JSON.stringify(v)),
  delete: async (k) => void store.delete(k),
};

export const chat = async () => {
  throw new Error('Forge LLM is not available locally');
};
export const list = async () => ({ models: [] });
