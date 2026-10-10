"""Refine the existing port blockout into a soft, hand-crafted model.

The original quay, house and hoist anchors stay fixed. Generated details are
named Style - ... so this pass can be safely re-applied while iterating.
"""

import math
import bpy
from mathutils import Vector


def apply_style():
    scene = bpy.context.scene
    collection = bpy.data.collections.get('Port - shared geometry')
    if collection is None or bpy.data.objects.get('Harbor house walls') is None:
        raise RuntimeError('Open the existing port blockout before applying this pass.')

    for obj in list(bpy.data.objects):
        if obj.name.startswith('Style - '):
            bpy.data.objects.remove(obj, do_unlink=True)
    for obj in list(collection.objects):
        if obj.type != 'MESH':
            continue
        if 'style_base_scale' not in obj:
            obj['style_base_scale'] = list(obj.scale)
        obj.scale = obj['style_base_scale']
        obj.hide_set(False)
        obj.hide_render = False

    def rgb(hex_color):
        values = [int(hex_color[i:i+2], 16) / 255 for i in (0, 2, 4)]
        return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in values)

    def paint(name, hex_color, roughness=.78, subsurface=0):
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        color = rgb(hex_color)
        mat.diffuse_color = (*color, 1)
        mat.use_nodes = True
        shader = mat.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = (*color, 1)
        shader.inputs['Roughness'].default_value = roughness
        shader.inputs['Subsurface Weight'].default_value = subsurface
        shader.inputs['Specular IOR Level'].default_value = .25
        return mat

    wood = paint('Honey wood', 'A87338')
    dark = paint('Dark structural timber', '795027')
    plaster = paint('Warm plaster', 'F0DEB0', .86, .035)
    canvas = paint('Cream canvas', 'EFDCAB', .90, .02)
    iron = paint('Dark iron', '62645B', .61)
    glass = paint('Deep teal glass', '517D7B', .42)
    cord = paint('Natural rope', 'B19A66', .95)
    tile_mats = [paint('Style roof %d' % i, color, .82) for i, color in enumerate(['C86B32', 'D47B3C', 'C97636', 'D08042'])]
    paint('Terracotta roof', 'C86B32')
    paint('Terracotta ridge', 'D17B3C')
    for i, color in enumerate(['C39355', 'CA995A', 'BC8A4A']):
        paint('Deck %d' % i, color)

    def soften(obj, amount=.035):
        if obj.type != 'MESH':
            return
        bevel = next((m for m in obj.modifiers if m.type == 'BEVEL'), None)
        if bevel is None:
            bevel = obj.modifiers.new('Clay edge softness', 'BEVEL')
        bevel.width = amount
        bevel.segments = 3
        bevel.limit_method = 'ANGLE'
        bevel.harden_normals = True
        for face in obj.data.polygons:
            face.use_smooth = True
        normals = obj.modifiers.get('Clay weighted normals') or obj.modifiers.new('Clay weighted normals', 'WEIGHTED_NORMAL')
        normals.keep_sharp = True
        normals.weight = 50

    def register(obj, name, mat, bevel=.03, model_part=True):
        obj.name = 'Style - ' + name
        if model_part:
            for current in list(obj.users_collection):
                current.objects.unlink(obj)
            collection.objects.link(obj)
        obj.data.materials.append(mat)
        if bevel:
            soften(obj, bevel)
        return obj

    def box(name, location, size, mat, bevel=.035):
        bpy.ops.mesh.primitive_cube_add(size=1, location=location)
        obj = bpy.context.object
        obj.dimensions = size
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        return register(obj, name, mat, bevel)

    def beam(name, start, end, width, mat=wood, bevel=.025):
        a, b = Vector(start), Vector(end)
        obj = box(name, (a + b) / 2, (width, width, (b-a).length), mat, bevel)
        obj.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
        return obj

    def mesh(name, vertices, faces, mat, bevel=.025):
        data = bpy.data.meshes.new(name)
        data.from_pydata(vertices, [], faces)
        data.update()
        obj = bpy.data.objects.new('Style - ' + name, data)
        collection.objects.link(obj)
        obj.data.materials.append(mat)
        if bevel:
            soften(obj, bevel)
        return obj

    def curve(name, points, radius, mat, cyclic=False):
        data = bpy.data.curves.new(name, 'CURVE')
        data.dimensions = '3D'
        data.bevel_depth = radius
        data.bevel_resolution = 2
        spline = data.splines.new('POLY')
        spline.points.add(len(points)-1)
        for point, co in zip(spline.points, points):
            point.co = (*co, 1)
        spline.use_cyclic_u = cyclic
        obj = bpy.data.objects.new('Style - ' + name, data)
        collection.objects.link(obj)
        data.materials.append(mat)
        return obj

    def hide(obj):
        obj.hide_render = True
        obj.hide_set(True)

    # Keep the blockout anchors. Soften surfaces and thicken structural members.
    for obj in list(collection.objects):
        if obj.type != 'MESH':
            continue
        soften(obj, .035)
        if obj.name.startswith(('House corner timber', 'House cross timber', 'House side timber')):
            obj.scale.x *= 1.22
            obj.scale.y *= 1.22
        if 'diagonal brace' in obj.name:
            obj.scale.x *= 1.45
            obj.scale.y *= 1.45
        if obj.name.startswith(('Hoist mast', 'Hoist boom', 'Hoist diagonal')):
            obj.scale.x *= 1.32
            obj.scale.y *= 1.32

    # Chunky posts, rope collars and feet replace the thin blockout cylinders.
    piles = [o for o in collection.objects if o.name.startswith('Foundation pile')]
    for index, obj in enumerate(piles):
        x, y = obj.location.x, obj.location.y
        hide(obj)
        box('Pier post %02d' % index, (x, y, .81), (.35, .35, 2.06), wood, .04)
        box('Pier post cap %02d' % index, (x, y, 1.87), (.38, .38, .13), wood, .032)
        box('Post iron foot %02d' % index, (x, y, -.13), (.37, .37, .18), iron, .02)
        for level in [1.65, 1.70]:
            ring = []
            for cx, cy, angle in [(.16, .16, 0), (-.16, .16, 90), (-.16, -.16, 180), (.16, -.16, 270)]:
                for step in range(5):
                    a = math.radians(angle + step*22.5)
                    ring.append((x + cx + .035*math.cos(a), y + cy + .035*math.sin(a), level))
            curve('Post rope %02d' % index, ring, .022, cord, True)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=4, radius=.041, location=(x, y-.18, 1.18))
        bolt = register(bpy.context.object, 'Iron post bolt %02d' % index, iron, 0)
        bolt.scale.y = .35

    # A real doorway with depth and a dark interior replaces a painted closed door.
    for obj in list(collection.objects):
        if obj.name.startswith(('Harbor house walls', 'Seaward door', 'Door board')):
            hide(obj)
    # Shell preserves the original footprint and eaves height.
    for x in [-4.565, -1.435]:
        box('Plaster side wall', (x, 2.15, 2.85), (.22, 2.40, 2.62), plaster, .05)
    box('Plaster rear wall', (-3, 3.24, 2.85), (3.35, .22, 2.62), plaster, .05)
    for x in [-4.135, -1.865]:
        box('Plaster entry pier', (x, 1.06, 2.85), (1.08, .22, 2.62), plaster, .05)
    box('Plaster over doorway', (-3, 1.06, 3.89), (3.35, .22, .54), plaster, .04)
    box('Interior floor', (-3, 2.12, 1.57), (3.1, 2.3, .10), dark)
    box('Interior shadow', (-3, 3.09, 2.75), (2.9, .08, 2.35), dark)
    for obj in [o for o in collection.objects if o.name.startswith('Door frame')]:
        obj.location.x = -3.79 if obj.location.x < -3 else -2.21
        obj.scale.x = 1.35
        obj.scale.y = 1.35
    header = bpy.data.objects.get('Door header')
    header.scale.x = 1.35
    header.scale.z = 1.40
    header.location.z = 3.53
    # Two short braces under the lintel lend the house its hand-built character.
    beam('Entry diagonal left', (-3.80, .81, 3.00), (-3.35, .81, 3.48), .15, dark)
    beam('Entry diagonal right', (-2.20, .81, 3.00), (-2.65, .81, 3.48), .15, dark)

    # Roof tiles follow a slightly bowed, continuous surface; all views use it.
    for obj in list(collection.objects):
        if obj.name.startswith(('Roof slope', 'Roof ridge cap')):
            hide(obj)
    def roof_z(u):
        return 5.65 - 1.50*u + .085*math.sin(math.pi*u)
    for side in [-1, 1]:
        for row in range(3):
            u0, u1 = row/3, (row+1)/3 + .018
            for column in range(4):
                y0 = .53 + column*.80
                y1 = y0 + .795
                vertices = []
                for depth in [0, -.12]:
                    for y in [y0, y1]:
                        for step in range(4):
                            u = u0 + (u1-u0)*step/3
                            vertices.append((-3 + side*2.02*u, y, roof_z(u)+depth))
                faces = [(i, i+1, 5+i, 4+i) for i in range(3)]
                faces += [(8+i, 12+i, 13+i, 9+i) for i in range(3)]
                faces += [(0, 8, 9, 1), (1, 9, 10, 2), (2, 10, 11, 3),
                          (4, 5, 13, 12), (5, 6, 14, 13), (6, 7, 15, 14),
                          (0, 4, 12, 8), (3, 11, 15, 7)]
                mesh('Roof tile %s %d %d' % (side, row, column), vertices, faces, tile_mats[(row+column+(side==1))%4], .032)
    for index in range(6):
        y0, y1 = .49+index*.55, .49+index*.55+.56
        vertices=[]
        for y in [y0, y1]:
            for step in range(7):
                angle=math.pi*step/6
                vertices.append((-3+.18*math.cos(angle), y, 5.54+.16*math.sin(angle)))
        cap=mesh('Rounded ridge tile %d' % index, vertices, [(i,i+1,8+i,7+i) for i in range(6)], tile_mats[1], .016)
        solid=cap.modifiers.new('Ridge tile body', 'SOLIDIFY')
        solid.thickness=.075

    # Move the awning to the right wall, matching the reference's open front.
    for obj in list(collection.objects):
        if obj.name.startswith(('Single canvas awning', 'Awning support', 'Awning front edge')):
            hide(obj)
    vertices=[]
    for y in [.72, 3.33]:
        for step in range(7):
            u=step/6
            vertices.append((-1.27+1.62*u, y, 3.74-.42*u-.13*math.sin(math.pi*u)))
    cloth=mesh('Soft side canopy', vertices, [(i,i+1,8+i,7+i) for i in range(6)], canvas, 0)
    thick=cloth.modifiers.new('Cloth thickness', 'SOLIDIFY')
    thick.thickness=.055
    smooth=cloth.modifiers.new('Soft cloth', 'SUBSURF')
    smooth.levels=1
    for y in [.79,3.26]:
        beam('Canopy timber upright', (.31,y,1.56),(.31,y,3.36),.15)
        box('Canopy post foot', (.31,y,1.64), (.22,.22,.19), dark)
    beam('Canopy top rail', (.31,.69,3.31),(.31,3.37,3.31),.105)
    curve('Canopy round hem', [(.35,y,3.28) for y in [.72,1.2,1.8,2.4,3.33]], .04, canvas)

    # Sturdy corner shoes and details make the hand-built house feel grounded.
    for x in [-4.68,-1.32]:
        for y in [.92,3.38]:
            box('House timber foot', (x,y,1.64), (.29,.29,.22), iron, .03)
    for x in [-4.31,-1.69]:
        end_x=-3.86 if x < -3 else -2.14
        beam('Front timber knee', (x,.79,3.53),(end_x,.79,4.02),.15, dark)

    # Retain one ground crate; add only the suspended cargo implied by the hoist.
    for obj in list(collection.objects):
        if obj.name.startswith(('Single crate','Crate front')):
            hide(obj)
    def crate(name, center, size):
        x,y,z=center
        box(name+' body',center,(size,size,size),bpy.data.materials['Deck 0'],.035)
        for dx in [-1,1]:
            for dy in [-1,1]:
                box(name+' corner',(x+dx*size*.45,y+dy*size*.45,z),(.065,.065,size+.02),wood,.014)
        for dz in [-1,1]:
            for dy in [-1,1]:
                box(name+' edge',(x,y+dy*size*.46,z+dz*size*.45),(size,.065,.065),wood,.014)
            for dx in [-1,1]:
                box(name+' side edge',(x+dx*size*.46,y,z+dz*size*.45),(.065,size,.065),wood,.014)
        for dy in [-1,1]:
            beam(name+' diagonal',(x-size*.38,y+dy*size*.51,z-size*.38),(x+size*.38,y+dy*size*.51,z+size*.38),.065,wood,.012)
    crate('Entry crate',(-1.93,.43,1.89),.63)
    # The load hangs from the original boom tip, at the same anchor in all views.
    for obj in list(collection.objects):
        if obj.name.startswith(('Hoist rope','Small hook')):
            hide(obj)
    load=(2.89,-2.8,2.08)
    crate('Hanging cargo',load,.53)
    curve('Hoist hanging line',[(2.89,-2.8,3.55),(2.89,-2.8,2.75)],.029,cord)
    for dx,dy in [(-1,-1),(-1,1),(1,-1),(1,1)]:
        curve('Cargo sling',[(2.89,-2.8,2.76),(load[0]+dx*.23,load[1]+dy*.23,2.39)],.025,cord)
    for z in [2.1,3.65]:
        box('Hoist metal collar',(5.55,-2.8,z),(.31,.31,.14),iron,.023)

    # A consistent studio makes the geometry read softly rather than like CAD.
    key=bpy.data.objects.get('Studio key')
    fill=bpy.data.objects.get('Studio fill')
    if key:
        key.data.energy=1550
        key.data.size=7
        key.data.color=(1,.88,.71)
    if fill:
        fill.data.energy=800
        fill.data.size=8
        fill.data.color=(.78,.88,1)
    scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.60,.55,.48,1)
    scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.32
    background=paint('Style backdrop','D5CFC2',.95)
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0,0,-.25))
    register(bpy.context.object,'Studio backdrop',background,0,False)
    scene.render.film_transparent=False
    scene.cycles.samples=48
    scene.cycles.use_denoising=True
    # Respect an already enabled render GPU; retain CPU fallback elsewhere.
    cycles_preferences=bpy.context.preferences.addons['cycles'].preferences
    if any(device.use and device.type!='CPU' for device in cycles_preferences.devices):
        scene.cycles.device='GPU'
    scene.view_settings.view_transform='AgX'
    try:
        scene.view_settings.look='AgX - Medium High Contrast'
    except TypeError:
        pass
    scene.view_settings.exposure=0
    bpy.ops.object.camera_add(location=(13,-19,14))
    beauty=bpy.context.object
    beauty.name='Style - beauty camera'
    beauty.data.type='ORTHO'
    beauty.data.ortho_scale=16.7
    beauty.rotation_euler=(Vector((0,-.4,2.1))-beauty.location).to_track_quat('-Z','Y').to_euler()
    scene.camera=beauty
    # Open the saved file in the same pleasant three-quarter orientation.
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                area.spaces.active.region_3d.view_rotation=beauty.rotation_euler.to_quaternion()
                area.spaces.active.region_3d.view_distance=19
                area.spaces.active.region_3d.view_location=(0,-.4,2)
                area.spaces.active.region_3d.view_perspective='ORTHO'
                area.spaces.active.shading.type='MATERIAL'
                area.spaces.active.shading.use_scene_world=True
                area.spaces.active.shading.use_scene_lights=True
    bpy.ops.object.select_all(action='DESELECT')
    print('Styled the existing port:',len(collection.objects),'objects; original anchors retained.')


if __name__=='__main__':
    apply_style()
