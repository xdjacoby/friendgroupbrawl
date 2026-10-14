"""Slim down an already rigged .glb (e.g. a Meshy export) so it draws faster
and downloads quicker, keeping its skeleton, skin weights and animation clips.

For Claude sessions (needs Blender's Python module, see autorig.py):

    /tmp/bpy/bin/python tools/slim.py in.glb public/models/<name>.glb [--faces 40000] [--texture 2048]

Decimates the mesh to about --faces triangles (the skin weights are blended
along with it) and caps the textures at --texture pixels (normal/roughness
maps at half that), saved as JPEG. Meshy's ~100k triangle, 4K-texture
exports come out around 5 MB and look the same at gameplay distance.
"""

import argparse
import sys

import bpy
import bmesh  # only importable once bpy is loaded

parser = argparse.ArgumentParser()
parser.add_argument('src')
parser.add_argument('dst')
parser.add_argument('--faces', type=int, default=40000, help='decimate to about this many triangles (0 = keep all)')
parser.add_argument('--texture', type=int, default=2048, help='largest color texture size (other maps get half)')
args = parser.parse_args(sys.argv[1:])

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=args.src)

# The importer's bone display shapes are meshes too; leave those alone.
shapes = {pb.custom_shape for o in bpy.context.scene.objects if o.type == 'ARMATURE' for pb in o.pose.bones}
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.data.vertices and o not in shapes]
total = sum(len(p.vertices) - 2 for o in meshes for p in o.data.polygons)
if args.faces and total > args.faces:
    for o in meshes:
        o.shape_key_clear()
        # Scans arrive split into thousands of pieces along the texture seams;
        # weld them (same spot, same weights) so decimation can work across them.
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bm.to_mesh(o.data)
        bm.free()
        dec = o.modifiers.new('decimate', 'DECIMATE')
        dec.ratio = args.faces / total
        # Decimate the mesh at rest, before the armature deforms it.
        bpy.context.view_layer.objects.active = o
        while o.modifiers[0] != dec:
            bpy.ops.object.modifier_move_up(modifier=dec.name)
        bpy.ops.object.modifier_apply(modifier=dec.name)
after = sum(len(p.vertices) - 2 for o in meshes for p in o.data.polygons)
print(f'slim: {total} -> {after} triangles')

for mat in bpy.data.materials:
    if not mat.node_tree:
        continue
    for node in mat.node_tree.nodes:
        if node.type != 'TEX_IMAGE' or not node.image:
            continue
        color = any(l.to_socket.name == 'Base Color' for out in node.outputs for l in out.links)
        limit = args.texture if color else args.texture // 2
        w, h = node.image.size
        if max(w, h) > limit:
            k = limit / max(w, h)
            node.image.scale(max(1, round(w * k)), max(1, round(h * k)))

bpy.ops.export_scene.gltf(
    filepath=args.dst, export_format='GLB', export_animations=True, export_skins=True,
    export_image_format='JPEG', export_jpeg_quality=90,
)
