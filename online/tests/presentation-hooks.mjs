// Exact UI-only additions allowed in the two native controllers. Every other byte
// still has to match the published M5-D canonical hash (including CPU orchestration).
const additions={
  'src/app.mjs':[
    "import {createFinalPresenter} from './finalPresentation.mjs';",
    "const resultSkin=createFinalPresenter({element:$('endScreen'),title:$('winnerTitle'),haptics});",
    '  if(game.over)resultSkin.celebrate();',
    "  resultSkin.render({finished:game.over,winners:game.winner==='Empate'?['A','B']:[game.winner],viewerTeam:control?.humanTeam,shared:!control});"
  ],
  'arena/src/app.mjs':[
    "import {createFinalPresenter} from '../../src/finalPresentation.mjs';",
    "const resultSkin=createFinalPresenter({element:$('turnBanner'),title:$('turnTitle'),haptics});let finalResultPending=false;",
    "  if(!presentation.active){resultSkin.render({finished:s.over,winners:s.winners,viewerTeam:control.opponent==='cpu'?control.humanTeam:null,shared:control.opponent!=='cpu'});if(finalResultPending){resultSkin.celebrate();finalResultPending=false;}}",
    '    if(!before.over&&session.game.over)finalResultPending=true;',
    "  if(s.over)$('turnHint').textContent='Territorios cerrados.';",
    '  finalResultPending=false;'
  ]
};
// Normalize only the exact rendering changes for the approved medals.
const medalHooks = [
  ["import {powerIcon} from './powerMedals.mjs';",
   "import {powerIcon} from './powerIcons.mjs';"],
  ["  for(const drop of s.drops){const p=point(drop.cell);markup+=`<g class=\"drop-token\" role=\"img\" aria-label=\"${POWER_LABELS[drop.type]}\">${powerIcon(drop.type,{x:p.x-31,y:p.y-31,size:62})}</g>`;}",
   "  for(const drop of s.drops){const p=point(drop.cell);markup+=`<g class=\"drop-token\" role=\"img\" aria-label=\"${POWER_LABELS[drop.type]}\"><rect class=\"drop\" x=\"${p.x-24}\" y=\"${p.y-24}\" width=\"48\" height=\"48\" rx=\"8\"/>${powerIcon(drop.type,{x:p.x-20,y:p.y-20,size:40})}</g>`;}"],
  ["    for (const item of s.inventories[s.pending.owner]) {\n      const btn = document.createElement('button');\n      btn.type = 'button';\n      btn.innerHTML = `${powerIcon(item.type)} Descartar ${POWER_LABELS[item.type]}`;\n      btn.dataset.discard = item.id;\n      btn.disabled = presentation.active || inspection.enabled || cpu.owns(s);\n      btn.addEventListener('click', event => dispatch({ type: 'discard', owner: s.pending.owner, power: item.id }, event.detail === 0));\n      discards.append(btn);\n    }",
   "    for(const item of s.inventories[s.pending.owner]){const btn=document.createElement('button');btn.type='button';btn.textContent=`Descartar ${POWER_LABELS[item.type]}`;btn.dataset.discard=item.id;btn.disabled=presentation.active||inspection.enabled||cpu.owns(s);btn.addEventListener('click',event=>dispatch({type:'discard',owner:s.pending.owner,power:item.id},event.detail===0));discards.append(btn);}"],
];
export function originalMedalControllerBytes(file, bytes) {
  if (file !== 'arena/src/app.mjs') return bytes;
  let source = bytes.toString('utf8');
  for (const [after, before] of medalHooks) {
    if (source.split(after).length !== 2) throw new Error('Gancho de medalla ausente o repetido: '+file);
    source = source.replace(after, before);
  }
  return Buffer.from(source);
}

export function originalControllerBytes(file,bytes){
  bytes = originalMedalControllerBytes(file, bytes);
  if(!additions[file])return bytes;
  let text=bytes.toString('utf8');
  for(const line of additions[file]){
    if(text.split(line+'\n').length!==2)throw new Error('Gancho visual ausente o repetido: '+file);
    text=text.replace(line+'\n','');
  }
  if(file==='arena/src/app.mjs')text=text.replace("?'Tú comienzas':'Comienza la CPU';","?'Tú comienzas · CPU experimental':'Comienza la CPU · CPU experimental';");
  return Buffer.from(text);
}
