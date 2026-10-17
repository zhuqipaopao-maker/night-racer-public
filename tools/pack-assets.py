# Pack a map's Tripo props into one GLB (one download for the whole map), from a spec in tools/assets/<map>.json.
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b --python tools/pack-assets.py -- tools/assets/ice.json /tmp/ice_raw.glb
#   (Tripo Studio full-quality exports, ~1.4M triangles each: simplify first, which keeps UV seams intact where
#    Blender's decimate tears the texture:  npx @gltf-transform/cli@4 simplify raw.glb s.glb --ratio 0 --error 0.012)
#   npx @gltf-transform/cli@4 optimize /tmp/ice_raw.glb public/models/ice.glb --compress meshopt --texture-compress webp \
#       --texture-size 1024 --simplify false --join false --instance false --flatten false
#
# Each asset becomes one node named after it, standing on its own origin (bottom centre), about 1 unit tall/long
# as Tripo delivers it; the map's scene module scales and places the copies. Spec fields:
#   assets: name -> texture size, or [texture size, source file stem, max triangles] (Tripo Studio's full-quality
#           exports are ~1.4M triangles: give a budget and the mesh is decimated to it)
#   low: name -> triangles, adds a decimated copy "<name>_lo" sharing the material (for far rows)
#   cut_below: name -> fraction of the height; faces below it are dropped (e.g. a pylon that must not move with a train)
# The generation prompts are in tools/tripo-log.jsonl.
import bpy, sys, os, json, bmesh, mathutils

spec_path, out = sys.argv[sys.argv.index('--') + 1:][:2]
spec = json.load(open(spec_path))
src = spec['src']
ASSETS = {k: (v + [k, 0][len(v) - 1:] if isinstance(v, list) else [v, k, 0]) for k, v in spec['assets'].items()}
LOW = spec.get('low', {})
CUT = spec.get('cut_below', {})
bpy.ops.wm.read_factory_settings(use_empty=True)
for name, (tex, stem, budget) in ASSETS.items():
    before = set(bpy.data.objects)
    imgs_before = set(bpy.data.images)
    bpy.ops.import_scene.gltf(filepath=os.path.join(src, stem + '.glb'))
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in new: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(meshes) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    for o in [o for o in new if o != ob and o.name in bpy.data.objects]: bpy.data.objects.remove(o)
    n = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    if budget and n > budget:
        m = ob.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = budget / n
        bpy.context.view_layer.objects.active = ob; bpy.ops.object.modifier_apply(modifier='dec')
    if name in CUT:   # drop everything below a fraction of the height
        zs = [v.co.z for v in ob.data.vertices]; cut = min(zs) + (max(zs) - min(zs)) * CUT[name]
        bm = bmesh.new(); bm.from_mesh(ob.data)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().z < cut], context='FACES')
        bm.to_mesh(ob.data); bm.free()
    # origin at the bottom centre
    vs = [v.co for v in ob.data.vertices]
    lo = mathutils.Vector([min(v[i] for v in vs) for i in range(3)]); hi = mathutils.Vector([max(v[i] for v in vs) for i in range(3)])
    base = mathutils.Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    ob.data.transform(mathutils.Matrix.Translation(-base)); ob.location = (0, 0, 0)
    ob.name = ob.data.name = name
    for m in ob.data.materials: m.name = name
    for img in set(bpy.data.images) - imgs_before:
        img.name = f'{name}_{img.name[:12]}'
        if img.size[0] > tex: img.scale(tex, tex)
    print('PACK', name, sum(len(p.vertices) - 2 for p in ob.data.polygons), 'tris', tuple(round(v, 2) for v in (hi - lo)))
    if name in LOW:
        lo_ob = ob.copy(); lo_ob.data = ob.data.copy(); lo_ob.name = lo_ob.data.name = name + '_lo'; bpy.context.scene.collection.objects.link(lo_ob)
        m = lo_ob.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = LOW[name] / sum(len(p.vertices) - 2 for p in ob.data.polygons)
        bpy.context.view_layer.objects.active = lo_ob; bpy.ops.object.modifier_apply(modifier='dec')
        print('PACK', lo_ob.name, sum(len(p.vertices) - 2 for p in lo_ob.data.polygons), 'tris')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True)
