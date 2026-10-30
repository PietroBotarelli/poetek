/**
 * main.js — Entry point dell'applicazione Poetek.
 *
 * Importa tutti i moduli, collega i callback, registra gli event
 * listener globali e avvia l'applicazione.
 */

// ── Imports ─────────────────────────────────────────────────────────

import { State, isPublicVisitor, reportBetaError, updateBetaChrome, requestPersonalAccess, clearRemoteLocalSession, activatePublicVisitor, rememberSearch, forgetSearches } from './state/store.js';
import { READER_BACKGROUND_STORAGE_KEY, READING_FONTS, DEFAULT_READING } from './config/constants.js';
import { setMenuOpen } from './utils/dom.js';
import { cardVisual, cardColour, cardCaptionText, setDraftSharedMedia, moveDraftCaption, previewMarkup } from './views/cards.js';
import { hydrateCardImages, setRenderCallback as setMediaRenderCallback } from './services/media.js';
import { condividiOpera, condividiImmagine, immagineStoria, siPuoCondividereUnFile, SFONDI, MODI } from './services/condivisione.js';
import { applyRemoteSnapshot, scheduleRemoteSnapshotRefresh, setRenderCallback as setBackendRenderCallback } from './services/backend-bridge.js';
import { homeTemplate, homeExpandedTemplate } from './views/home.js';
import { discoverTemplate, updateDiscoverResults, setRenderCallback as setDiscoverRenderCallback } from './views/discover.js';
import { updateReaderScrollCue, readerTemplate, prepareReaderHorizontalReading } from './views/reader.js';
import { profileTemplate } from './views/profile.js';
import { publishTemplate, publicationLead, anteprimaBozzaTemplate } from './views/publish.js';
import { libraryTemplate, publicAccessTemplate, aboutTemplate, collectionTemplate } from './views/pages.js';
import { changeRoute, openAuthor, openCollection, openPoem, routeFromHash, setRenderCallback as setRouterRenderCallback } from './router/router.js';
import {
  persist, toggleSave, submitPublication,
  startEditingPoem, startEditingCollectionCard, startAddingToCollection,
  importPublicationFile, importCardImage, importPoemImage,
  importProfileImage, setProfileImageUrl, removeProfileImage,
  saveProfileDisplayName, toggleAuthorFollow,
  addPublicationTheme, removePublicationTheme,
  setCardImageUrl, setPoemImageUrl, liberaAnteprimaLocale,
  setRenderCallback as setActionsRenderCallback,
  setNavigationCallbacks
} from './domain/actions.js';

// ── Funzione render ─────────────────────────────────────────────────

// Che cosa si sta guardando adesso. Se due rese di fila hanno la stessa
// firma, la seconda mostra la stessa cosa della prima: allora il punto di
// lettura si conserva, invece di essere buttato in cima alla pagina.
function firmaVista() {
  if (State.readerPoemId) return `lettura:${State.readerPoemId}`;
  if (State.collectionViewId) return `raccolta:${State.collectionViewId}`;
  return `${State.route}:${State.expandedHomeSection}:${State.activeAuthor}`;
}

function render() {
  State.navLinks.forEach((link) => link.classList.toggle("active", link.dataset.route === State.route));
  const firma = firmaVista();
  const stessaVista = firma === State.vistaResa;
  const scorrimento = stessaVista ? window.scrollY : 0;
  const poemInLettura = State.readerPoemId ? State.poems.find((entry) => entry.id === State.readerPoemId) : null;
  // L'opera potrebbe essere sparita mentre la si leggeva: in quel caso si
  // torna alla rotta di provenienza invece di mostrare una pagina vuota.
  if (State.readerPoemId && !poemInLettura) State.readerPoemId = "";

  if (poemInLettura) {
    State.app.innerHTML = readerTemplate(poemInLettura);
    requestAnimationFrame(prepareReaderHorizontalReading);
  } else if (State.collectionViewId) {
    State.app.innerHTML = collectionTemplate(State.collectionMap.get(State.collectionViewId));
  } else if (State.route === "home") {
    State.app.innerHTML = State.expandedHomeSection ? homeExpandedTemplate(State.expandedHomeSection) : homeTemplate();
  } else if (State.route === "about") {
    State.app.innerHTML = aboutTemplate();
  } else if (State.route === "discover") {
    State.app.innerHTML = discoverTemplate();
  } else if (State.route === "pietro") {
    State.app.innerHTML = isPublicVisitor() ? publicAccessTemplate("profile") : profileTemplate(`id:${State.activeSession.accountId}`);
  } else if (State.route === "account") {
    State.app.innerHTML = isPublicVisitor() ? publicAccessTemplate("profile") : profileTemplate(`id:${State.activeSession.accountId}`);
  } else if (State.route === "author") {
    State.app.innerHTML = State.activeAuthor ? profileTemplate(State.activeAuthor) : publicAccessTemplate("profile");
  } else if (State.route === "publish") {
    State.app.innerHTML = isPublicVisitor() ? publicAccessTemplate("publish") : publishTemplate();
  } else {
    State.app.innerHTML = isPublicVisitor() ? publicAccessTemplate("library") : libraryTemplate();
  }
  persist();
  State.app.focus({ preventScroll: true });
  State.vistaResa = firma;
  if (stessaVista && scorrimento) window.scrollTo({ top: scorrimento, behavior: "instant" });
}

// ── Collegamento callback ───────────────────────────────────────────

setBackendRenderCallback(render);
window.addEventListener("poetek-media-refresh", scheduleRemoteSnapshotRefresh);
setRouterRenderCallback(render);
setActionsRenderCallback(render);
setDiscoverRenderCallback(render);
setMediaRenderCallback(render);
setNavigationCallbacks({ changeRoute, openCollection, openPoem });

// ── Anteprima affiancata ────────────────────────────────────────────

// Sotto i 900px la colonna affiancata non esiste: l'anteprima nasce
// direttamente sotto la riga che l'ha chiamata, dove l'occhio è già.
const colonnaStretta = window.matchMedia("(max-width: 900px)");

function chiudiAnteprime() {
  State.app.querySelectorAll(".list-stage").forEach((stage) => {
    stage.classList.remove("is-previewing");
    const slot = stage.querySelector(".preview-slot");
    if (slot) { slot.hidden = true; slot.innerHTML = ""; }
    stage.querySelectorAll("[data-preview]").forEach((b) => b.setAttribute("aria-expanded", "false"));
    stage.querySelectorAll(".work-row.is-previewed").forEach((r) => r.classList.remove("is-previewed"));
  });
  State.app.querySelectorAll(".preview-inline").forEach((node) => node.remove());
}

function apriAnteprima(button) {
  const stage = button.closest(".list-stage");
  const riga = button.closest(".work-row");
  const poem = State.poems.find((entry) => entry.id === button.dataset.preview);
  if (!stage || !poem) return;
  const giaAperta = button.getAttribute("aria-expanded") === "true";
  chiudiAnteprime();
  if (giaAperta) return;

  if (colonnaStretta.matches && riga) {
    const blocco = document.createElement("div");
    blocco.className = "preview-inline";
    blocco.innerHTML = previewMarkup(poem);
    riga.after(blocco);
  } else {
    const slot = stage.querySelector(".preview-slot");
    slot.innerHTML = previewMarkup(poem);
    slot.hidden = false;
    stage.classList.add("is-previewing");
  }
  button.setAttribute("aria-expanded", "true");
  riga?.classList.add("is-previewed");
}

// Attraversare la soglia lascerebbe l'anteprima nel posto sbagliato.
colonnaStretta.addEventListener("change", chiudiAnteprime);

// ── Condivisione di un'opera ────────────────────────────────────────

// Prima di consegnare l'immagine al telefono la si fa vedere: e' l'unico
// momento in cui si puo' ancora scegliere su quale carta finira'.
let operaDaCondividere = null;
let cartaScelta = State.readerBackground;
let modoScelto = "standard";
// L'immagine mostrata nell'anteprima e' la stessa che parte: tenerla pronta
// evita di rifarla nell'istante in cui il tocco vale.
let immagineCorrente = null;

function chiudiCondivisione() {
  document.querySelector(".share-sheet")?.remove();
  document.body.classList.remove("condivisione-aperta");
  operaDaCondividere = null;
  immagineCorrente = null;
}

async function disegnaAnteprimaCondivisione() {
  const foglio = document.querySelector(".share-sheet");
  if (!foglio || !operaDaCondividere) return;
  const immagine = foglio.querySelector(".share-sheet-immagine");
  const esito = await immagineStoria(operaDaCondividere, cartaScelta, modoScelto);
  if (immagine.src) URL.revokeObjectURL(immagine.src);
  immagine.src = URL.createObjectURL(esito.blob);
  immagineCorrente = esito.blob;

  // Il tasto e la nota dicono quello che succedera' davvero su questo
  // browser: dove i file non si possono condividere, l'immagine si salva.
  const puo = siPuoCondividereUnFile(esito.blob);
  const azione = foglio.querySelector(".share-sheet-azione");
  const nota = foglio.querySelector(".share-sheet-nota");
  if (!azione.disabled) azione.textContent = puo ? "Condividi" : "Salva l'immagine";
  nota.innerHTML = puo
    ? "Il telefono aprirà il suo pannello: scegli Instagram e poi <strong>Storia</strong>."
    : "Questo browser non sa passare immagini ad altre app. L'immagine si salva nella galleria: da lì la aggiungi alla storia. Con <strong>Chrome</strong> la condivisione è diretta.";
  // Quando nemmeno l'intera ci sta, si dice invece di lasciarlo scoprire.
  const avviso = foglio.querySelector(".share-sheet-avviso");
  const troppoLunga = modoScelto === "intera" && esito.tagliata;
  avviso.hidden = !troppoLunga;
  if (troppoLunga) avviso.textContent = `La poesia è troppo lunga per una sola immagine: ne entrano ${esito.versiMostrati} versi, il resto rimanda a Poetek.`;
}

function apriCondivisione(poem) {
  chiudiCondivisione();
  operaDaCondividere = poem;
  // Ogni condivisione riparte dalla modalita' consigliata: la scelta vale
  // per l'immagine che si sta facendo, non per tutte quelle dopo.
  modoScelto = "standard";
  const nodo = document.createElement("div");
  nodo.className = "share-sheet";
  nodo.setAttribute("role", "dialog");
  nodo.setAttribute("aria-modal", "true");
  nodo.setAttribute("aria-label", "Condividi l'opera come storia");
  nodo.innerHTML = `<div class="share-sheet-panel">
    <div class="share-sheet-top">
      <p class="kicker">Condividi &middot; formato storia</p>
      <button class="share-sheet-close" type="button" data-share-close aria-label="Chiudi">&times;</button>
    </div>
    <img class="share-sheet-immagine" alt="Anteprima dell'immagine da condividere" />
    <div class="share-sheet-carte" role="group" aria-label="Quanto testo">
      ${MODI.map((voce) => `<button type="button" class="share-sheet-carta${voce.id === modoScelto ? " attiva" : ""}" data-share-modo="${voce.id}" aria-pressed="${voce.id === modoScelto}">${voce.label}<em>${voce.nota}</em></button>`).join("")}
    </div>
    <p class="share-sheet-avviso" hidden></p>
    <div class="share-sheet-carte" role="group" aria-label="Sfondo">
      ${SFONDI.map((voce) => `<button type="button" class="share-sheet-carta${voce.id === cartaScelta ? " attiva" : ""}" data-share-carta="${voce.id}" aria-pressed="${voce.id === cartaScelta}"><span class="share-sheet-pastiglia" style="background:${voce.carta}" aria-hidden="true"></span>${voce.label}</button>`).join("")}
    </div>
    <button class="share-sheet-azione" type="button" data-share-invia>Condividi</button>
    <p class="share-sheet-nota">Il telefono aprira' il suo pannello: scegli Instagram e poi <strong>Storia</strong>.</p>
  </div>`;
  document.body.appendChild(nodo);
  document.body.classList.add("condivisione-aperta");
  nodo.querySelector("[data-share-close]").focus();
  void disegnaAnteprimaCondivisione();
}

async function inviaCondivisione(tasto) {
  if (!operaDaCondividere || tasto.disabled) return;
  const testo = tasto.textContent;
  tasto.disabled = true;
  if (!immagineCorrente) tasto.textContent = "Preparo l'immagine…";
  try {
    const esito = immagineCorrente
      ? await condividiImmagine(immagineCorrente, operaDaCondividere)
      : await condividiOpera(operaDaCondividere, cartaScelta, modoScelto);
    if (esito === "scaricata") {
      tasto.textContent = "Immagine salvata";
      window.setTimeout(() => { tasto.disabled = false; tasto.textContent = testo; }, 2400);
      return;
    }
    chiudiCondivisione();
  } catch (error) {
    reportBetaError(error);
    tasto.textContent = "Non è riuscito";
    window.setTimeout(() => { tasto.disabled = false; tasto.textContent = testo; }, 2400);
  }
}

// ── Anteprima della bozza in pubblicazione ──────────────────────────

// Vive fuori da #app: render() ricostruisce la pagina a ogni cambio di
// stato e si porterebbe via il foglio mentre l'autore lo sta guardando.
function chiudiAnteprimaBozza() {
  document.querySelector(".draft-preview")?.remove();
  document.body.classList.remove("anteprima-bozza-aperta");
}

function apriAnteprimaBozza() {
  chiudiAnteprimaBozza();
  const contenitore = document.createElement("div");
  contenitore.innerHTML = anteprimaBozzaTemplate();
  const foglio = contenitore.firstElementChild;
  if (!foglio) return;
  document.body.appendChild(foglio);
  document.body.classList.add("anteprima-bozza-aperta");
  foglio.querySelector("[data-draft-preview-close]")?.focus();
}

// ── Suggerimenti sotto la barra di ricerca ──────────────────────────

function tendina() { return State.app.querySelector("#search-suggest"); }

function mostraSuggerimenti(aperta) {
  const menu = tendina();
  if (!menu) return;
  menu.hidden = !aperta;
  State.app.querySelector("#search")?.setAttribute("aria-expanded", String(aperta));
}

document.addEventListener("focusin", (event) => {
  if (event.target.id === "search") mostraSuggerimenti(true);
  else if (!event.target.closest?.("#search-suggest")) mostraSuggerimenti(false);
});

// Il clic su un suggerimento toglie il fuoco alla barra: senza questo la
// tendina si chiuderebbe prima che il clic arrivi a destinazione.
document.addEventListener("mousedown", (event) => {
  if (event.target.closest("#search-suggest")) event.preventDefault();
});

// ── Event listener globali ──────────────────────────────────────────

document.addEventListener("click", (event) => {
  const menuToggle = event.target.closest("[data-menu-toggle]");
  const menuClose = event.target.closest("[data-menu-close]");
  const nav = event.target.closest("[data-route]");
  const routeButton = event.target.closest("[data-route-button]");
  const collection = event.target.closest("[data-collection]");
  const open = event.target.closest("[data-open]");
  const save = event.target.closest("[data-save]");
  const tag = event.target.closest("[data-tag]");
  const back = event.target.closest("[data-back]");
  const closeCollection = event.target.closest("[data-close-collection]");
  const homeExpand = event.target.closest("[data-home-expand]");
  const homeCollapse = event.target.closest("[data-home-collapse]");
  const publicationTypeButton = event.target.closest("[data-publication-type]");
  const publish = event.target.closest("[data-publish]");
  const removeTheme = event.target.closest("[data-remove-theme]");
  const edit = event.target.closest("[data-edit]");
  const editCollection = event.target.closest("[data-edit-collection]");
  const addToCollectionBtn = event.target.closest("[data-add-to-collection]");
  const cardColourBtn = event.target.closest("[data-card-colour]");
  const cardTone = event.target.closest("[data-card-tone]");
  const cardLayoutMode = event.target.closest("[data-card-layout-mode]");
  const cardCaptionAlign = event.target.closest("[data-card-caption-align]");
  const readerBackgroundButton = event.target.closest("[data-reader-background]");
  const removeCardImage = event.target.closest("[data-remove-card-image]");
  const removePoemImage = event.target.closest("[data-remove-poem-image]");
  const removeProfileImageButton = event.target.closest("[data-remove-profile-image]");
  const saveProfileNameButton = event.target.closest("[data-save-profile-name]");
  const followAuthorButton = event.target.closest("[data-follow-author]");
  const openAuthButton = event.target.closest("[data-open-auth], [data-beta-auth-open]");
  const signOutButton = event.target.closest("[data-beta-signout]");
  const author = event.target.closest("[data-author]");
  const previewButton = event.target.closest("[data-preview]");
  const previewClose = event.target.closest("[data-preview-close]");
  const recentSearch = event.target.closest("[data-search]");
  const forget = event.target.closest("[data-forget-searches]");
  const condividi = event.target.closest("[data-share]");
  const condivisioneChiudi = event.target.closest("[data-share-close]");
  const condivisioneCarta = event.target.closest("[data-share-carta]");
  const condivisioneModo = event.target.closest("[data-share-modo]");
  const condivisioneInvia = event.target.closest("[data-share-invia]");
  if (condividi) {
    const poem = State.poems.find((entry) => entry.id === condividi.dataset.share);
    if (poem) apriCondivisione(poem);
    return;
  }
  if (condivisioneCarta) {
    cartaScelta = condivisioneCarta.dataset.shareCarta;
    document.querySelectorAll("[data-share-carta]").forEach((voce) => {
      const attiva = voce.dataset.shareCarta === cartaScelta;
      voce.classList.toggle("attiva", attiva);
      voce.setAttribute("aria-pressed", String(attiva));
    });
    void disegnaAnteprimaCondivisione();
    return;
  }
  if (condivisioneModo) {
    modoScelto = condivisioneModo.dataset.shareModo;
    document.querySelectorAll("[data-share-modo]").forEach((voce) => {
      const attiva = voce.dataset.shareModo === modoScelto;
      voce.classList.toggle("attiva", attiva);
      voce.setAttribute("aria-pressed", String(attiva));
    });
    void disegnaAnteprimaCondivisione();
    return;
  }
  if (condivisioneInvia) { void inviaCondivisione(condivisioneInvia); return; }
  if (condivisioneChiudi || event.target.classList?.contains("share-sheet")) { chiudiCondivisione(); return; }
  const bozzaApri = event.target.closest("[data-draft-preview]");
  const bozzaChiudi = event.target.closest("[data-draft-preview-close]");
  if (bozzaApri) { apriAnteprimaBozza(); return; }
  // Anche il fondo scuro chiude: e' il gesto che ci si aspetta da un foglio
  // aperto sopra la pagina.
  if (bozzaChiudi || event.target.classList?.contains("draft-preview")) { chiudiAnteprimaBozza(); return; }
  if (previewButton) { apriAnteprima(previewButton); return; }
  if (previewClose) { chiudiAnteprime(); return; }
  if (recentSearch) { State.searchQuery = recentSearch.dataset.search; rememberSearch(recentSearch.dataset.search); render(); return; }
  if (forget) { forgetSearches(); render(); return; }
  if (menuToggle) { setMenuOpen(!document.querySelector(".app-shell")?.classList.contains("menu-open")); return; }
  if (menuClose) { setMenuOpen(false); return; }
  if (openAuthButton) { requestPersonalAccess(); return; }
  if (signOutButton) { window.PoetekBackend?.signOut().catch(reportBetaError); return; }
  // L'elenco esteso vive nella home: se lo si chiede dal catalogo, ci si va.
  if (homeExpand) { State.expandedHomeSection = homeExpand.dataset.homeExpand; State.route = "home"; render(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  if (homeCollapse) { State.expandedHomeSection = ""; render(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  if (nav) { event.preventDefault(); changeRoute(nav.dataset.route); return; }
  if (routeButton) { changeRoute(routeButton.dataset.routeButton, routeButton.dataset.tagRoute); return; }
  if (publicationTypeButton) { State.publicationType = publicationTypeButton.dataset.publicationType; State.importFeedback = ""; render(); return; }
  if (cardColourBtn) { State.publicationDraft.card.background = cardColourBtn.dataset.cardColour; render(); return; }
  if (cardTone) { State.publicationDraft.card.tone = cardTone.dataset.cardTone; render(); return; }
  if (cardLayoutMode) { State.publicationDraft.card.layoutMode = cardLayoutMode.dataset.cardLayoutMode; render(); return; }
  if (cardCaptionAlign) { State.publicationDraft.card.captionAlign = cardCaptionAlign.dataset.cardCaptionAlign; render(); return; }
  if (readerBackgroundButton) {
    State.readerBackground = readerBackgroundButton.dataset.readerBackground === "paper" ? "paper" : "default";
    localStorage.setItem(READER_BACKGROUND_STORAGE_KEY, State.readerBackground);
    State.app.querySelector(".poem-canvas")?.setAttribute("data-reader-background-state", State.readerBackground);
    State.app.querySelectorAll("[data-reader-background]").forEach((button) => {
      const active = button.dataset.readerBackground === State.readerBackground;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    return;
  }
  if (removeCardImage) { setDraftSharedMedia(null); render(); return; }
  if (removePoemImage) { liberaAnteprimaLocale(); setDraftSharedMedia(null); render(); return; }
  if (removeProfileImageButton) { removeProfileImage(removeProfileImageButton.dataset.removeProfileImage); return; }
  if (saveProfileNameButton) { saveProfileDisplayName(saveProfileNameButton.dataset.saveProfileName); return; }
  if (followAuthorButton) { toggleAuthorFollow(followAuthorButton.dataset.followAuthor); return; }
  if (removeTheme) { removePublicationTheme(Number(removeTheme.dataset.removeTheme)); return; }
  if (publish) { submitPublication(); return; }
  if (editCollection) { startEditingCollectionCard(editCollection.dataset.editCollection); return; }
  if (addToCollectionBtn) { startAddingToCollection(addToCollectionBtn.dataset.addToCollection); return; }
  if (edit) { startEditingPoem(edit.dataset.edit); return; }
  if (author) { openAuthor(author.dataset.author); return; }
  if (collection) { openCollection(collection.dataset.collection); return; }
  if (open) { openPoem(open.dataset.open); return; }
  if (save) { toggleSave(save.dataset.save); return; }
  // Senza più il bottone "Tutte le opere", il tema attivo si spegne da sé.
  if (tag) { State.activeTag = State.activeTag === tag.dataset.tag ? "tutti" : tag.dataset.tag; render(); return; }
  if (back) { State.readerPoemId = ""; render(); return; }
  if (closeCollection) { State.readerPoemId = ""; State.collectionViewId = null; render(); }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "search") {
    State.searchQuery = event.target.value;
    updateDiscoverResults();
    return;
  }
  if (event.target.id === "publication-author") State.publicationDraft.author = event.target.value;
  if (event.target.id === "publication-title") State.publicationDraft.title = event.target.value;
  if (event.target.id === "publication-collection") State.publicationDraft.collection = event.target.value;
  if (event.target.id === "publication-text") State.publicationDraft.text = event.target.value;
  if (event.target.id === "card-caption") {
    State.publicationDraft.card.caption = event.target.value;
    const previewCaption = State.app.querySelector(".card-preview .card-caption");
    if (previewCaption) previewCaption.textContent = cardCaptionText(cardVisual(State.publicationDraft.card), publicationLead());
  }
});

document.addEventListener("pointerdown", (event) => {
  const caption = event.target.closest("[data-card-caption-drag]");
  const preview = caption?.closest(".card-preview");
  if (!caption || !preview) return;
  event.preventDefault();
  State.cardCaptionDrag = { pointerId: event.pointerId, preview };
  preview.setPointerCapture?.(event.pointerId);
  moveDraftCaption(event, preview);
});

document.addEventListener("pointermove", (event) => {
  if (!State.cardCaptionDrag || State.cardCaptionDrag.pointerId !== event.pointerId) return;
  event.preventDefault();
  moveDraftCaption(event, State.cardCaptionDrag.preview);
});

function finishCardCaptionDrag(event) {
  if (!State.cardCaptionDrag || State.cardCaptionDrag.pointerId !== event.pointerId) return;
  State.cardCaptionDrag.preview.releasePointerCapture?.(event.pointerId);
  State.cardCaptionDrag = null;
  render();
}

document.addEventListener("pointerup", finishCardCaptionDrag);
document.addEventListener("pointercancel", finishCardCaptionDrag);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") { setMenuOpen(false); chiudiAnteprime(); chiudiAnteprimaBozza(); chiudiCondivisione(); }
  if (event.target.id === "search" && event.key === "Enter") {
    event.preventDefault();
    rememberSearch(event.target.value);
  }
  if (event.target.id === "publication-theme-input" && event.key === "Enter") {
    event.preventDefault();
    addPublicationTheme(event.target.value);
  }
});

document.addEventListener("change", (event) => {
  if (event.target.id === "publication-file") importPublicationFile(event.target.files?.[0]);
  if (event.target.id === "card-image-file") importCardImage(event.target.files?.[0]);
  if (event.target.id === "poem-image-file") importPoemImage(event.target.files?.[0]);
  if (event.target.id === "profile-image-file") importProfileImage(event.target.files?.[0], event.target.dataset.profileOwner);
  if (event.target.id === "profile-image-url") setProfileImageUrl(event.target.value, event.target.dataset.profileOwner);
  if (event.target.id === "card-image-url") setCardImageUrl(event.target.value);
  if (event.target.id === "poem-image-url") setPoemImageUrl(event.target.value);
  if (event.target.id === "poem-image-position") {
    State.publicationDraft.reading.imagePosition = event.target.value === "bottom" ? "bottom" : "top";
    render();
  }
  if (event.target.id === "publication-font") {
    State.publicationDraft.reading.font = READING_FONTS.some((font) => font.id === event.target.value) ? event.target.value : DEFAULT_READING.font;
    render();
  }
  if (event.target.id === "card-colour-picker") {
    State.publicationDraft.card.background = cardColour(event.target.value);
    render();
  }
});

// ── Routing ─────────────────────────────────────────────────────────

window.addEventListener("hashchange", () => {
  setMenuOpen(false);
  const next = routeFromHash(location.hash);
  if (next.route !== State.route || next.author !== State.activeAuthor) {
    State.route = next.route;
    State.activeAuthor = next.author;
    State.readerPoemId = "";
    State.collectionViewId = null;
    State.expandedHomeSection = "";
    render();
  }
});

window.addEventListener("resize", () => requestAnimationFrame(updateReaderScrollCue));

const initialRoute = routeFromHash(location.hash);
State.route = initialRoute.route;
State.activeAuthor = initialRoute.author;

// ── Avvio applicazione ──────────────────────────────────────────────

async function startBetaApplication() {
  const backend = window.PoetekBackend;
  clearRemoteLocalSession();
  if (!backend?.isConfigured?.()) {
    if (window.POETEK_BETA_CONFIG?.requireBackend) {
      document.body.classList.add("beta-auth-required");
      document.querySelector("#beta-auth-message").textContent = "La Beta deve essere collegata a Supabase prima della pubblicazione.";
      document.querySelector("#beta-auth-gate")?.removeAttribute("hidden");
      return;
    }
    updateBetaChrome();
    render();
    if (typeof indexedDB !== "undefined") hydrateCardImages().catch(() => undefined);
    return;
  }

  State.betaReady = false;
  const applyStartedState = async (state) => {
    if (state?.session && state.profile) {
      State.activeSession = { accountId: state.session.user.id, displayName: state.profile.display_name, role: state.profile.role || "author" };
    } else {
      activatePublicVisitor();
    }
    applyRemoteSnapshot(await backend.loadSnapshot());
    State.betaReady = true;
    updateBetaChrome();
    render();
    backend.subscribeToChanges(scheduleRemoteSnapshotRefresh);
  };
  backend.bindAuthGate(async (state) => {
    try {
      await applyStartedState(state || { session: null, profile: null, public: true });
    } catch (error) {
      reportBetaError(error);
      console.error(error);
    }
  });
  try {
    const state = await backend.start();
    if ((!state.session || !state.profile) && !state.public) return;
    await applyStartedState(state);
  } catch (error) {
    console.error(error);
    if (window.POETEK_BETA_CONFIG?.publicReading) {
      activatePublicVisitor();
      State.betaReady = true;
      updateBetaChrome();
      render();
      return;
    }
    document.querySelector("#beta-auth-message").textContent = error instanceof Error ? error.message : "Non \u00e8 possibile avviare la Beta.";
    document.querySelector("#beta-auth-gate")?.removeAttribute("hidden");
  }
}

void startBetaApplication();
