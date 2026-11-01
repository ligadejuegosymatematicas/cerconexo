import { loadSession } from './session.mjs';
const INDEX='cerconexo-online-view-v1',CODE=/^[A-HJ-NP-Z2-9]{10}$/;
function index(storage){try{return JSON.parse(storage.getItem(INDEX))??{};}catch{return{};}}
function save(storage,value){try{storage.setItem(INDEX,JSON.stringify(value));}catch{/* Optional navigation metadata; personal access remains in its original key. */}}
function valid(ref){return ref&&CODE.test(ref.code)&&/^[1-4]$/.test(ref.profile??'1');}
const id=ref=>`${ref.profile??'1'}:${ref.code}`;
export function rememberOnline(storage,ref){
  if(!valid(ref)||!loadSession(storage,ref.code,ref.profile??'1'))return;
  const data=index(storage);save(storage,{current:{code:ref.code,profile:ref.profile??'1'},dismissed:(data.dismissed??[]).filter(k=>k!==id(ref))});
}
export function dismissOnline(storage,ref){const data=index(storage);save(storage,{current:data.current&&id(data.current)!==id(ref)?data.current:null,dismissed:[...new Set([...(data.dismissed??[]),id(ref)])].slice(-40)});}
export function recoverableOnline(storage){
  const data=index(storage),refs=[];
  if(valid(data.current))refs.push(data.current);
  try{for(let i=storage.length-1;i>=0;i--){const match=/^cerconexo-m6-session-v1:([1-4]):([A-HJ-NP-Z2-9]{10})$/.exec(storage.key(i)??'');if(match)refs.push({profile:match[1],code:match[2]});}}catch{}
  const seen=new Set();
  for(const ref of refs){const key=id(ref);if(seen.has(key)||(data.dismissed??[]).includes(key))continue;seen.add(key);const saved=loadSession(storage,ref.code,ref.profile??'1');if(saved)return{...ref,saved};}
  return null;
}
