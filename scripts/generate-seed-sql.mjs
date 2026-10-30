import { catalogueRows } from './catalogue.mjs';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
export function buildSeedSql(ownerId = null, poems = []) {
  const rows = catalogueRows(ownerId, poems);
  const literal = s => "'" + s.replaceAll("'", "''") + "'";
  return `begin;\ninsert into public.works (id, owner_id, author_name, title, issue, tags, body, note, card, reading, status, published_at)\nselect id, owner_id, author_name, title, issue, tags, body, note, card, reading, status, published_at\nfrom jsonb_populate_recordset(null::public.works, ${literal(JSON.stringify(rows))}::jsonb)\non conflict (id) do nothing;\ncommit;\n`;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = process.argv.find(a => a.startsWith('--input='))?.slice(8);
  const poems = input ? JSON.parse(fs.readFileSync(input, 'utf8')) : [];
  console.log(buildSeedSql(process.env.POETEK_OWNER_ID || null, poems));
}
