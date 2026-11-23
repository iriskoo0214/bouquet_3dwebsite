# add stem cylinders + quantize (KHR_mesh_quantization)
import sys,struct,json,io,array,math
inp,out=sys.argv[1],sys.argv[2]
b=open(inp,'rb').read()
clen=struct.unpack('<I',b[12:16])[0]; j=json.loads(b[20:20+clen])
off=20+clen; blen=struct.unpack('<I',b[off:off+4])[0]; BIN=b[off+8:off+8+blen]
TY={5126:'f',5125:'I'}; NC={'SCALAR':1,'VEC2':2,'VEC3':3}
def acc(i):
    a=j['accessors'][i]; bv=j['bufferViews'][a['bufferView']]
    st=bv.get('byteOffset',0)+a.get('byteOffset',0); n=NC[a['type']]
    arr=array.array(TY[a['componentType']]); arr.frombytes(BIN[st:st+a['count']*n*arr.itemsize]); return arr
pr=j['meshes'][0]['primitives'][0]
P=acc(pr['attributes']['POSITION']); N=acc(pr['attributes']['NORMAL']) if 'NORMAL' in pr['attributes'] else None
UV=acc(pr['attributes']['TEXCOORD_0']); I=acc(pr['indices'])
from PIL import Image
im=j['images'][0]; ibv=j['bufferViews'][im['bufferView']]; tbytes=BIN[ibv['byteOffset']:ibv['byteOffset']+ibv['byteLength']]
tex=Image.open(io.BytesIO(tbytes)).convert('RGB'); W,H=tex.size
# pick green stem uv: vertex with y in [-0.7,-0.5] whose texel is greenest
best=None
for v in range(len(P)//3):
    y=P[3*v+1]
    if -0.7<y<-0.5:
        u,w=UV[2*v],UV[2*v+1]; r,g,bb=tex.getpixel((min(W-1,int(u%1*W)),min(H-1,int(w%1*H))))
        s=g-(r+bb)/2
        if g>150 and (best is None or s>best[0]): best=(s,u,w,(r,g,bb))
print('stem uv',best)
_,su,sv,_=best
# stems
import random; random.seed(3)
ytop,ybot=-0.20,-0.80; ax,az=0.0,0.10
stems=[]
for k in range(14):
    a=random.random()*2*math.pi; rr=0.045*math.sqrt(random.random())
    cx=ax+rr*math.cos(a)+0.0; cz=az+rr*math.sin(a)
    stems.append((cx,cz,0.009+random.random()*0.004,ybot+random.random()*0.05))
base=len(P)//3; seg=8
for (cx,cz,r,yb) in stems:
    s0=len(P)//3
    for yy in (ytop,yb):
        for i in range(seg):
            t=2*math.pi*i/seg; nx,nz=math.cos(t),math.sin(t)
            P.extend([cx+r*nx,yy,cz+r*nz]); 
            if N is not None: N.extend([nx,0.0,nz])
            UV.extend([su,sv])
    for i in range(seg):
        a0=s0+i; a1=s0+(i+1)%seg; b0=a0+seg; b1=a1+seg
        I.extend([a0,b0,a1, a1,b0,b1])
    # bottom cap
    c=len(P)//3; P.extend([cx,yb,cz]); 
    if N is not None: N.extend([0,-1,0])
    UV.extend([su,sv])
    for i in range(seg): I.extend([c,s0+seg+(i+1)%seg,s0+seg+i])
nv=len(P)//3; print('verts',nv,'tris',len(I)//3)
# quantize positions int16
mn=[min(P[i::3]) for i in range(3)]; mx=[max(P[i::3]) for i in range(3)]
ext=max(mx[i]-mn[i] for i in range(3)); ctr=[(mx[i]+mn[i])/2 for i in range(3)]; sc=ext/2/32767
QP=P
QN=array.array('b')
if N is not None:
    for v in range(nv):
        x,y,z=N[3*v:3*v+3]; l=math.sqrt(x*x+y*y+z*z) or 1
        QN.extend([int(round(x/l*127)),int(round(y/l*127)),int(round(z/l*127)),0])
umin=min(UV); umax=max(UV); print('uv range',umin,umax)
QU=array.array('H')
for x in UV: QU.append(int(round(min(1,max(0,x))*65535)))
blob=bytearray(); views=[]; accs=[]
def view(data,stride=None,target=None):
    while len(blob)%4: blob.append(0)
    o=len(blob); blob.extend(data); v={'buffer':0,'byteOffset':o,'byteLength':len(data)}
    if stride: v['byteStride']=stride
    if target: v['target']=target
    views.append(v); return len(views)-1
attrs={}
accs.append({'bufferView':view(QP.tobytes(),None,34962),'componentType':5126,'count':nv,'type':'VEC3','min':mn,'max':mx}); attrs['POSITION']=0
if N is not None:
    accs.append({'bufferView':view(QN.tobytes(),4,34962),'componentType':5120,'normalized':True,'count':nv,'type':'VEC3'}); attrs['NORMAL']=len(accs)-1
accs.append({'bufferView':view(QU.tobytes(),4,34962),'componentType':5123,'normalized':True,'count':nv,'type':'VEC2'}); attrs['TEXCOORD_0']=len(accs)-1
accs.append({'bufferView':view(I.tobytes(),None,34963),'componentType':5125,'count':len(I),'type':'SCALAR'}); ia=len(accs)-1
tv=view(tbytes)
while len(blob)%4: blob.append(0)
j['accessors']=accs; j['bufferViews']=views; j['buffers']=[{'byteLength':len(blob)}]
pr['attributes']=attrs; pr['indices']=ia; j['images'][0]={'bufferView':tv,'mimeType':'image/jpeg'}
node=j['nodes'][0]
j['extensionsUsed']=list(set(j.get('extensionsUsed',[])+['KHR_mesh_quantization'])); j['extensionsRequired']=['KHR_mesh_quantization']
j['asset']['generator']='bouquet-cut (from Higgsfield model)'
js=json.dumps(j,separators=(',',':')).encode()
while len(js)%4: js+=b' '
o=struct.pack('<4sII',b'glTF',2,12+8+len(js)+8+len(blob))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(blob),0x004E4942)+bytes(blob)
open(out,'wb').write(o); print('bytes',len(o))
