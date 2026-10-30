/**
 * Condivisione di un'opera come immagine verticale, nel formato delle
 * storie (1080×1920).
 *
 * Instagram ha un'integrazione ufficiale per le storie, ma vive solo dentro
 * le app native: passa l'immagine per gli appunti di sistema o per un
 * Intent, e da un browser non si può invocare. Qui si prende l'altra
 * strada, che non richiede accordi né chiavi: si disegna l'immagine e la si
 * consegna al pannello di condivisione del telefono, dove Instagram compare
 * fra le destinazioni.
 */

import { poemReadingVisual, readingImageSource } from '../views/cards.js';

const LARGHEZZA = 1080;
const ALTEZZA = 1920;
const MARGINE = 96;
const COLONNA = LARGHEZZA - MARGINE * 2;

// In cima e in fondo le storie hanno la loro interfaccia -- il nome di chi
// pubblica sopra, la barra della risposta sotto -- che coprirebbe quello che
// ci finisse dentro. Il testo sta lontano da lì.
const RIPARO_ALTO = 200;
const RIPARO_BASSO = 210;

// Gli stessi caratteri della piattaforma: l'immagine deve sembrare
// staccata da Poetek, non ispirata a Poetek.
const SERIF = '"Newsreader", Georgia, serif';
const SANS = '"Manrope", Arial, sans-serif';
const MONO = '"DM Mono", Consolas, monospace';

// I due fogli su cui si legge su Poetek. Non c'e' un terzo: l'immagine
// condivisa e' la pagina di lettura, non una sua interpretazione.
export const SFONDI = Object.freeze([
  { id: 'default', label: 'Chiaro', carta: '#fffefa' },
  { id: 'paper', label: 'Carta', carta: '#e8ddc5' }
]);

const INCHIOSTRO = '#201d18';
const TITOLO = '#32333a';
const AUTORE = '#5e5e66';
const SPENTO = '#60616b';
const ACCENTO = '#9c6245';
const FILO = 'rgba(32, 29, 24, 0.22)';

function cartaDi(sfondo) {
  return (SFONDI.find((voce) => voce.id === sfondo) || SFONDI[0]).carta;
}

const VERSI_MOSTRATI = 8;
const DOMINIO = 'poetek-beta.netlify.app';

// Otto versi si leggono comodi anche su uno schermo piccolo; l'intera entra
// per quasi tutte le poesie, ma il corpo scende e con esso la leggibilita'.
// La scelta e' dell'autore, il consiglio resta nostro.
export const MODI = Object.freeze([
  { id: 'standard', label: 'Standard', nota: 'consigliata' },
  { id: 'intera', label: 'Intera', nota: 'tutta la poesia' }
]);

const CORPO_MASSIMO = 64;
const CORPO_COMODO = 26;
// Sotto questa misura l'immagine smette di essere leggibile su un telefono.
const CORPO_MINIMO = 20;

// Otto versi, contando solo quelli scritti: le righe vuote separano le
// strofe e non vanno conteggiate, ma vanno conservate, perché in poesia
// anche il silenzio è composto.
export function versiPerStoria(testo, quanti = VERSI_MOSTRATI) {
  const righe = String(testo || '').split('\n');
  const scelti = [];
  let pieni = 0;
  for (const riga of righe) {
    if (pieni === quanti) break;
    if (riga.trim()) { pieni += 1; scelti.push(riga.trim()); }
    else if (scelti.length) scelti.push('');
  }
  while (scelti.length && !scelti[scelti.length - 1]) scelti.pop();
  const totale = righe.filter((riga) => riga.trim()).length;
  return { versi: scelti, troncata: totale > pieni };
}

function spezza(ctx, testo, larghezza) {
  const parole = String(testo).split(/\s+/).filter(Boolean);
  const righe = [];
  let corrente = '';
  parole.forEach((parola) => {
    const prova = corrente ? `${corrente} ${parola}` : parola;
    if (ctx.measureText(prova).width <= larghezza || !corrente) corrente = prova;
    else { righe.push(corrente); corrente = parola; }
  });
  if (corrente) righe.push(corrente);
  return righe;
}

// Un verso non si manda a capo: si rimpicciolisce finché il più lungo entra
// nella colonna. È una tela di misura fissa, non una pagina che scorre.
function corpoDeiVersi(ctx, versi, altezzaDisponibile, minimo = CORPO_COMODO) {
  for (let corpo = CORPO_MASSIMO; corpo >= minimo; corpo -= 1) {
    ctx.font = `400 ${corpo}px ${SERIF}`;
    const largo = versi.every((verso) => !verso || ctx.measureText(verso).width <= COLONNA);
    const alto = versi.length * corpo * 1.52;
    if (largo && alto <= altezzaDisponibile) return corpo;
  }
  return minimo;
}

function tracciatura(ctx, valore) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = valore;
}

// L'immagine arriva da un altro dominio. Senza dichiararlo, disegnarla
// contamina la tela e l'esportazione fallisce con un SecurityError: si
// otterrebbe un'immagine da condividere che non si puo' generare.
function caricaFigura(indirizzo) {
  return new Promise((risolvi) => {
    const figura = new Image();
    figura.crossOrigin = 'anonymous';
    figura.onload = () => risolvi(figura);
    // Se non si carica, si condivide lo stesso: i versi valgono da soli.
    figura.onerror = () => risolvi(null);
    figura.src = indirizzo;
  });
}

async function caratteriPronti() {
  if (!document.fonts) return;
  await Promise.all([
    document.fonts.load(`400 48px ${SERIF}`),
    document.fonts.load(`400 30px ${SANS}`),
    document.fonts.load(`400 24px ${MONO}`)
  ]).catch(() => undefined);
  await document.fonts.ready;
}

export async function immagineStoria(poem, sfondo, modo) {
  await caratteriPronti();

  // L'immagine dell'opera segue la scelta dell'autore. In alto precede i
  // versi e ha senso anche con l'estratto; in fondo viene dopo la poesia,
  // quindi comparirebbe fuori posto sopra un testo tagliato: si mostra solo
  // quando la poesia c'e' tutta.
  const intera = modo === 'intera';
  const visuale = poemReadingVisual(poem);
  const inAlto = visuale.imagePosition !== 'bottom';
  const indirizzoFigura = (inAlto || intera) ? readingImageSource(visuale) : '';
  const figura = indirizzoFigura ? await caricaFigura(indirizzoFigura) : null;
  const tela = document.createElement('canvas');
  tela.width = LARGHEZZA;
  tela.height = ALTEZZA;
  const ctx = tela.getContext('2d');

  ctx.fillStyle = cartaDi(sfondo);
  ctx.fillRect(0, 0, LARGHEZZA, ALTEZZA);
  ctx.textBaseline = 'alphabetic';

  let y = RIPARO_ALTO;

  // Soprattitolo.
  tracciatura(ctx, '0.14em');
  ctx.font = `500 24px ${MONO}`;
  ctx.fillStyle = ACCENTO;
  ctx.fillText('POETEK', MARGINE, y);
  tracciatura(ctx, '0px');
  y += 74;

  // Il titolo si scrive solo se esiste. Un testo senza titolo non ne ha uno
  // nemmeno qui: mettergli in cima il suo primo verso lo ripeterebbe due
  // righe piu' sotto, fra i versi.
  if (String(poem.title || '').trim()) {
    ctx.font = `400 62px ${SERIF}`;
    ctx.fillStyle = TITOLO;
    spezza(ctx, poem.title, COLONNA).slice(0, 3).forEach((riga) => {
      ctx.fillText(riga, MARGINE, y);
      y += 72;
    });
  }

  // Autore.
  y += 14;
  ctx.font = `400 30px ${SANS}`;
  ctx.fillStyle = AUTORE;
  ctx.fillText(poem.author, MARGINE, y);
  y += 56;

  // Filo di separazione, come nell'elenco delle opere.
  ctx.fillStyle = FILO;
  ctx.fillRect(MARGINE, y, COLONNA, 1);
  y += 84;

  // I versi occupano da soli lo spazio fra l'intestazione e il piede, e ci
  // stanno in mezzo: appoggiati in alto lascerebbero mezza immagine vuota.
  const rigaPiede = ALTEZZA - RIPARO_BASSO;
  const cima = y;
  const fondo = rigaPiede - 74;
  const risultato = versiPerStoria(poem.text, intera ? Infinity : VERSI_MOSTRATI);
  let versi = risultato.versi;
  let troncata = risultato.troncata;
  const minimo = intera ? CORPO_MINIMO : CORPO_COMODO;

  // La figura accompagna i versi senza sostituirli. Il limite e' sull'altezza,
  // quindi una foto verticale ne esce anche stretta: tenerlo basso la
  // rimpiccioliva due volte. Poco meno della meta' dello spazio libero.
  const stacco = figura ? 44 : 0;
  let larghezzaFigura = 0;
  let altezzaFigura = 0;
  if (figura) {
    const scala = Math.min(COLONNA / figura.naturalWidth, ((fondo - cima) * 0.52) / figura.naturalHeight);
    larghezzaFigura = figura.naturalWidth * scala;
    altezzaFigura = figura.naturalHeight * scala;
  }

  const ingombroFigura = altezzaFigura + stacco;

  // Anche presa tutta, una poesia molto lunga non entra in un'immagine sola.
  // Allora si taglia davvero, invece di scrivere piu' piccolo di quanto si
  // riesca a leggere: meglio dirlo che fingere.
  if (intera) {
    const capienza = Math.floor((fondo - cima - 96 - ingombroFigura) / (minimo * 1.52));
    if (versi.length > capienza) {
      versi = versi.slice(0, Math.max(1, capienza - 1));
      troncata = true;
    }
  }

  // Il taglio si segna come ovunque nell'app. Entra fra i versi invece che
  // a parte, così prende il loro carattere, il loro inchiostro e il loro
  // passo, e l'altezza torna da sola.
  const composti = troncata ? [...versi, "[…]"] : versi;
  const spazioContinua = troncata ? 96 : 0;

  const corpo = corpoDeiVersi(ctx, composti, fondo - cima - spazioContinua - ingombroFigura, minimo);
  const passo = corpo * 1.52;
  const altezzaVersi = composti.length * passo;
  const avanzo = fondo - cima - spazioContinua - ingombroFigura - altezzaVersi;
  let cursore = cima + Math.max(0, avanzo / 2);

  if (figura && inAlto) {
    ctx.drawImage(figura, MARGINE, cursore, larghezzaFigura, altezzaFigura);
    cursore += ingombroFigura;
  }

  y = cursore + corpo;
  ctx.font = `400 ${corpo}px ${SERIF}`;
  ctx.fillStyle = INCHIOSTRO;
  composti.forEach((verso) => {
    if (verso) ctx.fillText(verso, MARGINE, y);
    y += passo;
  });
  y -= corpo;

  // L'invito a proseguire, solo se qualcosa è rimasto fuori.
  if (troncata) {
    y += 52;
    ctx.font = `400 34px ${SERIF}`;
    ctx.fillStyle = ACCENTO;
    ctx.fillText('continua su Poetek', MARGINE, y);
  }

  if (figura && !inAlto) {
    ctx.drawImage(figura, MARGINE, y + stacco, larghezzaFigura, altezzaFigura);
  }

  // Piede.
  tracciatura(ctx, '0.12em');
  ctx.font = `400 24px ${MONO}`;
  ctx.fillStyle = SPENTO;
  ctx.fillText(DOMINIO, MARGINE, rigaPiede);
  tracciatura(ctx, '0px');

  const blob = await new Promise((risolvi, rifiuta) => {
    tela.toBlob((prodotto) => {
      if (prodotto) risolvi(prodotto);
      else rifiuta(new Error("L'immagine non è stata generata."));
    }, 'image/png');
  });
  return { blob, tagliata: troncata, versiMostrati: versi.filter((verso) => verso).length, corpo, conFigura: Boolean(figura), figura: figura ? { larghezza: Math.round(larghezzaFigura), altezza: Math.round(altezzaFigura) } : null };
}

// Comodità per chi vuole solo l'immagine.
export async function disegnaStoria(poem, sfondo, modo) {
  return (await immagineStoria(poem, sfondo, modo)).blob;
}

function nomeFile(poem) {
  // Un'opera senza titolo si nomina con il suo attacco, qui come altrove:
  // col nome dell'autore, chi ne condivide diverse otterrebbe file gemelli.
  const attacco = (String(poem.text || '').split('\n').find((riga) => riga.trim()) || '').trim();
  const base = String(poem.title || attacco || poem.author || 'poesia')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `poetek-${base || 'poesia'}.png`;
}

function scarica(blob, nome) {
  const indirizzo = URL.createObjectURL(blob);
  const collegamento = document.createElement('a');
  collegamento.href = indirizzo;
  collegamento.download = nome;
  document.body.appendChild(collegamento);
  collegamento.click();
  collegamento.remove();
  // Si libera dopo, altrimenti lo scaricamento resta senza sorgente.
  setTimeout(() => URL.revokeObjectURL(indirizzo), 4000);
}

// Restituisce come è andata, perché l'interfaccia deve dire una cosa
// diversa a seconda che sia partito il pannello o lo scaricamento.
// Non tutti i browser sanno passare un file a un'altra app: Firefox su
// Android, per esempio, condivide solo testo e collegamenti. Chiederlo
// prima serve a dire la verita' all'autore, invece di promettergli un
// pannello che non si aprira'.
export function siPuoCondividereUnFile(blob) {
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [new File([blob], 'poetek.png', { type: 'image/png' })] });
  } catch {
    return false;
  }
}

// Consegna un'immagine gia' pronta. Fra il tocco e navigator.share non
// deve esserci lavoro: iOS concede la condivisione solo finche' dura il
// permesso del tocco, e ridisegnare la tela lo consuma -- la chiamata viene
// rifiutata e si finisce per scaricare il file invece di condividerlo.
export async function condividiImmagine(blob, poem) {
  const file = new File([blob], nomeFile(poem), { type: 'image/png' });
  const puoCondividere = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  if (puoCondividere) {
    try {
      await navigator.share({ files: [file], title: `${poem.title || 'Poesia'} — ${poem.author}` });
      return 'condivisa';
    } catch (errore) {
      // Annullare non è un guasto: si esce in silenzio.
      if (errore && errore.name === 'AbortError') return 'annullata';
      scarica(blob, nomeFile(poem));
      return 'scaricata';
    }
  }
  scarica(blob, nomeFile(poem));
  return 'scaricata';
}

// Quando l'immagine non c'e' ancora: la disegna e poi la consegna.
export async function condividiOpera(poem, sfondo, modo) {
  return condividiImmagine(await disegnaStoria(poem, sfondo, modo), poem);
}
