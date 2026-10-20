import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
// Decodificación compartida para comprobar píxeles sin dependencias adicionales.
export function decodePNG(bytes){
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
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
