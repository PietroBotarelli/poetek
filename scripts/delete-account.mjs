// Administrative request handling; never load this script in the browser.
import { adminConnection } from './catalogue.mjs';
const owner = process.argv.find(a => a.startsWith('--user='))?.slice(7);
if (!owner || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(owner)) throw new Error('Indicare --user=UUID dopo aver verificato la richiesta e l’identità');
if (!process.argv.includes('--apply')) {
  console.log(`Anteprima: rimuove account, profilo, preferenze, opere, raccolte e media di ${owner}. Nessun dato scritto. Usare --apply dopo la verifica della richiesta.`);
  process.exit(0);
}
const {url, headers}=adminConnection();
async function api(route, method='GET', body) {
  const r=await fetch(url+route,{method,headers:{...headers,Prefer:'return=minimal'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(!r.ok)throw new Error(`Operazione interrotta: HTTP ${r.status}. Controllare lo stato prima di ripetere.`);
  return r.status===204?null:r.text().then(s=>s?JSON.parse(s):null);
}
// List every owned upload, including unpublished and orphaned files, through
// the Storage API. Removing only storage.objects rows would leave the bytes.
async function list(prefix) {
  const files=[];
  for(let offset=0;;offset+=100){
    const page=await api('/storage/v1/object/list/poetek-media','POST',{prefix,limit:100,offset,sortBy:{column:'name',order:'asc'}});
    for(const e of page){const p=prefix+'/'+e.name;if(e.id)files.push(p);else files.push(...await list(p));}
    if(page.length<100)break;
  }
  return files;
}
const paths=await list(owner);
for(let i=0;i<paths.length;i+=100)await api('/storage/v1/object/poetek-media','DELETE',{prefixes:paths.slice(i,i+100)});
// Delete works before collections to avoid leaving content with null owner.
await api(`/rest/v1/works?owner_id=eq.${owner}`,'DELETE');
await api(`/rest/v1/collections?owner_id=eq.${owner}`,'DELETE');
await api(`/auth/v1/admin/users/${owner}`,'DELETE');
console.log('Account e dati associati rimossi. Annotare il completamento della richiesta senza conservare copie superflue dei contenuti.');
