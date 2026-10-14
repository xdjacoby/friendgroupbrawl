"""Auto-rig a standing humanoid .glb with a Mixamo-named skeleton the game can animate.

For Claude sessions (it needs Blender's Python module, ~400 MB, so it is not a
project dependency):

    python3 -m venv /tmp/bpy && /tmp/bpy/bin/pip install bpy
    /tmp/bpy/bin/python tools/autorig.py in.glb public/models/<name>.glb

Works on a model standing up straight, facing forward (glTF +Z), in a T-pose
or A-pose with the arms away from the body and the legs apart: what Meshy's
image-to-3D gives you from a photo taken that way. Joints are placed from the
mesh's own shape (arm direction, leg spacing, foot direction) on top of
standard Mixamo proportions, then Blender's automatic (heat) weights skin it.
Textures are re-saved as JPEG so the file stays small. Check the result with
the pose screenshots described in CLAUDE.md.
"""

import sys

import bpy
import bmesh  # only importable once bpy is loaded
from mathutils import Vector

src, dst = sys.argv[-2], sys.argv[-1]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

# Throw away any old skeleton (and the bone display shapes the importer makes);
# keep the meshes where they stand.
shapes = {pb.custom_shape for o in bpy.context.scene.objects if o.type == 'ARMATURE' for pb in o.pose.bones}
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.data.vertices and o not in shapes]
for o in list(bpy.context.scene.objects):
    if o.type == 'ARMATURE' or (o.type == 'MESH' and o not in meshes):
        for child in o.children:
            mw = child.matrix_world.copy()
            child.parent = None
            child.matrix_world = mw
for o in list(bpy.context.scene.objects):
    if o not in meshes:
        bpy.data.objects.remove(o, do_unlink=True)
for o in meshes:
    for m in list(o.modifiers):
        if m.type == 'ARMATURE':
            o.modifiers.remove(m)
    o.vertex_groups.clear()
    o.shape_key_clear()
    # Scans arrive as thousands of separate pieces, split along the texture
    # seams. Welding them by position makes one connected surface, which the
    # automatic weights need (texture coordinates are kept per face corner).
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(o.data)
    bm.free()
    o.data.validate()

verts = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
min_z = min(v.z for v in verts)
H = max(v.z for v in verts) - min_z
xs = sorted(v.x for v in verts)
cx = xs[len(xs) // 2]


def at(frac):
    return min_z + frac * H


def band(lo, hi, side=0):
    """Vertices between two heights (fractions of H); side -1/+1 = one half."""
    z0, z1 = at(lo), at(hi)
    return [v for v in verts if z0 <= v.z <= z1 and (side == 0 or (v.x - cx) * side > 0.005 * H)]


def mean(vs):
    return sum(vs, Vector()) / len(vs) if vs else Vector((cx, 0, 0))


def torso_point(frac):
    vs = [v for v in band(frac - 0.02, frac + 0.02) if abs(v.x - cx) < 0.09 * H]
    return Vector((cx, mean(vs).y, at(frac)))


# Spine chain, Mixamo proportions (fractions of height).
hips = torso_point(0.553)
spine = torso_point(0.624)
spine1 = torso_point(0.694)
spine2 = torso_point(0.765)
neck = torso_point(0.858)
head = torso_point(0.873)
head_top = Vector((cx, head.y, at(1.0)))

joints = {}
for side, name in ((1, 'Left'), (-1, 'Right')):  # the character's left is +x when facing -y
    # Arm: shoulder joint by proportion, then follow the actual arm out to the fingertips.
    shoulder = Vector((cx + side * 0.109 * H, spine2.y, at(0.806)))
    arm = [v for v in verts if (v.x - cx) * side > 0.17 * H and v.z > at(0.5)]
    tip = max(arm, key=lambda v: (v - shoulder).length) if arm else shoulder + Vector((side * 0.37 * H, 0, -0.03 * H))
    reach = tip - shoulder

    def along(frac):
        # The middle of the arm's cross-section that far along it (not its outline).
        near = [v for v in arm if abs((v - shoulder).dot(reach.normalized()) - reach.length * frac) < 0.02 * H]
        return mean(near) if near else shoulder + reach * frac

    elbow = along(0.35)
    wrist = along(0.73)
    clavicle = Vector((cx + side * 0.025 * H, spine2.y, at(0.821)))

    # Leg: centers of this side's half at hip, knee and ankle height.
    hip = mean([v for v in band(0.47, 0.51, side) if abs(v.x - cx) < 0.15 * H])
    hip = Vector((hip.x, hips.y, at(0.491)))
    knee = mean([v for v in band(0.26, 0.30, side) if abs(v.x - cx) < 0.2 * H])
    knee.z = at(0.279)
    ankle = mean([v for v in band(0.06, 0.09, side) if abs(v.x - cx) < 0.2 * H])
    ankle.z = at(0.074)
    foot = [v for v in band(0.0, 0.05, side) if abs(v.x - cx) < 0.25 * H]
    toe_end = min(foot, key=lambda v: v.y) if foot else ankle + Vector((0, -0.08 * H, -0.06 * H))
    toe_end = Vector((toe_end.x, toe_end.y, at(0.012)))
    toe = ankle + (toe_end - ankle) * 0.65
    toe.z = at(0.015)
    joints[name] = dict(clavicle=clavicle, shoulder=shoulder, elbow=elbow, wrist=wrist, tip=tip,
                        hip=hip, knee=knee, ankle=ankle, toe=toe, toe_end=toe_end)

# Build the armature.
arm_data = bpy.data.armatures.new('Armature')
rig = bpy.data.objects.new('Armature', arm_data)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')


def bone(name, head_pos, tail_pos, parent=None):
    b = arm_data.edit_bones.new('mixamorig:' + name)
    b.head, b.tail = head_pos, tail_pos
    if (b.tail - b.head).length < 1e-4:
        b.tail = b.head + Vector((0, 0, 0.02 * H))
    if parent:
        b.parent = arm_data.edit_bones['mixamorig:' + parent]
        b.use_connect = False
    return b


bone('Hips', hips, spine)
bone('Spine', spine, spine1, 'Hips')
bone('Spine1', spine1, spine2, 'Spine')
bone('Spine2', spine2, neck, 'Spine1')
bone('Neck', neck, head, 'Spine2')
bone('Head', head, head_top, 'Neck')
bone('HeadTop_End', head_top, head_top + Vector((0, 0, 0.03 * H)), 'Head')
for name, j in joints.items():
    bone(f'{name}Shoulder', j['clavicle'], j['shoulder'], 'Spine2')
    bone(f'{name}Arm', j['shoulder'], j['elbow'], f'{name}Shoulder')
    bone(f'{name}ForeArm', j['elbow'], j['wrist'], f'{name}Arm')
    bone(f'{name}Hand', j['wrist'], j['tip'], f'{name}ForeArm')
    bone(f'{name}UpLeg', j['hip'], j['knee'], 'Hips')
    bone(f'{name}Leg', j['knee'], j['ankle'], f'{name}UpLeg')
    bone(f'{name}Foot', j['ankle'], j['toe'], f'{name}Leg')
    bone(f'{name}ToeBase', j['toe'], j['toe_end'], f'{name}Foot')
bpy.ops.object.mode_set(mode='OBJECT')

# Skin it with automatic (heat) weights.
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')

# Heat weighting can miss bits of a messy scan; give those to the nearest bone.
segments = [(b.name, rig.matrix_world @ b.head_local, rig.matrix_world @ b.tail_local) for b in arm_data.bones]


def nearest_bone(p):
    best, best_d = None, 1e9
    for name, a, b in segments:
        ab = b - a
        t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
        d = (a + ab * t - p).length
        if d < best_d:
            best, best_d = name, d
    return best


fixed = 0
for o in meshes:
    groups = {g.name: g for g in o.vertex_groups}
    for v in o.data.vertices:
        if not any(g.weight > 0.001 for g in v.groups):
            name = nearest_bone(o.matrix_world @ v.co)
            g = groups.get(name) or o.vertex_groups.new(name=name)
            groups[name] = g
            g.add([v.index], 1.0, 'REPLACE')
            fixed += 1
print(f'autorig: height {H:.2f}, {len(verts)} vertices, {fixed} unweighted vertices fixed by hand')

bpy.ops.export_scene.gltf(
    filepath=dst, export_format='GLB', export_animations=False, export_skins=True,
    export_image_format='JPEG', export_jpeg_quality=90,
)
