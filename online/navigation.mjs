import { rememberOnline } from './session-index.mjs';
export function bindOnlineHome(link, getSession, notify = () => {}) {
  let leaving=false;
  const go=async event=>{
    if(event.button||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    const session=getSession();if(!session)return;
    event.preventDefault();if(leaving)return;leaving=true;
    rememberOnline(session.storage,{code:session.code,profile:session.profile});
    try{await session.leaveView();session.disconnect();location.assign(link.href);}
    catch{notify('Se perdió la conexión. Tu acceso sigue guardado.');leaving=false;}
  };
  link.addEventListener('click',go);return()=>link.removeEventListener('click',go);
}
