# Turn a Tripo car export into a game car: public/models/<id>.glb. Generalises tools/gt-model.py: the wheels are found
# by measuring the mesh instead of being typed in.
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b --python tools/car-model.py -- in.glb /tmp/<id>_raw.glb <nose>
#   npx @gltf-transform/cli@4 optimize /tmp/<id>_raw.glb public/models/<id>.glb --compress meshopt --texture-compress webp \
#       --texture-size 2048 --simplify false --join false --instance false --flatten false
#
# <nose> is +x or -x: which way the car's nose points in the export (render it once to see). Add `measure` after it to
# only print the measurements. Steps:
#  - wheels: the lowest vertices are the four contact patches (their middle is each wheel's x, their width the tyre);
#    the tyre radius is the circle around (x, r) that the most tread vertices lie on
#  - each tyre + rim is cut off on its own (faces inside the tread circle, outboard of the tyre's inner face) so it can
#    spin and steer; the wheel-arch liner stays on the body
#  - everything is decimated, turned nose to glTF +Z and scaled so the tyres match the game's WHEEL_R
#  - the full-detail body is baked into a normal map for the decimated one (decimating dents the big panels)
import bpy, bmesh, sys, math, mathutils, statistics as st

args = sys.argv[sys.argv.index('--') + 1:]
src, out, nose = args[0], args[1], args[2]
MEASURE_ONLY = 'measure' in args[3:]
BODY_TRIS, WHEEL_TRIS, WHEEL_R = 45000, 5000, 0.36

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
if len(meshes) > 1: bpy.ops.object.join()
body = bpy.context.view_layer.objects.active; body.name = 'body'
V = [v.co.copy() for v in body.data.vertices]

# ---- measure the wheels ----
# split the car into quadrants around its bounding-box centre; in each, the lowest vertices are that tyre's contact patch
xs = [v.x for v in V]; ys_ = [v.y for v in V]
xmid, L, Wd = (min(xs) + max(xs)) / 2, max(xs) - min(xs), max(ys_) - min(ys_)
wheels = {}
for sx in (-1, 1):
    for sy in (-1, 1):
        q = [v for v in V if (v.x - xmid) * sx > 0.08 * L and v.y * sy > 0.2 * Wd / 2]
        zq = min(v.z for v in q)
        g = [v for v in q if v.z < zq + 0.004]
        ys = sorted(abs(v.y) for v in g)
        wheels[(sx, sy)] = dict(x=st.median(v.x for v in g), yin=ys[int(len(ys) * 0.02)], yout=ys[int(len(ys) * 0.98)], z=zq, n=len(g))
# tyre radius, per wheel (a hypercar's rear tyres are bigger): the circle around (x, ground + r) through the most tread vertices
for (sx, sy), w in wheels.items():
    band = [v for v in V if w['yin'] <= abs(v.y) <= w['yout'] and v.y * sy > 0 and abs(v.x - w['x']) < 0.2]
    best = (0, 0)
    for k in range(400):
        r = 0.03 + k * 0.0004
        n = sum(1 for v in band if abs(math.hypot(v.x - w['x'], v.z - w['z'] - r) - r) < 0.0015)
        if n > best[0]: best = (n, r)
    w['r'] = best[1]
z0 = st.median(w['z'] for w in wheels.values())   # the ground the tyres stand on
WR = st.mean(w['r'] for w in wheels.values())
for k, w in wheels.items(): print('WHEEL', k, {a: round(b, 4) if isinstance(b, float) else b for a, b in w.items()})
print('MEAN RADIUS', round(WR, 4), 'ground', round(z0, 4))
if MEASURE_ONLY: sys.exit(0)

S = WHEEL_R / WR                       # the average tyre matches the game's wheel radius
yaw = math.pi / 2 if nose == '-x' else -math.pi / 2   # nose to Blender -Y, which the glTF export turns into +Z

def select_wheel(w, sy):
    bm = bmesh.new(); bm.from_mesh(body.data)
    ids = [f.index for f in bm.faces if sy * f.calc_center_median().y >= w['yin'] + 0.001 and math.hypot(f.calc_center_median().x - w['x'], f.calc_center_median().z - w['z'] - w['r']) < w['r'] * 0.982]   # just inside the tread: the arch liner stays on the body
    bm.free()
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_mode(type='FACE'); bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    for i in ids: body.data.polygons[i].select = True
    return len(ids)

parts = {}
for (sx, sy), w in wheels.items():
    bpy.ops.object.select_all(action='DESELECT'); body.select_set(True); bpy.context.view_layer.objects.active = body
    n = select_wheel(w, sy)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.separate(type='SELECTED'); bpy.ops.object.mode_set(mode='OBJECT')
    o = next(o for o in bpy.context.selected_objects if o != body); parts[(sx, sy)] = o
    print('CUT', (sx, sy), n, 'faces')

hi = body.copy(); hi.data = body.data.copy(); hi.name = 'body_hi'; bpy.context.scene.collection.objects.link(hi)
body.data.materials[0] = body.data.materials[0].copy()
for o in [body, *parts.values()]:
    n = sum(len(p.vertices) - 2 for p in o.data.polygons)
    m = o.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = min(1, (BODY_TRIS if o == body else WHEEL_TRIS) / n)
    bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='dec')

M = mathutils.Matrix.Scale(S, 4) @ mathutils.Matrix.Rotation(yaw, 4, 'Z') @ mathutils.Matrix.Translation((-xmid, 0, -z0))
bpy.ops.object.select_all(action='SELECT')
for o in bpy.context.selected_objects: o.matrix_world = M @ o.matrix_world
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# pivot each wheel on its axle, and name it by where it ends up: F/R from glTF z (Blender -y), L/R from glTF x
for (sx, sy), o in parts.items():
    w = wheels[(sx, sy)]
    c = M @ mathutils.Vector((w['x'], sy * (w['yin'] + w['yout']) / 2, w['z'] + w['r']))
    bpy.context.scene.cursor.location = c
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    o.name = 'wheel_' + ('F' if c.y < 0 else 'R') + ('L' if c.x > 0 else 'R')
    print('PIVOT', o.name, tuple(round(v, 3) for v in c))

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
lo = [min((body.matrix_world @ mathutils.Vector(c))[i] for c in body.bound_box) for i in range(3)]
hi_ = [max((body.matrix_world @ mathutils.Vector(c))[i] for c in body.bound_box) for i in range(3)]
print('BODY', [round(v, 3) for v in lo], [round(v, 3) for v in hi_])
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True, export_tangents=True)
