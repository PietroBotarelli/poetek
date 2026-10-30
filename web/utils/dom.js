/**
 * DOM utility functions.
 */
import { isRemoteBeta } from '../state/store.js';

export const esc = (value) => String(value || "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[char]));

export function externalImageUrl(value) {
  const candidate = String(value || "").trim();
  if (!candidate) return "";
  try {
    const url = new URL(candidate, location.href);
    return (isRemoteBeta() ? ["https:"] : ["https:", "http:"]).includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function calendarDayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function setMenuOpen(open) {
  const shell = document.querySelector(".app-shell");
  const toggle = document.querySelector("[data-menu-toggle]");
  shell?.classList.toggle("menu-open", open);
  toggle?.setAttribute("aria-expanded", String(open));
  toggle?.setAttribute("aria-label", open ? "Chiudi il menu" : "Apri il menu");
}
