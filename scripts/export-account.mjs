import fs from 'node:fs';
import { adminConnection } from './catalogue.mjs';
const owner=process.argv.find(a=>a.startsWith('--user='))?.slice(7);
const output=process.argv.find(a=>a.startsWith('--out='))?.slice(6);
if(!owner||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(owner)||!output)throw new Error('Indicare --user=UUID --out=percorso-privato.json dopo aver verificato l’identità');
const {url,headers}=adminConnection();
async function rows(table,filter){
 const all=[];
 for(let offset=0;;offset+=500){
  const r=await fetch(`${url}/rest/v1/${table}?${filter}&select=*&offset=${offset}&limit=500&order=${table==='reading_events'?'created_at,id':table==='author_follows'?'follower_id,author_id':table==='library_items'?'user_id,work_id':table==='profile_preferences'?'user_id':'id'}`,{headers});
  if(!r.ok)throw new Error(`Esportazione interrotta: HTTP ${r.status}`);
  const page=await r.json();all.push(...page);if(page.length<500)break;
 }return all;
}
const data={format:'poetek-account-export/v1',exportedAt:new Date().toISOString(),userId:owner};
for(const [table,field] of [['profiles','id'],['profile_preferences','user_id'],['works','owner_id'],['collections','owner_id'],['library_items','user_id'],['reading_events','user_id'],['author_follows','follower_id']])data[table]=await rows(table,`${field}=eq.${owner}`);
fs.writeFileSync(output,JSON.stringify(data,null,2),{flag:'wx',mode:0o600});
console.log('Esportazione creata: include dati personali, conservarla privatamente e inviarla soltanto al richiedente verificato. I file media vanno consegnati separatamente tramite link temporanei.');
