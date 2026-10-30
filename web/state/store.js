/**
 * state/store.js — Stato centralizzato dell'applicazione Poetek.
 *
 * Ogni modulo importa `State` e legge/scrive direttamente sulle sue
 * proprietà. Lo stato iniziale viene costruito qui a partire dai dati
 * seed, dal localStorage e dalla configurazione del backend.
 */

import {
  PUBLISHED_STORAGE_KEY,
  LOCAL_SESSION_STORAGE_KEY,
  PROFILE_STORAGE_KEY,
  SAVED_STORAGE_KEY,
  READING_EVENTS_STORAGE_KEY,
  READER_BACKGROUND_STORAGE_KEY,
  RECENT_SEARCHES_STORAGE_KEY,
  LAST_AUTHOR_STORAGE_KEY,
  DEFAULT_LOCAL_SESSION,
  DEFAULT_CARD,
  DEFAULT_READING
} from '../config/constants.js';

import { seedPoems, publicDomainPoems, aiPoems } from '../data/seed.js';

// ── Lettura del localStorage ────────────────────────────────────────

function readLocalSession() {
  try {
    const stored = JSON.parse(localStorage.getItem(LOCAL_SESSION_STORAGE_KEY) || "null");
    return stored && typeof stored.accountId === "string" && typeof stored.displayName === "string" ? { ...DEFAULT_LOCAL_SESSION, ...stored } : { ...DEFAULT_LOCAL_SESSION };
  } catch {
    return { ...DEFAULT_LOCAL_SESSION };
  }
}

function readReadingEvents() {
  try {
    const stored = JSON.parse(localStorage.getItem(READING_EVENTS_STORAGE_KEY) || "[]");
    const cutoff = Date.now() - 1000 * 60 * 60 * 24 * 56;
    return Array.isArray(stored) ? stored.filter((event) => event && typeof event.type === "string" && typeof event.id === "string" && Date.parse(event.at) >= cutoff) : [];
  } catch {
    return [];
  }
}

function readPublishedState() {
  const empty = { poems: [], collections: [], homeItems: [] };
  try {
    const stored = JSON.parse(localStorage.getItem(PUBLISHED_STORAGE_KEY) || "null");
    return stored && Array.isArray(stored.poems) && Array.isArray(stored.collections) && Array.isArray(stored.homeItems) ? stored : empty;
  } catch {
    return empty;
  }
}

function readProfileState() {
  const empty = { profiles: {}, following: [] };
  try {
    const stored = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || "null");
    if (!stored || !stored.profiles || typeof stored.profiles !== "object" || Array.isArray(stored.profiles)) return empty;
    return { ...stored, following: Array.isArray(stored.following) ? stored.following.filter((id) => typeof id === "string") : [] };
  } catch {
    return empty;
  }
}

// ── Costruzione dello stato iniziale ────────────────────────────────

const publishedState = readPublishedState();

// In una Beta remota non ereditiamo mai la sessione dimostrativa locale: finché Supabase non conferma un profilo, la persona è una visitatrice o un visitatore.
const initialSession = window.PoetekBackend?.isConfigured?.()
  ? { accountId: "", displayName: "", role: "visitor" }
  : readLocalSession();

const profileState = readProfileState();
const userPublishedPoems = publishedState.poems;

// Migrazione dei contenuti già creati nel prototipo: in produzione ownerId arriva dal server.
userPublishedPoems.forEach((poem) => { if (!poem.ownerId) poem.ownerId = initialSession.accountId; });
publishedState.collections.forEach((collection) => { if (!collection.ownerId) collection.ownerId = initialSession.accountId; });

const collectionPoems = [];
const basePoems = [...seedPoems, ...publicDomainPoems, ...aiPoems].filter((poem) => !userPublishedPoems.some((entry) => entry.id === poem.id));
const initialCollections = [...publishedState.collections];
const initialHomeItems = [...publishedState.homeItems, ...basePoems.map((poem) => ({ type: "poem", id: poem.id, popularity: 0, publishedAt: "2026-10-30" }))];

// ── Oggetto State centralizzato ─────────────────────────────────────

/**
 * Stato globale dell'applicazione. Ogni modulo importa questo oggetto
 * e legge/scrive direttamente sulle sue proprietà.
 */
export const State = {
  // Sessione e profilo
  activeSession: initialSession,
  publishedState,
  profileState,
  userPublishedPoems,

  // Catalogo
  poems: [...userPublishedPoems, ...basePoems],
  catalogueCollections: initialCollections,
  collectionMap: new Map(initialCollections.map((collection) => [collection.id, collection])),
  homeCatalogueItems: initialHomeItems,
  allTags: [...new Set([...userPublishedPoems, ...basePoems].flatMap((poem) => poem.tags || []))],
  collectionPoems,

  // DOM references
  app: document.querySelector("#app"),
  navLinks: [...document.querySelectorAll(".side-link")],

  // Navigazione e UI
  route: "home",
  activeTag: "tutti",
  searchQuery: "",
  recentSearches: (() => {
    try {
      const stored = JSON.parse(localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY) || "[]");
      return Array.isArray(stored) ? stored.filter((v) => typeof v === "string").slice(0, 8) : [];
    } catch { return []; }
  })(),
  collectionViewId: null,
  expandedHomeSection: "",
  activeAuthor: "",
  // Leggere è una posizione come le altre. Finché non lo era, il lettore
  // veniva scritto direttamente nella pagina e il primo render() lo
  // cancellava, riportando alla rotta rimasta indietro.
  readerPoemId: "",
  // Firma di ciò che si sta guardando: se una nuova resa mostra la stessa
  // cosa, si torna al punto in cui si stava leggendo invece che in cima.
  vistaResa: "",
  publicationType: "single",
  publicationNotice: "",
  importFeedback: "",
  // L'immagine scelta si vede subito, presa dal file sul telefono, mentre il
  // caricamento sul server e' ancora in corso: non entra mai nella bozza, e'
  // solo quello che l'autore ha davanti in attesa dell'originale.
  anteprimaImmagineLocale: "",
  editingPoemId: null,
  editingCollectionId: "",
  targetCollectionId: "",
  profileNotice: "",

  // Persistenza locale
  saved: new Set(JSON.parse(localStorage.getItem(SAVED_STORAGE_KEY) || "[]")),
  readerBackground: localStorage.getItem(READER_BACKGROUND_STORAGE_KEY) === "paper" ? "paper" : "default",
  // L'assenza di una lettura è uno stato reale dell'esperienza: non scegliamo
  // arbitrariamente un autore finché la persona non ha aperto la sua prima opera.
  lastAuthor: localStorage.getItem(LAST_AUTHOR_STORAGE_KEY) || "",
  readingEvents: readReadingEvents(),

  // Pubblicazione
  publicationDraft: { author: initialSession.displayName, title: "", collection: "", themes: [], text: "", card: { ...DEFAULT_CARD }, reading: { ...DEFAULT_READING } },

  // Media
  cardMediaUrls: new Map(),
  cardMediaDatabasePromise: null,
  cardCaptionDrag: null,

  // Metriche e social
  remoteReadCounts: new Map(),
  followedAuthorIds: new Set(profileState.following || []),
  authorFollowerCounts: new Map(),

  // Stato live refresh
  liveRefreshTimer: null,
  liveRefreshInFlight: false,
  // Com'era ogni opera e ogni raccolta l'ultima volta che il server ce l'ha
  // data. Serve a scrivere soltanto ciò che qui è davvero cambiato, invece
  // di rimandare indietro tutto il catalogo a ogni salvataggio.
  improntaRemota: new Map(),
  betaReady: !window.PoetekBackend?.isConfigured?.() && !window.POETEK_BETA_CONFIG?.requireBackend
};

// ── Funzioni di utilità sullo stato ─────────────────────────────────

export function isRemoteBeta() {
  return Boolean(window.PoetekBackend?.isConfigured?.());
}

export function isPublicVisitor() {
  // La sorgente di verità è la sessione applicativa appena confermata da Supabase, non una proprietà transitoria del client.
  const accountId = String(State.activeSession?.accountId || "").trim();
  return Boolean(isRemoteBeta() && (!accountId || State.activeSession?.role === "visitor"));
}

export function hasActiveAccount() {
  return Boolean(State.activeSession.accountId && State.activeSession.role !== "visitor");
}

export function activatePublicVisitor() {
  State.activeSession = { accountId: "", displayName: "", role: "visitor" };
  State.publicationDraft.author = "";
}

export function clearRemoteLocalSession() {
  if (!isRemoteBeta()) return;
  try {
    localStorage.removeItem(LOCAL_SESSION_STORAGE_KEY);
  } catch {
    // La sessione dimostrativa non deve mai influenzare la Beta remota.
  }
}

export function currentWeekKey(value = new Date()) {
  const date = new Date(value);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - mondayOffset);
  // La settimana editoriale segue il calendario locale. `toISOString()`
  // trasformava la mezzanotte italiana nel giorno UTC precedente: al reload
  // la Beta cercava quindi metriche con una data diversa da quella salvata da
  // Postgres (che usa il lunedì reale della settimana).
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function recentReadingItems(limit = 4) {
  const seen = new Set();
  return State.readingEvents
    .filter((event) => event.type === "poem" && State.poems.some((poem) => poem.id === event.id))
    .sort((first, second) => Date.parse(second.at) - Date.parse(first.at))
    .filter((event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    })
    .slice(0, limit)
    .map((event) => ({ type: "poem", id: event.id }));
}

export function reportBetaError(error) {
  const message = error instanceof Error ? error.message : "Non è possibile salvare la modifica nella Beta.";
  State.publicationNotice = "";
  State.importFeedback = message;
  console.error(error);
}

export function updateBetaChrome() {
  const publicVisitor = isPublicVisitor();
  document.querySelectorAll("[data-current-profile]").forEach((node) => { node.textContent = "Il tuo profilo"; });
  document.querySelectorAll("[data-session-label]").forEach((node) => { node.textContent = publicVisitor ? "Accesso libero" : isRemoteBeta() ? "Sessione Beta" : "Sessione locale"; });
  document.querySelectorAll("[data-beta-status]").forEach((node) => { node.textContent = isRemoteBeta() ? "Beta aperta" : "Beta locale"; });
  document.querySelectorAll("[data-beta-access-panel], [data-beta-access-note]").forEach((node) => { node.hidden = !isRemoteBeta() || !publicVisitor; });
}

// Le ricerche recenti sostituiscono il catalogo a riposo: sono la memoria
// di come questa persona entra nel catalogo, non un suggerimento nostro.
export function rememberSearch(value) {
  const term = String(value || "").trim();
  if (term.length < 2) return;
  State.recentSearches = [term, ...State.recentSearches.filter((v) => v.toLocaleLowerCase() !== term.toLocaleLowerCase())].slice(0, 8);
  try { localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(State.recentSearches)); } catch { /* memoria non disponibile */ }
}

export function forgetSearches() {
  State.recentSearches = [];
  try { localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY); } catch { /* memoria non disponibile */ }
}

export function requestPersonalAccess() {
  window.PoetekBackend?.openAuthGate?.();
}
