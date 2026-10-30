import { State } from '../state/store.js';
import { esc } from '../utils/dom.js';
import { recentReadingItems } from '../state/store.js';
import {
  rankedHomeItems, dailyNewHomeItems, rankedAuthors,
  newestAuthorsFromItems, dailyFeedDetail, authorSummary
} from '../domain/selectors.js';
import { cardVisual, cardCaptionText, workRow, authorRow, listStage } from './cards.js';

/**
 * Funzioni di template per la pagina Home.
 */

// Una raccolta in elenco: apre il proprio indice, non una scheda.
function collectionRow(collection) {
  const card = cardVisual(collection.card);
  return `<article class="work-row work-row--collection">
    <button class="work-row-open" data-collection="${esc(collection.id)}">
      <span class="work-row-name">${esc(cardCaptionText(card, collection.title))}</span>
      <span class="work-row-meta">${esc(collection.author)} · Raccolta</span>
    </button>
    <div class="work-row-actions"><span class="work-row-go" aria-hidden="true">→</span></div>
  </article>`;
}

function homeListItem(item) {
  if (item.type === "collection") return collectionRow(State.collectionMap.get(item.id));
  const poem = State.poems.find((entry) => entry.id === item.id);
  return poem ? workRow(poem) : "";
}

function homeHeadingMarkup(label, sublabel = "", expandKey = "") {
  return `<div class="section-heading-line home-section-heading"><div><p class="home-section-label">${esc(label)}</p>${sublabel ? `<p class="home-section-meta">${esc(sublabel)}</p>` : ""}</div>${expandKey ? `<div class="section-heading-actions"><button class="home-expand" data-home-expand="${esc(expandKey)}">Espandi <span aria-hidden="true">↗</span></button></div>` : ""}</div>`;
}

function homeExpandedData(key) {
  const latest = dailyNewHomeItems(20);
  const recent = recentReadingItems(Number.MAX_SAFE_INTEGER);
  const sections = {
    continue: recent.length ? { kicker: "Continua a leggere", title: "Le tue ultime letture", detail: "", items: recent } : null,
    popular: { kicker: "Le più popolari", title: "Classifica settimanale", detail: "Opere e raccolte ordinate per letture della settimana", items: rankedHomeItems("popularity", Number.MAX_SAFE_INTEGER) },
    latest: { kicker: "Le ultime uscite", title: "Nuovi ingressi", detail: dailyFeedDetail(latest), items: latest }
  };
  return sections[key] || null;
}

export function homeExpandedTemplate(key) {
  const section = homeExpandedData(key);
  if (!section) return homeTemplate();
  return `<section class="page home-expanded-page">
    <button class="reader-back" data-home-collapse>← Torna alle letture</button>
    <header class="home-expanded-header"><div><p class="kicker">${esc(section.kicker)}</p><h1 class="display">${esc(section.title)}</h1></div><p>${esc(section.detail)}</p><span>${section.items.length} ${section.items.length === 1 ? "opera" : "opere"}</span></header>
    ${listStage(section.items.map(homeListItem).join(""), section.title)}
  </section>`;
}

function homeSection(label, sublabel, items, expandKey = "") {
  return `<section class="home-section">
    ${homeHeadingMarkup(label, sublabel, expandKey)}
    ${listStage(items.slice(0, 5).map(homeListItem).join(""), label)}
  </section>`;
}

function emptyReadingSection() {
  return `<section class="home-section home-section--empty-reading">
    ${homeHeadingMarkup("Continua a leggere", "Le tue ultime letture")}
    <div class="home-empty-reading"><p>Non hai ancora aperto un testo. Scorri giù per scoprire nuova poesia!</p></div>
  </section>`;
}

function homeRankingSection(label, items, authors, options = {}) {
  const itemCount = options.itemCount || `Top ${items.length}`;
  const itemLabel = options.itemLabel || "Opere e raccolte";
  const authorLabel = options.authorLabel || "Poeti";
  const authorCount = options.authorCount || `Top ${authors.length}`;
  return `<section class="home-section home-ranking-section">
    ${homeHeadingMarkup(label, "", options.expandKey || "")}
    <div class="home-ranking-group"><div class="home-subheading"><span>${esc(itemLabel)}</span><span>${esc(itemCount)}</span></div>${listStage(items.slice(0, 5).map(homeListItem).join(""), itemLabel)}</div>
    <div class="home-ranking-group"><div class="home-subheading"><span>${esc(authorLabel)}</span><span>${esc(authorCount)}</span></div>${listStage(authors.slice(0, 5).map((a) => authorRow(a, authorSummary(a))).join(""), authorLabel)}</div>
  </section>`;
}

function homePath(routeTarget, title, description) {
  return `<button class="home-path" data-route-button="${esc(routeTarget)}"><span class="home-path-copy"><strong>${esc(title)}</strong><small>${esc(description)}</small></span><span class="home-path-arrow" aria-hidden="true">→</span></button>`;
}

// Le due sezioni di classifica valgono tanto in home quanto nel catalogo:
// sono lo stesso materiale, quindi vivono in una funzione sola.
export function sezioniInEvidenza() {
  const popular = rankedHomeItems("popularity", 5);
  const latest = dailyNewHomeItems(20);
  const popularAuthors = rankedAuthors("popularity");
  const latestAuthors = newestAuthorsFromItems(latest);
  return `${homeRankingSection("Le più popolari", popular, popularAuthors, { expandKey: "popular" })}
    ${homeRankingSection("Le ultime uscite", latest, latestAuthors, { expandKey: "latest", itemCount: latest.length === 20 ? "Ultimi 20" : `${latest.length} ingressi`, authorLabel: "Autori del periodo", authorCount: `${latestAuthors.length} ${latestAuthors.length === 1 ? "autore" : "autori"}` })}`;
}

export function homeTemplate() {
  const continued = recentReadingItems(4);
  return `<section class="page home-page">
    <header class="home-intro"><p class="home-intro-overline">Poetek / Home</p><div class="home-intro-main"><h1>La poesia<br>a portata di click.</h1><div class="home-intro-description"><p>Poetek è una piattaforma di pubblicazione e lettura della poesia contemporanea (e non).</p><button class="project-about" data-route-button="about">Scopri di più sul progetto <span aria-hidden="true">↗</span></button></div></div></header>
    <nav class="home-paths" aria-label="Scegli come usare Poetek">${homePath("discover", "Leggi poesia", "Testi, raccolte e nuove voci.")}${homePath("publish", "Pubblica un testo", "Dai una pagina alle tue opere.")}</nav>
    ${continued.length ? homeSection("Continua a leggere", "Le tue ultime letture", continued, "continue") : emptyReadingSection()}
    ${sezioniInEvidenza()}
  </section>`;
}
