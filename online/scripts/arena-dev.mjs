import {fileURLToPath} from 'node:url';
import {startUX} from './ux-local.mjs';

const site=await startUX({port:8840,apiPort:8841,stateDir:fileURLToPath(new URL('../.state/arena-demo/',import.meta.url))});
console.log(`Arena candidata: ${site.base}/arena/?new=1`);
console.log('Nueva partida → Online → Crear sala. Usa cuatro navegadores o perfiles independientes.');
console.log('Solo este PC (loopback); SQLite local persistente. Ctrl+C para detener.');
for(const event of ['SIGINT','SIGTERM'])process.once(event,async()=>{await site.stop();process.exit();});
