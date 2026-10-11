"""Run with Blender --background cottage-house.blend --python this_file.

Strip unrelated scenes from the saved copy, audit evaluated geometry, and make
fast studio previews. The previously opened port file is never overwritten.
"""
import bpy
import json
from pathlib import Path
from mathutils import Vector

directory=Path(bpy.data.filepath).parent
scene=bpy.data.scenes['Cottage house studio']
bpy.context.window.scene=scene
for other in list(bpy.data.scenes):
    if other!=scene: bpy.data.scenes.remove(other)
bpy.data.orphans_purge(do_recursive=True)
# Use a light warm collar matching the plaster, not the foundation stone.
plaster=bpy.data.materials['Cottage plaster ivory']
for obj in bpy.data.collections['Cottage house geometry'].objects:
    if obj.name.startswith('Chimney cap stone'): obj.data.materials[0]=plaster

dg=bpy.context.evaluated_depsgraph_get()
count=0; triangles=0; vertices=0; zero_area=0; negative_volumes=[]; bounds=[]
for obj in bpy.data.collections['Cottage house geometry'].objects:
    if obj.type!='MESH': continue
    count+=1
    evaluated=obj.evaluated_get(dg); data=evaluated.to_mesh(); data.calc_loop_triangles()
    triangles+=len(data.loop_triangles); vertices+=len(data.vertices)
    volume=0
    for tri in data.loop_triangles:
        a,b,c=[data.vertices[i].co for i in tri.vertices]
        if (b-a).cross(c-a).length<1e-9: zero_area+=1
        volume+=a.dot(b.cross(c))/6
    if volume < -1e-7: negative_volumes.append(obj.name)
    bounds.extend([obj.matrix_world@Vector(v) for v in obj.bound_box])
    evaluated.to_mesh_clear()
audit={'objects':count,'evaluated_triangles':triangles,'evaluated_vertices':vertices,'zero_area_triangles':zero_area,'negative_signed_volume_objects':negative_volumes,'source_bounds':[[min(v[i] for v in bounds),max(v[i] for v in bounds)] for i in range(3)],'smoke_anchor_blender':[1.15,.72,5.24],'axes':'Blender Z up, front -Y; OBJ Y up, front +Z','note':'Decorative flower petals and roof underlay are intentionally open; main walls, roof tiles and chimney solids are closed.'}
(directory/'model-audit.json').write_text(json.dumps(audit,indent=2)+'\n')

scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=900; scene.render.resolution_y=900
scene.world.use_nodes=True
background=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND')
background.inputs['Color'].default_value=(.72,.76,.82,1)
background.inputs['Strength'].default_value=.25
studio=bpy.data.collections['Cottage studio']
for old in list(studio.objects):
    if old.type=='LIGHT': bpy.data.objects.remove(old,do_unlink=True)
for name,pos,power,size in [('Warm key',( -4,-6,10),375,6),('Soft fill',(5,-2,6),225,5),('Rim',(2,5,8),275,4)]:
    data=bpy.data.lights.new(name,'AREA'); data.energy=power; data.shape='DISK'; data.size=size
    light=bpy.data.objects.new(name,data); studio.objects.link(light); light.location=pos
    light.rotation_euler=(Vector((0,0,2))-light.location).to_track_quat('-Z','Y').to_euler()
scene.render.film_transparent=True
scene.render.filepath=str(directory/'preview.png'); bpy.ops.render.render(write_still=True)
# Four reference views use Workbench and finish quickly.
scene.render.engine='BLENDER_WORKBENCH'; scene.render.film_transparent=False
scene.render.resolution_x=600; scene.render.resolution_y=600
for name,pos in [('front',(0,-11,3)),('back',(0,11,3)),('right',(11,0,3)),('top',(0,0,14))]:
    scene.camera.location=pos
    scene.camera.rotation_euler=(Vector((0,-.1,2.6))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(directory/('view-'+name+'.png')); bpy.ops.render.render(write_still=True)
scene.camera.location=(8,-11,7.3); scene.camera.rotation_euler=(Vector((0,-.1,2.55))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x=900; scene.render.resolution_y=900
scene.render.filepath=str(directory/'preview.png')
bpy.ops.wm.save_as_mainfile(filepath=str(directory/'cottage-house.blend'))
print(json.dumps(audit))
