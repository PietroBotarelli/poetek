/**
 * Selector functions for Poetek.
 * Pure functions that read state and compute derived data.
 */

import { State, isRemoteBeta, currentWeekKey, hasActiveAccount } from '../state/store.js';
import { calendarDayKey } from '../utils/dom.js';

export const worksForCollection = (collection) => collection.poemIds.map((id) => State.poems.find((poem) => poem.id === id)).filter(Boolean);

export const authorKey = (entry) => entry?.ownerId ? `id:${entry.ownerId}` : entry?.author || "";

export function resolveAuthor(reference) {
  const entries = [...State.poems, ...State.catalogueCollections];
  if (reference?.startsWith("id:")) {
    const ownerId = reference.slice(3);
    const name = State.profileState.profiles[ownerId]?.displayName || entries.find(e => e.ownerId === ownerId)?.author || (ownerId === State.activeSession.accountId ? State.activeSession.displayName : "Autore");
    return { key: reference, ownerId, name, ambiguous: false };
  }
  const owners = [...new Set(entries.filter(e => e.author === reference && e.ownerId).map(e => e.ownerId))];
  if (reference === State.activeSession.displayName && State.activeSession.accountId && !owners.includes(State.activeSession.accountId)) owners.push(State.activeSession.accountId);
  return { key: owners.length === 1 ? `id:${owners[0]}` : reference, ownerId: owners.length === 1 ? owners[0] : "", name: reference || "Autore", ambiguous: owners.length > 1 };
}
export function authorPoems(reference) {
  const a = resolveAuthor(reference);
  if (a.ambiguous) return [];
  return State.poems.filter(p => a.ownerId ? p.ownerId === a.ownerId : !p.ownerId && p.author === a.name);
}

export function weeklyReadCount(type, id) {
  if (isRemoteBeta()) return State.remoteReadCounts.get(`${type}:${id}`) || 0;
  const week = currentWeekKey();
  return State.readingEvents.reduce((count, event) => count + Number(event.type === type && event.id === id && event.week === week), 0);
}

export function workRankingScore(item) {
  return weeklyReadCount(item.type, item.id) * 10000 + Number(item.popularity || 0);
}

export function poemPublishedAt(poem) {
  return poem.publishedAt || State.homeCatalogueItems.find((item) => item.type === "poem" && item.id === poem.id)?.publishedAt || "1970-01-01";
}

export function collectionPublishedAt(collection) {
  return State.homeCatalogueItems.find((item) => item.type === "collection" && item.id === collection.id)?.publishedAt || "1970-01-01";
}

export function poemRankingScore(poem) {
  const homeItem = State.homeCatalogueItems.find((item) => item.type === "poem" && item.id === poem.id);
  return weeklyReadCount("poem", poem.id) * 10000 + Number(homeItem?.popularity || 0);
}

export function rankedAuthorPoems(author, limit = 10) {
  return authorPoems(author)
    .sort((first, second) => poemRankingScore(second) - poemRankingScore(first) || poemPublishedAt(second).localeCompare(poemPublishedAt(first)) || first.id.localeCompare(second.id))
    .slice(0, limit);
}

export function singleAuthorPoems(author) {
  return authorPoems(author).filter((poem) => !collectionForPoem(poem));
}

export function chronologicalGroups(entries, dateForEntry) {
  const groups = new Map();
  [...entries].sort((first, second) => dateForEntry(second).localeCompare(dateForEntry(first))).forEach((entry) => {
    const year = dateForEntry(entry).slice(0, 4) || "Senza data";
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year).push(entry);
  });
  return [...groups.entries()].map(([year, items]) => ({ year, items }));
}

export function rankedHomeItems(field, limit = 4) {
  return [...State.homeCatalogueItems]
    .filter((item) => homeItemSubject(item))
    .sort((first, second) => field === "publishedAt" ? homeItemPublishedAt(second).localeCompare(homeItemPublishedAt(first)) : workRankingScore(second) - workRankingScore(first))
    .slice(0, limit);
}

export function dailyNewHomeItems(limit = 20, now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayKey = calendarDayKey(today);
  const itemsByDay = new Map();
  const seen = new Set();

  State.homeCatalogueItems.forEach((item) => {
    if (!homeItemSubject(item)) return;
    const key = `${item.type}:${item.id}`;
    const day = calendarDayKey(homeItemPublishedAt(item));
    if (!day || day > todayKey || seen.has(key)) return;
    seen.add(key);
    if (!itemsByDay.has(day)) itemsByDay.set(day, []);
    itemsByDay.get(day).push(item);
  });

  const earliestDay = [...itemsByDay.keys()].sort()[0];
  if (!earliestDay) return [];
  const selected = [];
  const cursor = new Date(today);
  // Il ciclo rende esplicita la regola di prodotto: prima il giorno corrente,
  // poi il precedente, finché non ci sono 20 ingressi o il catalogo finisce.
  while (calendarDayKey(cursor) >= earliestDay && selected.length < limit) {
    const dayItems = [...(itemsByDay.get(calendarDayKey(cursor)) || [])]
      .sort((first, second) => homeItemPublishedAt(second).localeCompare(homeItemPublishedAt(first)) || `${first.type}:${first.id}`.localeCompare(`${second.type}:${second.id}`));
    selected.push(...dayItems.slice(0, limit - selected.length));
    cursor.setDate(cursor.getDate() - 1);
  }
  return selected;
}

export function homeDateLabel(item) {
  const date = new Date(homeItemPublishedAt(item));
  if (Number.isNaN(date.getTime())) return "Senza data";
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short" }).format(date).replace(".", "");
}

export function dailyFeedDetail(items) {
  if (!items.length) return "Nessun nuovo ingresso";
  const newest = homeDateLabel(items[0]);
  const oldest = homeDateLabel(items.at(-1));
  return newest === oldest ? `Uscite del ${newest}` : `Dal ${oldest} al ${newest}`;
}

export function authorSummary(profile) {
  const works = `${profile.workCount} ${profile.workCount === 1 ? "opera" : "opere"}`;
  const collections = profile.collectionCount ? ` · ${profile.collectionCount} ${profile.collectionCount === 1 ? "raccolta" : "raccolte"}` : "";
  return `${works}${collections}`;
}

export function authorProfiles() {
  const identities = new Map([...State.poems, ...State.catalogueCollections].map(e => [authorKey(e), e.author]));
  return [...identities].map(([key, name]) => {
    const works = State.poems.filter(e => authorKey(e) === key);
    const collections = State.catalogueCollections.filter(e => authorKey(e) === key);
    const relatedItems = State.homeCatalogueItems.filter(e => authorKey(homeItemSubject(e)) === key);
    const dates = [...works.map(e => e.publishedAt), ...relatedItems.map(homeItemPublishedAt)].filter(Boolean);
    const weeklyReads = isRemoteBeta() ? relatedItems.reduce((n,e) => n + weeklyReadCount(e.type,e.id),0) : State.readingEvents.reduce((n,e) => n + Number(e.author === name && e.week === currentWeekKey()),0);
    return { key, name, workCount: works.length, collectionCount: collections.length, weeklyReads, baselinePopularity: relatedItems.reduce((n,e) => n + Number(e.popularity || 0),0), latest: dates.sort().at(-1) || "1970-01-01" };
  });
}

export function rankedAuthors(field) {
  return authorProfiles()
    .sort((first, second) => field === "publishedAt" ? second.latest.localeCompare(first.latest) : (second.weeklyReads * 10000 + second.baselinePopularity) - (first.weeklyReads * 10000 + first.baselinePopularity))
    .slice(0, 4);
}

export function newestAuthorsFromItems(items, limit = 4) {
  const newestByAuthor = new Map();
  items.forEach((item) => {
    const author = authorKey(homeItemSubject(item));
    if (!author || newestByAuthor.has(author)) return;
    newestByAuthor.set(author, item);
  });
  const profileByName = new Map(authorProfiles().map((profile) => [profile.key, profile]));
  return [...newestByAuthor.entries()]
    .sort((first, second) => homeItemPublishedAt(second[1]).localeCompare(homeItemPublishedAt(first[1])) || first[0].localeCompare(second[0]))
    .map(([author]) => profileByName.get(author))
    .filter(Boolean)
    .slice(0, limit);
}

export function homeItemSubject(item) {
  return item.type === "collection" ? State.collectionMap.get(item.id) : State.poems.find((poem) => poem.id === item.id);
}

export function homeItemAuthor(item) {
  return homeItemSubject(item)?.author || "";
}

export function homeItemPublishedAt(item) {
  return item.publishedAt || homeItemSubject(item)?.publishedAt || "1970-01-01";
}

export function collectionForPoem(poem) {
  return State.catalogueCollections.find((collection) => collection.poemIds.includes(poem.id)) || null;
}

export function ownerIdForPoem(poem) {
  return poem?.ownerId || collectionForPoem(poem)?.ownerId || "";
}

export function isOwnedByActiveAccount(subject) {
  return Boolean(subject && (
    State.activeSession.role === "admin" ||
    (hasActiveAccount() && subject.ownerId === State.activeSession.accountId)
  ));
}

export function canEditPoem(poem) {
  return Boolean(poem && (
    State.activeSession.role === "admin" ||
    (hasActiveAccount() && ownerIdForPoem(poem) === State.activeSession.accountId)
  ));
}

export function isUserCollection(collection) {
  return isOwnedByActiveAccount(collection);
}

// Contratto da trasferire al back-end: il profilo e le sue immagini sono
// sempre indicizzati da ownerId/profileId. Il nome può cambiare senza perdere
// immagine né permessi.
export function profileOwnerId(author) { return resolveAuthor(author).ownerId; }

export function profileRecord(ownerId) {
  if (!ownerId) return { ownerId: "", imageId: "", imageUrl: "" };
  const stored = State.profileState.profiles[ownerId] || {};
  return {
    ownerId,
    imageId: typeof stored.imageId === "string" ? stored.imageId : "",
    imageUrl: typeof stored.imageUrl === "string" ? stored.imageUrl : ""
  };
}

export function profileImageSource(ownerId) {
  const profile = profileRecord(ownerId);
  return profile.imageUrl || (profile.imageId ? State.cardMediaUrls.get(profile.imageId) || "" : "");
}
