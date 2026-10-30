/*
 * Importa il formato storico poetek-local-export/v1.
 * Non richiede il catalogo dimostrativo. Eseguire prima su un ambiente di prova.
 */
import fs from "node:fs";
import { adminConnection } from "./catalogue.mjs";

if (!process.argv.includes("--apply")) { console.log("Importazione privata: nessuna scrittura. Impostare le variabili documentate e usare --apply."); process.exit(0); }

const required = ["POETEK_SUPABASE_URL", "POETEK_SUPABASE_SERVICE_ROLE_KEY", "POETEK_OWNER_ID", "POETEK_EXPORT_FILE"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Variabili mancanti: ${missing.join(", ")}`);

const exported = JSON.parse(fs.readFileSync(process.env.POETEK_EXPORT_FILE, "utf8"));
if (exported.format !== "poetek-local-export/v1") throw new Error("Il file non è un’esportazione Poetek valida.");
const local = exported.local || {};
const state = local["poetek-published-works"] || { poems: [], collections: [] };
const ownerId = process.env.POETEK_OWNER_ID;
const { url, headers } = adminConnection();

const storageRef = (path) => `storage://poetek-media/${path}`;
const mediaReferences = new Map();
for (const media of exported.media || []) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(media.dataUrl || "");
  if (!match) continue;
  const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" })[match[1]];
  if (!extension || Buffer.byteLength(match[2], "base64") > 10 * 1024 * 1024) throw new Error("Immagine non supportata o troppo grande");
  const path = `${ownerId}/migration/${String(media.id).replace(/[^a-z0-9-]/gi, "-")}.${extension}`;
  const response = await fetch(`${url}/storage/v1/object/poetek-media/${path}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": match[1], "x-upsert": "true" },
    body: Buffer.from(match[2], "base64")
  });
  if (!response.ok) throw new Error(`Immagine ${media.id}: ${response.status} ${await response.text()}`);
  mediaReferences.set(String(media.id), storageRef(path));
}

function migrateCard(value) {
  const card = value && typeof value === "object" ? { ...value } : {};
  if (card.imageId && mediaReferences.has(card.imageId)) {
    card.imageId = mediaReferences.get(card.imageId);
    card.imageUrl = "";
  }
  return card;
}

async function upsert(table, rows, conflict = "id") {
  if (!rows.length) return;
  const response = await fetch(`${url}/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows)
  });
  if (!response.ok) throw new Error(`${table}: ${response.status} ${await response.text()}`);
}

const collections = (state.collections || []).map((collection) => ({
  id: collection.id,
  owner_id: ownerId,
  author_name: collection.author,
  title: collection.title,
  description: collection.description || "",
  note: collection.note || "",
  card: migrateCard(collection.card),
  status: "published",
  published_at: collection.publishedAt || new Date().toISOString()
}));
await upsert("collections", collections);
const collectionIds = new Map(collections.map((collection) => [`${collection.author_name}::${collection.title}`, collection.id]));
const works = (state.poems || []).map((poem) => ({
  id: poem.id,
  owner_id: ownerId,
  collection_id: poem.collectionId || collectionIds.get(`${poem.author}::${poem.collection}`) || null,
  author_name: poem.author,
  title: poem.title || null,
  issue: poem.issue || "Pubblicazione Beta",
  tags: Array.isArray(poem.tags) ? poem.tags.slice(0, 5) : [],
  body: poem.text,
  note: poem.note || "",
  card: migrateCard(poem.card),
  reading: migrateCard(poem.reading),
  position: Number.parseInt(String(poem.number || ""), 10) || null,
  status: "published",
  published_at: poem.publishedAt || new Date().toISOString()
}));
await upsert("works", works);

const profileState = local["poetek-author-profiles"]?.profiles || {};
const localSession = local["poetek-local-session"] || {};
const oldProfile = profileState[localSession.accountId] || Object.values(profileState)[0] || {};
const avatarUrl = oldProfile.imageId && mediaReferences.has(oldProfile.imageId) ? mediaReferences.get(oldProfile.imageId) : oldProfile.imageUrl || null;
const lastAuthor = typeof local["poetek-last-author"] === "string" ? local["poetek-last-author"] : null;
if (avatarUrl) {
  const response = await fetch(`${url}/rest/v1/profiles?id=eq.${ownerId}`, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ avatar_url: avatarUrl }) });
  if (!response.ok) throw new Error(`Profilo: ${response.status} ${await response.text()}`);
}

if (lastAuthor) await upsert("profile_preferences", [{ user_id: ownerId, last_author: lastAuthor.slice(0, 80) }], "user_id");
const saved = Array.isArray(local["poetek-saved"]) ? local["poetek-saved"] : [];
await upsert("library_items", saved.map((workId) => ({ user_id: ownerId, work_id: workId })), "user_id,work_id");
console.log(`Migrazione completata: ${collections.length} raccolte, ${works.length} opere e ${mediaReferences.size} immagini.`);
