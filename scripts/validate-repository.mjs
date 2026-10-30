import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const checks = [];

const relative = (value) => path.relative(root, value).replaceAll("\\", "/");
const exists = (value) => fs.existsSync(path.join(root, value));
const read = (value) => exists(value) ? fs.readFileSync(path.join(root, value), "utf8") : "";

function check(condition, message) {
  if (condition) checks.push(message);
  else failures.push(message);
}

const requiredFiles = [
  "README.md",
  "netlify.toml",
  "docs/ARCHITECTURE.md",
  "docs/OPERATIONS.md",
  "web/index.html",
  "web/main.js",
  "web/backend.js",
  "web/beta-config.js",
  "web/styles.css",
  "web/editorial-direction.css",
  "web/assets/paper-suction-mask.svg",
  "web/assets/paper-suction-surface.svg",
  "supabase/schema.sql",
  "supabase/README.md",
  "supabase/email-templates/confirmation.html",
  "supabase/email-templates/recovery.html",
  "supabase/migrations/20260730_harden_reading_events.sql",
  "supabase/migrations/20260730_move_unaccent_extension.sql",
  "supabase/migrations/20260730_restrict_function_execution.sql"
];

for (const file of requiredFiles) check(exists(file), `file richiesto: ${file}`);

const obsoletePaths = [
  "web/app.js",
  "web/.keep",
  "web/README.md",
  "web/about.css",
  "web/poetek-connection.js",
  "web/assets/covers/.keep",
  "supabase/config.toml",
  "supabase/functions/invite-user",
  "supabase/email-templates/invite.html",
  "supabase/email-templates/magic-link.html"
];

for (const target of obsoletePaths) check(!exists(target), `residuo assente: ${target}`);

const index = read("web/index.html");
const backend = read("web/backend.js");
const config = read("web/beta-config.js");
const schema = read("supabase/schema.sql");
const headers = read("netlify.toml");
const hardening = read("supabase/migrations/20260730_harden_reading_events.sql");
const extensionHardening = read("supabase/migrations/20260730_move_unaccent_extension.sql");
const functionHardening = read("supabase/migrations/20260730_restrict_function_execution.sql");

check(headers.includes("Content-Security-Policy") && headers.includes("wss://*.supabase.co"), "CSP HTTP consente Supabase Realtime");
check(index.includes('type="password"'), "form di accesso con password");
check(backend.includes("signUpWithPassword"), "registrazione email e password");
check(backend.includes("signInWithPassword"), "accesso email e password");
check(backend.includes("resetPasswordForEmail"), "recupero password");
check(!/inviteOnly|functions\.invoke\(["']invite-user/.test(`${backend}\n${config}`), "nessun invito legacy nel frontend");
check(/^\s*supabaseUrl:\s*["']https:\/\//m.test(config), "URL Supabase HTTPS");
check(/^\s*supabaseAnonKey:\s*["'](?:sb_publishable_|eyJ)/m.test(config), "publishable key Supabase");
check(!/service[_-]?role|SUPABASE_SERVICE/i.test(`${index}\n${backend}\n${config}`), "nessun segreto privilegiato nel frontend");

const rlsCount = (schema.match(/enable row level security/gi) || []).length;
check(rlsCount >= 7, "RLS dichiarata per tutte le tabelle applicative");
check(/security definer/i.test(schema) && /record_reading/i.test(schema), "RPC letture con confine server-side");
check(/drop policy if exists "Members insert reading events"/i.test(hardening), "scrittura diretta letture rimossa");
check(/revoke insert on table public\.reading_events from anon, authenticated/i.test(hardening), "permesso INSERT letture revocato");
check(/alter extension unaccent[\s\S]*set schema extensions/i.test(extensionHardening), "estensione unaccent fuori dallo schema API");
check(/revoke execute on function public\.handle_new_user\(\)[\s\S]*from public, anon, authenticated/i.test(functionHardening), "funzioni trigger non esposte ai client");
check(/grant execute on function public\.record_reading\(text, text\)[\s\S]*to authenticated/i.test(functionHardening), "RPC letture riservata agli autenticati");

const localReferences = [];
for (const match of index.matchAll(/(?:href|src)="([^"]+)"/g)) {
  const value = match[1];
  if (/^(?:https?:|mailto:|data:|#)/.test(value)) continue;
  localReferences.push(value.split(/[?#]/)[0]);
}

for (const reference of localReferences) {
  check(exists(path.posix.join("web", reference)), `riferimento HTML: web/${reference}`);
}

for (const cssFile of ["web/styles.css", "web/editorial-direction.css"]) {
  const css = read(cssFile);
  for (const match of css.matchAll(/url\((?:["']?)([^"')]+)(?:["']?)\)/g)) {
    const value = match[1].trim();
    if (/^(?:https?:|data:|#)/.test(value)) continue;
    const target = path.resolve(root, path.dirname(cssFile), value.split(/[?#]/)[0]);
    check(fs.existsSync(target), `risorsa CSS: ${relative(target)}`);
  }
}

const assetReferences = new Set();
for (const sourceFile of ["web/data/seed.js", "web/state/store.js", "web/backend.js"]) {
  for (const match of read(sourceFile).matchAll(/assets\/[A-Za-z0-9._/-]+/g)) {
    assetReferences.add(match[0]);
  }
}
for (const reference of assetReferences) {
  check(exists(path.posix.join("web", reference)), `risorsa JavaScript: web/${reference}`);
}

const migrationDirectory = path.join(root, "supabase", "migrations");
if (fs.existsSync(migrationDirectory)) {
  const migrations = fs.readdirSync(migrationDirectory).filter((name) => name.endsWith(".sql"));
  check(migrations.length >= 5, "cronologia migrazioni presente");
  check(migrations.every((name) => /^\d{8}_[a-z0-9_]+\.sql$/.test(name)), "nomi migrazioni cronologici");
  check(new Set(migrations).size === migrations.length, "nomi migrazioni univoci");
}

if (failures.length) {
  console.error(`Validazione fallita (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Validazione completata: ${checks.length} controlli superati.`);
}
