"""Offline authoring recipe. No app code imports this module."""
import argparse
import math
from pathlib import Path
from tempfile import TemporaryDirectory

import bpy
import bmesh
import numpy as np
from mathutils import Quaternion, Vector
from PIL import Image, ImageDraw

from verify import SOURCE_SHA, digest

ROOT = Path(__file__).resolve().parent
SIZE = (704, 416)  # Art field in the 960 × 640 desktop reference.
SEED = 3072


def bounds(obj):
    return tuple(Vector([f(v.co[i] for v in obj.data.vertices) for i in range(3)])
                 for f in (min, max))


def reshape_key(obj, lo, hi):
    """Keep the donor's centers and stem footprints; fit chamfered blank caps."""
    center = (hi + lo) / 2
    octagon = [(1, 0.78), (0.81, 1), (-0.81, 1), (-1, 0.78),
               (-1, -0.78), (-0.81, -1), (0.81, -1), (1, -0.78)]
    sx, sy = (hi.x - lo.x) * 0.65, (hi.y - lo.y) * 0.62
    profile = ((0.23, lo.z), (0.23, lo.z + 0.007),
               (0.91, lo.z + 0.007), (1, hi.z - 0.0007), (0.93, hi.z))
    setback = 0.016 if lo.y > -0.06 else 0
    vertices = [(center.x + x * sx * scale, center.y + setback + y * sy * scale,
                 z + 0.16 * y * sy * scale)
                for scale, z in profile for x, y in octagon]
    faces = ring_faces(len(octagon), len(profile))
    replace_mesh(obj, vertices, faces)


def ring_faces(sides, rings):
    end = (rings - 1) * sides
    faces = [tuple(reversed(range(sides))), tuple(range(end, end + sides))]
    faces.extend((sides * j + i, sides * j + (i + 1) % sides,
                  sides * (j + 1) + (i + 1) % sides, sides * (j + 1) + i)
                 for j in range(rings - 1) for i in range(sides))
    return faces


def reshape_sheet(obj, lo, hi, platen):
    """Square the paper edge; keep one continuous curve around the rubber."""
    lower, upper = bounds(platen)
    axis = (lower + upper) / 2
    radius = (upper.y - lower.y) / 2 + 0.0003
    bend = math.radians(123)
    arc = [(axis.y + radius * math.cos(a), axis.z + radius * math.sin(a))
           for a in np.linspace(math.radians(206), bend, 17)]
    y, z = arc[-1]
    top = 0.207
    arc.append((y - (top - z) * math.tan(bend), top))
    center_x = (lo.x + hi.x) / 2
    half_width = 0.52 * (hi.x - lo.x)
    vertices = [(x, y + thickness, z)
                for y, z in arc for x, thickness in (
                    (center_x - half_width, 0), (center_x + half_width, 0),
                    (center_x + half_width, 0.00022), (center_x - half_width, 0.00022))]
    replace_mesh(obj, vertices, ring_faces(4, len(arc)))


def replace_mesh(obj, vertices, faces):
    old = obj.data
    data = bpy.data.meshes.new(obj.name + ' sculpt')
    data.from_pydata(vertices, [], faces)
    mesh = bmesh.new()
    mesh.from_mesh(data)
    bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces))
    mesh.to_mesh(data)
    mesh.free()
    obj.data = data
    bpy.data.meshes.remove(old)


def casting(obj, lo, hi):
    """Rebuild the cast shell within the donor's envelope, around its keys."""
    vertices, faces = [], []

    def sweep(sections):
        n = len(sections[0])
        start = len(vertices)
        vertices.extend(tuple(c / 1000 for c in p) for loop in sections for p in loop)
        faces.append(tuple(start + j for j in reversed(range(n))))
        for row in range(len(sections) - 1):
            a = start + row * n
            for j in range(n):
                k = (j + 1) % n
                faces.append((a + j, a + k, a + n + k, a + n + j))
        faces.append(tuple(start + (len(sections) - 1) * n + j for j in range(n)))

    outer = 1000 * hi.x
    front = 1000 * lo.y
    for side in (-1, 1):
        def rail(y, inner, upper, z, bevel, rear=0):
            return [(side * x, y, h) for x, h in (
                (inner, 9), (outer + 9 - rear, 4), (outer + 14 - rear, 11),
                (outer - rear, z - bevel), (upper, z),
                (inner, z - 3), (inner - 1.5, z - 10),
            )]

        sweep([rail(front + 4, 109, outer - 7, 43, 7),
               rail(front + 14, 109, outer - 5, 56, 9),
               rail(-12, 107, outer - 7, 94, 21),
               rail(24, 107, outer - 15, 118, 24),
               rail(72, 108, outer - 16, 108, 16, 11),
               rail(112, 108, outer - 26, 90, 8, 23),
               rail(139, 113, outer - 29, 82, 5, 29)])

    # Continuous front lip and lower pan; the original inset keyboard deck
    # and all of the gaps around its separate controls sit above the pan.
    sweep([[(side * x, y, z) for x, y, z in (
                (142, front + 1, 13), (142, front + 1, 46), (143, front + 10, 54),
                (144, -124, 54), (144, -116, 42), (142, 10, 58),
                (132, 46, 90), (122, 115, 95), (118, 139, 74),
                (118, 139, 13), (120, 135, 4), (142, front + 7, 4))]
           for side in (-1, 1)])

    # Ribbon cover, with an open slot leading to the original platen and
    # type guide. Shoulder sections rise beside the slot rather than sealing it.
    sweep([[(x, y, z + rise) for y, z in (
                (-38, 92), (-30, 108), (-9, 116), (14, 116), (21, 101), (14, 94))]
           for x, rise in ((-123, -6), (-102, 0), (-58, 0), (-45, -6),
                           (46, -6), (57, 0), (102, 0), (130, -6))])
    for side in (-1, 1):
        sweep([[(side * x, y, z + rise) for y, z in (
                    (10, 96), (13, 113), (25, 124), (45, 120), (60, 105), (62, 94))]
               for x, rise in ((48, -5), (62, 0), (97, 0), (121, -4))])
    replace_mesh(obj, vertices, faces)


def reshape_knob(obj, lo, hi):
    side = 1 if lo.x > 0 else -1
    center = (lo + hi) / 2
    start = min(abs(lo.x), abs(hi.x))
    width = (hi.x - lo.x) * (1.95 if side > 0 else 1.1)
    radius = (hi.y - lo.y) * (0.72 if side > 0 else 0.63)
    profile = ((0, 0.72), (0.25, 1), (0.78, 1), (1, 0.78))
    vertices = [(side * (start + u * width),
                 center.y + r * radius * math.cos(angle),
                 center.z + r * radius * math.sin(angle))
                for u, r in profile for i in range(10)
                for angle in ((i + 0.5) * math.tau / 10,)]
    replace_mesh(obj, vertices, ring_faces(10, len(profile)))


def import_parts(source):
    if digest(source) != SOURCE_SHA:
        raise ValueError("Not the approved Grab3D GLB")
    bpy.ops.import_scene.gltf(filepath=str(source), merge_vertices=True)
    body, = (obj for obj in bpy.context.scene.objects if obj.type == 'MESH')
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=0.00001)
    bpy.ops.mesh.separate(type='LOOSE')
    bpy.ops.object.mode_set(mode='OBJECT')

    parts = []
    keys = []
    platen = next(obj for obj in bpy.context.scene.objects
                  if obj.type == 'MESH' and len(obj.data.vertices) == 194)
    for obj in list(bpy.context.scene.objects):
        if obj.type != 'MESH':
            continue
        lo, hi = bounds(obj)
        count = len(obj.data.vertices)
        style = 'mechanism'
        if count in (192, 102) and hi.x < -0.1:
            # The projecting return lever is folded back behind the far end.
            for v in obj.data.vertices:
                v.co.y += (0.061 - v.co.y) * 0.98
                v.co.x += 0.028
        if count == 114:
            reshape_key(obj, lo, hi)
            keys.append((obj, lo, hi))
            style = 'key'
        elif count == 360:
            casting(obj, lo, hi)
            style = 'housing'
        elif count == 242:
            reshape_sheet(obj, lo, hi, platen)
            style = 'paper'
        elif count == 120:
            for v in obj.data.vertices:
                v.co.x *= 1.24
            style = 'spacebar'
        elif count == 482:
            style = 'knob'
            reshape_knob(obj, lo, hi)
        elif count in (82, 144) or (count == 80 and lo.z > 0.08):
            style = 'carriage'
        elif count == 26:
            style = 'bail'
            midpoint = (lo + hi) * 0.5
            for v in obj.data.vertices:
                v.co.y = midpoint.y + (v.co.y - midpoint.y) * 1.45
                v.co.z = midpoint.z + (v.co.z - midpoint.z) * 1.45
        elif count == 194:
            style = 'platen'
        elif count == 96 and lo.z > 0.1:
            # Shorten the donor rest so it doesn't show behind the clean sheet.
            for v in obj.data.vertices:
                v.co.x *= 0.76
                v.co.z = 0.12 + (v.co.z - 0.12) * 0.47
        elif count == 64 and hi.x < 0.01 and hi.y < 0.05:
            for v in obj.data.vertices:
                height = (v.co.z - lo.z) / (hi.z - lo.z)
                v.co.z = lo.z + 0.041 * height
                v.co.y += 0.007 * height
            style = 'carriage'
        parts.append((obj, style))
    # Move the assembled carriage (including the sheet, bail rollers and
    # lever) as one unit. Its bed still lands on the back of the casting.
    roll = Quaternion((0, 1, 0), math.radians(3))
    axle = Vector((0, 0.064, 0.1135))
    for obj, style in parts:
        lo, _ = bounds(obj)
        if (lo.y > 0.035 and lo.z > 0.088) or len(obj.data.vertices) == 80:
            for v in obj.data.vertices:
                v.co.x *= 0.971
                v.co = axle + roll @ (v.co - axle)
                v.co.z += 0.014
        obj.name = style
        for face in obj.data.polygons:
            face.use_smooth = False
        obj.data.materials.clear()

    # Protect the topology assumptions and the real cap-to-cap gaps after reshaping.
    assert len(parts) == 95 and len(keys) == 39
    rows = sorted({round(lo.y, 4) for _, lo, _ in keys})
    for row, expected in zip(rows, (9, 10, 10, 10), strict=True):
        extents = sorted((bounds(obj)[0].x, bounds(obj)[1].x)
                         for obj, lo, _ in keys if round(lo.y, 4) == row)
        assert len(extents) == expected
        assert min(b[0] - a[1] for a, b in zip(extents, extents[1:])) > 0.002
    assert sum(style == 'spacebar' for _, style in parts) == 1
    return parts


def camera_and_scene():
    scene = bpy.context.scene
    lens = bpy.data.cameras.new('Close perspective')
    lens.lens = 37
    lens.clip_start = 0.005
    camera = bpy.data.objects.new('Front right', lens)
    scene.collection.objects.link(camera)
    camera.location = (0.238, -0.321, 0.105)
    focus = Vector((0.004, -0.004, 0.114))
    camera.rotation_mode = 'QUATERNION'
    camera.rotation_quaternion = ((focus - camera.location).to_track_quat('-Z', 'Y')
                                  @ Quaternion((0, 0, 1), math.radians(-10)))
    scene.camera = camera
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 32
    scene.cycles.seed = SEED
    scene.cycles.use_adaptive_sampling = False
    scene.cycles.use_denoising = False
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 8
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.dither_intensity = 0
    scene.view_settings.view_transform = 'Standard'
    scene.world = bpy.data.worlds.new('Clay fill')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.22
    light = bpy.data.lights.new('Clay key', 'AREA')
    light.energy = 5
    light.shape = 'DISK'
    light.size = 0.18
    lamp = bpy.data.objects.new('Clay key', light)
    scene.collection.objects.link(lamp)
    lamp.location = (-0.28, -0.24, 0.58)
    lamp.rotation_euler = (focus - lamp.location).to_track_quat('-Z', 'Y').to_euler()
    return scene


def render(scene, scale):
    scene.render.resolution_x, scene.render.resolution_y = SIZE
    scene.render.resolution_percentage = 100 * scale
    with TemporaryDirectory(prefix='focus-typewriter-') as work:
        path = Path(work) / 'render.png'
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        with Image.open(path) as source:
            image = source.convert('RGBA')
    # Blender writes wall-clock stamps even when they are not burned into pixels.
    image.info.clear()
    return image


def linear(hex_color):
    rgb = [int(hex_color[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return (*(c / 12.92 if c < 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb), 1.0)


def clay_material():
    mat = bpy.data.materials.new('Unprinted clay')
    mat.diffuse_color = (0.51, 0.51, 0.51, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = mat.diffuse_color
    bsdf.inputs['Roughness'].default_value = 0.85
    return mat


# Ink tone is determined by the face normal, not a photographic specular lobe.
# The bands preserve the facets at the small desktop projection.
PALETTES = {
    'housing': ('060d4d', '0b1595', '111fb9', '182cde', '3a55f3'),
    'mechanism': ('070d28', '0a1238', '101a45', '111a48', '182450'),
    'carriage': ('081237', '162576', '243eb1', '3c53d5', '7384f1'),
    'knob': ('081238', '1223a1', '1931c9', '2b45e2', '4c62ed'),
    'platen': ('070d2d', '101946', '172563', '263a83', '4562b2'),
    'bail': ('0b1a46', '283787', '5668aa', 'a6b1db', 'e7eaff'),
    'key': ('121b3e', '252f59', '4c5b88', 'dce3f7', 'fafbff'),
    'spacebar': ('101833', '28345c', '596b97', 'e9edf7', 'fafbff'),
    'paper': ('d3d8e2', 'e4e8ef', 'f2f4f6', 'f9fafb', 'fdfdfe'),
}


def ink_material(style):
    mat = bpy.data.materials.new(style.title() + ' ink')
    mat.diffuse_color = linear(PALETTES[style][2])
    mat.use_nodes = True
    tree = mat.node_tree
    tree.nodes.clear()

    def node(kind, **inputs):
        item = tree.nodes.new(kind)
        for key, val in inputs.items():
            socket = item.inputs[int(key) if key.isdecimal() else key]
            if isinstance(val, bpy.types.NodeSocket):
                tree.links.new(val, socket)
            else:
                socket.default_value = val
        return item

    def scalar(op, a, b=0):
        item = node('ShaderNodeMath', **{'0': a, '1': b})
        item.operation = op
        return item.outputs[0]

    def vector(op, a, b):
        item = node('ShaderNodeVectorMath', **{'0': a, '1': b})
        item.operation = op
        return item.outputs['Value' if op in ('DOT_PRODUCT', 'DISTANCE') else 'Vector']

    geometry = node('ShaderNodeNewGeometry')
    tone = vector('DOT_PRODUCT', geometry.outputs['True Normal'], (-0.19, -0.44, 0.88))
    t = scalar('MULTIPLY_ADD', tone, 0.5)
    t.node.inputs[2].default_value = 0.5
    ramp_node = node('ShaderNodeValToRGB', Fac=t)
    ramp = ramp_node.color_ramp
    ramp.interpolation = 'CONSTANT'
    colors = PALETTES[style]
    stops = (0.0, 0.30, 0.47, 0.68, 0.90)
    if style in ('key', 'spacebar'):
        stops = (0.0, 0.39, 0.60, 0.77, 0.85)
    elif style == 'housing':
        stops = (0.0, 0.31, 0.48, 0.77, 0.90)
    ramp.elements.remove(ramp.elements[1])
    for i, (at, color) in enumerate(zip(stops, colors)):
        stop = ramp.elements.new(at) if i else ramp.elements[0]
        stop.color = linear(color)
    ink = ramp_node.outputs['Color']

    if style in ('housing', 'knob'):
        # A fixed 37° press screen, measured in desktop pixels. Only the near
        # wall and the end grain of the roller knob take the dense navy plate.
        near = vector('DOT_PRODUCT', geometry.outputs['True Normal'], (1, 0, 0))
        near = scalar('GREATER_THAN', near, 0.81 if style == 'housing' else 0.92)
        world_x = node('ShaderNodeSeparateXYZ', Vector=geometry.outputs['Position']).outputs['X']
        near = scalar('MULTIPLY', near, scalar('GREATER_THAN', world_x, 0.144))
        window = node('ShaderNodeTexCoord').outputs['Window']
        xy = node('ShaderNodeSeparateXYZ', Vector=window).outputs
        x, y = scalar('MULTIPLY', xy['X'], SIZE[0]), scalar('MULTIPLY', xy['Y'], SIZE[1])
        pitch = 4.55 if style == 'housing' else 4.35
        angle = math.radians(37)
        c, s = math.cos(angle) / pitch, math.sin(angle) / pitch
        u = scalar('FRACT', scalar('ADD', scalar('MULTIPLY', x, c), scalar('MULTIPLY', y, s)))
        v = scalar('FRACT', scalar('ADD', scalar('MULTIPLY', x, -s), scalar('MULTIPLY', y, c)))
        uv = node('ShaderNodeCombineXYZ', X=u, Y=v).outputs['Vector']
        radius = vector('DISTANCE', uv, (0.5, 0.5, 0))
        dot = scalar('LESS_THAN', radius, 0.35 if style == 'housing' else 0.37)
        ink = node('ShaderNodeMixRGB', **{'0': scalar('MULTIPLY', near, dot),
                                        '1': ink, '2': linear('080f3a')}).outputs[0]
    emitter = node('ShaderNodeEmission', Color=ink)
    node('ShaderNodeOutputMaterial', Surface=emitter.outputs[0])
    return mat


def paper_and_ink(art):
    """Compose an original spot-color plate under the scene's actual matte."""
    width, height = art.size
    yy, xx = np.ogrid[:height, :width]
    # Vertical trim at the right; left edge follows the diagonal of the platen.
    mask = np.clip((xx - (0.51 * width - 0.67 * yy)) * 0.85 + 0.5, 0, 1)
    rng = np.random.default_rng(SEED)
    grain = rng.normal(0, 1.35, (height, width))
    cells = rng.random((height // 2, width // 2)).repeat(2, axis=0).repeat(2, axis=1)
    flecks = np.maximum(0, (cells - 0.977) / 0.023) * rng.uniform(0.4, 1, (height, width))
    pink = np.empty((height, width, 4), dtype=np.uint8)
    density = grain + 19 * flecks
    for channel, value in enumerate((251, 13, 145)):
        pink[:, :, channel] = np.clip(value + density, 0, 255)
    pink[:, :, 3] = np.uint8(np.rint(mask * 255))
    pink[pink[:, :, 3] == 0] = 0

    pixels = np.array(art)
    rgb = pixels[:, :, :3]
    saturation = rgb.max(axis=2).astype(float) - rgb.min(axis=2)
    ink = np.clip((saturation - 25) / 90, 0, 1)
    dry = grain + 44 * flecks
    pixels[:, :, :3] = np.clip(rgb + (ink * dry)[:, :, None], 0, 255)
    return Image.alpha_composite(Image.fromarray(pink), Image.fromarray(pixels))


def comparison(clay, hero, dest):
    """Reference only: extract its art field at the 960 × 640 baseline scale."""
    ref = Image.open(ROOT.parent / 'references/approved-cobalt-dashboard.png').convert('RGB')
    ref = ref.resize((960, 640), Image.Resampling.LANCZOS).crop((256, 81, 960, 497))
    # The timer overlaps the field's transparent left triangle in the mockup.
    # Mask that UI from the reference proof only, not from the source image.
    ImageDraw.Draw(ref).polygon([(0, 0), (350, 0), (211, 204), (154, 250),
                                 (116, 299), (6, 383), (0, 405)], fill='#f4f5f6')
    strip = Image.new('RGB', (3 * SIZE[0], SIZE[1]), '#f4f5f6')
    strip.paste(ref, (0, 0))
    for i, candidate in enumerate((clay, hero), 1):
        strip.paste(candidate, (i * SIZE[0], 0), candidate.getchannel('A'))
    strip.save(dest, optimize=True)


def main(output, clay_only):
    output.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.use_scripts_auto_execute = False
    parts = import_parts(ROOT / 'source/typewriter.glb')
    scene = camera_and_scene()
    clay = clay_material()
    for obj, _ in parts:
        obj.data.materials.append(clay)
    scene.cycles.use_denoising = True
    clay_image = render(scene, 1)
    clay_image.save(output / 'clay.png', optimize=True)
    if clay_only:
        return
    scene.cycles.use_denoising = False
    inks = {style: ink_material(style) for style in PALETTES}
    for obj, style in parts:
        obj.data.materials[0] = inks[style]
    hero = paper_and_ink(render(scene, 2))
    hero.save(output / 'typewriter-cobalt.png', optimize=True)
    comparison(clay_image, hero.resize(SIZE, Image.Resampling.LANCZOS),
               output / 'comparison.png')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--clay-only', action='store_true')
    args = parser.parse_args()
    main(args.output.resolve(), args.clay_only)
