import sys,glob,os
import numpy as np
from PIL import Image, ImageFilter
src,out=sys.argv[1],sys.argv[2]; os.makedirs(out,exist_ok=True)
files=sorted(glob.glob(src+'/f*.png'))
load=lambda f: np.asarray(Image.open(f).convert('RGB')).astype(np.float32)
stack=np.stack([load(f) for f in files[::2]])
sat=lambda a: a.max(-1)-a.min(-1)
# pass1: 배경 후보 = 채도 낮고 밝기 220~242 (흰 손잡이·꽃·철사 제외)
lum=stack.mean(-1)
cand=(sat(stack)<10)&(lum>205)&(lum<243)
m=np.where(cand[...,None],stack,np.nan)
plate=np.nanmedian(m,axis=0)
# 한 번도 배경이 안 보인 자리는 주변으로 채움
hole=np.isnan(plate[...,0])
smooth=np.asarray(Image.fromarray(np.nan_to_num(plate,nan=231).astype(np.uint8)).filter(ImageFilter.GaussianBlur(25))).astype(np.float32)
plate[hole]=smooth[hole]
print('holes',hole.sum())
Image.fromarray(plate.astype(np.uint8)).save(out+'/_plate.png')
np.save(out+'/_plate.npy',plate)
