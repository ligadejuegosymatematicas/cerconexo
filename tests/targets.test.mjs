import test from 'node:test';
import assert from 'node:assert/strict';
import {moveHitBox,wallHitPolygon} from '../src/boardTargets.mjs';

const rectangle=b=>[[b.x,b.y],[b.x+b.width,b.y],[b.x+b.width,b.y+b.height],[b.x,b.y+b.height]];
function overlap(a,b){
  for(const polygon of [a,b])for(let i=0;i<polygon.length;i++){
    const p=polygon[i],q=polygon[(i+1)%polygon.length],axis=[p[1]-q[1],q[0]-p[0]];
    const project=shape=>shape.map(v=>v[0]*axis[0]+v[1]*axis[1]);
    const pa=project(a),pb=project(b);
    if(Math.max(...pa)<=Math.min(...pb)||Math.max(...pb)<=Math.min(...pa))return false;
  }
  return true;
}
test('Objetivos de movimiento y muros no se superponen, incluidas las esquinas',()=>{
  for(let row=0;row<7;row++)for(let col=0;col<7;col++){
    const x=60+col*80,y=60+row*80,targets=[];
    const add=(cx,cy,line)=>{
      targets.push(rectangle(moveHitBox(cx,cy,x,y)),wallHitPolygon(...line));
    };
    if(row>0)add(x,y-80,[x,y,x+80,y]);
    if(col<6)add(x+80,y,[x+80,y,x+80,y+80]);
    if(row<6)add(x,y+80,[x,y+80,x+80,y+80]);
    if(col>0)add(x-80,y,[x,y,x,y+80]);
    for(let a=0;a<targets.length;a++)for(let b=a+1;b<targets.length;b++){
      assert.equal(overlap(targets[a],targets[b]),false,`Selecciones ${a}/${b} en ${row},${col}`);
    }
  }
});
test('Casillas disponibles tienen una superficie táctil mayor que el círculo anterior',()=>{
  for(const [x,y] of [[0,80],[160,80],[80,0],[80,160]]){
    const hit=moveHitBox(x,y,80,80);
    assert.ok(hit.width*hit.height>Math.PI*21**2);
    assert.ok(hit.x<=x+40&&hit.x+hit.width>=x+40);
    assert.ok(hit.y<=y+40&&hit.y+hit.height>=y+40);
  }
});
