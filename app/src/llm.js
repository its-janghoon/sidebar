// Thin wrapper over Forge LLMs (Atlassian-hosted Claude). Picks an active
// Claude model once a day and forces structured output through a tool call.
import { chat, list } from '@forge/llm';
import { kvs } from '@forge/kvs';

async function pickModel() {
  const cached = await kvs.get('llm:model');
  if (cached && cached.at > Date.now() - 86400e3) return cached.model;
  const { models = [] } = await list();
  const active = models.filter((m) => m.status === 'active').map((m) => m.model);
  // Prefer a Sonnet-class model: good legal reading at a modest cost.
  const model = active.find((m) => /sonnet/.test(m)) || active.find((m) => /haiku/.test(m)) || active[0];
  if (!model) throw new Error('No Forge LLM model is active');
  await kvs.set('llm:model', { model, at: Date.now() });
  return model;
}

/** Ask for JSON that matches `schema` by forcing a single tool call. */
export async function structured({ system, user, name, description, schema, maxTokens = 3000 }) {
  const model = await pickModel();
  const res = await chat({
    model,
    messages: [
      { role: 'system', content: [{ type: 'text', text: system }] },
      { role: 'user', content: [{ type: 'text', text: user }] },
    ],
    temperature: 0,
    max_completion_tokens: maxTokens,
    tools: [{ type: 'function', function: { name, description, parameters: schema } }],
    tool_choice: { type: 'function', function: { name } },
  });
  const call = res.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error('Model returned no structured answer');
  const args = call.function.arguments;
  return { data: typeof args === 'string' ? JSON.parse(args) : args, usage: res.usage, model };
}

/** Plain text answer. */
export async function answer({ system, user, maxTokens = 600 }) {
  const model = await pickModel();
  const res = await chat({
    model,
    messages: [
      { role: 'system', content: [{ type: 'text', text: system }] },
      { role: 'user', content: [{ type: 'text', text: user }] },
    ],
    temperature: 0.2,
    max_completion_tokens: maxTokens,
  });
  const parts = res.choices?.[0]?.message?.content || [];
  return parts.map((p) => p.text || '').join('').trim();
}
