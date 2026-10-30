/**
 * Gestione dei file multimediali e salvataggio in IndexedDB.
 */
import { State } from '../state/store.js';
import { MEDIA_DATABASE_NAME, MEDIA_DATABASE_VERSION, MEDIA_STORE_NAME } from '../config/constants.js';

let renderCallback = () => {};

export function setRenderCallback(fn) {
  renderCallback = fn;
}

// Logica minima per estrarre l'ID dell'immagine da card o reading,
// senza importare tutti i default dell'interfaccia utente.
function cardVisual(value) {
  const source = value && typeof value === "object" ? value : {};
  return { imageId: typeof source.imageId === "string" ? source.imageId : "" };
}

function readingVisual(value) {
  const source = value && typeof value === "object" ? value : {};
  return { imageId: typeof source.imageId === "string" ? source.imageId : "" };
}

export function mediaDatabase() {
  if (State.cardMediaDatabasePromise) return State.cardMediaDatabasePromise;
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("La memoria immagini non è disponibile in questo browser."));
  State.cardMediaDatabasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(MEDIA_DATABASE_NAME, MEDIA_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(MEDIA_STORE_NAME)) request.result.createObjectStore(MEDIA_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Non è possibile aprire la memoria immagini."));
  });
  return State.cardMediaDatabasePromise;
}

export async function storeCardImage(file) {
  if (!file || !file.type.startsWith("image/")) throw new Error("Scegli un file immagine valido.");
  const id = `immagine-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const database = await mediaDatabase();
  await new Promise((resolve, reject) => {
    const request = database.transaction(MEDIA_STORE_NAME, "readwrite").objectStore(MEDIA_STORE_NAME).put(file, id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("L'immagine non può essere salvata."));
  });
  State.cardMediaUrls.set(id, URL.createObjectURL(file));
  return id;
}

export async function loadCardImage(id) {
  if (!id || State.cardMediaUrls.has(id)) return;
  const database = await mediaDatabase();
  const blob = await new Promise((resolve, reject) => {
    const request = database.transaction(MEDIA_STORE_NAME, "readonly").objectStore(MEDIA_STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("L'immagine non può essere letta."));
  });
  if (blob) State.cardMediaUrls.set(id, URL.createObjectURL(blob));
}

export async function hydrateCardImages() {
  const cardIds = [...State.poems, ...State.catalogueCollections].map((item) => cardVisual(item.card).imageId).filter(Boolean);
  const poemImageIds = State.poems.map((poem) => readingVisual(poem.reading).imageId).filter(Boolean);
  // Gli avatar usano lo stesso archivio binario delle locandine, ma restano
  // associati al profile/owner id e non al nome visualizzato dell'autore.
  const profileIds = Object.values(State.profileState.profiles).map((profile) => profile?.imageId).filter(Boolean);
  const ids = [...cardIds, ...poemImageIds, ...profileIds];
  if (!ids.length) return;
  await Promise.all([...new Set(ids)].map((id) => loadCardImage(id).catch(() => undefined)));
  renderCallback();
}
