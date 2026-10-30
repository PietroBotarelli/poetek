/**
 * View templates for the publishing and editing studio.
 */

import { State, isRemoteBeta } from '../state/store.js';
import { esc } from '../utils/dom.js';
import { READING_FONTS } from '../config/constants.js';
import { readingVisual, readingImageSource, readingFontFamily, poemBody, readerMobileFontSize } from './cards.js';

export function editingContext() {
  if (!State.editingPoemId) return null;
  const poem = State.userPublishedPoems.find((entry) => entry.id === State.editingPoemId);
  if (!poem) return null;
  const collection = State.catalogueCollections.find((entry) => entry.poemIds.includes(poem.id)) || null;
  return { poem, collection };
}

export function publicationLead() {
  const title = State.publicationDraft.title.trim();
  if (title) return title;
  const firstLine = State.publicationDraft.text.split("\n").find((line) => line.trim()) || "L'attacco della poesia";
  return firstLine.length > 92 ? `${firstLine.slice(0, 89).trimEnd()} […]` : firstLine;
}

export function readingStudioTemplate() {
  const reading = readingVisual(State.publicationDraft.reading);
  const originale = readingImageSource(reading);
  // Finché l'originale non è arrivato dal server si mostra il file scelto:
  // l'autore ha già visto quell'immagine, non deve aspettarla due volte.
  const source = originale || State.anteprimaImmagineLocale;
  const inArrivo = !originale && Boolean(State.anteprimaImmagineLocale);
  return `<section class="publish-block reading-studio">
    <div class="reading-studio-controls">
      <label class="form-field reading-font-field"><span>Carattere</span><select id="publication-font">${READING_FONTS.map((font) => `<option value="${font.id}" ${font.id === reading.font ? "selected" : ""}>${esc(font.label)}</option>`).join("")}</select><small>Il carattere si applica insieme a titolo e versi.</small></label>
      <div class="card-control-group reading-image-source"><span class="form-label">Immagine dell'opera <em>facoltativa</em></span><label class="file-import file-import--image">Scegli dalla galleria<input id="poem-image-file" type="file" accept="image/*" /></label><label class="card-image-url"><span>oppure URL dell'immagine</span><input id="poem-image-url" type="url" inputmode="url" value="${esc(/^https?:/i.test(reading.imageUrl) ? reading.imageUrl : "")}" placeholder="https://…" /></label>${source ? `<div class="reading-image-options"><div class="reading-image-preview"><img src="${esc(source)}" alt="" /><div class="card-image-state"><span>${inArrivo ? "Caricamento in corso…" : reading.imageId ? "Immagine originale salvata" : "Immagine collegata"}</span><button data-remove-poem-image>Rimuovi ovunque</button></div></div><label class="form-field"><span>Posizione nella lettura</span><select id="poem-image-position"><option value="top" ${reading.imagePosition === "top" ? "selected" : ""}>Prima del testo</option><option value="bottom" ${reading.imagePosition === "bottom" ? "selected" : ""}>Dopo il testo</option></select></label></div>` : `<p class="card-image-hint">L'immagine entra intera nella pagina di lettura, sopra o sotto i versi.</p>`}</div>
    </div>
  </section>`;
}

export function publishTemplate() {
  const editing = editingContext();
  const targetCollection = State.targetCollectionId ? State.publishedState.collections.find((entry) => entry.id === State.targetCollectionId) : null;
  const collectionEditing = State.editingCollectionId ? State.publishedState.collections.find((entry) => entry.id === State.editingCollectionId) : null;
  const creatingCollection = !editing && !targetCollection && !collectionEditing && State.publicationType === "collection";
  const collectionMode = Boolean(editing?.collection || targetCollection || creatingCollection);
  const typeLabel = collectionEditing ? "Raccolta" : targetCollection ? "Nuovo componimento" : collectionMode ? (editing ? "Componimento in raccolta" : "Raccolta") : "Testo singolo";
  const actionLabel = collectionEditing ? "Salva raccolta" : editing ? "Salva modifiche" : targetCollection ? "Aggiungi poesia" : "Pubblica";
  const headerKicker = collectionEditing ? "Gestisci raccolta" : targetCollection ? "Aggiungi alla raccolta" : editing ? "Modifica opera" : "Pubblica";
  const headerTitle = collectionEditing ? "Dai una forma alla raccolta." : targetCollection ? "Aggiungi un nuovo testo." : editing ? "Correggi il testo." : "Nuova opera.";
  const themesField = `<div class="publish-block publish-themes-block"><div class="form-field"><span>Temi <em>liberi</em></span><div class="theme-composer">${State.publicationDraft.themes.map((theme, index) => `<span class="theme-draft">${esc(theme)}<button data-remove-theme="${index}" aria-label="Rimuovi il tema ${esc(theme)}">×</button></span>`).join("")}<input id="publication-theme-input" type="text" ${State.publicationDraft.themes.length === 5 ? "disabled" : ""} placeholder="Scrivi un tema per far trovare la tua opera" /></div><p class="theme-hint">Una parola o espressione alla volta · ${State.publicationDraft.themes.length}/5</p></div></div>`;
  const formatBlock = collectionEditing ? `<div class="publish-block"><span class="form-label">Raccolta</span><p class="publication-static"><strong>${esc(collectionEditing.title)}</strong><br><small>${esc(collectionEditing.author)} · ${collectionEditing.poemIds.length} ${collectionEditing.poemIds.length === 1 ? "poesia" : "poesie"}</small></p></div>` : editing ? `<div class="publish-block"><span class="form-label">Formato</span><p class="publication-static">${collectionMode ? `Componimento in <strong>${esc(editing.collection.title)}</strong>` : "Testo singolo"}</p></div>` : targetCollection ? `<div class="publish-block"><span class="form-label">Destinazione</span><p class="publication-static">Nuovo componimento in <strong>${esc(targetCollection.title)}</strong></p></div>` : `<div class="publish-block"><span class="form-label">Formato</span><div class="publication-types"><button class="publication-type ${State.publicationType === "single" ? "active" : ""}" data-publication-type="single"><span>01</span>Testo singolo</button><button class="publication-type ${creatingCollection ? "active" : ""}" data-publication-type="collection"><span>02</span>Raccolta</button></div></div>`;
  const metadataFields = collectionEditing ? "" : `<div class="publish-fields"><label class="form-field"><span>Autore</span><input id="publication-author" type="text" value="${esc(State.publicationDraft.author)}" placeholder="Nome autore" ${(editing || targetCollection || isRemoteBeta()) ? "readonly" : ""} /></label>${creatingCollection ? `<label class="form-field"><span>Titolo della raccolta</span><input id="publication-collection" type="text" value="${esc(State.publicationDraft.collection)}" placeholder="Titolo richiesto" /></label>` : `<label class="form-field"><span>Titolo <em>facoltativo</em></span><input id="publication-title" type="text" value="${esc(State.publicationDraft.title)}" placeholder="Lascia vuoto per un testo senza titolo" /></label>`}</div>`;
  const textBlock = collectionEditing ? "" : `<div class="publish-block publish-text-block"><div class="file-row"><span class="form-label">${creatingCollection ? "Testo della raccolta" : "Testo"}</span><label class="file-import">Carica .txt o .docx<input id="publication-file" type="file" accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" /></label></div><p class="file-hint">Oppure scrivi direttamente qui sotto.</p><textarea id="publication-text" wrap="off" spellcheck="false" placeholder="Incolla o digita i versi">${esc(State.publicationDraft.text)}</textarea>${State.importFeedback ? `<p class="import-feedback">${esc(State.importFeedback)}</p>` : ""}</div>`;
  return `<section class="page publish-page"><header class="publish-header"><p class="kicker">${headerKicker}</p><h1 class="display">${headerTitle}</h1></header><div class="publish-layout"><section class="publish-paper" aria-label="Inserimento o modifica di un'opera">${formatBlock}${metadataFields}${textBlock}${collectionEditing ? "" : themesField}${collectionEditing ? "" : readingStudioTemplate()}<div class="publish-actions"><span>${esc(typeLabel)} · lettura Poetek</span><div class="publish-actions-buttons">${collectionEditing ? "" : `<button class="publish-preview-button" type="button" data-draft-preview>Anteprima</button>`}<button class="primary-button" data-publish>${actionLabel}</button></div></div></section><aside class="publish-aside"><h2>${collectionEditing ? "La locandina" : "Struttura del testo"}</h2>${collectionEditing ? `<p>Questa scelta agisce soltanto sulla scheda della raccolta. L'indice e le pagine di lettura restano essenziali.</p>` : `<p>Ogni a capo inserito dall'autore resta un verso nella pagina di lettura.</p>${creatingCollection ? `<p>Per separare più componimenti nella raccolta, inserisci <strong>---</strong> su una riga autonoma.</p>` : `<p>Un testo senza titolo sarà mostrato attraverso il suo attacco.</p>`}`}</aside></div></section>`;
}

// L'anteprima non imita la pagina di lettura: la costruisce con gli stessi
// pezzi del lettore vero -- stesso foglio, stesso carattere, stessa immagine --
// cosi' quello che l'autore vede prima di pubblicare e' quello che sara'.
export function anteprimaBozzaTemplate() {
  const draft = State.publicationDraft;
  const reading = readingVisual(draft.reading);
  const opera = { text: draft.text, title: draft.title.trim(), author: draft.author.trim() };
  const source = readingImageSource(reading);
  const image = source ? `<figure class="reader-media reader-media--${reading.imagePosition}"><img src="${esc(source)}" alt="" loading="eager" /></figure>` : "";
  // Un testo senza titolo resta senza titolo anche nella lettura: e' cosi'
  // che apparira' davvero, e l'anteprima non deve consolare l'autore.
  const corpo = draft.text.trim()
    ? `<div class="reader-poem" style="--mobile-reader-size:${readerMobileFontSize(opera)}px">${poemBody(opera)}</div>`
    : `<p class="draft-preview-vuota">Scrivi o carica il testo: qui vedrai la pagina esattamente come la leggeranno gli altri.</p>`;
  return `<div class="draft-preview" role="dialog" aria-modal="true" aria-label="Anteprima della pagina di lettura">
    <div class="draft-preview-panel">
      <div class="draft-preview-top"><p class="kicker">Anteprima &middot; pagina di lettura</p><button class="draft-preview-close" type="button" data-draft-preview-close aria-label="Chiudi l'anteprima">&times;</button></div>
      <div class="draft-preview-scroll">
        <section class="poem-canvas" data-reader-background-state="${esc(State.readerBackground)}" style="--poem-font:${esc(readingFontFamily(reading))}">
          ${opera.title ? `<p class="reader-work-label">${esc(opera.title)}</p>` : ""}
          ${opera.author ? `<p class="reader-author">${esc(opera.author)}</p>` : ""}
          ${reading.imagePosition === "top" ? image : ""}
          ${corpo}
          ${reading.imagePosition === "bottom" ? image : ""}
        </section>
      </div>
    </div>
  </div>`;
}
