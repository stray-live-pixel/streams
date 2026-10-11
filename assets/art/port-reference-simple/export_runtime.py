import bpy
selected = list(bpy.context.selected_objects)
active = bpy.context.view_layer.objects.active
temporary_objects = []
temporary_meshes = []
depsgraph = bpy.context.evaluated_depsgraph_get()
try:
    bpy.ops.object.select_all(action='DESELECT')
    for source in bpy.data.collections['Port - shared geometry'].all_objects:
        if source.type not in {'MESH', 'CURVE'} or source.hide_get() or source.hide_render:
            continue
        mesh = bpy.data.meshes.new_from_object(source.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph)
        obj = bpy.data.objects.new('Export - ' + source.name, mesh)
        temporary_meshes.append(mesh)
        temporary_objects.append(obj)
        bpy.context.scene.collection.objects.link(obj)
        obj.matrix_world = source.matrix_world.copy()
        obj.select_set(True)
    bpy.ops.wm.obj_export(filepath=bpy.path.abspath('//port.obj'), export_selected_objects=True, forward_axis='NEGATIVE_Z', up_axis='Y', apply_modifiers=False, export_uv=False, export_normals=True, export_materials=True, export_triangulated_mesh=True)
    print('Exported', len(temporary_objects), 'evaluated objects without duplicate curve geometry.')
finally:
    for obj in temporary_objects:
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in temporary_meshes:
        bpy.data.meshes.remove(mesh)
    for obj in selected:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = active
