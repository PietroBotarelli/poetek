/**
 * Servizi per l'integrazione con il backend e la sincronizzazione dello stato remoto.
 */
import { State, isRemoteBeta, reportBetaError, updateBetaChrome } from '../state/store.js';
import { PROFILE_STORAGE_KEY } from '../config/constants.js';

let renderCallback = () => {};

export function setRenderCallback(fn) {
  renderCallback = fn;
}

// Due righe si considerano uguali se sono scritte uguali: le opere e le
// raccolte arrivano sempre dalla stessa funzione di mappatura, quindi le
// chiavi hanno lo stesso ordine e il confronto testuale regge.
function impronta(entry) {
  return JSON.stringify(entry);
}

function registraImpronte(entries) {
  entries.forEach((entry) => { if (entry?.id) State.improntaRemota.set(entry.id, impronta(entry)); });
}

export function applyRemoteSnapshot(snapshot) {
  const remotePoems = snapshot.works || [];
  const remoteCollections = snapshot.collections || [];
  // Da qui in poi sappiamo che cosa ha il server, e possiamo distinguere
  // ciò che abbiamo toccato noi da ciò che ci è semplicemente passato fra
  // le mani.
  State.improntaRemota.clear();
  registraImpronte(remotePoems);
  registraImpronte(remoteCollections);
  State.userPublishedPoems.splice(0, State.userPublishedPoems.length, ...remotePoems);
  State.poems.splice(0, State.poems.length, ...remotePoems);
  State.publishedState.collections.splice(0, State.publishedState.collections.length, ...remoteCollections);
  State.catalogueCollections.splice(0, State.catalogueCollections.length, ...remoteCollections);
  State.collectionMap.clear();
  remoteCollections.forEach((collection) => State.collectionMap.set(collection.id, collection));
  State.publishedState.homeItems.splice(0, State.publishedState.homeItems.length, ...(snapshot.homeItems || []));
  State.homeCatalogueItems.splice(0, State.homeCatalogueItems.length, ...(snapshot.homeItems || []));
  State.allTags.splice(0, State.allTags.length, ...new Set(remotePoems.flatMap((poem) => poem.tags || [])));
  State.saved = new Set(snapshot.savedWorkIds || []);
  State.readingEvents.splice(0, State.readingEvents.length);
  State.remoteReadCounts.clear();
  Object.entries(snapshot.readCounts || {}).forEach(([key, value]) => State.remoteReadCounts.set(key, Number(value) || 0));
  Object.entries(snapshot.mediaUrls || {}).forEach(([imageId, url]) => State.cardMediaUrls.set(imageId, url));
  State.followedAuthorIds.clear();
  (snapshot.followingAuthorIds || []).forEach((authorId) => State.followedAuthorIds.add(authorId));
  State.authorFollowerCounts.clear();
  Object.entries(snapshot.followerCounts || {}).forEach(([authorId, count]) => State.authorFollowerCounts.set(authorId, Number(count) || 0));
  State.profileState.following = [...State.followedAuthorIds];
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(State.profileState));
  State.profileState.profiles = {};
  (snapshot.profiles || []).forEach((profile) => {
    const isStoredMedia = String(profile.avatar_url || "").startsWith("storage://poetek-media/");
    State.profileState.profiles[profile.id] = { ownerId: profile.id, displayName: profile.display_name, imageId: isStoredMedia ? profile.avatar_url : "", imageUrl: isStoredMedia ? "" : profile.avatar_url || "" };
  });
  if (snapshot.profile?.display_name) State.activeSession.displayName = snapshot.profile.display_name;
  State.publicationDraft.author = State.activeSession.displayName;
  State.lastAuthor = snapshot.profile?.last_author || "";
  updateBetaChrome();
}

// Che cosa, di quello che arriva dal server, si vede sullo schermo. Aprire
// una poesia scrive last_author sul profilo, il che fa scattare un
// aggiornamento in tempo reale: se poi si ridisegnasse tutto, chi sta
// leggendo vedrebbe la pagina rifarsi sotto gli occhi per un dato che non
// compare da nessuna parte.
function contenutoVisibileIdentico(snapshot) {
  if (Object.entries(snapshot.mediaUrls || {}).some(([id, url]) => State.cardMediaUrls.get(id) !== url)) return false;
  const opere = snapshot.works || [];
  const raccolte = snapshot.collections || [];
  if (opere.length + raccolte.length !== State.improntaRemota.size) return false;
  const invariate = [...opere, ...raccolte].every((entry) => State.improntaRemota.get(entry.id) === impronta(entry));
  if (!invariate) return false;

  const stessoInsieme = (arrivati, presenti) => {
    const a = [...(arrivati || [])].sort();
    const b = [...presenti].sort();
    return a.length === b.length && a.every((v, i) => v === b[i]);
  };
  if (!stessoInsieme(snapshot.savedWorkIds, State.saved)) return false;
  if (impronta(snapshot.readCounts || {}) !== impronta(Object.fromEntries(State.remoteReadCounts))) return false;
  if (impronta(snapshot.followerCounts || {}) !== impronta(Object.fromEntries(State.authorFollowerCounts))) return false;
  if (!stessoInsieme(snapshot.followingAuthorIds, State.followedAuthorIds)) return false;
  // I ritratti si confrontano nella stessa forma in cui vengono conservati,
  // altrimenti il paragone sarebbe fra cose diverse e non direbbe nulla.
  const daSnapshot = (snapshot.profiles || []).map((profilo) => {
    const inArchivio = String(profilo.avatar_url || "").startsWith("storage://poetek-media/");
    return `${profilo.id}:${inArchivio ? profilo.avatar_url : ""}:${inArchivio ? "" : profilo.avatar_url || ""}`;
  }).sort();
  const daStato = Object.values(State.profileState.profiles)
    .map((profilo) => `${profilo.ownerId}:${profilo.imageId || ""}:${profilo.imageUrl || ""}`).sort();
  return impronta(daSnapshot) === impronta(daStato);
}

export async function refreshRemoteSnapshot() {
  if (State.liveRefreshInFlight || !isRemoteBeta() || !State.betaReady) return;
  State.liveRefreshInFlight = true;
  try {
    const snapshot = await window.PoetekBackend.loadSnapshot();
    const nienteDiNuovoDaMostrare = contenutoVisibileIdentico(snapshot);
    applyRemoteSnapshot(snapshot);
    if (!nienteDiNuovoDaMostrare) renderCallback();
  } catch (error) {
    console.warn("Aggiornamento in tempo reale non disponibile.", error);
  } finally {
    State.liveRefreshInFlight = false;
  }
}

export function scheduleRemoteSnapshotRefresh() {
  if (State.liveRefreshTimer) window.clearTimeout(State.liveRefreshTimer);
  State.liveRefreshTimer = window.setTimeout(() => {
    State.liveRefreshTimer = null;
    void refreshRemoteSnapshot();
  }, 450);
}

export async function syncRemoteContent() {
  if (!isRemoteBeta() || !State.betaReady) return;
  const poems = State.userPublishedPoems;
  const collections = State.publishedState.collections;

  // Senza impronte non sappiamo che cosa abbia il server: si manda tutto,
  // perché non far arrivare una pubblicazione è peggio che riscriverla.
  const alBuio = State.improntaRemota.size === 0;
  const cambiati = new Set();
  if (!alBuio) {
    const confronta = (entry) => {
      if (entry?.id && State.improntaRemota.get(entry.id) !== impronta(entry)) cambiati.add(entry.id);
    };
    poems.forEach(confronta);
    collections.forEach(confronta);
    if (!cambiati.size) return;
  }

  try {
    await window.PoetekBackend.syncContent({ poems, collections, changedIds: alBuio ? null : cambiati });
    // Quello che è appena partito è ora anche quello che il server ha: senza
    // questo il salvataggio successivo lo rimanderebbe daccapo.
    if (!alBuio) {
      registraImpronte(poems.filter((poem) => cambiati.has(poem.id)));
      registraImpronte(collections.filter((collection) => cambiati.has(collection.id)));
    }
  } catch (error) {
    reportBetaError(error);
  }
}
