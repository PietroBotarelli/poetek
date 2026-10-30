/**
 * Generazione e calcolo delle visuali (card e reading) per le opere poetiche.
 * Modulo specializzato nel rendering delle interfacce grafiche delle poesie.
 */

import { State } from '../state/store.js';
import { DEFAULT_CARD, DEFAULT_READING, READING_FONTS } from '../config/constants.js';
import { esc } from '../utils/dom.js';
import { canEditPoem } from '../domain/selectors.js';

export function cardColour(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : DEFAULT_CARD.background;
}

export function cardCoordinate(value, fallback) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? Math.min(96, Math.max(4, Math.round(coordinate))) : fallback;
}

export function cardVisual(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    mode: ["text", "image", "image-text"].includes(source.mode) ? source.mode : DEFAULT_CARD.mode,
    imageId: typeof source.imageId === "string" ? source.imageId : "",
    imageUrl: typeof source.imageUrl === "string" ? source.imageUrl : "",
    background: cardColour(source.background),
    tone: source.tone === "light" ? "light" : "dark",
    caption: typeof source.caption === "string" ? source.caption.slice(0, 420) : "",
    layoutMode: source.layoutMode === "free" ? "free" : "default",
    captionX: cardCoordinate(source.captionX, DEFAULT_CARD.captionX),
    captionY: cardCoordinate(source.captionY, DEFAULT_CARD.captionY),
    captionAlign: ["left", "center", "right"].includes(source.captionAlign) ? source.captionAlign : DEFAULT_CARD.captionAlign
  };
}

export function cloneCardVisual(value) {
  return { ...cardVisual(value) };
}

export function readingVisual(value) {
  const source = value && typeof value === "object" ? value : {};
  const font = READING_FONTS.some((entry) => entry.id === source.font) ? source.font : DEFAULT_READING.font;
  return {
    font,
    imageId: typeof source.imageId === "string" ? source.imageId : "",
    imageUrl: typeof source.imageUrl === "string" ? source.imageUrl : "",
    imagePosition: source.imagePosition === "bottom" ? "bottom" : "top"
  };
}

export function cloneReadingVisual(value) {
  return { ...readingVisual(value) };
}

export function readingImageSource(value) {
  const reading = readingVisual(value);
  const source = reading.imageUrl || (reading.imageId ? State.cardMediaUrls.get(reading.imageId) || "" : "");
  return source;
}

export function visualImageReference(value) {
  const source = value && typeof value === "object" ? value : {};
  const imageId = typeof source.imageId === "string" ? source.imageId : "";
  const imageUrl = typeof source.imageUrl === "string" ? source.imageUrl : "";
  return imageId || imageUrl ? { imageId, imageUrl } : null;
}

// L'immagine appartiene all'opera, non alla superficie che la mostra: se la
// pagina di lettura non ne ha una propria, si eredita quella salvata a suo
// tempo sulla locandina, così le opere già pubblicate non perdono la figura.
export function poemReadingVisual(poem) {
  const reading = readingVisual(poem?.reading);
  const media = visualImageReference(reading) || visualImageReference(cardVisual(poem?.card));
  return media ? { ...reading, ...media } : reading;
}

export function setDraftSharedMedia(media) {
  const reference = media || { imageId: "", imageUrl: "" };
  State.publicationDraft.card.imageId = reference.imageId || "";
  State.publicationDraft.card.imageUrl = reference.imageUrl || "";
  State.publicationDraft.reading.imageId = reference.imageId || "";
  State.publicationDraft.reading.imageUrl = reference.imageUrl || "";
}

export function synchroniseDraftMedia(preferred = "reading") {
  const card = visualImageReference(State.publicationDraft.card);
  const reading = visualImageReference(State.publicationDraft.reading);
  setDraftSharedMedia(preferred === "card" ? card || reading : reading || card);
}

export function readingFontFamily(value) {
  const reading = readingVisual(value);
  return READING_FONTS.find((entry) => entry.id === reading.font)?.family || READING_FONTS[0].family;
}

export function moveDraftCaption(event, preview) {
  const bounds = preview.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  State.publicationDraft.card.layoutMode = "free";
  State.publicationDraft.card.captionX = cardCoordinate(((event.clientX - bounds.left) / bounds.width) * 100, DEFAULT_CARD.captionX);
  State.publicationDraft.card.captionY = cardCoordinate(((event.clientY - bounds.top) / bounds.height) * 100, DEFAULT_CARD.captionY);
  preview.style.setProperty("--caption-x", `${State.publicationDraft.card.captionX}%`);
  preview.style.setProperty("--caption-y", `${State.publicationDraft.card.captionY}%`);
}

export function cardCaptionText(card, fallback) {
  return card.caption.trim() || fallback;
}

export function cardLead(poem) {
  const title = String(poem.title || "").trim();
  return title || homeAttack(poem);
}

export function homeAttack(poem, maximum = 92) {
  const firstVerse = (firstVerses(poem, 1)[0] || "").replace(/\s+/g, " ").trim();
  if (firstVerse.length <= maximum) return firstVerse;
  const candidate = firstVerse.slice(0, maximum + 1);
  const lastSpace = candidate.lastIndexOf(" ");
  const cutoff = lastSpace > maximum * .55 ? lastSpace : maximum;
  return `${candidate.slice(0, cutoff).trimEnd()} […]`;
}

export function firstVerses(poem, count = 2) {
  return poem.text.split("\n").filter((line) => line.trim()).slice(0, count);
}

export function tags(poem, count = 2) {
  return `<div class="tag-stack">${(poem.tags || []).slice(0, count).map((tag) => `<span class="small-tag">${esc(tag)}</span>`).join("")}</div>`;
}

export function workName(poem) {
  return poem.title || poem.number || "Senza titolo";
}

export function poemBody(poem) {
  return poem.text.split("\n").map((line) => line.trim() ? `<p class="verse">${esc(line)}</p>` : `<div class="stanza-separator" aria-hidden="true"></div>`).join("");
}

// La palpebra a mandorla e l'iride, di solo tratto: un disegno e non un
// carattere, così la forma è esatta e non dipende dal font installato.
const OCCHIO = `<svg class="work-row-occhio" viewBox="0 0 24 14" aria-hidden="true" focusable="false">
  <path d="M1.2 7C1.2 7 5.4 1.4 12 1.4S22.8 7 22.8 7 18.6 12.6 12 12.6 1.2 7 1.2 7Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
  <circle cx="12" cy="7" r="3.1" fill="none" stroke="currentColor" stroke-width="1.5"/>
</svg>`;

// Un'opera in elenco: una riga sola. Il titolo, quando manca, lascia il posto
// all'attacco in corsivo, che è il modo in cui una poesia senza titolo si nomina.
export function workRow(poem) {
  const isSaved = State.saved.has(poem.id);
  const editable = canEditPoem(poem);
  const untitled = !String(poem.title || "").trim();
  const label = untitled ? homeAttack(poem) : poem.title;
  const collection = poem.collection && poem.collection !== "Testi singoli" ? poem.collection : "";
  return `<article class="work-row" data-work="${esc(poem.id)}">
    <button class="work-row-open" data-open="${esc(poem.id)}">
      <span class="work-row-name${untitled ? " is-incipit" : ""}">${esc(label)}</span>
      <span class="work-row-meta">${esc(poem.author)}${collection ? ` · ${esc(collection)}` : ""}</span>
    </button>
    <div class="work-row-actions">
      <button class="work-row-preview" data-preview="${esc(poem.id)}" aria-expanded="false" aria-label="Anteprima di ${esc(workName(poem))}">${OCCHIO}<span class="work-row-preview-testo">Anteprima</span></button>
      ${editable ? `<button class="work-row-edit" data-edit="${esc(poem.id)}">Modifica</button>` : ""}
      <button class="work-row-save ${isSaved ? "saved" : ""}" data-save="${esc(poem.id)}" aria-label="${isSaved ? "Rimuovi dall'archivio" : "Aggiungi all'archivio"}: ${esc(workName(poem))}">${isSaved ? "✓" : "+"}</button>
    </div>
  </article>`;
}

// Una voce d'autore in elenco.
export function authorRow(profile, summary = "") {
  return `<article class="work-row work-row--author">
    <button class="work-row-open" data-author="${esc(profile.key || profile.name)}">
      <span class="work-row-name">${esc(profile.name)}</span>
      ${summary ? `<span class="work-row-meta">${esc(summary)}</span>` : ""}
    </button>
    <div class="work-row-actions"><span class="work-row-go" aria-hidden="true">→</span></div>
  </article>`;
}

// L'elenco e, accanto, lo spazio dove si apre l'anteprima.
export function listStage(rowsMarkup, label = "") {
  return `<div class="list-stage"${label ? ` aria-label="${esc(label)}"` : ""}>
    <div class="work-list">${rowsMarkup}</div>
    <aside class="preview-slot" hidden></aside>
  </div>`;
}

// L'anteprima: testo ridotto ma leggibile, e l'immagine se l'autore l'ha messa.
export function previewMarkup(poem) {
  const reading = poemReadingVisual(poem);
  const source = readingImageSource(reading);
  const image = source
    // L'anteprima è già stata chiesta: l'immagine non si fa attendere.
    ? `<figure class="preview-media preview-media--${reading.imagePosition}"><img src="${esc(source)}" alt="" loading="eager" decoding="async" /></figure>`
    : "";
  const untitled = !String(poem.title || "").trim();
  const verses = poem.text.split("\n").slice(0, 14)
    .map((line) => line.trim() ? `<p class="preview-verse">${esc(line)}</p>` : `<span class="preview-gap" aria-hidden="true"></span>`)
    .join("");
  const truncated = poem.text.split("\n").filter((l) => l.trim()).length > 14;
  return `<div class="preview-card" style="--poem-font:${esc(readingFontFamily(reading))}">
    <div class="preview-top">
      <p class="preview-kicker">Anteprima</p>
      <button class="preview-close" data-preview-close aria-label="Chiudi l'anteprima">×</button>
    </div>
    ${untitled ? "" : `<p class="preview-name">${esc(poem.title)}</p>`}
    <p class="preview-author${untitled ? " senza-titolo" : ""}">${esc(poem.author)}</p>
    ${reading.imagePosition === "top" ? image : ""}
    <div class="preview-body">${verses}${truncated ? `<p class="preview-more">[…]</p>` : ""}</div>
    ${reading.imagePosition === "bottom" ? image : ""}
    <div class="preview-actions">
      <button class="preview-read" data-open="${esc(poem.id)}">Leggi l'opera →</button>
      <button class="preview-share" data-share="${esc(poem.id)}" aria-label="Condividi ${esc(workName(poem))}">Condividi</button>
    </div>
  </div>`;
}

export function readerMobileFontSize(poem) {
  const longestVerse = Math.max(...poem.text.split("\n").filter((line) => line.trim()).map((line) => line.length), 0);
  if (longestVerse > 76) return 13;
  if (longestVerse > 58) return 14;
  if (longestVerse > 44) return 15;
  return 16;
}
