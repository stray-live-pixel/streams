"""Export only evaluated cottage geometry, preserving corner normals."""
import bpy
ROOT = '/Users/kirilleremin/Desktop/stream/ostrov/assets/art/cottage-house/'
collection = bpy.data.collections['Cottage house geometry']
dg = bpy.context.evaluated_depsgraph_get()
objects = []
meshes = []
selected = list(bpy.context.selected_objects)
active = bpy.context.view_layer.objects.active
try:
    bpy.ops.object.select_all(action='DESELECT')
    for source in collection.objects:
        if source.type != 'MESH':
            continue
        data = bpy.data.meshes.new_from_object(source.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
        obj = bpy.data.objects.new(source.name + ' export', data)
        bpy.context.scene.collection.objects.link(obj)
        obj.matrix_world = source.matrix_world.copy()
        obj.select_set(True)
        objects.append(obj)
        meshes.append(data)
    bpy.ops.wm.obj_export(filepath=ROOT+'cottage-house.obj', export_selected_objects=True, forward_axis='NEGATIVE_Z', up_axis='Y', apply_modifiers=False, export_uv=False, export_normals=True, export_materials=True, export_triangulated_mesh=True)
    print('Exported',len(objects),'cottage meshes')
finally:
    for obj in objects: bpy.data.objects.remove(obj, do_unlink=True)
    for data in meshes: bpy.data.meshes.remove(data)
    for obj in selected: obj.select_set(True)
    bpy.context.view_layer.objects.active=active
