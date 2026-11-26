# Tripo GLB -> 생화 재질 GLB: 색 텍스처만 남기고(2048 JPEG), 무광·양면·sheen(꽃잎 벨벳)·낮은 specular
import sys,struct,json,io
from PIL import Image
src,dst=sys.argv[1],sys.argv[2]
P=dict(rough=float(sys.argv[3]) if len(sys.argv)>3 else 0.85, sheen=float(sys.argv[4]) if len(sys.argv)>4 else 0.5)
b=open(src,'rb').read()
cl=struct.unpack('<I',b[12:16])[0]; j=json.loads(b[20:20+cl])
off=20+cl; bl=struct.unpack('<I',b[off:off+4])[0]; BIN=b[off+8:off+8+bl]
def view(i):
    bv=j['bufferViews'][i]; o=bv.get('byteOffset',0); return BIN[o:o+bv['byteLength']]
# 새 버퍼: 기하 bufferView만 복사 + 새 텍스처
mat=j['materials'][0]; base_img=j['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
img=Image.open(io.BytesIO(view(j['images'][base_img]['bufferView']))).convert('RGB').resize((2048,2048),Image.LANCZOS)
buf=io.BytesIO(); img.save(buf,'JPEG',quality=88,optimize=True); tex=buf.getvalue()
image_views={im['bufferView'] for im in j['images']}
out=bytearray(); newviews=[]; remap={}
for i,bv in enumerate(j['bufferViews']):
    if i in image_views: continue
    while len(out)%4: out.append(0)
    nb=dict(bv); nb['byteOffset']=len(out); nb['buffer']=0; out+=view(i); remap[i]=len(newviews); newviews.append(nb)
while len(out)%4: out.append(0)
newviews.append({'buffer':0,'byteOffset':len(out),'byteLength':len(tex)}); out+=tex
for a in j['accessors']: a['bufferView']=remap[a['bufferView']]
j['bufferViews']=newviews; j['buffers']=[{'byteLength':len(out)}]
j['images']=[{'bufferView':len(newviews)-1,'mimeType':'image/jpeg'}]
j['textures']=[{'source':0}]
j['materials']=[{
  'name':'live_petal',
  'pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0.0,'roughnessFactor':P['rough']},
  'doubleSided':True,
  'extensions':{
    'KHR_materials_sheen':{'sheenColorFactor':[P['sheen']]*3,'sheenColorTexture':{'index':0},'sheenRoughnessFactor':0.7},
    'KHR_materials_specular':{'specularFactor':0.35}}}]
j['extensionsUsed']=['KHR_materials_sheen','KHR_materials_specular']
js=json.dumps(j,separators=(',',':')).encode()
while len(js)%4: js+=b' '
total=12+8+len(js)+8+len(out)
with open(dst,'wb') as f:
    f.write(struct.pack('<III',0x46546C67,2,total)); f.write(struct.pack('<II',len(js),0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II',len(out),0x004E4942)); f.write(out)
print(dst, round(total/1e6,2),'MB')
