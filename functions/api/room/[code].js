// WebSocket entry for a multiplayer room: /api/room/K7QX → the Durable Object named after the code.
export async function onRequest({ request, env, params }) {
  const code = String(params.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  if (code.length < 4) return new Response('bad room code', { status: 400 });
  if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
  return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
}
