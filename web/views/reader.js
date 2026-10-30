/**
 * @module views/reader
 * @description Templates and logic for the reader view and poem rendering.
 */

import { State } from '../state/store.js';
import { canEditPoem } from '../domain/selectors.js';
import { esc } from '../utils/dom.js';
import { readingImageSource, readingFontFamily, readerMobileFontSize, workName, poemReadingVisual, poemBody } from './cards.js';
import { READER_BACKGROUNDS } from '../config/constants.js';

export function poemReadingImageMarkup(reading) {
  const source = readingImageSource(reading);
  if (!source) return "";
  return `<figure class="reader-media reader-media--${reading.imagePosition}"><img src="${esc(source)}" alt="" loading="eager" /></figure>`;
}

export function readerBackgroundControls() {
  return `<div class="reader-paper-switch" role="group" aria-label="Sfondo di lettura"><span class="reader-paper-label">Sfondo</span>${READER_BACKGROUNDS.map((option) => `<button type="button" class="reader-paper-option ${State.readerBackground === option.id ? "active" : ""}" data-reader-background="${option.id}" aria-label="Sfondo ${option.label}" aria-pressed="${State.readerBackground === option.id}"><span class="reader-paper-swatch reader-paper-swatch--${option.id}" aria-hidden="true"></span>${option.label}</button>`).join("")}</div>`;
}

export function readerTemplate(poem) {
  const isSaved = State.saved.has(poem.id);
  const editable = canEditPoem(poem);
  const previous = State.collectionViewId ? "Raccolta" : State.route === "library" ? "Archivio personale" : State.route === "discover" ? "Catalogo" : State.route === "pietro" || State.route === "account" || State.route === "author" ? "Profilo autore" : "Letture";
  const reading = poemReadingVisual(poem);
  const image = poemReadingImageMarkup(reading);
  const topImage = reading.imagePosition === "top" ? image : "";
  const bottomImage = reading.imagePosition === "bottom" ? image : "";
  const poemStyle = `--poem-font:${esc(readingFontFamily(reading))}`;
  return `<article class="page reader"><button class="reader-back" data-back>← ${previous}</button><div class="reader-stage"><section class="poem-canvas" data-reader-background-state="${State.readerBackground}" style="${poemStyle}"><div class="reader-canvas-head"><p class="reader-overline">${esc(poem.issue)}</p>${readerBackgroundControls()}</div><h1 class="sr-only">${esc(workName(poem))}</h1>${poem.title ? `<p class="reader-work-label">${esc(poem.title)}</p>` : poem.number ? `<p class="reader-work-label">${esc(poem.number)}</p>` : ""}<p class="reader-author">${esc(poem.author)}</p>${topImage}<div class="reader-poem" style="--mobile-reader-size:${readerMobileFontSize(poem)}px">${poemBody(poem)}</div><p class="reader-scroll-cue" hidden aria-hidden="true">Scorri il verso <span>→</span></p>${bottomImage}</section><aside class="reader-aside"><h3>Apparato</h3><p>${esc(poem.note)}</p><div class="reader-tags">${(poem.tags || []).map((tag) => `<span class="small-tag">${esc(tag)}</span>`).join("")}</div><p><strong>Raccolta</strong><br>${esc(poem.collection)}</p>${editable ? `<button class="reader-edit" data-edit="${esc(poem.id)}">Modifica l'opera</button>` : ""}<button class="library-save ${isSaved ? "saved" : ""}" data-save="${esc(poem.id)}">${isSaved ? "✓ Nell'archivio" : "+ Conserva nell'archivio"}</button><button class="reader-share" data-share="${esc(poem.id)}">Condividi l'opera</button></aside></div></article>`;
}

export function updateReaderScrollCue() {
  const poem = State.app.querySelector(".reader-poem");
  const cue = State.app.querySelector(".reader-scroll-cue");
  if (!poem || !cue) return;
  cue.hidden = window.innerWidth > 610 || poem.scrollWidth <= poem.clientWidth + 1 || poem.scrollLeft > 4;
}

export function prepareReaderHorizontalReading() {
  const poem = State.app.querySelector(".reader-poem");
  if (!poem) return;
  updateReaderScrollCue();
  poem.addEventListener("scroll", updateReaderScrollCue, { passive: true });
}
