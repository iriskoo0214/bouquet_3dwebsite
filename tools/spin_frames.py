import sys,glob,os
import numpy as np
from PIL import Image, ImageFilter
src,out,mode=sys.argv[1],sys.argv[2],sys.argv[3]
files=sorted(glob.glob(src+'/f*.png')); plate=np.load(out+'/_plate.npy')
def matte(a):
    d=np.sqrt(((a-plate)**2).sum(-1)); s=a.max(-1)-a.min(-1)
    al=np.clip((np.maximum(d,s*1.2)-10)/(24-10),0,1)
    im=Image.fromarray((al*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.4))
    return np.asarray(im).astype(np.float32)/255
def rgba(i):
    a=np.asarray(Image.open(files[i]).convert('RGB')).astype(np.float32); al=matte(a)
    # 가장자리의 회색 배경 번짐 제거 (언프리멀티플라이)
    fg=np.clip((a-plate*(1-al[...,None]))/np.maximum(al[...,None],0.05),0,255)
    fg=np.where(al[...,None]>0.98,a,fg)
    return Image.fromarray(np.dstack([fg,al*255]).astype(np.uint8))
if mode=='check':
    o=Image.new('RGB',(640*4,640))
    for k,i in enumerate((0,60,120,180)):
        bg=Image.new('RGBA',(640,640),(236,228,214,255)); bg.alpha_composite(rgba(i)); o.paste(bg.convert('RGB'),(640*k,0))
    o.resize((1600,400)).save(out+'/sheet2.jpg')
else:
    n=int(mode); os.makedirs(sys.argv[4],exist_ok=True); tot=0
    idx=np.linspace(0,len(files)-1,n,endpoint=False).round().astype(int)
    for k,i in enumerate(idx):
        p=f'{sys.argv[4]}/{k:03d}.webp'; rgba(i).save(p,'WEBP',quality=82,method=6); tot+=os.path.getsize(p)
    print(n,'frames',round(tot/1e6,2),'MB')
