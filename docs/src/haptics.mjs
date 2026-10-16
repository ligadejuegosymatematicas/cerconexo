// Preferencia local separada del estado del juego. Sin efecto sobre reglas o turnos.
export const HAPTIC_KEY='cerconexo-preferences-v1';
export const HAPTIC_PATTERNS=Object.freeze({turn:8,wall:12,secured:Object.freeze([12,35,12])});

export function createHaptics({nav=globalThis.navigator,storage,visible=()=>!globalThis.document?.hidden,
  reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')??{matches:false},now=()=>performance.now()}={}){
  if(storage===undefined){try{storage=globalThis.localStorage;}catch{}}
  let enabled=false,lastPulse=-Infinity;
  const supported=typeof nav?.vibrate==='function';
  try{enabled=JSON.parse(storage?.getItem(HAPTIC_KEY))?.vibration===true;}catch{}
  function stop(){if(supported&&enabled){try{nav.vibrate(0);}catch{}}}
  return {
    get supported(){return supported;},
    get enabled(){return enabled;},
    get paused(){return reduced.matches;},
    setEnabled(value){
      if(!supported)return;
      if(!value)stop();
      enabled=!!value;
      try{storage?.setItem(HAPTIC_KEY,JSON.stringify({vibration:enabled}));}catch{}
    },
    pulse(event){
      const pattern=HAPTIC_PATTERNS[event];
      if(!pattern||!supported||!enabled||!visible()||reduced.matches||now()-lastPulse<150)return false;
      lastPulse=now();
      try{return nav.vibrate(Array.isArray(pattern)?[...pattern]:pattern)===true;}catch{return false;}
    },
    // Una sola señal por jugada; asegurar territorio sustituye al pulso de muro.
    committed({secured=false}={}){return this.pulse(secured?'secured':'wall');},
    stop
  };
}
