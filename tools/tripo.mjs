// Generate a model with the Tripo API and download it.
//
//   node tools/tripo.mjs <out.glb> "<prompt>" [faces] [model_version]
//   TRIPO_TASK=<task id> node tools/tripo.mjs <out.glb> "<prompt>"   # resume one that was already submitted
//
// The key is read from ~/.config/tripo/api-key (never printed). Each run appends prompt, task id, credits spent
// and the output path to tools/tripo-log.jsonl, so the asset list can be regenerated or audited later.
import fs from 'fs';
import os from 'os';
import path from 'path';

const [out, prompt, faces, version = 'v3.1-20260211'] = process.argv.slice(2);
if (!out || !prompt) { console.error('usage: node tools/tripo.mjs <out.glb> "<prompt>" [faces] [model_version]'); process.exit(1); }
const KEY = fs.readFileSync(path.join(os.homedir(), '.config/tripo/api-key'), 'utf8').trim();
const API = 'https://api.tripo3d.ai/v2/openapi';
const call = async (p, body) => {
  for (let tries = 0; ; tries++) {   // the API now and then answers with an HTML error page or drops the connection: retry those
    let j;
    try {
      const r = await fetch(API + p, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
      j = JSON.parse(await r.text());
    } catch (e) {
      if (tries >= 5) throw e;
      await new Promise(r => setTimeout(r, 5000)); continue;
    }
    if (j.code !== 0) throw new Error(`${p}: ${JSON.stringify(j)}`);
    return j.data;
  }
};

const before = (await call('/user/balance')).balance;
const body = { type: 'text_to_model', prompt, model_version: version, texture: true, pbr: true };
if (faces) body.face_limit = +faces;
let task_id = process.env.TRIPO_TASK;   // set it to pick up a task that was already submitted (and paid for)
for (let tries = 0; !task_id; tries++) {   // code 2000: too many tasks running at once (about 10) — wait for a slot
  try { ({ task_id } = await call('/task', body)); }
  catch (e) { if (!/"code":2000/.test(e.message) || tries > 40) throw e; await new Promise(r => setTimeout(r, 15000)); }
}
console.log('task', task_id);
let t;
for (;;) {
  t = await call('/task/' + task_id);
  if (['success', 'failed', 'banned', 'expired', 'cancelled', 'unknown'].includes(t.status)) break;
  process.stdout.write(`\r${t.status} ${t.progress ?? ''}%   `);
  await new Promise(r => setTimeout(r, 4000));
}
console.log('\n' + t.status);
const after = (await call('/user/balance')).balance;
const url = t.output && (t.output.pbr_model || t.output.model || t.output.base_model);
if (t.status === 'success' && url) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(await (await fetch(url)).arrayBuffer()));
}
const rec = { at: new Date().toISOString(), out, prompt, faces: faces ? +faces : null, version, task_id, status: t.status, credits: before - after, balance: after };
fs.appendFileSync(new URL('./tripo-log.jsonl', import.meta.url), JSON.stringify(rec) + '\n');
console.log(JSON.stringify(rec));
if (t.status !== 'success') process.exit(2);
