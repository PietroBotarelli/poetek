import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
globalThis.window={PoetekBackend:{isConfigured:()=>false}};
globalThis.document={querySelector:()=>null,querySelectorAll:()=>[]};
globalThis.location={href:'https://poetek.example/'};
const {State}=await import('../web/state/store.js');
const {workRow}=await import('../web/views/cards.js');
const {profileTemplate}=await import('../web/views/profile.js');
const {authorProfiles,authorPoems,profileOwnerId}=await import('../web/domain/selectors.js');
const {readDocxDocument,inflateZipEntry,MAX_DOCUMENT_XML_BYTES}=await import('../web/utils/parsers.js');
const {routeFromHash}=await import('../web/router/router.js');
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222';
test('legacy unsafe IDs are escaped by HTML rendering',()=>{
 State.saved=new Set();State.activeSession={accountId:A,displayName:'Same',role:'author'};
 const html=workRow({id:'x"><img src="https://example.invalid/injected">',title:'Title',author:'Author',text:'Test'});
 assert.ok(!html.includes('<img'));assert.ok(html.includes('&quot;&gt;&lt;img'));
});
test('homonymous authors keep separate works, profiles and editing controls',()=>{
 State.activeSession={accountId:A,displayName:'Same',role:'author'};
 State.profileState.profiles={[A]:{displayName:'Same'},[B]:{displayName:'Same'}};
 State.poems=[{id:'work-a',ownerId:A,author:'Same',title:'Only A',text:'A',publishedAt:'2026-10-30'}, {id:'work-b',ownerId:B,author:'Same',title:'Only B',text:'B',publishedAt:'2026-10-30'}];
 State.catalogueCollections=[];State.homeCatalogueItems=[];State.readingEvents=[];
 assert.equal(authorProfiles().length,2);
 assert.deepEqual(authorPoems(`id:${A}`).map(p=>p.id),['work-a']);
 assert.equal(profileOwnerId('Same'),'');
 const own=profileTemplate(`id:${A}`), other=profileTemplate(`id:${B}`);
 assert.ok(own.includes('Only A'));assert.ok(!own.includes('Only B'));
 assert.ok(other.includes('Only B'));assert.ok(!other.includes('Only A'));
 assert.ok(!other.includes('data-save-profile-name'));
 assert.ok(profileTemplate('Same').includes('Più autori'));
});
test('malformed author links do not crash the router',()=>{
 assert.deepEqual(routeFromHash('#autore=%E0%A4%A'),{route:'home',author:''});
});
test('Word import rejects oversized input and oversized expanded XML',async()=>{
 await assert.rejects(readDocxDocument(new ArrayBuffer(6*1024*1024)),/troppo grande/);
 window.DecompressionStream=globalThis.DecompressionStream;
 // A tiny compressed input which expands beyond the limit must be stopped
 // while streaming, even if an attacker lies about its ZIP directory size.
 const compressed=zlib.deflateRawSync(Buffer.alloc(MAX_DOCUMENT_XML_BYTES+1,65));
 await assert.rejects(inflateZipEntry(compressed),/troppo testo/);
});
test('distributed legal pages are generated and linked',()=>{
 const html=fs.readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
 for(const name of ['privacy-policy','terms-of-use']) {
  assert.ok(html.includes(`legal/${name}.html`));
  const page=fs.readFileSync(new URL(`../web/legal/${name}.html`,import.meta.url),'utf8');
  assert.ok(page.includes('Pietro Botarelli'));assert.ok(!/\[(?:NOME|EMAIL|REGIONE|FORO)/.test(page));
 }
});
