// Simplify the meshes of a packed asset GLB to per-mesh triangle budgets with meshoptimizer, which keeps UV seams
// (Blender's decimate tears the textures of Tripo exports). Run on the raw pack, before `gltf-transform optimize`.
//   node tools/simplify-assets.mjs in.glb out.glb saguaro=1200 dead_tree=1200 '*=0.012'
// name=N: at most N triangles for that mesh; '*=E': every other mesh simplified within error E (relative to its size).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { simplifyPrimitive, weld, compactPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const [src, out, ...rules] = process.argv.slice(2);
const budget = Object.fromEntries(rules.map(r => r.split('=')).map(([k, v]) => [k, +v]));
const fallbackError = budget['*'] ?? 0.012;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
await doc.transform(weld());
const tris = p => (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const name = node.getName(), target = budget[name];
  for (const prim of mesh.listPrimitives()) {
    const before = tris(prim);
    if (target) {
      // the ratio alone can stop early on locked borders: let the error grow until the budget is met
      for (const error of [0.01, 0.02, 0.04, 0.08, 0.15, 0.3]) { simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: Math.min(1, target / tris(prim)), error }); if (tris(prim) <= target * 1.15) break; }
      // flat, seam-heavy meshes (ground patches, plant clumps) won't go further while keeping UV seams: fall back to
      // meshopt's sloppy simplifier, which ignores topology; fine for small props seen at speed
      if (tris(prim) > target * 1.5) {
        const pos = prim.getAttribute('POSITION').getArray(), idx = new Uint32Array(prim.getIndices().getArray());
        const [out] = MeshoptSimplifier.simplifySloppy(idx, pos instanceof Float32Array ? pos : new Float32Array(pos), 3, null, target * 3, 1);
        prim.getIndices().setArray(prim.getAttribute('POSITION').getCount() > 65535 ? out : new Uint16Array(out));
        compactPrimitive(prim);
      }
    } else simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: 0, error: fallbackError });
    console.log(name.padEnd(14), before, '→', tris(prim));
  }
}
await io.write(out, doc);
