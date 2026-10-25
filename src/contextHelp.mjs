// Ayuda de consulta: no lee ni escribe el estado de juego.
export function setupContextHelp(){
  const content={
    control:['¿Cómo quieres jugar?',['Local: compartís el dispositivo.','Contra CPU: eliges equipo y dificultad.']],
    turns:['Sistema de turnos',['Por ficha: A1 → B1 → A2 → B2, mientras sigan activas.','Por equipo: eliges cualquier ficha activa de tu equipo.','Cada paso es definitivo.']],
    difficulty:['Dificultad',['Principiante: decisiones sencillas.','Intermedio: territorio y anticipación.','Avanzado: mayor análisis de respuestas.']],
    team:['Tu equipo',['A · Naranja: empiezas tú.','B · Celeste: empieza la CPU.','Elegir equipo no cambia las posiciones.']],
    arenaControl:['Juego local',['Compartís un dispositivo.','Elige dos equipos o cuatro equipos independientes.']],
    arenaMode:['Enfrentamiento',['2 vs. 2: dos fichas por equipo.','4 equipos: una ficha por equipo.','Cuatro equipos juegan A → B → C → D.']],
    arenaTurns:['Turnos e inventarios',['Por ficha: A1 → B1 → A2 → B2; un poder por ficha.','Por equipo: eliges ficha activa; inventario compartido.','Capacidad compartida: un poder por cada ficha activa.','Cada paso es definitivo.']]
  };
  const dialog=document.createElement('dialog');dialog.id='contextHelp';dialog.className='context-help';dialog.setAttribute('aria-labelledby','contextHelpTitle');
  dialog.innerHTML='<button type="button" class="dialog-close close" aria-label="Cerrar ayuda">×</button><h2 id="contextHelpTitle"></h2><ul id="contextHelpText"></ul>';
  document.body.append(dialog);let opener=null,outside=false;
  const isOutside=e=>{const r=dialog.getBoundingClientRect();return e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);};
  for(const button of document.querySelectorAll('[data-context-help]')){
    button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls',dialog.id);
    button.addEventListener('click',()=>{const [title,items]=content[button.dataset.contextHelp];opener=button;dialog.querySelector('h2').textContent=title;dialog.querySelector('ul').replaceChildren(...items.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));dialog.showModal();dialog.querySelector('button').focus({preventScroll:true});});
  }
  dialog.querySelector('button').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('pointerdown',e=>{outside=isOutside(e);});
  dialog.addEventListener('click',e=>{if(outside&&isOutside(e))dialog.close();outside=false;});
  dialog.addEventListener('close',()=>{outside=false;opener?.focus({preventScroll:true});});
  dialog.addEventListener('keydown',e=>{if(e.key==='Tab'){e.preventDefault();dialog.querySelector('button').focus();}});
  for(const guide of document.querySelectorAll('[data-visual-guide]')){
    const buttons=[...guide.querySelectorAll('[data-guide-tab]')];
    for(const button of buttons)button.addEventListener('click',()=>{for(const b of buttons)b.setAttribute('aria-pressed',String(b===button));for(const pane of guide.querySelectorAll('[data-guide-pane]'))pane.hidden=pane.dataset.guidePane!==button.dataset.guideTab;});
    guide.querySelector('[data-full-rules]')?.addEventListener('click',()=>{guide.addEventListener('close',()=>{const rules=document.getElementById(guide.dataset.rules);rules.showModal();rules.querySelector('button').focus({preventScroll:true});},{once:true});guide.close();});
    const rules=document.getElementById(guide.dataset.rules);
    if(rules&&!rules.querySelector('[data-close]')){
      let started=false;
      const beyond=e=>{const r=rules.getBoundingClientRect();return e.target===rules&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);};
      rules.addEventListener('pointerdown',e=>{started=beyond(e);});
      rules.addEventListener('click',e=>{if(started&&beyond(e))rules.close();started=false;});
    }
    rules?.addEventListener('close',()=>{guide.showModal();guide.querySelector('[data-full-rules]').focus({preventScroll:true});});
  }
}
