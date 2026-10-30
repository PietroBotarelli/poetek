/**
 * @module views/pages
 * @description Miscellaneous page templates for library, public access, about, and collections.
 */

import { State } from '../state/store.js';
import { worksForCollection, isUserCollection } from '../domain/selectors.js';
import { esc } from '../utils/dom.js';
import { workRow, listStage, workName } from './cards.js';

export function libraryTemplate() {
  const savedPoems = State.poems.filter((poem) => State.saved.has(poem.id));
  return `<section class="page library-page"><header class="library-header"><p class="kicker">Archivio personale</p><h1 class="display">Opere conservate.</h1></header><section class="library-content">${savedPoems.length ? `<div class="library-top"><p>${savedPoems.length} ${savedPoems.length === 1 ? "opera disponibile" : "opere disponibili"}</p><button class="small-action" data-route-button="discover">Aggiungi dal catalogo →</button></div>${listStage(savedPoems.map(workRow).join(""), "Opere conservate")}` : `<div class="library-empty"><h2>Il tuo archivio è vuoto.</h2><p>Conserva qui le opere che vuoi ritrovare: la lettura può avere una sua memoria.</p><button class="primary-button" data-route-button="discover">Apri il catalogo</button></div>`}</section></section>`;
}

export function publicAccessTemplate(area) {
  const copy = {
    profile: {
      title: "Il tuo spazio personale.",
      heading: "Crea il tuo profilo.",
      description: "Accedi per creare il tuo profilo, seguire le voci che ti interessano e gestire nome, immagine e attività personale.",
      action: "Accedi per creare il tuo profilo"
    },
    library: {
      title: "La tua libreria.",
      heading: "Salva le poesie che ti piacciono.",
      description: "Accedi per organizzare il tuo archivio personale e salvare le opere che vuoi ritrovare.",
      action: "Accedi"
    },
    publish: {
      title: "Pubblica la tua poesia.",
      heading: "Dai una pagina alle tue opere.",
      description: "Accedi per pubblicare le tue poesie e le tue raccolte sul tuo profilo pubblico.",
      action: "Accedi"
    }
  }[area] || {
    title: "Benvenuto in Poetek.",
    heading: "La poesia è accessibile da subito.",
    description: "Leggi ed esplora liberamente; accedi per partecipare alla piattaforma.",
    action: "Accedi"
  };
  return `<section class="page library-page public-access-page"><header class="library-header"><p class="kicker">Esperienza personale</p><h1 class="display">${copy.title}</h1></header><section class="library-content"><div class="library-empty"><h2>${copy.heading}</h2><p>${copy.description}</p><div class="public-access-actions"><button class="primary-button" data-open-auth>${copy.action}</button></div></div></section></section>`;
}

export function aboutTemplate() {
  return `
    <section class="page about-page">
      <header class="about-header">
        <p class="kicker">Poetek / Chi siamo</p>
        <h1 class="sr-only">Chi siamo</h1>
      </header>
      <div class="about-statement" aria-label="Il progetto Poetek">
        <p class="about-opening">Questo progetto si propone come aggregatore culturale di poesia contemporanea, uno spazio in cui leggere, pubblicare, scoprire e condividere testi poetici.</p>
        <p>L'iniziativa nasce con il duplice obiettivo di radunare le tendenze dispersive della poesia digitale e rendere la fruizione della poesia -in generale- maggiormente accessibile ad un pubblico eterogeneo.</p>
        <p>Inoltre, la piattaforma vuole valorizzare il carattere frammentario della poesia, in modo tale che un singolo componimento possa lasciare il segno indipendentemente dalla raccolta poetica d'appartenenza.</p>
        <p class="about-closing">Speriamo, con questo lavoro, di restituire la poesia alla quotidianità delle persone.</p>
      </div>
    </section>
  `;
}

export function collectionTemplate(collection) {
  const works = worksForCollection(collection);
  const canManage = isUserCollection(collection);
  return `<section class="page collection-page">
    <button class="reader-back" data-close-collection>← Torna alle letture</button>
    <header class="collection-header"><p class="kicker">Raccolta</p><h1 class="display">${esc(collection.title)}.</h1><div><p class="collection-byline">${esc(collection.author)}</p><p class="collection-description">${esc(collection.description)} · ${esc(collection.note)}</p></div>${canManage ? `<div class="collection-manager-actions"><button data-add-to-collection="${esc(collection.id)}">Aggiungi nuova poesia</button></div>` : ""}</header>
    <div class="collection-browse"><aside class="collection-index"><p class="kicker">Indice</p><ol>${works.map((poem, index) => `<li><button data-open="${esc(poem.id)}"><span>${String(index + 1).padStart(2, "0")}</span>${esc(workName(poem))}</button></li>`).join("")}</ol></aside><section class="collection-works"><div class="section-heading-line"><div><p class="kicker">Opere</p><h2 class="section-title">${works.length} ${works.length === 1 ? "opera" : "opere"}</h2></div></div>${listStage(works.map(workRow).join(""), "Opere della raccolta")}</section></div>
  </section>`;
}
