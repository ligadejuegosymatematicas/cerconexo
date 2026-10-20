import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const asset=name=>new URL('../assets/'+name,import.meta.url);

// Lector PNG mínimo para probar los píxeles sin dependencias de CI.
async function png(name){
  const bytes=await readFile(asset(name));assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  let width,height,channels;const chunks=[];
  for(let offset=8;offset<bytes.length;){
    const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8),data=bytes.subarray(offset+8,offset+8+length);
    if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);assert.equal(data[8],8);assert.ok([2,6].includes(data[9]));channels=data[9]===6?4:3;assert.equal(data[12],0);}
    if(type==='IDAT')chunks.push(data);offset+=length+12;
  }
  const raw=inflateSync(Buffer.concat(chunks)),stride=width*channels,pixels=Buffer.alloc(stride*height);
  const paeth=(a,b,c)=>{const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c;};
  for(let y=0;y<height;y++){
    const filter=raw[y*(stride+1)];assert.ok(filter<=4);
    for(let x=0;x<stride;x++){
      const i=y*stride+x,a=x>=channels?pixels[i-channels]:0,b=y?pixels[i-stride]:0,c=y&&x>=channels?pixels[i-stride-channels]:0;
      const predict=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];
      pixels[i]=(raw[y*(stride+1)+1+x]+predict)&255;
    }
  }
  return {width,height,channels,pixels};
}
test('Los PNG oficiales permanecen intactos',async()=>{
  for(const [name,sha] of [['Cerconexo_logo_v3_original.png','07aa639bf3c8c69fb951797df954db2bb540d186e283d2d9626a5edd8d3ec4c2'],['Cerconexo_wordmark_original.png','2f61e7ddb232b7c3dbd2c17bf62b355262449c4b22db9858b2044e9c068d126f']])assert.equal(createHash('sha256').update(await readFile(asset(name))).digest('hex'),sha);
});
test('El derivado conserva dimensiones y colores opacos; alfa desmatizada sin cambiar el aspecto sobre negro',async()=>{
  // El archivo oficial lleva extensión .png pero su contenido es JPEG.
  // Usar el recorte PNG existente como referencia decodificada sin añadir un códec a CI.
  const original=await png('Cerconexo_wordmark_original.png'),derived=await png('Cerconexo_wordmark_transparente.png');
  assert.equal(derived.width,original.width);assert.equal(derived.height,original.height);assert.equal(derived.channels,4);
  let opaque=0,transparent=0,edge=0;
  for(let i=0;i<derived.width*derived.height;i++){
    const alpha=derived.pixels[i*4+3];
    if(!alpha){transparent++;continue;}
    if(alpha===255)opaque++;else edge++;
    for(let c=0;c<3;c++){
      const source=original.pixels[i*3+c],value=derived.pixels[i*4+c];
      if(alpha===255)assert.equal(value,source);
      assert.ok(Math.abs(Math.round(value*alpha/255)-source)<=1);
    }
  }
  assert.ok(opaque>60000&&transparent>100000&&edge>1000);
});
test('El wordmark usa exactamente el recorte aprobado, sin escalar ni redibujar',async()=>{
  const full=await png('Cerconexo_logo_v3_transparente.png'),word=await png('Cerconexo_wordmark_transparente.png');
  assert.deepEqual([full.width,full.height],[1536,1152]);
  assert.equal(word.width,1075);assert.equal(word.height,196);assert.equal(word.channels,4);
  for(let y=0;y<word.height;y++)assert.deepEqual(word.pixels.subarray(y*word.width*4,(y+1)*word.width*4),full.pixels.subarray(((776+y)*full.width+230)*4,((776+y)*full.width+230+word.width)*4));
});
