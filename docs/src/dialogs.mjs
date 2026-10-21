// El diálogo nativo aporta modalidad e inercia al tablero. El foco y el gesto
// exterior se gestionan aquí para compartir el mismo comportamiento en los tres paneles.
export function bindDialog(dialog,opener,{fallback=opener,onOpen=()=>{}}={}){
  let startedOutside=false;
  const outside=event=>{
    const r=dialog.getBoundingClientRect();
    return event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom);
  };
  opener.setAttribute('aria-controls',dialog.id);opener.setAttribute('aria-haspopup','dialog');opener.setAttribute('aria-expanded','false');
  opener.addEventListener('click',()=>{
    if(onOpen()===false)return;
    dialog.showModal();dialog.scrollTop=0;opener.setAttribute('aria-expanded','true');
    dialog.querySelector('.dialog-close')?.focus({preventScroll:true});
  });
  dialog.addEventListener('pointerdown',event=>{startedOutside=outside(event);});
  dialog.addEventListener('click',event=>{if(startedOutside&&outside(event))dialog.close();startedOutside=false;});
  dialog.addEventListener('close',()=>{
    opener.setAttribute('aria-expanded','false');startedOutside=false;
    const target=opener.isConnected&&opener.getClientRects().length?opener:fallback;
    target?.focus();
  });
  dialog.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const nodes=[...dialog.querySelectorAll('button,input,summary,a[href],[tabindex="0"]')].filter(n=>!n.disabled&&n.getClientRects().length);
    const first=nodes[0],last=nodes.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  });
}
