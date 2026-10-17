# Bake a ground prop (moss mound, leaf litter, a patch of plants) into a top-down colour image with alpha, for cheap
# decals: thousands of them would cost millions of triangles as meshes.
#   Blender -b --python tools/bake-topdown.py -- model.glb out.png [size] [side]
# With `side`, the model is shot from the front instead (for crossed-card impostors of trees and grass clumps);
# the image is twice as tall as wide when the model is taller than wide.
import bpy, sys, math, mathutils
a = sys.argv[sys.argv.index('--') + 1:]
src, out, size = a[0], a[1], int(a[2]) if len(a) > 2 else 512
SIDE = 'side' in a[3:]
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=src)
ms = [o for o in bpy.data.objects if o.type == 'MESH']
lo = mathutils.Vector((1e9,) * 3); hi = -lo
for o in ms:
    for c in o.bound_box: w = o.matrix_world @ mathutils.Vector(c); lo = mathutils.Vector(map(min, lo, w)); hi = mathutils.Vector(map(max, hi, w))
# unlit: show the base colour as it is, lit only by a soft sky so the relief still reads
for m in bpy.data.materials:
    if not m.use_nodes: continue
    nt = m.node_tree; b = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if b is None: continue
    for k in ('Metallic', 'Specular IOR Level'):
        if k in b.inputs: [nt.links.remove(l) for l in list(b.inputs[k].links)]; b.inputs[k].default_value = 0
sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE'; sc.render.resolution_x = sc.render.resolution_y = size
sc.render.film_transparent = True; sc.view_settings.view_transform = 'Standard'
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (1, 1, 1, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.9
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun); sun.data.energy = 1.2; sun.rotation_euler = (math.radians(25), 0, math.radians(40))
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'
if SIDE:   # from the front (-Y), framing the full height; base at the bottom edge
    w, h = hi.x - lo.x, hi.z - lo.z; tall = h > w * 1.4
    sc.render.resolution_x, sc.render.resolution_y = (size, size * 2) if tall else (size, size)
    cam.data.ortho_scale = max(w, h) * 1.02 if not tall else max(w * 2, h) * 1.02
    cam.location = ((lo.x + hi.x) / 2, lo.y - 10, (lo.z + hi.z) / 2); cam.rotation_euler = (math.pi / 2, 0, 0)
    print('ASPECT', 'tall' if tall else 'square', 'w', round(w, 3), 'h', round(h, 3))
else:
    cam.data.ortho_scale = max(hi.x - lo.x, hi.y - lo.y) * 1.02
    cam.location = ((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, hi.z + 5); cam.rotation_euler = (0, 0, 0)
sc.render.filepath = out; bpy.ops.render.render(write_still=True)
print('BAKED', out, 'footprint', round(hi.x - lo.x, 3), round(hi.y - lo.y, 3))
