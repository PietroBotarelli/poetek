import { seedPoems } from '../web/data/seed.js';

export function catalogueRows(ownerId = null, poems = seedPoems) {
  if (ownerId !== null && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(ownerId)) throw new Error('Owner ID non valido');
  if (!Array.isArray(poems)) throw new Error('Il catalogo esterno deve essere un array di opere');
  return poems.map(p => ({ id: p.id, owner_id: ownerId, author_name: p.author,
    title: p.title || null, issue: p.issue, tags: p.tags, body: p.text,
    note: p.note || '', card: {}, reading: {}, status: 'published', published_at: '2026-10-30T12:00:00Z' }));
}
export function adminConnection() {
  const url = new URL(process.env.POETEK_SUPABASE_URL || 'https://missing.invalid');
  if (url.protocol !== 'https:' || url.hostname === 'missing.invalid') throw new Error('Impostare POETEK_SUPABASE_URL con un URL HTTPS');
  const key = process.env.POETEK_SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Impostare POETEK_SUPABASE_SERVICE_ROLE_KEY solo nel terminale');
  return { url: url.origin, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}
