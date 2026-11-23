import sys,struct,json,io,array
from PIL import Image
inp,out,R,RIB=sys.argv[1],sys.argv[2],float(sys.argv[3]),float(sys.argv[4])
b=open(inp,'rb').read()
clen=struct.unpack('<I',b[12:16])[0]; j=json.loads(b[20:20+clen])
off=20+clen; blen=struct.unpack('<I',b[off:off+4])[0]; BIN=b[off+8:off+8+blen]
TY={5126:'f',5125:'I',5123:'H',5121:'B'}; NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
def acc(i):
    a=j['accessors'][i]; bv=j['bufferViews'][a['bufferView']]
    st=bv.get('byteOffset',0)+a.get('byteOffset',0); n=NC[a['type']]; t=TY[a['componentType']]
    arr=array.array(t); arr.frombytes(BIN[st:st+a['count']*n*arr.itemsize]); return arr,n,a
pr=j['meshes'][0]['primitives'][0]
attrs={k:acc(v) for k,v in pr['attributes'].items()}
pos=attrs['POSITION'][0]; uv=attrs['TEXCOORD_0'][0]; idx,_,_=acc(pr['indices'])
im=j['images'][0]; ibv=j['bufferViews'][im['bufferView']]
tex=Image.open(io.BytesIO(BIN[ibv.get('byteOffset',0):ibv.get('byteOffset',0)+ibv['byteLength']])).convert('RGB'); W,H=tex.size
def tcol(t):
    s=[0,0,0]
    for k in range(3):
        v=idx[t+k]; px=tex.getpixel((min(W-1,int(uv[2*v]%1*W)),min(H-1,int(uv[2*v+1]%1*H))))
        for d in range(3): s[d]+=px[d]
    return [x/3 for x in s]
def green(c): r,g,bb=c; return g>r+8 and g>bb+25
def axis(y):
    if y<-0.3: return (0.0,0.11)
    f=(y+0.3)/0.18; return (0.0, 0.11+(0.02-0.11)*min(1,max(0,f)))
keep=[]
for t in range(0,len(idx),3):
    cx=sum(pos[3*idx[t+k]] for k in range(3))/3; cy=sum(pos[3*idx[t+k]+1] for k in range(3))/3; cz=sum(pos[3*idx[t+k]+2] for k in range(3))/3
    if cy>=-0.12: keep.append(t); continue
    if cy<-0.9: continue
    ax,az=axis(cy); d=((cx-ax)**2+(cz-az)**2)**.5
    if d>R: continue
    c=tcol(t)
    if green(c) or cy>RIB: keep.append(t)
# remove tiny floating comps below y<0
nv=len(pos)//3; rep={}; key={}
for v in range(nv):
    k=(round(pos[3*v],5),round(pos[3*v+1],5),round(pos[3*v+2],5)); rep[v]=key.setdefault(k,v)
par={}
def f(x):
    par.setdefault(x,x)
    while par[x]!=x: par[x]=par[par[x]]; x=par[x]
    return x
for t in keep:
    a,bb,c=(f(rep[idx[t+k]]) for k in range(3)); par[bb]=a; par[f(c)]=a
comp={}
for t in keep:
    r=f(rep[idx[t]]); e=comp.setdefault(r,[0,9]); e[0]+=1; e[1]=min(e[1],pos[3*idx[t]+1])
kept=[t for t in keep if not (comp[f(rep[idx[t]])][0]<40 and max(pos[3*idx[t+k]+1] for k in range(3))<0.0)]
print('tris before',len(idx)//3,'after cut',len(keep),'after debris',len(kept))
# compact vertices
remap={}; order=[]
newidx=array.array('I')
for t in kept:
    for k in range(3):
        v=idx[t+k]
        if v not in remap: remap[v]=len(order); order.append(v)
        newidx.append(remap[v])
# texture recompress
q=int(sys.argv[5]) if len(sys.argv)>5 else 82
tb=io.BytesIO(); tex.save(tb,'JPEG',quality=q,optimize=True); tbytes=tb.getvalue()
# build new BIN
blob=bytearray(); views=[]; accs=[]
def addview(data,target=None):
    while len(blob)%4: blob.append(0)
    o=len(blob); blob.extend(data); v={'buffer':0,'byteOffset':o,'byteLength':len(data)}
    if target: v['target']=target
    views.append(v); return len(views)-1
newattrs={}
for k,(arr,n,a) in attrs.items():
    na=array.array(arr.typecode)
    for v in order: na.extend(arr[v*n:(v+1)*n])
    bvi=addview(na.tobytes(),34962)
    acc_={'bufferView':bvi,'componentType':a['componentType'],'count':len(order),'type':a['type']}
    if a.get('normalized'): acc_['normalized']=True
    if k=='POSITION':
        acc_['min']=[min(na[i::3]) for i in range(3)]; acc_['max']=[max(na[i::3]) for i in range(3)]
    accs.append(acc_); newattrs[k]=len(accs)-1
ibvi=addview(newidx.tobytes(),34963); accs.append({'bufferView':ibvi,'componentType':5125,'count':len(newidx),'type':'SCALAR'}); iacc=len(accs)-1
tbvi=addview(tbytes)
while len(blob)%4: blob.append(0)
j['accessors']=accs; j['bufferViews']=views; j['buffers']=[{'byteLength':len(blob)}]
pr['attributes']=newattrs; pr['indices']=iacc
j['images'][0]={'bufferView':tbvi,'mimeType':'image/jpeg'}
js=json.dumps(j,separators=(',',':')).encode()
while len(js)%4: js+=b' '
total=12+8+len(js)+8+len(blob)
o=struct.pack('<4sII',b'glTF',2,total)+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(blob),0x004E4942)+bytes(blob)
open(out,'wb').write(o); print('out bytes',len(o),'texture',len(tbytes),'verts',len(order))
