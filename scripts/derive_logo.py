"""Derivar alfa del PNG oficial sobre negro; no generar, escalar ni redibujar.

Herramienta de preparación, no dependencia del juego ni del empaquetado.
Requiere Pillow y NumPy. Conserva los píxeles opacos y desmatiza únicamente
la franja antialias para no arrastrar el fondo negro al marfil.
"""
from pathlib import Path
from collections import deque
import hashlib,json
from PIL import Image,ImageFilter
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
ORIGINAL=ROOT/'assets/Cerconexo_logo_v3_original.png'
EXPECTED='07aa639bf3c8c69fb951797df954db2bb540d186e283d2d9626a5edd8d3ec4c2'

def derive():
    assert hashlib.sha256(ORIGINAL.read_bytes()).hexdigest()==EXPECTED,'El original oficial cambió'
    image=Image.open(ORIGINAL).convert('RGB')
    rgb=np.asarray(image).copy()
    value=rgb.max(axis=2)
    strong=np.asarray(Image.fromarray(((value>22)*255).astype('uint8')).filter(ImageFilter.MinFilter(5)))>0
    support=np.asarray(Image.fromarray((strong*255).astype('uint8')).filter(ImageFilter.MaxFilter(9)))>0
    mask=(value>1)&support
    # El original contiene leves residuos de compresión en el fondo negro.
    # Quitar solo motas desconectadas; ninguna pieza real del logo es tan pequeña.
    seen=np.zeros(mask.shape,dtype=bool)
    height,width=mask.shape
    removed=0
    for y,x in zip(*np.where(mask)):
        if seen[y,x]:continue
        queue=deque([(y,x)]);seen[y,x]=True;component=[]
        while queue:
            r,c=queue.popleft();component.append((r,c))
            for nr,nc in [(r-1,c),(r+1,c),(r,c-1),(r,c+1)]:
                if 0<=nr<height and 0<=nc<width and mask[nr,nc] and not seen[nr,nc]:
                    seen[nr,nc]=True;queue.append((nr,nc))
        if len(component)<24:
            for r,c in component:mask[r,c]=False
            removed+=len(component)
    core=strong
    local=np.asarray(Image.fromarray(value).filter(ImageFilter.MaxFilter(9))).astype(float)
    alpha=np.where(core,1,np.where(mask,value/np.maximum(local,1),0))
    alpha8=np.rint(alpha*255).astype('uint8')
    rgba=np.zeros((*mask.shape,4),dtype='uint8')
    rgba[:,:,:3]=np.clip(np.rint(rgb.astype(float)*255/np.maximum(alpha8[:,:,None],1)),0,255).astype('uint8')
    rgba[alpha8==0,:3]=0
    rgba[:,:,3]=alpha8
    full=Image.fromarray(rgba)
    def save_png(image,name):
        target=ROOT/'assets'/name
        temporary=target.with_suffix('.tmp.png')
        image.save(temporary)
        temporary.replace(target)
    save_png(full,'Cerconexo_logo_v3_transparente.png')
    # Exactamente el mismo recorte y proporciones que la cabecera aprobada.
    left,top=round(width*.15),round(height*.674)
    crop=(left,top,left+round(width*.70),top+round(height*.17))
    wordmark=full.crop(crop)
    save_png(wordmark,'Cerconexo_wordmark_transparente.png')
    assert np.array_equal(rgba[core,:3],rgb[core]),'Colores interiores alterados'
    black=np.asarray(Image.alpha_composite(Image.new('RGBA',full.size,'black'),full))[:,:,:3]
    retained=alpha8>0
    max_error=int(np.abs(black.astype(int)-rgb.astype(int))[retained].max())
    assert max_error<=1,'La desmatización cambió el aspecto sobre negro'
    assert hashlib.sha256(ORIGINAL.read_bytes()).hexdigest()==EXPECTED
    return {'originalSHA256':EXPECTED,'fullSize':full.size,'wordmarkSize':wordmark.size,'crop':crop,
            'opaquePixelsUnchanged':int(core.sum()),'blackRecompositionMaxError':max_error,'removedBackgroundSpeckles':removed}

if __name__=='__main__':
    print(json.dumps(derive(),ensure_ascii=False,indent=2))
