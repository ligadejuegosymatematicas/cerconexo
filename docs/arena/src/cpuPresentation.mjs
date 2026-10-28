import {POWER_LABELS} from './config.mjs';

// Solo presentación. Cada acción ya fue validada y guardada por ArenaSession.
export const CPU_PRESENTATION_MS=Object.freeze({select:260,move:360,wall:460,power:700,pickup:850,discard:850,territory:900});
export function arenaCpuPresentation(before,after,action){
  const actor=before.turn.actor??action.actor,steps=[],events=after.lastEvents;
  const add=(kind,text,milliseconds)=>steps.push({kind,text,milliseconds});
  if(action.type==='select')add('select',`La CPU elige ${action.actor}.`,CPU_PRESENTATION_MS.select);
  else if(action.type==='discard'){
    const item=before.inventories[action.owner]?.find(p=>p.id===action.power);
    add('discard',`${action.owner} descarta ${POWER_LABELS[item?.type]??'un poder'}.`,CPU_PRESENTATION_MS.discard);
  }else if(POWER_LABELS[action.type])add(action.type,`${actor} usa ${POWER_LABELS[action.type]}.`,CPU_PRESENTATION_MS.power);
  else add(action.type,action.type==='move'?`${actor} da un paso.`:`${actor} construye su muro final.`,CPU_PRESENTATION_MS[action.type]??360);
  for(const e of events.filter(e=>e.type==='pickup'))add('pickup',`${e.actor} recoge ${POWER_LABELS[e.power]}.`,CPU_PRESENTATION_MS.pickup);
  const changes=[];
  for(const e of events){
    if(e.type==='secured')changes.push(`${e.actor} asegura su territorio.`);
    if(e.type==='reactivated')changes.push(`${e.actor} vuelve a participar.`);
    if(e.type==='territory')changes.push(`${e.team}: ${e.delta>0?'+':''}${e.delta} ${Math.abs(e.delta)===1?'casilla':'casillas'}.`);
  }
  if(after.over)changes.push(after.winners.length===1?`Gana el equipo ${after.winners[0]}.`:`Empate entre ${after.winners.join(', ')}.`);
  if(changes.length)add('territory',changes.join(' '),CPU_PRESENTATION_MS.territory);
  if(after.pending&&!after.over)steps.at(-1).text+=` Equipo ${after.pending.team}: elige qué descartar.`;
  return steps;
}

/** Un único reloj cancelable, sin escrituras ni referencias al estado mutable. */
export function createCpuPresentation({show,clear=()=>{},onFinish=()=>{},schedule=setTimeout,unschedule=clearTimeout}){
  let timer=null,serial=0,active=false;
  function cancel(){serial++;if(timer!==null)unschedule(timer);timer=null;active=false;clear();}
  function play(steps){
    cancel();if(!steps.length)return;
    active=true;const id=serial;let index=0;
    function next(){
      if(id!==serial)return;
      if(index===steps.length){timer=null;active=false;clear();onFinish();return;}
      const step=steps[index++];show(step);timer=schedule(next,step.milliseconds);
    }
    next();
  }
  return {play,cancel,get active(){return active;}};
}
