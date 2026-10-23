import {arenaCell,validCell} from './geometry.mjs';

export const POWER_TYPES=Object.freeze(['demolition','jump','extraWall']);
export const POWER_LABELS=Object.freeze({demolition:'Demolición',jump:'Salto',extraWall:'Muro adicional'});
export const ARENA_MODES=Object.freeze({
  duo:{label:'2 vs. 2',teams:['A','B'],pieces:[
    {id:'A1',team:'A',pos:arenaCell(2,2)},{id:'B1',team:'B',pos:arenaCell(2,8)},
    {id:'A2',team:'A',pos:arenaCell(8,8)},{id:'B2',team:'B',pos:arenaCell(8,2)},
  ]},
  ffa:{label:'4 equipos',teams:['A','B','C','D'],pieces:[
    {id:'A',team:'A',pos:arenaCell(2,2)},{id:'B',team:'B',pos:arenaCell(2,8)},
    {id:'C',team:'C',pos:arenaCell(8,8)},{id:'D',team:'D',pos:arenaCell(8,2)},
  ]},
});

export const DEFAULT_EXPERIMENT=Object.freeze({
  duo:{
    initial:[
      {type:'demolition',cell:arenaCell(3,3)},{type:'demolition',cell:arenaCell(3,7)},
      {type:'jump',cell:arenaCell(7,3)},{type:'jump',cell:arenaCell(7,7)},
      {type:'extraWall',cell:arenaCell(5,4)},{type:'extraWall',cell:arenaCell(5,6)},
    ],
    waves:[{afterTurn:8,type:'jump',count:2},{afterTurn:16,type:'demolition',count:2}],
    symmetry:'vertical',placement:'center-first',
  },
  ffa:{
    initial:[
      {type:'extraWall',cell:arenaCell(3,3)},{type:'extraWall',cell:arenaCell(3,7)},
      {type:'extraWall',cell:arenaCell(7,7)},{type:'extraWall',cell:arenaCell(7,3)},
    ],
    waves:[{afterTurn:8,type:'jump',count:4},{afterTurn:16,type:'demolition',count:4}],
    symmetry:'rotation',placement:'center-first',
  },
});

export function experimentFor(mode,custom){
  if(!ARENA_MODES[mode])throw new Error('Modalidad Arena desconocida.');
  const cfg=structuredClone(custom??DEFAULT_EXPERIMENT[mode]);
  if(!cfg||!Array.isArray(cfg.initial)||!Array.isArray(cfg.waves)||cfg.initial.length>81||cfg.waves.length>20)throw new Error('Configuración experimental inválida.');
  if(!['vertical','rotation'].includes(cfg.symmetry)||!['center-first','row-major'].includes(cfg.placement))throw new Error('Criterio de aparición desconocido.');
  const starts=new Set(ARENA_MODES[mode].pieces.map(p=>p.pos));
  if(new Set(cfg.initial.map(p=>p.cell)).size!==cfg.initial.length||cfg.initial.some(p=>!validCell(p.cell)||starts.has(p.cell)||!POWER_TYPES.includes(p.type)))throw new Error('Poder inicial inválido.');
  const turns=new Set();
  for(const w of cfg.waves){
    if(!Number.isInteger(w.afterTurn)||w.afterTurn<1||!POWER_TYPES.includes(w.type)||!Number.isInteger(w.count)||w.count<1||w.count>40||turns.has(w.afterTurn))throw new Error('Oleada inválida o turno repetido.');
    const orbit=cfg.symmetry==='vertical'?2:4;
    if(w.count%orbit)throw new Error('La oleada debe contener conjuntos simétricos completos.');
    turns.add(w.afterTurn);
  }
  cfg.waves.sort((a,b)=>a.afterTurn-b.afterTurn);
  return cfg;
}
