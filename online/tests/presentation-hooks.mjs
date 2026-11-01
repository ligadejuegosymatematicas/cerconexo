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
export function originalControllerBytes(file,bytes){
  if(!additions[file])return bytes;
  let text=bytes.toString('utf8');
  for(const line of additions[file]){
    if(text.split(line+'\n').length!==2)throw new Error('Gancho visual ausente o repetido: '+file);
    text=text.replace(line+'\n','');
  }
  if(file==='arena/src/app.mjs')text=text.replace("?'Tú comienzas':'Comienza la CPU';","?'Tú comienzas · CPU experimental':'Comienza la CPU · CPU experimental';");
  return Buffer.from(text);
}
