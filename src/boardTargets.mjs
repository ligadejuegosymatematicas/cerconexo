/** Geometría de selección SVG. No calcula movimientos ni valida reglas. */
export function moveHitBox(cellX,cellY,originX,originY){
  const box={x:cellX+6,y:cellY+6,width:68,height:68};
  // Reserva una franja junto al borde que comparte con la ficha activa.
  if(cellX>originX){box.x+=16;box.width-=16;}
  if(cellX<originX)box.width-=16;
  if(cellY>originY){box.y+=16;box.height-=16;}
  if(cellY<originY)box.height-=16;
  return box;
}

export function wallHitPolygon(x1,y1,x2,y2){
  const length=Math.hypot(x2-x1,y2-y1);
  const tx=(x2-x1)/length,ty=(y2-y1)/length,nx=-ty,ny=tx;
  const point=(along,across)=>[x1+tx*along+nx*across,y1+ty*along+ny*across];
  // Extremos biselados: dos muros vecinos nunca comparten la esquina táctil.
  return [point(6,0),point(22,18),point(length-22,18),point(length-6,0),point(length-22,-18),point(22,-18)];
}
