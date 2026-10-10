"""Build one port model and render its four orthographic views in Blender.

Run: Blender --background --python build_reference.py
Coordinates: X across shore, +Y toward land, +Z up. Units are metres.
The generated design image is an appearance reference; this scene defines layout.
"""

from pathlib import Path
from math import pi

import bpy
from mathutils import Vector


OUT = Path(__file__).resolve().parent
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'


def material(name, color):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = 0.85
    return mat


wood = material('Honey wood', (0.43, 0.235, 0.095))
deck_mats = [material('Deck %d' % i, (0.60 + i * .018, .365 + i * .013, .16 + i * .008)) for i in range(3)]
dark = material('Dark structural timber', (.235, .125, .055))
cream = material('Warm plaster', (.88, .79, .59))
roof_mat = material('Terracotta roof', (.64, .205, .07))
roof_edge = material('Terracotta ridge', (.76, .28, .10))
canvas = material('Cream canvas', (.94, .865, .65))
glass = material('Deep teal glass', (.075, .20, .21))
rope = material('Natural rope', (.52, .40, .22))
iron = material('Dark iron', (.11, .125, .115))

model = bpy.data.collections.new('Port - shared geometry')
scene.collection.children.link(model)


def keep(obj, name, mat, bevel=0):
    obj.name = name
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    model.objects.link(obj)
    obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new('Small planar bevel', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 1
    return obj


def box(name, location, size, mat, bevel=.018):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return keep(obj, name, mat, bevel)


def beam(name, start, end, width, mat=dark):
    start, end = Vector(start), Vector(end)
    obj = box(name, (start + end) / 2, (width, width, (end - start).length), mat)
    obj.rotation_euler = (end - start).to_track_quat('Z', 'Y').to_euler()
    return obj


def cylinder(name, location, radius, depth, mat, vertices=8):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    return keep(bpy.context.object, name, mat, .012)


def mesh(name, vertices, faces, mat, thickness=0):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    model.objects.link(obj)
    obj.data.materials.append(mat)
    if thickness:
        modifier = obj.modifiers.new('Panel thickness', 'SOLIDIFY')
        modifier.thickness = thickness
    return obj


# A 12 x 3.6 m quay, plus a 3 x 4.5 m seaward finger on the right.
# These planks and every detail below are created once, never per view.
for i in range(12):
    box('Quay plank %02d' % i, (0, .15 + i * .30, 1.45), (12, .285, .18), deck_mats[i % 3])
for i in range(15):
    box('Finger plank %02d' % i, (4.5, -.15 - i * .30, 1.45), (3, .285, .18), deck_mats[i % 3])

for y in [.12, 3.48]:
    box('Quay longitudinal beam', (0, y, 1.19), (12, .24, .32), wood)
for x in [3.12, 5.88]:
    box('Finger longitudinal beam', (x, -2.2, 1.19), (.24, 4.65, .32), wood)

pile_positions = set()
for x in [-5.75, -3, -.25, 2.5, 5.75]:
    for y in [.12, 3.48]:
        pile_positions.add((x, y))
for x in [3.12, 5.88]:
    for y in [-2.15, -4.28]:
        pile_positions.add((x, y))
for i, (x, y) in enumerate(sorted(pile_positions)):
    cylinder('Foundation pile %02d' % i, (x, y, .70), .16, 1.85, wood)
for x1, x2 in zip([-5.75, -3, -.25, 2.5], [-3, -.25, 2.5, 5.75]):
    beam('Quay diagonal brace', (x1, .12, .1), (x2, .12, 1.15), .14)
for x in [3.12, 5.88]:
    beam('Finger diagonal brace', (x, -.05, .1), (x, -2.15, 1.15), .14)
    beam('Finger diagonal brace', (x, -2.15, .1), (x, -4.28, 1.15), .14)

# The only building, at the rear-left of the quay.
box('Harbor house walls', (-3, 2.15, 2.85), (3.35, 2.4, 2.62), cream, .03)
mesh('Gable walls', [(-4.675, .95, 4.16), (-1.325, .95, 4.16), (-3, .95, 5.45),
                    (-4.675, 3.35, 4.16), (-1.325, 3.35, 4.16), (-3, 3.35, 5.45)],
     [(0, 1, 2), (5, 4, 3)], cream)
for x in [-4.68, -1.32]:
    for y in [.92, 3.38]:
        box('House corner timber', (x, y, 2.84), (.16, .16, 2.66), dark)
for y in [.90, 3.40]:
    box('House cross timber', (-3, y, 4.09), (3.55, .16, .17), wood)
    beam('Gable frame left', (-4.8, y, 4.15), (-3, y, 5.51), .17, wood)
    beam('Gable frame right', (-3, y, 5.51), (-1.2, y, 4.15), .17, wood)
for x in [-4.68, -1.32]:
    box('House side timber', (x, 2.15, 4.09), (.16, 2.65, .17), wood)

for x in [-4.88, -1.12]:
    mesh('Roof slope', [(x, .68, 4.12), (x, 3.62, 4.12), (-3, 3.62, 5.58), (-3, .68, 5.58)],
         [(0, 1, 2, 3)], roof_mat, .11)
beam('Roof ridge cap', (-3, .60, 5.62), (-3, 3.70, 5.62), .18, roof_edge)
box('Chimney', (-2.05, 2.85, 5.29), (.42, .48, 1.36), cream)
box('Chimney cap', (-2.05, 2.85, 5.98), (.58, .64, .13), cream)
box('Chimney opening', (-2.05, 2.85, 6.06), (.29, .35, .04), iron, 0)

box('Seaward door', (-3, .927, 2.47), (1.05, .07, 1.85), dark)
for x in [-3.60, -2.40]:
    box('Door frame', (x, .85, 2.49), (.15, .15, 2.04), wood)
box('Door header', (-3, .85, 3.49), (1.35, .17, .17), wood)
for i in range(5):
    box('Door board', (-3.44 + i * .22, .876, 2.47), (.208, .03, 1.80), wood, .004)


def front_window(name, x, y, z):
    box(name + ' glass', (x, y, z), (.66, .06, .62), glass)
    for dx in [-.37, .37, 0]:
        box(name + ' vertical frame', (x + dx, y - .04, z), (.06, .08, .76), wood, .007)
    for dz in [-.35, .35, 0]:
        box(name + ' horizontal frame', (x, y - .04, z + dz), (.78, .08, .06), wood, .007)


front_window('Front loft window', -3, .88, 4.56)
front_window('Rear window', -3, 3.405, 2.96)
box('Right wall glass', (-1.285, 2.30, 2.97), (.06, .72, .72), glass)
for y in [1.90, 2.30, 2.70]:
    box('Right window upright', (-1.25, y, 2.97), (.09, .065, .88), wood)
for z in [2.57, 2.97, 3.37]:
    box('Right window horizontal', (-1.25, 2.30, z), (.09, .86, .065), wood)

# One awning above the seaward entrance; its supports never move with the camera.
mesh('Single canvas awning', [(-4.36, .86, 3.72), (-1.64, .86, 3.72),
                             (-1.64, -.015, 3.28), (-4.36, -.015, 3.28)],
     [(0, 1, 2, 3)], canvas, .035)
for x in [-4.34, -1.66]:
    beam('Awning support', (x, .035, 1.56), (x, .035, 3.32), .10, wood)
beam('Awning front edge', (-4.39, .015, 3.28), (-1.61, .015, 3.28), .08, wood)

# One decorative crate beside the house entrance.
box('Single crate', (-1.92, .45, 1.85), (.54, .54, .60), deck_mats[0])
for x in [-2.17, -1.67]:
    box('Crate front frame', (x, .165, 1.85), (.065, .06, .60), dark, .006)
beam('Crate front diagonal', (-2.16, .16, 1.58), (-1.68, .16, 2.12), .055, dark)

# One compact cargo hoist on the finger's outer/right edge.
box('Hoist foot', (5.55, -2.8, 1.62), (.55, .55, .18), dark)
beam('Hoist mast', (5.55, -2.8, 1.65), (5.55, -2.8, 3.84), .21, wood)
beam('Hoist boom', (5.72, -2.8, 3.78), (2.75, -2.8, 3.78), .19, wood)
beam('Hoist diagonal', (5.55, -2.8, 2.42), (3.45, -2.8, 3.78), .13, wood)
cylinder('Pulley', (2.89, -2.8, 3.58), .13, .14, iron).rotation_euler.x = pi / 2
beam('Hoist rope', (2.89, -2.8, 3.55), (2.89, -2.8, 2.20), .025, rope)
beam('Small hook', (2.89, -2.8, 2.20), (3.00, -2.8, 2.09), .05, iron)

for x in [3.27, 5.73]:
    cylinder('Mooring bollard', (x, -4.16, 1.76), .14, .45, dark)
    cylinder('Mooring head', (x, -4.16, 1.98), .20, .09, iron)
for x in [4.04, 4.86]:
    beam('End ladder rail', (x, -4.62, -.18), (x, -4.62, 1.70), .09, wood)
for z in [.04, .36, .68, 1, 1.32, 1.60]:
    beam('End ladder rung', (4.04, -4.62, z), (4.86, -4.62, z), .075, wood)

# Keep the model collection separate from cameras and studio lighting.
scene.world.use_nodes = True
scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value = (.75, .78, .80, 1)
scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value = .75


def light(name, location, energy, size):
    bpy.ops.object.light_add(type='AREA', location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.energy = energy
    obj.data.shape = 'DISK'
    obj.data.size = size
    obj.rotation_euler = (Vector((0, 0, 2)) - obj.location).to_track_quat('-Z', 'Y').to_euler()


light('Studio key', (-4, -6, 12), 1800, 7)
light('Studio fill', (6, 4, 9), 1250, 8)
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.render.resolution_x = 1600
scene.render.resolution_y = 1200
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'AgX'

views = [
    ('front', (0, -30, 2.80), (0, 0, 2.80)),
    ('back', (0, 30, 2.80), (0, 0, 2.80)),
    ('right', (30, 0, 2.80), (0, 0, 2.80)),
    ('top', (0, -.4, 30), (0, -.4, 0)),
]
for name, location, target in views:
    bpy.ops.object.camera_add(location=location)
    camera = bpy.context.object
    camera.name = 'View - ' + name
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 15.0
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = camera
    scene.render.filepath = str(OUT / ('view-' + name + '.png'))
    bpy.ops.render.render(write_still=True)

scene.camera = bpy.data.objects['View - front']
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'port.blend'))
assert sum(obj.name == 'Harbor house walls' for obj in model.objects) == 1
assert len([obj for obj in scene.objects if obj.type == 'CAMERA']) == 4
print('PORT_REFERENCE_COMPLETE', len(model.objects), 'shared model objects, four orthographic cameras')
