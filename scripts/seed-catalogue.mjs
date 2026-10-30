import { catalogueRows, adminConnection } from './catalogue.mjs';
import fs from 'node:fs';
const input = process.argv.find(a => a.startsWith('--input='))?.slice(8);
const rows = catalogueRows(process.env.POETEK_OWNER_ID || null, input ? JSON.parse(fs.readFileSync(input, 'utf8')) : []);
if (!process.argv.includes('--apply')) {
  console.log(`Anteprima: ${rows.length} opere dal file esterno. Nessun dato scritto. Usare --input=PERCORSO_PRIVATO.json --apply per inserire.`);
} else {
  if (!input || !rows.length) throw new Error('Fornire un catalogo esterno non vuoto con --input');
  const { url, headers } = adminConnection();
  const response = await fetch(`${url}/rest/v1/works?on_conflict=id`, {
    method: 'POST', headers: { ...headers, Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(rows)
  });
  if (!response.ok) throw new Error(`Importazione non riuscita: HTTP ${response.status}`);
  console.log('Seed inserito; le opere esistenti non sono state sovrascritte.');
}
