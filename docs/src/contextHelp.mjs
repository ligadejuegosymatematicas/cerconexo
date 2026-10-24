// Ayuda de consulta: no lee ni escribe el estado de juego.
export function setupContextHelp(){
  const content={
    control:['¿Cómo quieres jugar?','Local: comparte el dispositivo. Contra CPU: elige tu equipo y la dificultad.'],
    turns:['Sistema de turnos','Por ficha: A1 → B1 → A2 → B2, mientras sigan activas. Por equipo: elige cualquier ficha activa de tu equipo. Cada paso es definitivo.'],
    difficulty:['Dificultad','Principiante: decisiones sencillas. Intermedio: territorio y anticipación. Avanzado: mayor análisis de respuestas.'],
    team:['Tu equipo','El equipo A (naranja) comienza siempre. Con B (celeste), comienza la CPU.'],
    arenaMode:['Enfrentamiento','2 vs. 2: dos fichas por equipo. Cuatro equipos: una ficha por equipo, en orden A → B → C → D.'],
    arenaTurns:['Turnos e inventarios','Por ficha: orden A1 → B1 → A2 → B2 y un poder por ficha. Por equipo: elige ficha activa e inventario compartido; capacidad igual al número de fichas activas.']
  };
  const dialog=document.createElement('dialog');dialog.id='contextHelp';dialog.className='context-help';dialog.setAttribute('aria-labelledby','contextHelpTitle');
  dialog.innerHTML='<button type="button" class="dialog-close close" aria-label="Cerrar ayuda">×</button><h2 id="contextHelpTitle"></h2><p id="contextHelpText"></p>';
  document.body.append(dialog);let opener=null,outside=false;
  const isOutside=e=>{const r=dialog.getBoundingClientRect();return e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);};
  for(const button of document.querySelectorAll('[data-context-help]')){
    button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls',dialog.id);
    button.addEventListener('click',()=>{const [title,text]=content[button.dataset.contextHelp];opener=button;dialog.querySelector('h2').textContent=title;dialog.querySelector('p').textContent=text;dialog.showModal();dialog.querySelector('button').focus({preventScroll:true});});
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
