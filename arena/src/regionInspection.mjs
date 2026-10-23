/** Capa de consulta reutilizable. Recibe componentes; no importa motor, DOM ni persistencia. */
export class RegionInspection {
  enabled=false;
  selectedCell=null;
  focusCell=0;
  components=[];
  byCell=new Map();
  signature='';
  update(components,columns,rows=columns){
    const signature=JSON.stringify(components.map(c=>[c.type,[...c.cells].sort((a,b)=>a-b)]));
    if(this.signature!==signature)this.selectedCell=null;
    this.signature=signature;this.components=components;this.columns=columns;this.rows=rows;
    this.byCell=new Map(components.flatMap((c,i)=>c.cells.map(cell=>[cell,i])));
  }
  toggle(){this.enabled=!this.enabled;this.selectedCell=null;return this.enabled;}
  reset(){this.enabled=false;this.selectedCell=null;this.focusCell=0;this.signature='';}
  select(cell){
    if(!this.enabled||!this.byCell.has(cell))return false;
    const same=this.selectedCell!==null&&this.byCell.get(this.selectedCell)===this.byCell.get(cell);
    this.selectedCell=same?null:cell;this.focusCell=cell;return true;
  }
  moveFocus(key){
    const c=this.focusCell%this.columns,r=Math.floor(this.focusCell/this.columns);
    if(key==='ArrowLeft'&&c>0)this.focusCell--;
    if(key==='ArrowRight'&&c<this.columns-1)this.focusCell++;
    if(key==='ArrowUp'&&r>0)this.focusCell-=this.columns;
    if(key==='ArrowDown'&&r<this.rows-1)this.focusCell+=this.columns;
    if(key==='Home')this.focusCell=r*this.columns;
    if(key==='End')this.focusCell=(r+1)*this.columns-1;
    return this.focusCell;
  }
  get selected(){return this.selectedCell===null?null:this.components[this.byCell.get(this.selectedCell)];}
}

export function regionDescription(component){
  if(!component)return 'Toca una casilla para conocer su región.';
  const status=component.type==='shared'?`Región compartida · Equipos ${component.teams.join(', ')}`:component.type==='empty'?'Región vacía · Sin puntos':`Región exclusiva · Equipo ${component.type}`;
  return `${status} · ${component.cells.length} ${component.cells.length===1?'casilla':'casillas'}${component.ids.length?` · ${component.ids.join(', ')}`:''}`;
}

/** El anclaje es siempre una casilla REAL, no el centro de una caja envolvente. */
export function regionAnnotation(component,columns,{occupied=[]}={}){
  if(!component?.cells.length)return null;
  const blocked=new Set(occupied),cells=component.cells;
  const cx=cells.reduce((a,c)=>a+c%columns,0)/cells.length,cy=cells.reduce((a,c)=>a+Math.floor(c/columns),0)/cells.length;
  const ordered=[...cells].sort((a,b)=>Number(blocked.has(a))-Number(blocked.has(b))||
    ((a%columns-cx)**2+(Math.floor(a/columns)-cy)**2)-((b%columns-cx)**2+(Math.floor(b/columns)-cy)**2)||a-b);
  const cell=ordered[0];
  return {cell,count:cells.length,x:cell%columns+(blocked.has(cell)?0.30:0.5),y:Math.floor(cell/columns)+(blocked.has(cell)?0.77:0.5),compact:blocked.has(cell)};
}

/** Frontera exacta con huecos y entrantes. El renderizador decide cómo presentarla. */
export function regionBoundary(cells,columns){
  const set=new Set(cells),segments=[];
  for(const cell of cells){
    const x=cell%columns,y=Math.floor(cell/columns);
    if(!set.has(cell-columns))segments.push([x,y,x+1,y]);
    if(x===columns-1||!set.has(cell+1))segments.push([x+1,y,x+1,y+1]);
    if(!set.has(cell+columns))segments.push([x+1,y+1,x,y+1]);
    if(x===0||!set.has(cell-1))segments.push([x,y+1,x,y]);
  }
  return segments;
}
