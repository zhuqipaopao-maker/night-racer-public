# Render a quick look at a generated asset and print its size.
#   Blender -b --python tools/preview.py -- in.glb out.png
import bpy, sys, math, mathutils
src, out = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
ms = [o for o in bpy.data.objects if o.type == 'MESH']
lo = mathutils.Vector((1e9,) * 3); hi = -lo
for o in ms:
    for c in o.bound_box:
        w = o.matrix_world @ mathutils.Vector(c); lo = mathutils.Vector(map(min, lo, w)); hi = mathutils.Vector(map(max, hi, w))
size = hi - lo; ctr = (hi + lo) / 2
print('ASSET tris', sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in ms), 'size', tuple(round(v, 3) for v in size),
      'images', [(i.name[-14:], i.size[0]) for i in bpy.data.images])
sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE'; sc.render.resolution_x, sc.render.resolution_y = 700, 700
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.45, 0.5, 0.58, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1.0
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun); sun.data.energy = 3.5
sun.rotation_euler = (math.radians(50), 0, math.radians(35))
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = max(size) * 1.35
d = mathutils.Vector((1.6, -2.2, 1.0)).normalized() * max(size) * 4
cam.location = ctr + d; cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
sc.render.filepath = out; bpy.ops.render.render(write_still=True)
