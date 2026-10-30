/**
 * Core constants and default configurations for the Poetek application.
 */

export const REVIEW_STORAGE_PREFIX = "poetek-v2-review";
export const PUBLISHED_STORAGE_KEY = `${REVIEW_STORAGE_PREFIX}-published-works`;
export const READING_EVENTS_STORAGE_KEY = `${REVIEW_STORAGE_PREFIX}-reading-events`;
export const LOCAL_SESSION_STORAGE_KEY = `${REVIEW_STORAGE_PREFIX}-local-session`;
export const PROFILE_STORAGE_KEY = `${REVIEW_STORAGE_PREFIX}-author-profiles`;
export const SAVED_STORAGE_KEY = `${REVIEW_STORAGE_PREFIX}-saved`;
export const LAST_AUTHOR_STORAGE_KEY = `${REVIEW_STORAGE_PREFIX}-last-author`;
export const READER_BACKGROUND_STORAGE_KEY = `${REVIEW_STORAGE_PREFIX}-reader-background`;
export const RECENT_SEARCHES_STORAGE_KEY = `${REVIEW_STORAGE_PREFIX}-recent-searches`;
export const MEDIA_DATABASE_NAME = `${REVIEW_STORAGE_PREFIX}-card-media`;
export const MEDIA_DATABASE_VERSION = 1;
export const MEDIA_STORE_NAME = "originals";
export const DEFAULT_CARD = Object.freeze({
  mode: "text",
  imageId: "",
  imageUrl: "",
  background: "#e8ddc5",
  tone: "dark",
  // Il layout standard resta quello editoriale attuale. Questi dati entrano
  // in gioco soltanto quando l'autore apre “Modifica layout”.
  caption: "",
  layoutMode: "default",
  captionX: 8,
  captionY: 43,
  captionAlign: "left"
});

// Il carattere storico di Poetek resta la scelta predefinita. Le altre
// famiglie si applicano soltanto alla pagina di lettura dell'opera.
export const READING_FONTS = Object.freeze([
  { id: "standard", label: "Standard — Instrument Serif", family: '"Instrument Serif", Georgia, serif' },
  { id: "eb-garamond", label: "EB Garamond", family: '"EB Garamond", Georgia, serif' },
  { id: "libre-baskerville", label: "Libre Baskerville", family: '"Libre Baskerville", Georgia, serif' },
  { id: "lora", label: "Lora", family: '"Lora", Georgia, serif' },
  { id: "merriweather", label: "Merriweather", family: '"Merriweather", Georgia, serif' },
  { id: "playfair-display", label: "Playfair Display", family: '"Playfair Display", Georgia, serif' },
  { id: "cormorant-garamond", label: "Cormorant Garamond", family: '"Cormorant Garamond", Georgia, serif' },
  { id: "crimson-pro", label: "Crimson Pro", family: '"Crimson Pro", Georgia, serif' },
  { id: "source-serif-4", label: "Source Serif 4", family: '"Source Serif 4", Georgia, serif' },
  { id: "noto-serif", label: "Noto Serif", family: '"Noto Serif", Georgia, serif' }
]);
export const DEFAULT_READING = Object.freeze({ font: "standard", imageId: "", imageUrl: "", imagePosition: "top" });
export const READER_BACKGROUNDS = Object.freeze([
  { id: "default", label: "Chiaro" },
  { id: "paper", label: "Carta" }
]);

// Contratto pronto per il back-end: il server sostituirà questa lettura locale
// con la sessione autenticata, mentre le regole UI continueranno a confrontare ownerId.
export const DEFAULT_LOCAL_SESSION = Object.freeze({ accountId: "local-demo", displayName: "Autore locale", role: "author" });
