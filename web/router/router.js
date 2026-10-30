/**
 * Module for routing and navigation functions.
 */

import { State, isRemoteBeta, hasActiveAccount, reportBetaError } from '../state/store.js';
import { setMenuOpen } from '../utils/dom.js';
import { authorProfiles, resolveAuthor } from '../domain/selectors.js';
import { recordReading } from '../domain/actions.js';
import { LAST_AUTHOR_STORAGE_KEY } from '../config/constants.js';

let render = () => {};

export function setRenderCallback(fn) {
  render = fn;
}

export function changeRoute(next, tag) {
  setMenuOpen(false);
  State.route = next;
  State.readerPoemId = "";
  State.collectionViewId = null;
  State.expandedHomeSection = "";
  if (tag) State.activeTag = tag;
  const paths = { home: "home", about: "chi-siamo", discover: "scopri", library: "libreria", pietro: "pietro-botarelli", account: "profilo", publish: "pubblica" };
  location.hash = paths[next];
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
}

export function openAuthor(author) {
  const identity = resolveAuthor(author);
  if (identity.ambiguous || !authorProfiles().some((profile) => profile.key === identity.key)) return;
  author = identity.key;
  setMenuOpen(false);
  State.activeAuthor = author;
  State.route = "author";
  State.readerPoemId = "";
  State.collectionViewId = null;
  location.hash = `autore=${encodeURIComponent(author)}`;
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
}

export function openCollection(id) {
  const collection = State.collectionMap.get(id);
  if (!collection) return;
  recordReading("collection", id, collection.author);
  State.readerPoemId = "";
  State.collectionViewId = id;
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
}

export function openPoem(id, shouldRecord = true) {
  const poem = State.poems.find((entry) => entry.id === id);
  if (!poem) return;
  if (shouldRecord) recordReading("poem", id, poem.author);
  State.lastAuthor = poem.author;
  localStorage.setItem(LAST_AUTHOR_STORAGE_KEY, State.lastAuthor);
  if (isRemoteBeta() && State.betaReady && hasActiveAccount()) window.PoetekBackend.updateProfile({ last_author: State.lastAuthor }).catch(reportBetaError);
  // La lettura passa dallo stato, non scritta a mano nella pagina: così
  // sopravvive a un aggiornamento che arrivi mentre si sta leggendo.
  State.readerPoemId = id;
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
}

export function routeFromHash(hash) {
  // Compatibilità per vecchi collegamenti: AI resta un normale profilo autore,
  // non una sezione autonoma dell'applicazione.
  if (hash === "#ai") return { route: "author", author: "AI" };
  if (hash.startsWith("#autore=")) {
    try { return { route: "author", author: decodeURIComponent(hash.slice("#autore=".length)) }; }
    catch { return { route: "home", author: "" }; }
  }
  const paths = { "#home": "home", "#scopri": "discover", "#libreria": "library", "#pietro-botarelli": "pietro", "#profilo": "account", "#pubblica": "publish", "#chi-siamo": "about" };
  return { route: paths[hash] || "home", author: "" };
}
