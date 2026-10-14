"""Turn the Sketchfab "Lamborghini Aventador SVJ SDC (FREE)" model into Byron's
game-ready Lambo (public/models/lambo.glb).

For Claude sessions (needs Blender's Python module, see autorig.py):

    /tmp/bpy/bin/python tools/prep_lambo.py lamborghini_aventador_svj.glb public/models/lambo.glb

The original is ~500k triangles in 62 pieces with 30 materials (more than all
four fighters put together), and a closed coupe that Byron's head would poke
through. This script:
  - cuts the roof, door windows and upper windshield off (a roadster, so you
    can see him driving), and drops the parts you never see (undercarriage,
    brakes, interior bits)
  - decimates to ~30k triangles and boils the materials down to a few
  - keeps the front wheels and the rear axle as separate objects named
    wheel_fl / wheel_fr / wheel_rear, centered on their axles, so the game
    can spin them
  - points the nose down +X (the way fighters face), scales it to ~3.6 m long
    and puts the driver's seat at the origin, wheels on the ground (y = 0)
The coordinates below are specific to that model.
"""

import sys

import bpy
from mathutils import Matrix, Vector

src, dst = sys.argv[-2], sys.argv[-1]
LENGTH = 3.6  # m, nose to tail in game
SEAT_Y = 0.05  # the driver's hips, along the model's length (model units, nose at -Y)
TARGET_TRIS = 30000

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']


def group_of(o):
    p = o.parent.name if o.parent else ''
    if p.startswith('WheelFrLeft.001'):
        return 'wheel_fr'
    if p.startswith('WheelFrLeft'):
        return 'wheel_fl'
    if p.startswith('WheelRear'):
        return 'wheel_rear'
    return 'body'


# Parts nobody sees from the side: undercarriage, brakes, a tiny logo, interior buttons.
DROP = {'Undercarriage', 'MetalGoldenLogo', 'intTexButtonsGlossy', 'Material.004', 'MetalRedEngine'}
for o in list(meshes):
    if o.data.materials and o.data.materials[0].name in DROP:
        meshes.remove(o)
        bpy.data.objects.remove(o, do_unlink=True)

# Bake every transform into the vertices and detach from the empties
# (remembering which wheel each piece belonged to).
GROUP = {o.name: group_of(o) for o in meshes}
for o in meshes:
    mw = o.matrix_world.copy()
    o.parent = None
    o.data.transform(mw)
    o.matrix_world = Matrix()
for o in list(bpy.context.scene.objects):
    if o.type != 'MESH':
        bpy.data.objects.remove(o, do_unlink=True)

# Make it a roadster: drop every face of the greenhouse above the beltline
# (roof, door glass, top of the windshield and the rear window).
import bmesh  # noqa: E402  (only importable once bpy is loaded)

for o in meshes:
    if GROUP[o.name] != 'body':
        continue
    bm = bmesh.new()
    bm.from_mesh(o.data)
    doomed = [f for f in bm.faces if (c := f.calc_center_median()).z > 0.86 and -0.75 < c.y < 0.62]
    bmesh.ops.delete(bm, geom=doomed, context='FACES')
    bm.to_mesh(o.data)
    bm.free()

# Fewer materials: everything maps onto a handful of looks (each one is a
# separate draw call in the game). Metal is toned down because the game has
# no reflections for it to show.
LOOKS = {
    'paint': (['CARROSSERIE'], dict(metal=0.3, rough=0.32)),
    'carbon': (['CARBONE'], dict(metal=0.2, rough=0.4)),
    'black': (['MetalDark', 'intPlasticDkPlain', 'Material.006', 'WheelTireBump', 'WheelMetalBlack', 'Material.005',
               'MetalExhaustTextured', 'ExteriorDetailTex', 'GLS_MR', 'intAlcantara'], dict(color=(0.03, 0.03, 0.035), metal=0.1, rough=0.6)),
    'chrome': (['Chrome', 'Aluminum', 'material_0'], dict(color=(0.55, 0.56, 0.6), metal=0.4, rough=0.3)),
    'glass': (['GLASS', 'GlassLights'], dict(color=(0.02, 0.025, 0.04), metal=0.0, rough=0.05)),
    'redlight': (['GlassRedLights', 'Material.003'], dict(color=(0.9, 0.02, 0.04), metal=0.0, rough=0.3, glow=(0.6, 0.0, 0.02))),
    'whitelight': (['GlassWhite', 'HdLightsLens', 'LightEmissiveWhite', 'Material.002'], dict(color=(0.95, 0.95, 0.9), metal=0.0, rough=0.4, glow=(0.5, 0.5, 0.45))),
    'orange': (['GlassOrangeLights'], dict(metal=0.0, rough=0.3)),
    'green': (['Material.001'], dict(metal=0.0, rough=0.4)),
}
look_of = {name: look for look, (names, _) in LOOKS.items() for name in names}
for look, (names, opts) in LOOKS.items():
    m = bpy.data.materials.get(names[0])
    if not m:
        continue
    m.name = f'lambo_{look}'
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    if 'color' in opts:
        for link in list(bsdf.inputs['Base Color'].links):
            m.node_tree.links.remove(link)
        bsdf.inputs['Base Color'].default_value = (*opts['color'], 1)
    bsdf.inputs['Metallic'].default_value = opts['metal']
    bsdf.inputs['Roughness'].default_value = opts['rough']
    bsdf.inputs['Alpha'].default_value = 1.0
    if 'glow' in opts:
        bsdf.inputs['Emission Color'].default_value = (*opts['glow'], 1)
        bsdf.inputs['Emission Strength'].default_value = 1.0
    m.surface_render_method = 'DITHERED'  # opaque in glTF
for o in meshes:
    for slot in o.material_slots:
        look = look_of.get(slot.material.name if slot.material else '')
        if look:
            slot.material = bpy.data.materials[f'lambo_{look}']

# Decimate; tiny parts (lights, stripes) are left alone.
total = sum(len(p.vertices) - 2 for o in meshes for p in o.data.polygons)
ratio = TARGET_TRIS / total
for o in meshes:
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    if tris < 800:
        continue
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(o.data)
    bm.free()
    dec = o.modifiers.new('decimate', 'DECIMATE')
    dec.ratio = max(ratio, 400 / tris)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=dec.name)

# One object per group: the body, and each wheel on its own axle.
groups = {}
for o in meshes:
    groups.setdefault(GROUP[o.name], []).append(o)
for name, objs in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = obj.data.name = name
    groups[name] = obj

# Nose to +X (glTF +X = Blender +X; the model's nose points down -Y), seat at
# the origin, scaled to game size.
bbox_len = 4.854
k = LENGTH / bbox_len
xf = Matrix.Scale(k, 4) @ Matrix.Translation((SEAT_Y, 0, 0)) @ Matrix.Rotation(1.5707963, 4, 'Z')
for obj in groups.values():
    obj.data.transform(xf)
# Wheels pivot on their axles.
for name, obj in groups.items():
    if name == 'body':
        continue
    vs = [v.co for v in obj.data.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    c = (lo + hi) / 2
    obj.data.transform(Matrix.Translation(-c))
    obj.location = c
    print(f'prep_lambo: {name} axle at x={c.x:.2f} height={c.z:.2f} radius={(hi.z - lo.z) / 2:.2f}')
tris = sum(len(p.vertices) - 2 for o in groups.values() for p in o.data.polygons)
print(f'prep_lambo: {total} -> {tris} triangles, {len(bpy.data.materials)} materials')

bpy.ops.export_scene.gltf(
    filepath=dst, export_format='GLB', export_animations=False,
    export_image_format='JPEG', export_jpeg_quality=85,
)
