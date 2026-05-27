/**
 * tet-qb-worker — Cloudflare Worker proxy for R2 explanation storage.
 *
 * R2 object key: explanations/<Subject>/<question_folder>.json
 *
 * Routes (all under /explanations/:subject/:folder):
 *   GET    /explanations/:subject/:folder              — fetch all explanations
 *   POST   /explanations/:subject/:folder              — save new explanation
 *   PATCH  /explanations/:subject/:folder/:expId       — like/dislike
 *   DELETE /explanations/:subject/:folder/:expId       — remove one explanation
 *
 * Auth: Bearer token (env.AUTH_TOKEN) required for all writes.
 *       Set via: wrangler secret put AUTH_TOKEN
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url   = new URL(request.url);
    const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/');

    if (parts[0] !== 'explanations') {
      return json({ error: 'Not found' }, 404);
    }

    const subject = parts[1];
    const folder  = parts[2];
    const expId   = parts[3];

    if (!subject || !folder) {
      return json({ error: 'Missing subject or folder in path' }, 400);
    }

    // Auth on all write operations
    if (request.method !== 'GET') {
      const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      if (!env.AUTH_TOKEN || token !== env.AUTH_TOKEN) {
        return json({ error: 'Unauthorized' }, 401);
      }
    }

    const key = `explanations/${subject}/${folder}.json`;

    // ── GET ────────────────────────────────────────────────────────────────
    if (request.method === 'GET') {
      const obj = await env.EXPLANATIONS.get(key);
      if (!obj) {
        return json(emptyDoc(folder, subject));
      }
      return json(await obj.json());
    }

    // ── POST — save new explanation ────────────────────────────────────────
    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const { html, model = 'gemini-2.5-flash' } = body;
      if (!html) return json({ error: '"html" field required' }, 400);

      const data = await read(env, key, folder, subject);
      const exp  = {
        id:          crypto.randomUUID(),
        html,
        model,
        generatedAt: new Date().toISOString(),
        likes:       0,
        dislikes:    0,
      };
      data.explanations.push(exp);
      await env.EXPLANATIONS.put(key, JSON.stringify(data));
      return json(exp, 201);
    }

    // ── PATCH — update like/dislike counts ────────────────────────────────
    if (request.method === 'PATCH') {
      if (!expId) return json({ error: 'expId required in path' }, 400);
      const body   = await request.json().catch(() => ({}));
      const action = body.action; // 'like' | 'unlike' | 'dislike' | 'undislike'
      const valid  = ['like', 'unlike', 'dislike', 'undislike'];
      if (!valid.includes(action)) {
        return json({ error: `action must be one of: ${valid.join(', ')}` }, 400);
      }

      const data = await read(env, key, folder, subject);
      const exp  = data.explanations.find(e => e.id === expId);
      if (!exp) return json({ error: 'Explanation not found' }, 404);

      if (action === 'like')       exp.likes    = Math.max(0, (exp.likes    || 0) + 1);
      if (action === 'unlike')     exp.likes    = Math.max(0, (exp.likes    || 0) - 1);
      if (action === 'dislike')    exp.dislikes = Math.max(0, (exp.dislikes || 0) + 1);
      if (action === 'undislike')  exp.dislikes = Math.max(0, (exp.dislikes || 0) - 1);

      await env.EXPLANATIONS.put(key, JSON.stringify(data));
      return json(exp);
    }

    // ── DELETE — remove one explanation ───────────────────────────────────
    if (request.method === 'DELETE') {
      if (!expId) return json({ error: 'expId required in path' }, 400);
      const data = await read(env, key, folder, subject);
      const before = data.explanations.length;
      data.explanations = data.explanations.filter(e => e.id !== expId);
      if (data.explanations.length === before) {
        return json({ error: 'Explanation not found' }, 404);
      }
      await env.EXPLANATIONS.put(key, JSON.stringify(data));
      return json({ deleted: expId });
    }

    return json({ error: 'Method not allowed' }, 405);
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function read(env, key, folder, subject) {
  const obj = await env.EXPLANATIONS.get(key);
  if (!obj) return emptyDoc(folder, subject);
  return obj.json();
}

function emptyDoc(folder, subject) {
  return { schemaVersion: '1.0', questionId: folder, subject, explanations: [] };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
