/**
 * @module parsers
 * @description Pure functions for parsing text and importing documents.
 */

export function normaliseText(value) {
  return value.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").trim();
}

export function splitCollectionText(value) {
  return normaliseText(value).split(/\n\s*(?:-{3,}|—{3,}|_{3,})\s*\n/g).map((part) => part.trim()).filter(Boolean);
}

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_DOCUMENT_XML_BYTES = 2 * 1024 * 1024;

export async function inflateZipEntry(bytes) {
  if (!("DecompressionStream" in window)) throw new Error("Questo browser non supporta l'importazione Word.");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_DOCUMENT_XML_BYTES) { await reader.cancel(); throw new Error("Il documento Word contiene troppo testo."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

export async function readDocxDocument(buffer) {
  if (buffer.byteLength > MAX_IMPORT_BYTES || buffer.byteLength < 22) throw new Error("Il file Word è troppo grande o non valido.");
  const view = new DataView(buffer);
  let end = -1;
  for (let offset = view.byteLength - 22; offset >= Math.max(0, view.byteLength - 65557); offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) { end = offset; break; }
  }
  if (end < 0) throw new Error("Il file Word non è valido.");
  let cursor = view.getUint32(end + 16, true);
  const entries = view.getUint16(end + 10, true);
  const decoder = new TextDecoder();
  for (let index = 0; index < entries; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error("Il file Word non è leggibile.");
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(new Uint8Array(buffer, cursor + 46, nameLength));
    if (name === "word/document.xml") {
      if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("Il documento Word non contiene testo leggibile.");
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = new Uint8Array(buffer.slice(dataStart, dataStart + compressedSize));
      const declaredSize = view.getUint32(cursor + 24, true);
      if (declaredSize > MAX_DOCUMENT_XML_BYTES || compressedSize > MAX_IMPORT_BYTES) throw new Error("Il documento Word contiene troppo testo.");
      const data = method === 0 ? compressed : method === 8 ? await inflateZipEntry(compressed) : null;
      if (data && data.length > MAX_DOCUMENT_XML_BYTES) throw new Error("Il documento Word contiene troppo testo.");
      if (!data) throw new Error("Il formato Word caricato non è supportato.");
      return decoder.decode(data);
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error("Nel file Word non è stato trovato alcun testo.");
}

export function docxXmlToText(xml) {
  const parsed = new DOMParser().parseFromString(xml, "application/xml");
  if (parsed.querySelector("parsererror")) throw new Error("Il testo Word non può essere interpretato.");
  const namespace = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const readNode = (node) => {
    if (node.nodeType !== 1) return "";
    if (node.namespaceURI === namespace && node.localName === "t") return node.textContent || "";
    if (node.namespaceURI === namespace && (node.localName === "br" || node.localName === "cr")) return "\n";
    if (node.namespaceURI === namespace && node.localName === "tab") return "\t";
    return [...node.childNodes].map(readNode).join("");
  };
  const paragraphs = [...parsed.getElementsByTagNameNS(namespace, "p")].map((paragraph) => [...paragraph.childNodes].map(readNode).join(""));
  return paragraphs.join("\n");
}
