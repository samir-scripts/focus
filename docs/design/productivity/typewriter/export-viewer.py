"""Rebuild the 3D.2 model and 1-bit key legend atlas from local sources."""
import argparse
import json
from pathlib import Path

import bpy
from mathutils import Vector
from PIL import Image, ImageFont
from render import ROOT, bounds, import_parts, replace_mesh, ring_faces

REPO = ROOT.parents[3]
DEST = REPO / 'apps/desktop/src/typewriter/assets'
KEYBOARD = json.loads((DEST.parent / 'keyboard.json').read_text())
KEYS, ATLAS = KEYBOARD['keys'], KEYBOARD['atlas']
FONT = REPO / 'packages/ui/src/assets/FocusBitmap-Regular.ttf'

OCTAGON = ((1, .78), (.81, 1), (-.81, 1), (-1, .78),
           (-1, -.78), (-.81, -1), (.81, -1), (1, -.78))


def box(index):
    w, h = ATLAS['width'], ATLAS['height']
    row, col = divmod(index, ATLAS['columns'])
    return col * w, row * h, w, h


def export_atlas(path):
    ink = Image.new('1', (ATLAS['columns'] * ATLAS['width'], ATLAS['rows'] * ATLAS['height']))
    # Focus Bitmap uses 128-unit cells at 1,200 units/em. Integral cell
    # sizes avoid seams where separately outlined rows touch in FreeType.
    fonts = {cells: ImageFont.truetype(str(FONT), cells * 1200 / 128) for cells in (2, 3, 4)}
    for index, key in enumerate(KEYS):
        x, y, w, h = box(index)
        if key['id'] == 'Space':
            continue  # A working, traditionally unprinted spacebar.
        marks = ((key['shifted'], 3, .255), (key['legend'], 3, .745)) if 'shifted' in key else (
            (key['legend'], 2 if key['id'].startswith('Shift') else 4, .5),)
        for mark, cells, line in marks:
            raw = fonts[cells].getmask(mark, mode='1')
            mask = Image.frombytes('L', raw.size, bytes(raw))
            mask = mask.crop(mask.getbbox())
            assert 0 < mask.width < w - 4 and 0 < mask.height < (h // 2 if 'shifted' in key else h - 4), mark
            ink.paste(mask, (x + (w - mask.width) // 2, y + round(line * h - mask.height / 2)))
    # Dark opaque ink on alpha, so filtering and color conversion never soften it.
    atlas = Image.new('RGBA', ink.size, (12, 20, 61, 0))
    atlas.putalpha(ink.convert('L'))
    atlas.save(path, optimize=True)


def cap(obj, index, key):
    row, slot = key['row'], key['slot']
    count = sum(k['row'] == row for k in KEYS)
    shift = key['id'].startswith('Shift')
    space = row == 4
    x = (slot - (count - 1) / 2) * 18.1 + (0, -3, 2.5, 0, 0)[row]
    y = (-29, -51, -73, -95, -121)[row]
    z = (95, 85, 75, 65, 58)[row]
    w, d = (190, 12) if space else (18.4 if shift else 13.4, 14.5)
    # The 3B recipe's octagonal cap, with a widened shift/spacebar and clean face.
    section = OCTAGON
    profile = ((.37, -11), (.37, -5), (.86, -5), (1, -1.4), (.95, 0))
    vertices = [(a * scale * w / 2000, b * scale * d / 2000,
                 (height + b * scale * d * .19) / 1000)
                for scale, height in profile for a, b in section]
    faces = ring_faces(len(section), len(profile))
    replace_mesh(obj, vertices, faces)
    obj.location = Vector((x, y, z)) / 1000
    obj.name = key['id']
    obj['cap'] = key['id']
    # +X reads right from the operator's side; +Y is the top of the legend.
    # Put every non-top loop on the transparent border texel.
    uv = obj.data.uv_layers.new(name='Legend')
    tx, ty, tw, th = box(index)
    aw, ah = ATLAS['columns'] * tw, ATLAS['rows'] * th
    for i, vertex in enumerate(obj.data.loops):
        v = obj.data.vertices[vertex.vertex_index].co
        u, t = .5, .5
        if vertex.vertex_index >= len(vertices) - len(section):
            u = tx + tw * (.5 + v.x * 1000 / w)
            t = ty + th * (.5 - v.y * 1000 / d)
        uv.data[i].uv = u / aw, 1 - t / ah
    for face in obj.data.polygons:
        if not all(v >= len(vertices) - len(section) for v in face.vertices):
            for i in face.loop_indices:
                uv.data[i].uv = .5 / aw, 1 - .5 / ah


def export_model(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.use_scripts_auto_execute = False
    parts = import_parts(ROOT / 'source/typewriter.glb')
    donors = sorted((o for o, style in parts if style == 'key'),
                    key=lambda o: (-round(bounds(o)[0].y, 4), bounds(o)[0].x))
    housing, = (o for o, style in parts if style == 'housing')
    # The original casting's ribbon cover started ahead of the number row.
    # Move just that 8×6 sweep behind it; keep the rails, pan and shoulders.
    cover = list(housing.data.vertices)[7 * 7 * 2 + 12 * 2:][:8 * 6]
    assert len(cover) == 48 and min(v.co.y for v in cover) < -.037
    for v in cover:
        v.co.y = .007 + (v.co.y + .038) * .63
    # Lift the bottom of the near lip; recast the donor's two front feet so
    # they remain visible underneath instead of turning the nose into a slab.
    for v in housing.data.vertices:
        at_front = min(1, max(0, (-v.co.y - .072) / .063))
        v.co.z = max(v.co.z, .004 + .022 * at_front)
    feet = [obj for obj, style in parts if style == 'mechanism' and len(obj.data.vertices) == 62
            and bounds(obj)[0].y < -.1]
    assert len(feet) == 2
    for foot in feet:
        lo, hi = bounds(foot)
        center = (lo + hi) / 2
        vertices = [(center.x + x * .014, center.y + y * .014, z)
                    for z in (0, .031) for x, y in OCTAGON]
        replace_mesh(foot, vertices, ring_faces(len(OCTAGON), 2))
    paper, = (o for o, style in parts if style == 'paper')
    # Trim only the exposed end along the existing sheet and retain its fit
    # around the rubber roller.
    assert len(paper.data.vertices) == 72
    for base, end in zip(list(paper.data.vertices)[-8:-4], list(paper.data.vertices)[-4:], strict=True):
        end.co = base.co.lerp(end.co, .90)
    spacebar, = (o for o, style in parts if style == 'spacebar')
    sources = donors + [bpy.data.objects.new(f'Cap {i}', bpy.data.meshes.new(f'Cap {i}'))
                        for i in range(len(KEYS) - len(donors) - 1)] + [spacebar]
    for index, (obj, key) in enumerate(zip(sources, KEYS, strict=True)):
        if not obj.users_collection:
            bpy.context.collection.objects.link(obj)
        cap(obj, index, key)

    # One mesh per static ink saves draw calls; every cap remains independent.
    for style in sorted({style for _, style in parts} - {'key', 'spacebar'}):
        objects = [o for o, kind in parts if kind == style]
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        objects[0].name = style
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', export_extras=True,
                              export_materials='NONE', export_texcoords=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path, nargs='?', default=DEST)
    out = parser.parse_args().output.resolve()
    out.mkdir(parents=True, exist_ok=True)
    export_atlas(out / 'legends.png')
    export_model(out / 'machine.glb')
