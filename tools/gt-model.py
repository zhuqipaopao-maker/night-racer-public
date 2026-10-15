# Turn a Tripo car export into public/models/gt.glb.
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b --python tools/gt-model.py -- "<tripo export>.glb" /tmp/gt_raw.glb
#   npx @gltf-transform/cli@4 optimize /tmp/gt_raw.glb public/models/gt.glb --compress meshopt --texture-compress webp \
#       --texture-size 2048 --simplify false --join false --instance false --flatten false
#
# The Tripo mesh is one shell with the wheels fused on. This cuts each tyre + rim off on its own (so it can spin and steer),
# decimates everything, turns the nose to +Z and scales it so the tyres match the game's WHEEL_R.
# Decimating leaves the big panels (doors, bonnet) faintly dented, so the full-detail body is baked into a new normal map
# for the decimated one: same triangle count, original smooth reflections. Check with a chrome + striped-sky render.
# The WHEELS numbers are for the white GT export of 2026-10-14 (nose toward -X, ground at z = 0); a new model needs them
# re-measured: the lowest vertices give each tyre's contact patch (x) and inner/outer face (y).
import bpy, bmesh, sys, math, mathutils

src, out = sys.argv[sys.argv.index('--') + 1:][:2]
WR = 0.0786                    # tyre radius in the export's units
CUT_R, CUT_Y = 0.0772, 0.151   # take faces within CUT_R of the axle and outboard of |y| = CUT_Y: just the tyre's outer half and the rim
TYRE_Y = 0.1755                # tyre centre line
WHEELS = {'FL': (-0.2855, -1), 'FR': (-0.2855, 1), 'RL': (0.2855, -1), 'RR': (0.2855, 1)}
BODY_TRIS, WHEEL_TRIS = 45000, 5000
S = 0.36 / WR                  # game WHEEL_R

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
body = [o for o in bpy.data.objects if o.type == 'MESH'][0]
body.name = 'body'

def select_wheel(wx, sy):
    bm = bmesh.new(); bm.from_mesh(body.data)
    ids = [f.index for f in bm.faces
           if sy * f.calc_center_median().y >= CUT_Y and math.hypot(f.calc_center_median().x - wx, f.calc_center_median().z - WR) < CUT_R]
    bm.free()
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_mode(type='FACE'); bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    for i in ids: body.data.polygons[i].select = True

for k, (wx, sy) in WHEELS.items():
    bpy.ops.object.select_all(action='DESELECT'); body.select_set(True); bpy.context.view_layer.objects.active = body
    select_wheel(wx, sy)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.separate(type='SELECTED'); bpy.ops.object.mode_set(mode='OBJECT')
    next(o for o in bpy.context.selected_objects if o != body).name = 'wheel_' + k

# full-detail copy to bake from; the body gets its own material so its new normal map leaves the wheels' alone
hi = body.copy(); hi.data = body.data.copy(); hi.name = 'body_hi'; bpy.context.scene.collection.objects.link(hi)
body.data.materials[0] = body.data.materials[0].copy()

for o in [o for o in bpy.data.objects if o.type == 'MESH' and o != hi]:
    n = sum(len(p.vertices) - 2 for p in o.data.polygons)
    m = o.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'
    m.ratio = min(1, (BODY_TRIS if o.name == 'body' else WHEEL_TRIS) / n)
    bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='dec')

# nose from -X to -Y (which glTF's Y-up export turns into +Z), then game scale
bpy.ops.object.select_all(action='SELECT')
for o in bpy.context.selected_objects:
    o.matrix_world = mathutils.Matrix.Scale(S, 4) @ mathutils.Matrix.Rotation(math.pi / 2, 4, 'Z') @ o.matrix_world
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

for k, (wx, sy) in WHEELS.items():   # pivot each wheel on its axle
    w = bpy.data.objects['wheel_' + k]
    bpy.context.scene.cursor.location = mathutils.Vector((-sy * TYRE_Y, wx, WR)) * S
    bpy.ops.object.select_all(action='DESELECT'); w.select_set(True); bpy.context.view_layer.objects.active = w
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')

sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.samples = 1
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'; prefs.get_devices(); sc.cycles.device = 'GPU'
except Exception:
    pass
img = bpy.data.images.new('body_normal', 2048, 2048); img.colorspace_settings.name = 'Non-Color'
nt = body.data.materials[0].node_tree
tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; nt.nodes.active = tex
bpy.ops.object.select_all(action='DESELECT'); hi.select_set(True); body.select_set(True); bpy.context.view_layer.objects.active = body
bpy.ops.object.bake(type='NORMAL', use_selected_to_active=True, cage_extrusion=0.03, max_ray_distance=0.08, margin=8)
img.pack()
nmap = next(n for n in nt.nodes if n.type == 'NORMAL_MAP')
nt.links.new(tex.outputs['Color'], nmap.inputs['Color'])
bpy.data.objects.remove(hi)

bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True, export_tangents=True)
