/**
 * Modulo per le azioni di mutazione dello stato.
 */

import { State, isRemoteBeta, isPublicVisitor, reportBetaError, updateBetaChrome, requestPersonalAccess, currentWeekKey } from '../state/store.js';
import { PUBLISHED_STORAGE_KEY, SAVED_STORAGE_KEY, READING_EVENTS_STORAGE_KEY, LAST_AUTHOR_STORAGE_KEY, LOCAL_SESSION_STORAGE_KEY, PROFILE_STORAGE_KEY, DEFAULT_CARD, DEFAULT_READING } from '../config/constants.js';
import { cloneCardVisual, cloneReadingVisual, synchroniseDraftMedia, setDraftSharedMedia, workName } from '../views/cards.js';
import { ownerIdForPoem, canEditPoem, isUserCollection, profileRecord } from '../domain/selectors.js';
import { editingContext } from '../views/publish.js';
import { storeCardImage } from '../services/media.js';
import { syncRemoteContent } from '../services/backend-bridge.js';
import { normaliseText, splitCollectionText, readDocxDocument, docxXmlToText } from '../utils/parsers.js';
import { externalImageUrl } from '../utils/dom.js';

let _render = () => {};
let _changeRoute = () => {};
let _openCollection = () => {};
let _openPoem = () => {};

export function setRenderCallback(fn) {
    _render = fn;
}

export function setNavigationCallbacks({ changeRoute, openCollection, openPoem }) {
    _changeRoute = changeRoute;
    _openCollection = openCollection;
    _openPoem = openPoem;
}

export function persist() {
  localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify([...State.saved]));
  document.querySelectorAll(".saved-count").forEach((node) => { node.textContent = State.saved.size; });
}

export function persistReadingEvents() {
  localStorage.setItem(READING_EVENTS_STORAGE_KEY, JSON.stringify(State.readingEvents));
}

export function persistPublishedState() {
  localStorage.setItem(PUBLISHED_STORAGE_KEY, JSON.stringify({ poems: State.userPublishedPoems, collections: State.publishedState.collections, homeItems: State.publishedState.homeItems }));
  void syncRemoteContent();
}

export function persistProfileState() {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(State.profileState));
  if (isRemoteBeta() && State.betaReady) {
    const profile = profileRecord(State.activeSession.accountId);
    window.PoetekBackend.updateProfile({ avatar_url: profile.imageUrl || profile.imageId || null }).catch(reportBetaError);
  }
}

export function persistProfileFollows() {
  State.profileState.following = [...State.followedAuthorIds];
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(State.profileState));
}

export function recordReading(type, id, author) {
  const now = Date.now();
  const alreadyRecorded = State.readingEvents.find((event) => event.type === type && event.id === id && now - Date.parse(event.at) < 60000);
  if (alreadyRecorded) return;
  State.readingEvents.unshift({ type, id, author, at: new Date(now).toISOString(), week: currentWeekKey(now) });
  State.readingEvents.splice(120);
  persistReadingEvents();
  if (isRemoteBeta() && State.betaReady) {
    window.PoetekBackend.recordReading(type, id)
      .then((count) => {
        if (!count) return;
        State.remoteReadCounts.set(`${type}:${id}`, count);
        // Se chi legge torna subito alla home, la nuova posizione nella
        // classifica è già visibile senza dover ricaricare la pagina.
        const app = document.querySelector("#app");
        if (State.route === "home" && !State.collectionViewId && !(app && app.querySelector(".reader"))) _render();
      })
      .catch(reportBetaError);
  }
}

export function toggleSave(id) {
  if (isPublicVisitor()) {
    requestPersonalAccess();
    return;
  }
  const reading = Boolean(State.app.querySelector(".reader"));
  State.saved.has(id) ? State.saved.delete(id) : State.saved.add(id);
  persist();
  if (isRemoteBeta() && State.betaReady) window.PoetekBackend.syncLibrary([...State.saved]).catch(reportBetaError);
  if (reading) _openPoem(id, false);
  else _render();
}

function normaliseTheme(value) {
  return value.trim().replace(/\s+/g, " ");
}

export function addPublicationTheme(value) {
  const theme = normaliseTheme(value);
  if (!theme || State.publicationDraft.themes.includes(theme) || State.publicationDraft.themes.length >= 5) return;
  State.publicationDraft.themes.push(theme);
  _render();
}

export function removePublicationTheme(index) {
  State.publicationDraft.themes.splice(index, 1);
  _render();
}

export function publicationId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function saveCollectionCard() {
  const collectionEditing = State.editingCollectionId ? State.publishedState.collections.find((entry) => entry.id === State.editingCollectionId) : null;
  if (collectionEditing) {
    collectionEditing.card = cloneCardVisual(State.publicationDraft.card);
    persistPublishedState();
    State.publicationNotice = `Locandina aggiornata: ${collectionEditing.title}.`;
    State.editingCollectionId = "";
    State.importFeedback = "";
    _openCollection(collectionEditing.id);
  }
}

export function submitPublication() {
  if (isPublicVisitor()) {
    requestPersonalAccess();
    return;
  }

  if (State.editingCollectionId) {
    saveCollectionCard();
    return;
  }

  if (State.editingPoemId) {
    savePublicationEdits();
    return;
  }

  synchroniseDraftMedia();

  const targetCollection = State.targetCollectionId ? State.publishedState.collections.find((entry) => entry.id === State.targetCollectionId) : null;
  const author = (isRemoteBeta() ? State.activeSession.displayName : State.publicationDraft.author).trim();
  const text = normaliseText(State.publicationDraft.text);
  const collectionTitle = State.publicationDraft.collection.trim();
  const themes = [...State.publicationDraft.themes];

  if (!author || !text || (!targetCollection && State.publicationType === "collection" && !collectionTitle)) {
    State.importFeedback = !targetCollection && State.publicationType === "collection" ? "Inserisci autore, titolo della raccolta e testo prima di pubblicare." : "Inserisci autore e testo prima di pubblicare.";
    _render();
    return;
  }

  if (targetCollection) {
    const createdAt = new Date().toISOString();
    const poem = {
      id: publicationId("opera"),
      number: `${targetCollection.poemIds.length + 1}.`,
      title: State.publicationDraft.title.trim(),
      author: targetCollection.author,
      issue: `${targetCollection.title} · ${targetCollection.poemIds.length + 1}`,
      tags: themes,
      text,
      note: "Componimento pubblicato nella Beta Poetek.",
      collection: targetCollection.title,
      collectionId: targetCollection.id,
      publishedAt: createdAt,
      ownerId: targetCollection.ownerId,
      card: cloneCardVisual(State.publicationDraft.card),
      reading: cloneReadingVisual(State.publicationDraft.reading)
    };
    State.userPublishedPoems.unshift(poem);
    State.poems.unshift(poem);
    targetCollection.poemIds.push(poem.id);
    targetCollection.description = `${targetCollection.poemIds.length} ${targetCollection.poemIds.length === 1 ? "componimento" : "componimenti"}`;
    themes.forEach((theme) => { if (!State.allTags.includes(theme)) State.allTags.push(theme); });
    // Anche un testo aggiunto in un secondo momento a una raccolta è un nuovo
    // ingresso della giornata: non deve scomparire dalla cronologia home.
    const homeItem = { type: "poem", id: poem.id, popularity: 0, publishedAt: createdAt };
    State.homeCatalogueItems.unshift(homeItem);
    State.publishedState.homeItems.unshift(homeItem);
    persistPublishedState();
    State.publicationNotice = `Poesia aggiunta: ${workName(poem)}.`;
    State.targetCollectionId = "";
    resetPublicationDraft();
    State.importFeedback = "";
    _openCollection(targetCollection.id);
    return;
  }

  const parts = State.publicationType === "collection" ? splitCollectionText(text) : [text];
  const createdAt = new Date().toISOString();
  const collectionId = State.publicationType === "collection" ? publicationId("raccolta") : "";
  const createdPoems = parts.map((part, index) => ({
    id: publicationId("opera"),
    number: State.publicationType === "collection" ? `${index + 1}.` : "",
    title: State.publicationType === "single" ? State.publicationDraft.title.trim() : "",
    author,
    issue: State.publicationType === "collection" ? `${collectionTitle} · ${index + 1}` : "Pubblicazione diretta",
    tags: themes,
    text: part,
    note: "Opera pubblicata nella Beta Poetek.",
    collection: State.publicationType === "collection" ? collectionTitle : "Testi singoli",
    collectionId: State.publicationType === "collection" ? collectionId : "",
    publishedAt: createdAt,
    ownerId: State.activeSession.accountId,
    card: cloneCardVisual(State.publicationDraft.card),
    reading: cloneReadingVisual(State.publicationDraft.reading)
  }));

  State.userPublishedPoems.unshift(...createdPoems);
  State.poems.unshift(...createdPoems);
  themes.forEach((theme) => { if (!State.allTags.includes(theme)) State.allTags.push(theme); });

  let homeItem;
  if (State.publicationType === "collection") {
    const collection = {
      id: collectionId,
      title: collectionTitle,
      author,
      description: `${createdPoems.length} ${createdPoems.length === 1 ? "componimento" : "componimenti"}`,
      note: "Raccolta pubblicata nella Beta Poetek.",
      poemIds: createdPoems.map((poem) => poem.id),
      ownerId: State.activeSession.accountId,
      card: cloneCardVisual(State.publicationDraft.card)
    };
    State.catalogueCollections.unshift(collection);
    State.publishedState.collections.unshift(collection);
    State.collectionMap.set(collection.id, collection);
    homeItem = { type: "collection", id: collection.id, popularity: 0, publishedAt: createdAt };
  } else {
    homeItem = { type: "poem", id: createdPoems[0].id, popularity: 0, publishedAt: createdAt };
  }

  State.homeCatalogueItems.unshift(homeItem);
  State.publishedState.homeItems.unshift(homeItem);
  persistPublishedState();
  State.publicationNotice = State.publicationType === "collection" ? `Raccolta pubblicata: ${collectionTitle}.` : "Testo pubblicato nel tuo profilo.";
  const collectionToOpen = State.publicationType === "collection" ? State.collectionMap.get(collectionId) : null;
  State.targetCollectionId = "";
  State.editingCollectionId = "";
  resetPublicationDraft();
  State.importFeedback = "";
  if (collectionToOpen) _openCollection(collectionToOpen.id);
  // Chi pubblica atterra sul proprio profilo. Qui la rotta era fissata a
  // quella di Pietro Botarelli: quando lui era l'unico autore coincidevano,
  // adesso che pubblica anche altra gente mandava tutti a casa d'altri.
  else _changeRoute("account");
}

export function savePublicationEdits() {
  const context = editingContext();
  const author = State.publicationDraft.author.trim();
  const text = normaliseText(State.publicationDraft.text);
  if (!context || !author || !text) {
    State.importFeedback = "Inserisci autore e testo prima di salvare le modifiche.";
    _render();
    return;
  }

  context.poem.title = State.publicationDraft.title.trim();
  context.poem.text = text;
  context.poem.tags = [...State.publicationDraft.themes];
  context.poem.note = "Opera modificata nella Beta Poetek.";
  context.poem.publishedAt = context.poem.publishedAt || new Date().toISOString();
  context.poem.card = cloneCardVisual(State.publicationDraft.card);
  context.poem.reading = cloneReadingVisual(State.publicationDraft.reading);
  context.poem.tags.forEach((theme) => { if (!State.allTags.includes(theme)) State.allTags.push(theme); });
  persistPublishedState();
  State.publicationNotice = `Modifiche salvate: ${workName(context.poem)}.`;
  State.editingPoemId = null;
  resetPublicationDraft();
  State.importFeedback = "";
  if (context.collection) _openCollection(context.collection.id);
  else _changeRoute("account");
}

export function resetPublicationDraft() {
  State.publicationDraft.author = State.activeSession.displayName;
  State.publicationDraft.title = "";
  State.publicationDraft.collection = "";
  State.publicationDraft.themes = [];
  State.publicationDraft.text = "";
  State.publicationDraft.card = { ...DEFAULT_CARD };
  State.publicationDraft.reading = { ...DEFAULT_READING };
}

export function startEditingPoem(id) {
  const original = State.poems.find((entry) => entry.id === id);
  if (!original || !canEditPoem(original)) return;
  const poem = original && (State.userPublishedPoems.find((entry) => entry.id === id) || promoteOwnedPoem(original));
  if (!poem) return;
  const collection = State.catalogueCollections.find((entry) => entry.poemIds.includes(poem.id));
  State.editingPoemId = poem.id;
  State.editingCollectionId = "";
  State.targetCollectionId = "";
  State.publicationType = collection ? "collection" : "single";
  State.publicationDraft.author = poem.author;
  State.publicationDraft.title = poem.title || "";
  State.publicationDraft.collection = collection?.title || "";
  State.publicationDraft.themes = [...(poem.tags || [])];
  State.publicationDraft.text = poem.text;
  State.publicationDraft.card = cloneCardVisual(poem.card);
  State.publicationDraft.reading = cloneReadingVisual(poem.reading);
  synchroniseDraftMedia();
  State.importFeedback = "";
  _changeRoute("publish");
}

export function startAddingToCollection(id) {
  const original = State.catalogueCollections.find((entry) => entry.id === id);
  if (!original || !isUserCollection(original)) return;
  const collection = original && (State.publishedState.collections.find((entry) => entry.id === id) || promoteOwnedCollection(original));
  if (!collection) return;
  State.editingPoemId = null;
  State.editingCollectionId = "";
  State.targetCollectionId = collection.id;
  State.publicationType = "single";
  resetPublicationDraft();
  State.publicationDraft.author = collection.author;
  State.publicationDraft.collection = collection.title;
  State.publicationDraft.card = cloneCardVisual(collection.card);
  synchroniseDraftMedia("card");
  State.importFeedback = "";
  _changeRoute("publish");
}

export function startEditingCollectionCard(id) {
  const original = State.catalogueCollections.find((entry) => entry.id === id);
  if (!original || !isUserCollection(original)) return;
  const collection = original && (State.publishedState.collections.find((entry) => entry.id === id) || promoteOwnedCollection(original));
  if (!collection) return;
  State.editingPoemId = null;
  State.targetCollectionId = "";
  State.editingCollectionId = collection.id;
  State.publicationType = "collection";
  resetPublicationDraft();
  State.publicationDraft.author = collection.author;
  State.publicationDraft.collection = collection.title;
  State.publicationDraft.card = cloneCardVisual(collection.card);
  State.importFeedback = "";
  _changeRoute("publish");
}

export function promoteOwnedPoem(poem) {
  const saved = State.userPublishedPoems.find((entry) => entry.id === poem.id);
  if (saved) return canEditPoem(saved) ? saved : null;
  if (!canEditPoem(poem)) return null;
  const editable = { ...poem, ownerId: State.activeSession.accountId, tags: [...(poem.tags || [])], card: cloneCardVisual(poem.card) };
  State.userPublishedPoems.unshift(editable);
  const globalIndex = State.poems.findIndex((entry) => entry.id === poem.id);
  if (globalIndex >= 0) State.poems[globalIndex] = editable;
  const importedIndex = State.collectionPoems.findIndex((entry) => entry.id === poem.id);
  if (importedIndex >= 0) State.collectionPoems[importedIndex] = editable;
  persistPublishedState();
  return editable;
}

export function promoteOwnedCollection(collection) {
  const saved = State.publishedState.collections.find((entry) => entry.id === collection.id);
  if (saved) return isUserCollection(saved) ? saved : null;
  if (!isUserCollection(collection)) return null;
  const editable = { ...collection, ownerId: State.activeSession.accountId, poemIds: [...collection.poemIds], card: cloneCardVisual(collection.card) };
  State.publishedState.collections.unshift(editable);
  const catalogueIndex = State.catalogueCollections.findIndex((entry) => entry.id === collection.id);
  if (catalogueIndex >= 0) State.catalogueCollections[catalogueIndex] = editable;
  State.collectionMap.set(editable.id, editable);
  persistPublishedState();
  return editable;
}

export function updateProfileRecord(ownerId, changes) {
  if (!ownerId || ownerId !== State.activeSession.accountId) return null;
  State.profileState.profiles[ownerId] = {
    ...profileRecord(ownerId),
    ...changes,
    ownerId,
    updatedAt: new Date().toISOString()
  };
  persistProfileState();
  return State.profileState.profiles[ownerId];
}

export async function importProfileImage(file, ownerId) {
  if (!file || ownerId !== State.activeSession.accountId) return;
  try {
    if (isRemoteBeta()) {
      const media = await window.PoetekBackend.uploadMedia(file, "avatars");
      State.cardMediaUrls.set(media.imageId, media.previewUrl);
      updateProfileRecord(ownerId, { imageId: media.imageId, imageUrl: "" });
    } else {
      const imageId = await storeCardImage(file);
      updateProfileRecord(ownerId, { imageId, imageUrl: "" });
    }
  } catch (error) {
    State.profileNotice = error instanceof Error ? error.message : "L'immagine profilo non può essere utilizzata.";
  }
  _render();
}

export function setProfileImageUrl(value, ownerId) {
  if (ownerId !== State.activeSession.accountId) return;
  const imageUrl = externalImageUrl(value);
  if (String(value || "").trim() && !imageUrl) {
    State.profileNotice = "L'URL dell'immagine profilo deve iniziare con http:// o https://.";
    _render();
    return;
  }
  updateProfileRecord(ownerId, { imageId: "", imageUrl });
  State.profileNotice = "";
  _render();
}

export function removeProfileImage(ownerId) {
  if (ownerId !== State.activeSession.accountId) return;
  updateProfileRecord(ownerId, { imageId: "", imageUrl: "" });
  _render();
}

export function applyOwnedAuthorName(ownerId, name, previous = State.activeSession.displayName) {
  State.profileState.profiles[ownerId] = { ...State.profileState.profiles[ownerId], ownerId, displayName: name };
  State.poems.forEach((poem) => {
    if (ownerIdForPoem(poem) === ownerId || poem.ownerId === ownerId) poem.author = name;
  });
  State.catalogueCollections.forEach((collection) => {
    if (collection.ownerId === ownerId) collection.author = name;
  });
  State.publishedState.collections.forEach((collection) => {
    if (collection.ownerId === ownerId) collection.author = name;
  });
  if (State.activeAuthor === previous) State.activeAuthor = `id:${ownerId}`;
  if (State.lastAuthor === previous) {
    State.lastAuthor = name;
    localStorage.setItem(LAST_AUTHOR_STORAGE_KEY, name);
  }
}

export async function saveProfileDisplayName(ownerId) {
  if (ownerId !== State.activeSession.accountId) return;
  const input = document.querySelector("#profile-display-name");
  const name = String(input?.value || "").trim().replace(/\s+/g, " ");
  if (!name || name.length > 80) {
    State.profileNotice = "Il nome profilo deve contenere da 1 a 80 caratteri.";
    _render();
    return;
  }
  const previous = State.activeSession.displayName;
  try {
    const profile = isRemoteBeta() && State.betaReady
      ? await window.PoetekBackend.updateProfile({ display_name: name })
      : { display_name: name };
    const nextName = profile?.display_name || name;
    applyOwnedAuthorName(ownerId, nextName, previous);
    State.activeSession.displayName = nextName;
    if (isRemoteBeta()) localStorage.removeItem(LOCAL_SESSION_STORAGE_KEY);
    else localStorage.setItem(LOCAL_SESSION_STORAGE_KEY, JSON.stringify(State.activeSession));
    State.publicationDraft.author = nextName;
    State.profileNotice = "Nome profilo aggiornato.";
    updateBetaChrome();
    if (State.route === "author" && State.activeAuthor === previous) State.activeAuthor = `id:${ownerId}`;
  } catch (error) {
    State.profileNotice = error instanceof Error ? error.message : "Non è possibile aggiornare il nome profilo.";
  }
  _render();
}

export async function toggleAuthorFollow(ownerId) {
  if (isPublicVisitor()) {
    requestPersonalAccess();
    return;
  }
  if (!ownerId || ownerId === State.activeSession.accountId) return;
  const shouldFollow = !State.followedAuthorIds.has(ownerId);
  try {
    if (isRemoteBeta() && State.betaReady) await window.PoetekBackend.setAuthorFollow(ownerId, shouldFollow);
    if (shouldFollow) {
      State.followedAuthorIds.add(ownerId);
      State.authorFollowerCounts.set(ownerId, (State.authorFollowerCounts.get(ownerId) || 0) + 1);
    } else {
      State.followedAuthorIds.delete(ownerId);
      State.authorFollowerCounts.set(ownerId, Math.max(0, (State.authorFollowerCounts.get(ownerId) || 1) - 1));
    }
    persistProfileFollows();
    State.profileNotice = shouldFollow ? "Ora segui questo autore." : "Non segui più questo autore.";
  } catch (error) {
    State.profileNotice = error instanceof Error ? error.message : "Non è possibile aggiornare i seguiti.";
  }
  _render();
}

export async function importPublicationFile(file) {
  if (!file) return;
  try {
    const lowerName = file.name.toLowerCase();
    if (file.size > 5 * 1024 * 1024) throw new Error("Il documento non può superare 5 MB.");
    const importedText = lowerName.endsWith(".txt") ? await file.text() : lowerName.endsWith(".docx") ? docxXmlToText(await readDocxDocument(await file.arrayBuffer())) : null;
    if (!importedText) throw new Error("Scegli un file .txt o .docx.");
    State.publicationDraft.text = normaliseText(importedText);
    State.importFeedback = `Importato “${file.name}”. Controlla il testo prima di pubblicare.`;
  } catch (error) {
    State.importFeedback = error instanceof Error ? error.message : "Il file non può essere importato.";
  }
  _render();
}

export async function importCardImage(file) {
  if (!file) return;
  try {
    if (isRemoteBeta()) {
      const media = await window.PoetekBackend.uploadMedia(file, "covers");
      State.cardMediaUrls.set(media.imageId, media.previewUrl);
      setDraftSharedMedia({ imageId: media.imageId, imageUrl: "" });
    } else {
      const imageId = await storeCardImage(file);
      setDraftSharedMedia({ imageId, imageUrl: "" });
    }
    State.importFeedback = "";
  } catch (error) {
    State.importFeedback = error instanceof Error ? error.message : "L'immagine non può essere utilizzata.";
  }
  _render();
}

export async function importPoemImage(file) {
  if (!file) return;
  // Il file e' gia' sul dispositivo: mostrarlo non richiede di aspettare il
  // server. Prima si vede, poi si carica.
  liberaAnteprimaLocale();
  State.anteprimaImmagineLocale = URL.createObjectURL(file);
  _render();
  try {
    if (isRemoteBeta()) {
      const media = await window.PoetekBackend.uploadMedia(file, "poem-images");
      State.cardMediaUrls.set(media.imageId, media.previewUrl);
      setDraftSharedMedia({ imageId: media.imageId, imageUrl: "" });
    } else {
      const imageId = await storeCardImage(file);
      setDraftSharedMedia({ imageId, imageUrl: "" });
    }
    State.importFeedback = "";
  } catch (error) {
    State.importFeedback = error instanceof Error ? error.message : "L'immagine non può essere utilizzata.";
  }
  // L'originale ha preso il posto della copia locale: si rende, e solo dopo
  // si libera, altrimenti l'immagine sparirebbe per un istante.
  const provvisoria = State.anteprimaImmagineLocale;
  State.anteprimaImmagineLocale = "";
  _render();
  if (provvisoria) URL.revokeObjectURL(provvisoria);
}

// L'indirizzo del blob resta valido finché non lo si revoca: senza questo
// ogni immagine scelta lascerebbe dietro di sé un pezzo di memoria.
export function liberaAnteprimaLocale() {
  if (!State.anteprimaImmagineLocale) return;
  URL.revokeObjectURL(State.anteprimaImmagineLocale);
  State.anteprimaImmagineLocale = "";
}

export function setPoemImageUrl(value) {
  liberaAnteprimaLocale();
  const urlValue = externalImageUrl(value);
  setDraftSharedMedia({ imageId: "", imageUrl: urlValue });
  State.importFeedback = value.trim() && !urlValue ? "L'URL dell'immagine deve iniziare con http:// o https://." : "";
  _render();
}

export function setCardImageUrl(value) {
  const urlValue = externalImageUrl(value);
  setDraftSharedMedia({ imageId: "", imageUrl: urlValue });
  State.importFeedback = value.trim() && !urlValue ? "L'URL dell'immagine deve iniziare con http:// o https://." : "";
  _render();
}
