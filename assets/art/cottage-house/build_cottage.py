"""Cottage reference v1, handmade geometry. Run in Blender's Python console/MCP.

Creates an isolated scene and saves a new copy without modifying the previously
open port file. finalize_cottage.py strips unrelated scenes from that copy.
Z is up, front faces -Y, ground is Z=0.
"""
import bpy
import math
import random
from mathutils import Vector

ROOT = '/Users/kirilleremin/Desktop/stream/ostrov/assets/art/cottage-house/'
random.seed(71)
scene = bpy.data.scenes.new('Cottage house studio')
bpy.context.window.scene = scene
collection = bpy.data.collections.new('Cottage house geometry')
scene.collection.children.link(collection)
root = bpy.data.objects.new('Cottage house', None)
collection.objects.link(root)

def material(name, color):
    m = bpy.data.materials.new('Cottage ' + name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = .86
    return m

plaster = material('plaster ivory', (.77, .65, .44))
wood = material('timber honey', (.33, .145, .042))
woodlight = material('wood cut ends', (.45, .235, .075))
doorwood = [material('wood door %d' % i, (.34+i*.022, .12+i*.009, .032)) for i in range(4)]
tiles = [material('roof terracotta %d' % i, (.61+i*.026, .155+i*.009, .033+i*.003)) for i in range(5)]
stone = [material('stone warm %d' % i, (.35+i*.032, .32+i*.029, .255+i*.026)) for i in range(4)]
teal = material('window teal frame', (.045, .18, .155))
glass = [material('glass %d' % i, c) for i,c in enumerate([(.13,.34,.31),(.25,.45,.36),(.63,.48,.20),(.83,.65,.29)])]
iron = material('iron dark', (.07,.075,.065))
leaf = [material('leaf %d' % i,c) for i,c in enumerate([(.16,.27,.035),(.25,.37,.045),(.38,.46,.07)])]
petal = material('petal cream', (.91,.86,.66))
yellow = material('flower gold', (.82,.49,.055))
dark = material('chimney soot', (.065,.063,.054))

def finish(obj, mat, bevel=0):
    for c in list(obj.users_collection): c.objects.unlink(obj)
    collection.objects.link(obj)
    obj.parent = root
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Soft cut edges','BEVEL')
        mod.width = bevel
        mod.segments = 1
        mod = obj.modifiers.new('Weighted broad faces','WEIGHTED_NORMAL')
        mod.keep_sharp = True
    return obj

def box(name, pos, size, mat, bevel=.035):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(obj,mat,bevel)

def mesh(name, verts, faces, mat, bevel=0):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts,[],faces)
    data.update()
    obj = bpy.data.objects.new(name,data)
    collection.objects.link(obj)
    obj.parent = root
    obj.data.materials.append(mat)
    if bevel:
        mod=obj.modifiers.new('Soft edges','BEVEL'); mod.width=bevel; mod.segments=1
        mod=obj.modifiers.new('Weighted faces','WEIGHTED_NORMAL'); mod.keep_sharp=True
    return obj

def beam(name,a,b,width,depth,mat=wood):
    a,b=Vector(a),Vector(b)
    obj=box(name,(a+b)/2,(width,depth,(b-a).length),mat,.035)
    obj.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    return obj

# Solid plaster body and gables with consistent outward winding.
box('Plaster ground floor',(0,0,1.62),(4,3.2,2.64),plaster,.07)
mesh('Plaster attic',[(-2,-1.6,2.94),(2,-1.6,2.94),(0,-1.6,5.12),(-2,1.6,2.94),(2,1.6,2.94),(0,1.6,5.12)],[(0,1,2),(5,4,3),(0,3,4,1),(1,4,5,2),(2,5,3,0)],plaster)
# Stone foundation, closed at bottom; irregular individual blocks.
box('Foundation core',(0,0,.23),(4.13,3.32,.46),stone[0],.045)
for y in [-1.65,1.65]:
    for i in range(7):
        o=box('Foundation front back block',(-1.8+i*.60,y,.24),(.58,.23,.45+random.uniform(-.035,.035)),random.choice(stone),.055)
        o.rotation_euler[1]=random.uniform(-.025,.025)
for x in [-2.04,2.04]:
    for i in range(5): box('Foundation side block',(x,-1.25+i*.62,.24),(.22,.60,.45),random.choice(stone),.055)
# Structural frame and deep eaves.
for x in [-1.91,1.91]:
    for y in [-1.54,1.54]: box('Corner timber',(x,y,1.69),(.25,.25,2.60),wood,.045)
for y in [-1.64,1.64]:
    box('Gable sill timber',(0,y,2.89),(4.25,.24,.28),wood,.045)
    for x in [-1.91,1.91]:
        beam('Ground diagonal brace',(x,y,2.68),(x-math.copysign(.55,x),y,2.05),.15,.18)
    for x in [-1.16,1.16]:
        beam('Attic upright',(x,y,3.02),(x,y,3.80),.16,.19)
    for sign in [-1,1]:
        beam('Heavy gable bargeboard',(sign*2.26,y*1.13,2.84),(0,y*1.13,5.29),.26,.26)
    box('Gable apex cut end',(0,y*1.15,5.12),(.29,.30,.43),woodlight,.05)
for x in [-2.08,2.08]: box('Side eave beam',(x,0,2.89),(.24,3.76,.24),wood,.035)
# Roof base and individual slightly barrel-shaped overlapping terracotta tiles.
# Each tile is a closed six-section shell, not a flat decal.
for sign in [-1,1]:
    verts=[(0,-1.91,5.26),(sign*2.38,-1.91,2.72),(sign*2.38,1.91,2.72),(0,1.91,5.26)]
    if sign<0: verts.reverse()
    mesh('Roof dark underlay',verts,[(0,1,2,3)],wood)
    for row in range(7):
        x0=.015+row*.329
        length=.46 if row<6 else .39
        for col in range(8):
            yc=-1.68+col*.48+(random.uniform(-.008,.008))
            verts=[]
            for along in [0,1]:
                x=x0+length*along
                for j in range(5):
                    t=j/4
                    y=yc+(t-.5)*.505
                    z=5.30-x*(2.54/2.38)+.065*math.sin(math.pi*t)+.015*(7-row)
                    verts.append((sign*x,y,z))
            verts += [(x,y,z-.065) for x,y,z in verts]
            faces=[]
            for j in range(4):
                faces.extend([(j,j+5,j+6,j+1),(j+10,j+11,j+16,j+15)])
            faces.extend([(0,1,2,3,4,14,13,12,11,10),(5,15,16,17,18,19,9,8,7,6),(0,10,15,5),(4,9,19,14)])
            if sign<0: faces=[tuple(reversed(f)) for f in faces]
            mesh('Roof overlapping tile %d %d %d'%(sign,row,col),verts,faces,random.choice(tiles))
# Ridge rounded caps, hollow semicircular cross section with closed ends.
for i in range(8):
    verts=[]
    for y in [-1.93+i*.48,-1.40+i*.48]:
        for radius in [.22,.15]:
            for j in range(7):
                a=j*math.pi/6
                verts.append((math.cos(a)*radius,y,5.29+math.sin(a)*radius))
    faces=[]
    for j in range(6): faces.extend([(j,j+14,j+15,j+1),(j+7,j+8,j+22,j+21),(j,j+1,j+8,j+7),(j+14,j+21,j+22,j+15)])
    faces.extend([(0,7,21,14),(6,20,27,13)])
    mesh('Roof ridge cap',verts,faces,tiles[(i+2)%5])
# Window assembly: local coordinates u across facade, n outward, z up.
def window(name, center, side=False, scale=1):
    cx,cy,cz=center
    def pos(u,n,z): return (cx+n,cy+u,cz+z) if side else (cx+u,cy-n,cz+z)
    def size(u,n,z): return (n,u,z) if side else (u,n,z)
    w=.82*scale; h=.91*scale
    box(name+' dark recess',pos(0,.018,0),size(w+.13,.07,h+.1),iron,.01)
    for a in [-1,1]:
        box(name+' jamb',pos(a*(w/2+.065),.10,0),size(.135,.16,h+.23),woodlight,.023)
        box(name+' horizontal timber',pos(0,.12,a*(h/2+.09)),size(w+.39,.21,.18),woodlight,.03)
    for u in [-1,1]:
        for z in [-1,1]:
            box(name+' glass pane',pos(u*w/4,.064,z*h/4),size(w/2-.035,.018,h/2-.038),glass[(0 if u<0 else 1)+(2 if z<0 else 0)],.005)
    box(name+' mullion',pos(0,.095,0),size(.057,.055,h),teal,.008)
    box(name+' crossbar',pos(0,.095,0),size(w,.055,.060),teal,.008)

window('Front window',(-.99,-1.62,1.57))
window('Attic window',(0,-1.62,3.82),scale=.84)
window('East window',(2.02,.12,1.57),side=True)
window('West window',(-2.02,.0,1.57),side=True)
window('Back window',(.65,1.62,1.57))
# Correct outward-facing west/back windows by mirror around their local facade.
for obj in list(collection.objects):
    if obj.name.startswith('West window'): obj.location.x=-4.04-obj.location.x
    if obj.name.startswith('Back window'): obj.location.y=3.24-obj.location.y
# Door on the front right, recessed dark reveals and individually visible boards.
dx=.70
box('Door shadow',(dx,-1.632,1.34),(1.17,.07,1.97),iron,.02)
for i in range(6): box('Door vertical plank',(dx-.45+i*.18,-1.686,1.34),(.174,.07,1.89),doorwood[i%4],.009)
for x in [-.6,.6]: box('Door thick jamb',(dx+x,-1.76,1.35),(.17,.21,2.12),woodlight,.035)
box('Door lintel',(dx,-1.76,2.39),(1.46,.24,.24),woodlight,.04)
for z in [.75,1.95]:
    box('Door iron strap',(dx+.04,-1.74,z),(.78,.055,.105),iron,.015)
    for x in [-.24,.32]: box('Door strap rivet',(dx+x,-1.775,z),(.042,.022,.042),stone[1],.009)
plate=box('Door knocker plate',(dx-.30,-1.76,1.39),(.12,.055,.15),iron,.012)
bpy.ops.mesh.primitive_torus_add(major_segments=10,minor_segments=4,location=(dx-.30,-1.82,1.29),major_radius=.08,minor_radius=.021,rotation=(math.pi/2,0,0))
finish(bpy.context.object,iron); bpy.context.object.name='Door iron ring'
for z,y,w,d in [(.29,-1.94,1.45,.65),(.105,-2.21,1.72,.54)]: box('Front stone step',(dx,y,z),(w,d,.21),stone[3],.055)
# Flower box, readable low-poly greenery, cream daisies.
box('Window flower box',(-.99,-1.87,.98),(1.18,.36,.30),woodlight,.035)
for x in [-1.39,-.59]: box('Flower box bracket',(x,-1.77,.82),(.12,.22,.30),wood,.02)
for z in [.91,1.06]: box('Flower box long plank',(-.99,-2.045,z),(1.20,.065,.12),wood,.018)
for i in range(11):
    x=-1.48+i*.096; y=-1.88+random.uniform(-.12,.09); z=1.18+random.uniform(-.02,.09)
    for j in range(2):
        angle=random.uniform(0,math.tau)
        direction=Vector((math.cos(angle)*.18,math.sin(angle)*.14,.10))
        center=Vector((x,y,z))
        width=Vector((-math.sin(angle)*.065,math.cos(angle)*.065,0))
        mesh('Flower box pointed leaf',[center-direction*.3,center+width,center+direction,center-width,center+Vector((0,0,.035))],[(4,1,0),(4,2,1),(4,3,2),(4,0,3),(0,1,2,3)],random.choice(leaf))
for x,y,z in [(-1.30,-1.94,1.34),(-.84,-2.00,1.29),(-.55,-1.84,1.35)]:
    for j in range(5):
        a=j*math.tau/5; c=Vector((x,y,z)); u=Vector((math.cos(a),math.sin(a),.3)); v=Vector((-math.sin(a),math.cos(a),0))
        mesh('Daisy cream petal',[c,c+u*.12-v*.042,c+u*.17,c+u*.12+v*.042],[(0,1,2,3)],petal)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.038,location=(x,y,z+.015)); finish(bpy.context.object,yellow); bpy.context.object.name='Daisy golden heart'
# Cream chimney intersects roof cleanly; four cap stones leave real dark opening.
box('Chimney plaster shaft',(1.15,.72,4.35),(.51,.57,1.37),plaster,.04)
for x,y,s in [(1.15,.37,(.72,.18,.20)),(1.15,1.07,(.72,.18,.20)),(.88,.72,(.18,.53,.20)),(1.42,.72,(.18,.53,.20))]: box('Chimney cap stone',(x,y,5.14),s,plaster,.035)
box('Chimney dark opening',(1.15,.72,5.055),(.42,.46,.025),dark,.0)

# Lightweight Workbench studio; excluded from geometry collection/runtime export.
studio=bpy.data.collections.new('Cottage studio'); scene.collection.children.link(studio)
camdata=bpy.data.cameras.new('Cottage camera'); cam=bpy.data.objects.new('Cottage camera',camdata); studio.objects.link(cam)
cam.location=(8,-11,7.3); target=Vector((0,-.1,2.55)); cam.rotation_euler=(target-Vector(cam.location)).to_track_quat('-Z','Y').to_euler(); camdata.type='ORTHO'; camdata.ortho_scale=7.4; scene.camera=cam
scene.render.engine='BLENDER_WORKBENCH'
scene.display.shading.light='STUDIO'; scene.display.shading.color_type='MATERIAL'; scene.display.shading.show_shadows=True; scene.display.shading.show_cavity=True
scene.display.shading.cavity_type='BOTH'; scene.display.shading.curvature_ridge_factor=1.1; scene.display.shading.curvature_valley_factor=1.0
scene.display.shading.background_type='WORLD'; scene.world=bpy.data.worlds.new('Cottage warm studio'); scene.world.color=(.72,.66,.56)
scene.render.resolution_x=900; scene.render.resolution_y=900; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.film_transparent=False
scene.view_settings.view_transform='Standard'
bpy.ops.object.select_all(action='DESELECT'); root.select_set(True); bpy.context.view_layer.objects.active=root
bpy.ops.wm.save_as_mainfile(filepath=ROOT+'cottage-house.blend')
scene.render.filepath=ROOT+'preview.png'; bpy.ops.render.render(write_still=True)
print('COTTAGE_CREATED',len(collection.objects),'objects; standalone blend saved')
