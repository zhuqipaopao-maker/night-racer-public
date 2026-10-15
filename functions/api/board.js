// Leaderboard API: GET ?map=city&uid=… → top 50 (+ your rank); POST {map, uid, name, t} → submit a lap.
// CORS is open so the downloadable single-file copy of the game (file://) can use it too.
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'content-type' };
export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const res = await env.BOARD.get(env.BOARD.idFromName('global')).fetch(request);
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
  out.headers.set('cache-control', 'no-store');
  return out;
}
