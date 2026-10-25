// Consulta independiente del juego. Los ejemplos son fixtures, nunca estados de la partida.
// Su geometría, recorridos, puntuaciones y clasificación se verifican con ambos motores.
export function manualExample(mode,kind='initial'){
  const n=mode==='arena'?9:7,positions=n===7?[8,12,40,36]:[10,16,70,64];
  const pieces=['A1','B1','A2','B2'].map((id,i)=>({id,team:id[0],pos:positions[i]}));
  const walls=kind==='territory'?[`${1}-${2}`,`${n+1}-${n+2}`,`${n}-${2*n}`,`${n+1}-${2*n+1}`]:[];
  return {size:n,pieces,walls,highlight:kind==='territory'?[0,1,n,n+1]:[],path:kind==='move'?[positions[0],positions[0]+1,positions[0]+1+n]:[]};
}

export function manualBoard(example){
  const {size:n,pieces,walls,highlight,path}=example,step=24,pad=6,end=pad+n*step;
  let svg=`<svg class="manual-board" viewBox="0 0 ${end+pad} ${end+pad}" role="img" aria-label="${path.length?'Dos pasos legales con un giro':highlight.length?'Una región de cuatro casillas exclusiva del equipo A':'Posiciones iniciales de las cuatro fichas'} en un tablero ${n} por ${n}"><rect x="${pad}" y="${pad}" width="${n*step}" height="${n*step}" rx="2" fill="#fbf7ef"/>`;
  for(const c of highlight)svg+=`<rect x="${pad+c%n*step}" y="${pad+Math.floor(c/n)*step}" width="24" height="24" fill="#f59e0b" fill-opacity=".24"/>`;
  for(let i=1;i<n;i++)svg+=`<path d="M${pad+i*step} ${pad}V${end}M${pad} ${pad+i*step}H${end}" stroke="#cbbeaa" stroke-width=".7"/>`;
  for(const w of walls){const [a,b]=w.split('-').map(Number),r=Math.floor(a/n),c=a%n;
    svg+=`<path d="${b-a===1?`M${pad+(c+1)*step} ${pad+r*step}v24`:`M${pad+c*step} ${pad+(r+1)*step}h24`}" stroke="#475569" stroke-width="3"/>`;
  }
  svg+=`<rect x="${pad}" y="${pad}" width="${n*step}" height="${n*step}" rx="2" fill="none" stroke="#d4a64a" stroke-width="3"/>`;
  if(path.length){const xy=c=>`${pad+c%n*step+12},${pad+Math.floor(c/n)*step+12}`;svg+=`<polyline points="${path.map(xy).join(' ')}" fill="none" stroke="#167d81" stroke-width="3" stroke-linejoin="round"/><circle cx="${pad+path[1]%n*step+12}" cy="${pad+Math.floor(path[1]/n)*step+12}" r="6" fill="#167d81"/><text x="${pad+path[1]%n*step+12}" y="${pad+Math.floor(path[1]/n)*step+15}" text-anchor="middle" font-size="9" fill="white">1</text><circle cx="${pad+path[2]%n*step+12}" cy="${pad+Math.floor(path[2]/n)*step+12}" r="6" fill="#167d81"/><text x="${pad+path[2]%n*step+12}" y="${pad+Math.floor(path[2]/n)*step+15}" text-anchor="middle" font-size="9" fill="white">2</text>`;}
  for(const p of pieces)svg+=`<circle cx="${pad+p.pos%n*step+12}" cy="${pad+Math.floor(p.pos/n)*step+12}" r="8" fill="${p.team==='A'?'#f59e0b':'#38bdf8'}" stroke="#102a43" stroke-width="1.5"/><text x="${pad+p.pos%n*step+12}" y="${pad+Math.floor(p.pos/n)*step+15}" text-anchor="middle" fill="#071a2f" font-size="7.5" font-weight="800">${p.id}</text>`;
  return svg+'</svg>';
}

// Cada ficha temática es una frase precisa; la lista no sustituye al reglamento canónico interno.
export function manualChapters(mode){
  const arena=mode==='arena';
  const chapter=(id,title,lead,diagram,cards)=>({id,title,lead,diagram,cards});
  const card=(title,...items)=>({title,items});
  return [
    chapter('start','Inicio',arena?'Poderes, conquista y reconquista.':'Un tablero, dos equipos y un territorio por conquistar.','initial',[
      card('El tablero',`${arena?'9 × 9: 81':'7 × 7: 49'} casillas; cuatro fichas en las posiciones de la ilustración.`,`Empiezas sin muros interiores; el borde exterior no se atraviesa.`),
      card('¿Quién juega?',...(arena?['2 vs. 2: A y B tienen dos fichas cada uno.','4 equipos: A, B, C y D tienen una ficha cada uno, en las cuatro esquinas interiores; juegan en ese orden.']:['A y B tienen dos fichas cada uno.','Local: compartes el dispositivo. Contra CPU: eliges equipo y dificultad; las reglas son las mismas.']), 'El equipo A empieza.'),
      card('Sistema de turnos','Por ficha: A1 → B1 → A2 → B2, omitiendo las aseguradas; la compañera ocupa los turnos de su equipo.','Por equipo: A y B alternan. Elige cualquier ficha activa; puedes repetirla en tus turnos.',arena?'Antes de actuar puedes cambiar de ficha; un paso o un poder compromete la ficha del turno.':'Puedes cambiar de ficha antes de mover; al dar el primer paso queda comprometida.' )
    ]),
    chapter('turn','Turno','Puedes construir sin desplazarte, o avanzar antes de construir.','move',[
      card('Muévete','0, 1 o 2 pasos, en horizontal o vertical; nunca en diagonal.','Un paso normal no atraviesa muros ni otras fichas.','Puedes girar o regresar al origen en el segundo paso: ambos pasos quedan consumidos.','Cada paso es definitivo, también si recargas.'),
      card('Construye',`Exactamente un muro final en un lado interior libre de tu casilla${arena?', si sigues activo':''}.`,'Puede haber una ficha al otro lado del muro.',arena?'Cada acción es definitiva; Demolición retira muros como una acción nueva.':'No puedes deshacer los pasos ni el muro.',...(arena?['Si una acción te asegura, tu turno termina de inmediato sin pedir otro muro.']:[])),
      ...(arena?[card('Elige tu ficha','Aro discontinuo: ficha disponible para elegir.','Aro continuo: ficha seleccionada. Un paso o un poder la compromete para ese turno.')]:[])
    ]),
    chapter('territory','Territorio','Una región reúne casillas conectadas sin cruzar muros.','territory',[
      card('Una región exclusiva','Solo contiene fichas de un equipo: todas sus casillas puntúan para él.','Aquí A asegura 4 casillas. Se cuentan una sola vez, aunque haya dos fichas compañeras.'),
      card('Sin puntos',`Compartida: contiene ${arena?'dos o más equipos distintos':'ambos equipos'}; sigue en disputa.`,'Vacía: no contiene fichas; no puntúa para nadie.'),
      card(arena?'Asegurar y reactivar':'Asegurar es definitivo',...(arena?['Una ficha está activa mientras comparta región con rivales.','Sin rivales queda asegurada; si vuelven a compartir región, se reactiva inmediatamente.','Los puntos se recalculan tras cada acción: un territorio puede perderse y reconquistarse.']:['Sin rivales, la ficha queda asegurada y deja de participar para siempre.','Conserva su casilla, color e identificador, con el distintivo ✓.'])),
      card('Los caminos importan','Un muro no siempre divide una región: puede quedar otro camino abierto.','Inspeccionar solo muestra regiones y tamaños; no gasta acciones ni cambia la partida.')
    ]),
    ...(arena?[
      chapter('powers','Poderes','Recoge un poder al entrar en su casilla; puedes usarlo en ese mismo turno.',null,[
        {...card('Demolición','Retira un muro interior adyacente sin gastar pasos.','Puedes usarla antes, entre o después de tus movimientos.'),power:'demolition'},
        {...card('Salto','Cruza un muro interior intacto hacia la casilla ortogonal contigua desocupada.','Gasta un poder y uno de tus dos pasos; no destruye el muro.','Puede llevarte a otra región o a la misma si existe otro camino.','Si entras en una región vacía o exclusiva propia y quedas asegurado, terminas sin muro final.'),power:'jump'},
        {...card('Muro adicional','Construye un muro interior adyacente libre sin gastar pasos.','Puedes seguir moviéndote; si continúas activo, debes construir además el muro final.'),power:'extraWall'},
        card('En el mismo turno','Cada uso consume el poder elegido. Puedes usar varios, según los que tengas y los pasos disponibles.','Cada uso es definitivo. Tras cada acción se actualizan territorios, puntos y actividad.')
      ]),
      chapter('inventory','Inventario','Todos pueden ver los poderes propios y rivales.',null,[
        card('Por ficha y con cuatro equipos','Cada ficha guarda como máximo un poder.','Asegurada lo conserva; solo podrá usarlo si se reactiva.'),
        card('Por equipo','El inventario es compartido: cabe un poder por ficha activa.','Dos activas: 2. Una activa: 1. Ninguna: 0. La capacidad cambia inmediatamente.'),
        card('Si no cabe','El dueño elige manualmente qué descartar, incluso si lo provoca una acción rival.','Se pausa al rival, resuelves tu descarte y se le devuelve el control.','Puedes rechazar el poder recién recogido; la casilla se desactiva igualmente.','Lo descartado no vuelve cuando aumenta la capacidad.'),
        card('Orden de resolución','Acción → territorios y actividad → resultado si termina la partida.','Si sigue: capacidad y descartes → recolección → continuar solo si la ficha sigue activa.','No se piden descartes después del final. Acciones y decisiones pendientes sobreviven a una recarga.')
      ])
    ]:[]),
    chapter('end','Final','Gana quien tenga más casillas exclusivas.',null,[
      card('Cuándo termina',`Cuando desaparece la última región compartida${arena?' entre dos o más equipos':''}.`,'El resultado depende solo de la puntuación; con igualdad en el máximo hay empate.'),
      card('Todas las casillas cuentan',`${arena?'81':'49'} = casillas de los equipos + casillas vacías al terminar.`,'Las vacías no dan puntos; las que siguen en disputa durante el juego tampoco son vacías.'),
      card('El tablero permanece','Puedes examinar las regiones finales sin cambiar el resultado.','Inicio conserva la partida. Jugar de nuevo repite la configuración; Nueva partida permite cambiarla.')
    ],),
    ...(arena?[chapter('waves','Apariciones','La configuración inicial incluye dos oleadas de poderes.',null,[
      card('Cuándo aparecen','Tras las intervenciones completadas 8 y 16, solo si la partida sigue activa.','Las fichas aseguradas que se omiten no cuentan como turnos completados.'),
      card('Dónde aparecen','Solo en casillas desocupadas de regiones compartidas, sin otro poder.','Se buscan parejas simétricas en 2 vs. 2 y grupos con giro de un cuarto de vuelta en cuatro equipos.','Si no existe un grupo simétrico completo, esa oleada no aparece.')
    ])]:[])
  ];
}

export function mountIllustratedManual(){
  for(const host of document.querySelectorAll('[data-illustrated-manual]')){
    const mode=host.dataset.illustratedManual,chapters=manualChapters(mode);host.classList.add('illustrated-manual');
    host.innerHTML=`<nav class="manual-topics" aria-label="Temas del manual">${chapters.map((ch,i)=>`<button type="button" data-manual-topic="${ch.id}" aria-pressed="${i===0}" aria-controls="manual-${mode}-${ch.id}">${ch.title}</button>`).join('')}</nav><div class="manual-pages" tabindex="0" role="region" aria-label="Contenido del manual">${chapters.map((ch,i)=>`<section class="manual-page" id="manual-${mode}-${ch.id}" data-manual-page="${ch.id}" ${i?'hidden':''}><h3>${ch.title}</h3><p class="manual-lead">${ch.lead}</p><div class="manual-layout ${ch.diagram?'has-diagram':''}">${ch.diagram?`<figure>${manualBoard(manualExample(mode,ch.diagram))}<figcaption>${ch.diagram==='territory'?'Una región exclusiva de A · 4 casillas':ch.diagram==='move'?'Dos pasos, un giro · después construyes':'Cuatro fichas · posiciones iniciales'}</figcaption></figure>`:''}<div class="manual-cards">${ch.cards.map(c=>`<article>${c.power?`<span data-guide-icon="${c.power}"></span>`:''}<h4>${c.title}</h4><ul>${c.items.map(s=>`<li>${s}</li>`).join('')}</ul></article>`).join('')}</div></div></section>`).join('')}</div>`;
    for(const button of host.querySelectorAll('[data-manual-topic]'))button.addEventListener('click',()=>{
      for(const b of host.querySelectorAll('[data-manual-topic]'))b.setAttribute('aria-pressed',String(b===button));
      for(const page of host.querySelectorAll('[data-manual-page]'))page.hidden=page.dataset.manualPage!==button.dataset.manualTopic;
      host.querySelector('.manual-pages').scrollTop=0;
    });
  }
}
