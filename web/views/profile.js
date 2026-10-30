/**
 * @module views/profile
 * @description Templates for author profiles, avatars, social controls, and chronological lists.
 */

import { State } from '../state/store.js';
import { authorKey, resolveAuthor, profileOwnerId, profileImageSource, profileRecord, collectionPublishedAt, poemPublishedAt, chronologicalGroups, rankedAuthorPoems, singleAuthorPoems, isUserCollection, canEditPoem } from '../domain/selectors.js';
import { esc } from '../utils/dom.js';
import { workRow, listStage, cardLead } from './cards.js';

export function profileInitials(author) {
  if (author === "AI") return "AI";
  return author.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "P";
}

export function profilePortrait(reference) {
  const author = resolveAuthor(reference).name;
  const ownerId = profileOwnerId(reference);
  const imageSource = profileImageSource(ownerId);
  const editable = Boolean(ownerId && ownerId === State.activeSession.accountId);
  const image = imageSource ? `<img class="profile-avatar-image" src="${esc(imageSource)}" alt="" loading="lazy" />` : `<span>Immagine profilo</span><strong>${esc(profileInitials(author))}</strong>`;
  const upload = editable ? `<label class="profile-avatar-upload">${imageSource ? "Cambia immagine" : "Aggiungi immagine"}<input id="profile-image-file" data-profile-owner="${esc(ownerId)}" type="file" accept="image/*" /></label>` : "";
  const controls = editable ? `<div class="profile-avatar-controls"><label><span>Oppure URL dell'immagine</span><input id="profile-image-url" data-profile-owner="${esc(ownerId)}" type="url" inputmode="url" value="${esc(/^https?:/i.test(profileRecord(ownerId).imageUrl) ? profileRecord(ownerId).imageUrl : "")}" placeholder="https://…" /></label>${imageSource ? `<button type="button" data-remove-profile-image="${esc(ownerId)}">Rimuovi immagine</button>` : ""}</div>` : "";
  return `<div class="profile-portrait ${imageSource ? "profile-portrait--image" : "profile-portrait--placeholder"}" aria-label="Immagine profilo di ${esc(author)}">${image}${upload}</div>${controls}`;
}

export function profileSocialControls(reference) {
  const author = resolveAuthor(reference).name;
  const ownerId = profileOwnerId(reference);
  if (!ownerId) return State.profileNotice ? `<p class="profile-notice">${esc(State.profileNotice)}</p>` : "";
  const editable = ownerId === State.activeSession.accountId;
  const followerCount = State.authorFollowerCounts.get(ownerId) || 0;
  const followerLabel = `${followerCount} ${followerCount === 1 ? "persona segue" : "persone seguono"} questo autore`;
  const nameControl = editable ? `<div class="profile-name-controls"><label><span>Nome profilo</span><input id="profile-display-name" type="text" maxlength="80" value="${esc(author)}" autocomplete="name" /></label><button type="button" data-save-profile-name="${esc(ownerId)}">Salva nome</button></div>` : "";
  const following = State.followedAuthorIds.has(ownerId);
  const followControl = editable ? "" : `<button class="profile-follow-button ${following ? "is-following" : ""}" type="button" data-follow-author="${esc(ownerId)}" aria-pressed="${following}">${following ? "✓ Segui già" : "+ Segui"}</button>`;
  return `<div class="profile-social-controls">${nameControl}${followControl ? `<div class="profile-follow-controls">${followControl}<span>${esc(followerLabel)}</span></div>` : `<p class="profile-follow-count">${esc(followerLabel)}</p>`}${State.profileNotice ? `<p class="profile-notice">${esc(State.profileNotice)}</p>` : ""}</div>`;
}

export function profileListItem(entry, type) {
  const isCollection = type === "collection";
  const date = isCollection ? collectionPublishedAt(entry) : poemPublishedAt(entry);
  const title = isCollection ? entry.title : cardLead(entry);
  const action = isCollection ? `data-collection="${esc(entry.id)}"` : `data-open="${esc(entry.id)}"`;
  const editable = isCollection ? isUserCollection(entry) : canEditPoem(entry);
  const editAction = isCollection ? `data-edit-collection="${esc(entry.id)}"` : `data-edit="${esc(entry.id)}"`;
  return `<div class="profile-list-item"><button class="profile-list-open-target" ${action}><span class="profile-list-type">${isCollection ? "Raccolta" : "Poesia singola"}</span><span class="profile-list-title">${esc(title)}</span><span class="profile-list-date">${esc(date.slice(0, 4))}</span><span class="profile-list-open">Apri →</span></button>${editable ? `<button class="profile-list-edit" ${editAction}>${isCollection ? "Gestisci" : "Modifica"}</button>` : ""}</div>`;
}

export function profileChronologicalList(entries, type) {
  const dateForEntry = type === "collection" ? collectionPublishedAt : poemPublishedAt;
  const groups = chronologicalGroups(entries, dateForEntry);
  if (!groups.length) return `<p class="profile-list-empty">Nessuna ${type === "collection" ? "raccolta" : "poesia singola"} disponibile.</p>`;
  return groups.map((group) => `<section class="profile-year-group"><p class="profile-year">${esc(group.year)}</p><div class="profile-list">${group.items.map((entry) => profileListItem(entry, type)).join("")}</div></section>`).join("");
}

export function profileTemplate(reference) {
  const identity = resolveAuthor(reference);
  const author = identity.name;
  if (identity.ambiguous) return `<section class="page"><p>Più autori hanno questo nome. Scegli il profilo dal catalogo.</p></section>`;
  const isPersonalProfile = Boolean(identity.ownerId && identity.ownerId === State.activeSession.accountId);
  const profileCollections = State.catalogueCollections.filter((collection) => authorKey(collection) === identity.key);
  const popularPoems = rankedAuthorPoems(reference, 10);
  const singlePoems = singleAuthorPoems(reference);
  return `<section class="page profile-page">
    <header class="profile-header">
      <p class="kicker">${isPersonalProfile ? "Area personale" : "Profilo autore"}</p>
      <h1 class="display">${isPersonalProfile ? "Il tuo profilo." : `${esc(author)}.`}</h1>
      ${profilePortrait(reference)}
      ${profileSocialControls(reference)}
    </header>
    <section class="profile-popular"><div class="section-heading-line"><div><p class="kicker">Le più lette</p><h2 class="section-title">Letture in primo piano</h2></div><p class="works-total">Top ${popularPoems.length}</p></div>${listStage(popularPoems.map(workRow).join(""), "Letture in primo piano")}</section>
    <section class="profile-catalogue"><div class="section-heading-line"><div><p class="kicker">Tutte le opere</p><h2 class="section-title">Archivio cronologico</h2></div><p class="works-total">${singlePoems.length + profileCollections.length} ingressi</p></div><div class="profile-archive-columns"><section class="profile-archive-section"><div class="profile-archive-heading"><h3>Poesie singole</h3><span>${singlePoems.length}</span></div>${profileChronologicalList(singlePoems, "poem")}</section><section class="profile-archive-section"><div class="profile-archive-heading"><h3>Raccolte</h3><span>${profileCollections.length}</span></div>${profileChronologicalList(profileCollections, "collection")}</section></div></section>
  </section>`;
}
