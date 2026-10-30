/**
 * @module views/discover
 * @description Templates and view logic for the discover section, search results, and author search cards.
 */

import { State } from '../state/store.js';
import { authorProfiles, authorSummary } from '../domain/selectors.js';
import { esc } from '../utils/dom.js';
import { workRow, listStage } from './cards.js';
import { sezioniInEvidenza } from './home.js';

let render = () => {};

export function setRenderCallback(fn) {
  render = fn;
}

export function authorSearchCard(profile) {
  return `<button class="author-profile-card" data-author="${esc(profile.key || profile.name)}">
    <p class="author-profile-name">${esc(profile.name)}</p>
    <div class="author-profile-footer"><span>${esc(authorSummary(profile))}</span><span>Apri profilo →</span></div>
  </button>`;
}

// La memoria delle ricerche non occupa più la pagina: si affaccia sotto la
// barra quando ci si scrive, come ci si aspetta da un campo di ricerca.
function suggerimentiTemplate() {
  const recent = State.recentSearches;
  if (!recent.length) return "";
  return `<div class="search-suggest" id="search-suggest" hidden>
    <div class="search-suggest-head"><span>Ricerche recenti</span><button class="recent-clear" data-forget-searches>Svuota</button></div>
    ${recent.map((term) => `<button class="recent-item" data-search="${esc(term)}"><span class="recent-item-icon" aria-hidden="true">&#x2315;</span>${esc(term)}</button>`).join("")}
  </div>`;
}

export function discoverResultsTemplate() {
  const query = State.searchQuery.trim().toLocaleLowerCase();
  // A riposo il catalogo propone qualcosa da leggere: le stesse sezioni
  // della home, che sono il modo in cui si entra nelle opere.
  if (!query && State.activeTag === "tutti") return `<section class="results results--evidenza">${sezioniInEvidenza()}</section>`;
  const matchingAuthors = query ? authorProfiles().filter((profile) => profile.name.toLocaleLowerCase().includes(query)) : [];
  const matchingAuthorNames = new Set(matchingAuthors.map((profile) => profile.name));
  const filtered = State.poems.filter((poem) => {
    const indexable = `${poem.title} ${poem.author} ${(poem.tags || []).join(" ")} ${poem.collection} ${poem.text}`.toLocaleLowerCase();
    return (State.activeTag === "tutti" || (poem.tags || []).includes(State.activeTag)) && !matchingAuthorNames.has(poem.author) && indexable.includes(query);
  });
  const label = State.activeTag === "tutti" ? "Catalogo completo" : `Materia: ${State.activeTag}`;
  const authorResults = matchingAuthors.length ? `<section class="author-search-results"><div class="result-note"><span>Profili autore</span><span>${matchingAuthors.length} ${matchingAuthors.length === 1 ? "profilo" : "profili"}</span></div><div class="author-card-grid">${matchingAuthors.map(authorSearchCard).join("")}</div></section>` : "";
  const workResults = filtered.length ? `<section class="work-search-results"><div class="result-note result-note--works"><span>${esc(label)}</span><span>${filtered.length} ${filtered.length === 1 ? "opera" : "opere"}</span></div>${listStage(filtered.map(workRow).join(""), "Risultati")}</section>` : matchingAuthors.length ? "" : `<section class="work-search-results"><div class="result-note result-note--works"><span>${esc(label)}</span><span>0 opere</span></div><p class="no-results">Nessuna opera corrisponde a questa ricerca.</p></section>`;
  return `<section class="results">${authorResults}${workResults}</section>`;
}

export function discoverTemplate() {
  return `<section class="page discover-page">
    <header class="catalogue-heading"><p class="kicker">Catalogo</p><div class="search-area"><span class="search-icon" aria-hidden="true">&#x2315;</span><input id="search" type="search" dir="ltr" value="${esc(State.searchQuery)}" autocomplete="off" spellcheck="false" placeholder="Cerca per tema, titolo, autore o stringa di testo" aria-label="Cerca nel catalogo" role="combobox" aria-expanded="false" aria-controls="search-suggest" />${suggerimentiTemplate()}</div></header>
    <div class="filters">${State.allTags.map((tag) => `<button class="filter-button ${State.activeTag === tag ? "active" : ""}" data-tag="${esc(tag)}">${esc(tag)}</button>`).join("")}</div>
    ${discoverResultsTemplate()}
  </section>`;
}

export function updateDiscoverResults() {
  const results = State.app.querySelector(".results");
  if (!results) {
    render();
    return;
  }
  results.outerHTML = discoverResultsTemplate();
}
