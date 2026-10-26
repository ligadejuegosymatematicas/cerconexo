/** Metadatos del controlador: el diario y su formato siguen siendo de ArenaSession. */
export const ARENA_CPU_KEY='cerconexo-arena-controller-v1';
export const LOCAL_ARENA_CONTROL=Object.freeze({opponent:'local',humanTeam:'A'});
export function arenaControl(value,mode='duo'){
  return mode==='duo'&&value?.opponent==='cpu'&&['A','B'].includes(value.humanTeam)
    ?{opponent:'cpu',humanTeam:value.humanTeam}:{...LOCAL_ARENA_CONTROL};
}
// Identificador de contenido, no credencial ni validación del diario (la hace el motor).
export function journalIdentity(raw){
  let a=2166136261,b=5381;
  for(let i=0;i<raw.length;i++){a=Math.imul(a^raw.charCodeAt(i),16777619);b=Math.imul(b,33)^raw.charCodeAt(i);}
  return `${raw.length}:${a>>>0}:${b>>>0}`;
}
export function restoreArenaControl(storage,raw,mode='duo'){
  try{
    const data=JSON.parse(storage.getItem(ARENA_CPU_KEY));
    if(data?.version!==1)return {...LOCAL_ARENA_CONTROL};
    const match=[data.current,data.previous].find(r=>r?.journal===journalIdentity(raw));
    return arenaControl(match?.control,mode);
  }catch{return {...LOCAL_ARENA_CONTROL};}
}
/** Escritura anticipada: admite el diario anterior si la escritura oficial falla. */
export function saveArenaControl(storage,key,raw,control){
  const old=storage.getItem(key),oldMetadata=storage.getItem(ARENA_CPU_KEY);
  const previous=old?{journal:journalIdentity(old),control:restoreArenaControl(storage,old)}:null;
  storage.setItem(ARENA_CPU_KEY,JSON.stringify({version:1,current:{journal:journalIdentity(raw),control:arenaControl(control,JSON.parse(raw).setup?.mode)},previous}));
  try{storage.setItem(key,raw);}
  catch(error){
    // Si el reemplazo tiene exactamente el mismo diario inicial, su identidad
    // no distingue las dos configuraciones. Recuperar también la preferencia.
    try{storage.setItem(ARENA_CPU_KEY,oldMetadata??'null');}catch{}
    throw error;
  }
}
