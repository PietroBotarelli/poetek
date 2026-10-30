import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const esc = s => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
fs.mkdirSync(path.join(root,'web/legal'), {recursive:true});
for (const name of ['privacy-policy','terms-of-use']) {
  const source=fs.readFileSync(path.join(root,`legal/${name}.md`),'utf8');
  const html=source.trim().split(/\r?\n\s*\r?\n/).map(block=>{
    if(block.startsWith('# '))return `<h1>${esc(block.slice(2))}</h1>`;
    if(block.startsWith('## '))return `<h2>${esc(block.slice(3))}</h2>`;
    return `<p>${esc(block.replace(/\r?\n/g,' ')).replaceAll('pietrobota@gmail.com','<a href="mailto:pietrobota@gmail.com">pietrobota@gmail.com</a>')}</p>`;
  }).join('\n');
  fs.writeFileSync(path.join(root,`web/legal/${name}.html`),`<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name==='privacy-policy'?'Privacy':'Condizioni d’uso'} — Poetek</title><link rel="stylesheet" href="legal.css"><main><a href="../">← Poetek</a>${html}</main></html>\n`);
}
