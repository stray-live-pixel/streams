"""Pack original Kenney OBJ geometry and palette colours into the offline HTML.
Requires Pillow. Original assets and their CC0 license are kept in assets/.
"""
from pathlib import Path
from PIL import Image
import json
ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT/'assets/kenney-fantasy-town/Models/OBJ format'
NAMES = ['wall-block','wall-wood-window-glass','wall-wood-door',
         'roof-gable','roof-high-point','windmill','stall-red','stall-green',
         'tree','tree-high','cart','fence','banner-red','chimney']
image = Image.open(SOURCE/'Textures/colormap.png').convert('RGB')
packed = {}
for name in NAMES:
    vertices, uvs, faces, palette = [], [], [], []
    for line in (SOURCE/(name+'.obj')).read_text().splitlines():
        a=line.split()
        if not a: continue
        if a[0]=='v': vertices.append([round(float(v),6) for v in a[1:4]])
        if a[0]=='vt': uvs.append(list(map(float,a[1:3])))
        if a[0]=='f':
            refs=[list(map(int,r.split('/')[:2])) for r in a[1:]]
            for i in range(1,len(refs)-1):
                tri=[refs[0],refs[i],refs[i+1]]
                uv=[sum(uvs[r[1]-1][k] for r in tri)/3 for k in range(2)]
                color=list(image.getpixel((min(511,max(0,int(uv[0]*512))),min(511,max(0,int((1-uv[1])*512))))))
                if color not in palette: palette.append(color)
                faces.append([*[r[0]-1 for r in tri],palette.index(color)])
    packed[name]={'p':vertices,'f':faces,'c':palette}
    print(name,len(vertices),'vertices',len(faces),'triangles')
payload=json.dumps(packed,separators=(',',':'))
html=(ROOT/'index.html').read_text()
start='<!-- KENNEY-ASSETS-BEGIN -->'
end='<!-- KENNEY-ASSETS-END -->'
block=start+'\n<script id="kenney-assets" type="application/json">'+payload+'</script>\n'+end
if start in html:
    html=html[:html.index(start)]+block+html[html.index(end)+len(end):]
else:
    html=html.replace('<script>\n',block+'\n<script>\n',1)
(ROOT/'index.html').write_text(html)
