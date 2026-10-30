/* global supabase */
// La chiave publishable può stare nel client: i dati sono protetti dalle policy RLS.
// Manteniamo l'eventuale configurazione esterna, così il file resta sostituibile in futuro.
window.POETEK_BETA_CONFIG ||= {
  supabaseUrl: "",
  supabaseAnonKey: "",
  appName: "Poetek — Direzione editoriale",
  requireBackend: false,
  publicReading: true
};

(function betaBackendFactory() {
  const config = window.POETEK_BETA_CONFIG || {};
  const isConfigured = () => Boolean(config.supabaseUrl && config.supabaseAnonKey && window.supabase?.createClient);
  const allowsPublicReading = () => config.publicReading === true;
  let client = null;
  let currentSession = null;
  let currentProfile = null;
  let liveChannel = null;
  let authSubscription = null;
  let authSuccessHandler = null;
  let sessionActivation = null;
  let sessionActivationKey = "";
  let authMode = "signin";
  const AUTH_PERSISTENT_STORAGE_KEY = "poetek-beta-auth-session-v2";

  function legacyAuthStorageKey() {
    try {
      const projectRef = new URL(config.supabaseUrl).hostname.split(".")[0];
      return projectRef ? `sb-${projectRef}-auth-token` : "";
    } catch {
      return "";
    }
  }

  function clearLegacyPersistentSession() {
    const storageKey = legacyAuthStorageKey();
    if (!storageKey) return;
    try {
      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const candidate = window.localStorage.key(index);
        if (candidate === storageKey || candidate?.startsWith(`${storageKey}-`)) {
          window.localStorage.removeItem(candidate);
        }
      }
    } catch {
      // Se lo storage non è disponibile, Supabase gestirà l'accesso soltanto
      // per la durata della pagina corrente.
    }
  }

  const requireClient = () => {
    if (!isConfigured()) throw new Error("La Beta non è ancora collegata a Supabase.");
    if (!client) {
      // La vecchia Beta privata usava la chiave predefinita di Supabase.
      // Cambiando chiave azzeriamo una sola volta quegli accessi senza toccare
      // utenti o dati. Dopo il nuovo accesso, la sessione resta persistente e
      // viene rinnovata automaticamente fino all'uscita esplicita.
      clearLegacyPersistentSession();
      client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: {
          persistSession: true,
          storage: window.localStorage,
          storageKey: AUTH_PERSISTENT_STORAGE_KEY,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: "implicit"
        }
      });
    }
    return client;
  };

  const weekKey = (value = new Date()) => {
    const date = new Date(value);
    const mondayOffset = (date.getDay() + 6) % 7;
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - mondayOffset);
    // Manteniamo la stessa chiave locale usata dal database: in Italia la
    // conversione ISO della mezzanotte avrebbe restituito la domenica UTC.
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
  };

  // PostgREST limita ogni risposta a 1000 righe: oltre quella soglia il
  // catalogo verrebbe troncato in silenzio, senza errore. Scorriamo quindi
  // la tabella a blocchi. `buildQuery` costruisce una query nuova a ogni
  // pagina: non riusiamo un builder già eseguito, che porta con sé i
  // parametri della richiesta precedente.
  async function fetchAllRows(buildQuery, pageSize = 500) {
    const rows = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await buildQuery().range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data?.length) return rows;
      rows.push(...data);
      if (data.length < pageSize) return rows;
    }
  }

  const gate = () => document.querySelector("#beta-auth-gate");
  const gateMessage = () => document.querySelector("#beta-auth-message");

  function configureAuthGate() {
    const form = document.querySelector("#beta-auth-form");
    if (!form) return;
    const modes = {
      signin: {
        title: "Entra in Poetek.",
        intro: "Accedi con le credenziali scelte durante la registrazione.",
        submit: "Accedi"
      },
      signup: {
        title: "Crea il tuo profilo.",
        intro: "Registrati una volta sola: in seguito userai sempre email e password.",
        submit: "Registrati"
      },
      recovery: {
        title: "Recupera l’accesso.",
        intro: "Riceverai un collegamento sicuro per scegliere una nuova password.",
        submit: "Invia l’email di recupero"
      },
      reset: {
        title: "Scegli una nuova password.",
        intro: "Imposta la password che userai per i prossimi accessi.",
        submit: "Salva la nuova password"
      }
    };
    const mode = modes[authMode] || modes.signin;
    const title = document.querySelector("#beta-auth-title");
    const intro = document.querySelector("#beta-auth-intro");
    const nameField = document.querySelector("[data-auth-name-field]");
    const emailField = document.querySelector("[data-auth-email-field]");
    const passwordField = document.querySelector("[data-auth-password-field]");
    const confirmField = document.querySelector("[data-auth-confirm-field]");
    const recoverButton = document.querySelector("[data-auth-recover]");
    const backButton = document.querySelector("[data-auth-back]");
    const submitButton = document.querySelector("[data-auth-submit]");
    const password = form.elements.password;
    const confirmation = form.elements.passwordConfirm;
    const displayName = form.elements.displayName;
    const email = form.elements.email;
    const needsName = authMode === "signup";
    const needsEmail = authMode !== "reset";
    const needsPassword = authMode !== "recovery";
    const needsConfirmation = authMode === "signup" || authMode === "reset";
    const termsField = document.querySelector("[data-auth-terms-field]");
    if (termsField) termsField.hidden = authMode !== "signup";
    if (form.elements.acceptTerms) form.elements.acceptTerms.required = authMode === "signup";

    if (title) title.textContent = mode.title;
    if (intro) intro.textContent = mode.intro;
    if (nameField) nameField.hidden = !needsName;
    if (emailField) emailField.hidden = !needsEmail;
    if (passwordField) passwordField.hidden = !needsPassword;
    if (confirmField) confirmField.hidden = !needsConfirmation;
    if (displayName) displayName.required = needsName;
    if (email) email.required = needsEmail;
    if (password) {
      password.required = needsPassword;
      password.autocomplete = authMode === "signin" ? "current-password" : "new-password";
    }
    if (confirmation) confirmation.required = needsConfirmation;
    if (recoverButton) recoverButton.hidden = authMode !== "signin";
    if (backButton) backButton.hidden = authMode === "signin" || authMode === "signup";
    if (submitButton) submitButton.textContent = mode.submit;
    document.querySelectorAll("[data-auth-mode]").forEach((button) => {
      const active = button.dataset.authMode === authMode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function showGate(message = "", mode = authMode) {
    authMode = ["signin", "signup", "recovery", "reset"].includes(mode) ? mode : "signin";
    document.body.classList.add("beta-auth-required");
    gate()?.removeAttribute("hidden");
    configureAuthGate();
    if (gateMessage()) gateMessage().textContent = message;
  }

  function hideGate() {
    document.body.classList.remove("beta-auth-required");
    gate()?.setAttribute("hidden", "");
  }

  function authUrlParameters() {
    const url = new URL(window.location.href);
    const hash = url.hash.startsWith("#") ? url.hash.slice(1) : "";
    const hashParams = new URLSearchParams(hash);
    return {
      callback: url.searchParams.get("auth_callback") === "1",
      recovery: url.searchParams.get("auth_recovery") === "1" || hashParams.get("type") === "recovery",
      error: url.searchParams.get("error") || hashParams.get("error") || "",
      errorCode: url.searchParams.get("error_code") || hashParams.get("error_code") || "",
      errorDescription: url.searchParams.get("error_description") || hashParams.get("error_description") || "",
      hasAuthHash: ["access_token", "refresh_token", "expires_in", "token_type"].some((key) => hashParams.has(key))
    };
  }

  function authErrorMessage() {
    const { error, errorCode, errorDescription } = authUrlParameters();
    if (!error && !errorCode && !errorDescription) return "";
    if (errorCode === "otp_expired") return "Il collegamento è già stato usato o è scaduto. Richiedi una nuova email.";
    return "Il collegamento di conferma o recupero non è più valido. Richiedine uno nuovo.";
  }

  function readableAuthError(error, fallback) {
    const message = error instanceof Error ? error.message : String(error || "");
    if (/signups? not allowed|signup.*disabled/i.test(message)) {
      return "La creazione di nuovi profili non è ancora disponibile. Riprova tra poco.";
    }
    if (/invalid login credentials/i.test(message)) return "Email o password non corrette.";
    if (/email not confirmed/i.test(message)) return "Conferma prima la registrazione dall’email ricevuta.";
    if (/already registered|user already exists/i.test(message)) return "Questa email è già registrata. Accedi oppure recupera la password.";
    if (/password.*(short|weak)|weak password/i.test(message)) return "Scegli una password di almeno 8 caratteri.";
    if (/token.*(expired|invalid)|otp.*(expired|invalid)/i.test(message)) return "Il collegamento è scaduto. Richiedine uno nuovo.";
    return fallback;
  }

  function cleanAuthCallbackUrl() {
    const url = new URL(window.location.href);
    const hash = url.hash.startsWith("#") ? url.hash.slice(1) : "";
    const hashParams = new URLSearchParams(hash);
    const authHashKeys = ["access_token", "refresh_token", "expires_in", "expires_at", "token_type", "provider_token", "provider_refresh_token", "error", "error_code", "error_description"];
    const hasAuthHash = authHashKeys.some((key) => hashParams.has(key));
    ["auth_callback", "auth_recovery", "code", "error", "error_code", "error_description"].forEach((key) => url.searchParams.delete(key));
    if (hasAuthHash) url.hash = "#home";
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, document.title, next || "/");
  }

  function authCallbackUrl() {
    const url = new URL(`${window.location.origin}${window.location.pathname}`);
    url.searchParams.set("auth_callback", "1");
    return url.toString();
  }

  function passwordRecoveryUrl() {
    const url = new URL(`${window.location.origin}${window.location.pathname}`);
    url.searchParams.set("auth_recovery", "1");
    return url.toString();
  }

  async function resolveProfile(user) {
    const api = requireClient();
    // Il trigger database crea il profilo al primo accesso. L'attesa cresce
    // in modo esponenziale: il caso normale si risolve entro poche centinaia
    // di millisecondi, mentre un avvio a freddo del database ha comunque il
    // tempo di completare senza restituire un errore falso.
    const maxAttempts = 8;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const { data, error } = await api.from("profiles").select("id, display_name, handle, avatar_url, role, status").eq("id", user.id).maybeSingle();
      if (error) throw error;
      if (data) {
        if (data.status !== "active") throw new Error("Il tuo profilo non è attivo.");
        const { data: preferences, error: preferenceError } = await api.from("profile_preferences").select("last_author").eq("user_id", user.id).maybeSingle();
        if (preferenceError) throw preferenceError;
        return { ...data, last_author: preferences?.last_author || "" };
      }
      // Dopo l'ultimo tentativo non ha senso attendere ancora.
      if (attempt === maxAttempts - 1) break;
      const delay = Math.min(200 * 2 ** attempt, 5000);
      await new Promise((resolve) => window.setTimeout(resolve, delay));
    }
    throw new Error("Stiamo preparando il tuo profilo. Ricarica la pagina fra qualche secondo.");
  }

  async function activateSession(session) {
    if (!session?.user) {
      currentSession = null;
      currentProfile = null;
      return { configured: true, session: null, profile: null };
    }
    const key = `${session.user.id}:${session.access_token || ""}`;
    if (sessionActivation && sessionActivationKey === key) return sessionActivation;
    sessionActivationKey = key;
    sessionActivation = (async () => {
      try {
        currentSession = session;
        currentProfile = await resolveProfile(session.user);
        hideGate();
        cleanAuthCallbackUrl();
        return { configured: true, session, profile: currentProfile };
      } catch (failure) {
        await requireClient().auth.signOut();
        currentSession = null;
        currentProfile = null;
        showGate(failure instanceof Error ? failure.message : "Non è possibile accedere alla Beta.");
        return { configured: true, session: null, profile: null };
      } finally {
        sessionActivation = null;
        sessionActivationKey = "";
      }
    })();
    return sessionActivation;
  }

  async function start() {
    if (!isConfigured()) return { configured: false, session: null, profile: null };
    const api = requireClient();
    const { data: { session }, error } = await api.auth.getSession();
    if (error) throw error;
    if (session?.user && authUrlParameters().recovery) {
      currentSession = session;
      currentProfile = null;
      showGate("Scegli e conferma la nuova password.", "reset");
      return { configured: true, session: null, profile: null, recovery: true };
    }
    if (!session?.user) {
      const callbackError = authErrorMessage();
      if (callbackError) {
        showGate(callbackError, "signin");
        return { configured: true, session: null, profile: null, public: allowsPublicReading() };
      }
      if (allowsPublicReading()) {
        hideGate();
        return { configured: true, session: null, profile: null, public: true };
      }
      showGate(authErrorMessage() || undefined);
      return { configured: true, session: null, profile: null };
    }
    return activateSession(session);
  }

  function cleanEmailAddress(email) {
    const value = String(email || "").trim().toLowerCase();
    if (!value) throw new Error("Inserisci il tuo indirizzo email.");
    return value;
  }

  function cleanPassword(password, confirmation = password) {
    const value = String(password || "");
    if (value.length < 8) throw new Error("La password deve contenere almeno 8 caratteri.");
    if (value !== String(confirmation || "")) throw new Error("Le due password non coincidono.");
    return value;
  }

  async function signInWithPassword(email, password) {
    const api = requireClient();
    const result = await api.auth.signInWithPassword({
      email: cleanEmailAddress(email),
      password: String(password || "")
    });
    if (result.error) throw result.error;
    if (!result.data?.session?.user) throw new Error("Non è stato possibile completare l’accesso.");
    return activateSession(result.data.session);
  }

  async function signUpWithPassword({ email, password, confirmation, displayName }) {
    const api = requireClient();
    const name = String(displayName || "").trim().replace(/\s+/g, " ");
    if (!name || name.length > 80) throw new Error("Il nome pubblico deve contenere da 1 a 80 caratteri.");
    const result = await api.auth.signUp({
      email: cleanEmailAddress(email),
      password: cleanPassword(password, confirmation),
      options: {
        data: { display_name: name, terms_version: "2026-10-30", terms_accepted_at: new Date().toISOString() },
        emailRedirectTo: authCallbackUrl()
      }
    });
    if (result.error) throw result.error;
    if (result.data?.session?.user) return activateSession(result.data.session);
    return {
      configured: true,
      session: null,
      profile: null,
      pending: true,
      message: "Registrazione completata. Conferma l’indirizzo dall’email ricevuta, poi accedi con la tua password."
    };
  }

  async function requestPasswordRecovery(email) {
    const { error } = await requireClient().auth.resetPasswordForEmail(cleanEmailAddress(email), {
      redirectTo: passwordRecoveryUrl()
    });
    if (error) throw error;
    return "Se l’indirizzo è registrato, riceverai un collegamento per scegliere una nuova password.";
  }

  async function completePasswordRecovery(password, confirmation) {
    cleanPassword(password, confirmation);
    const api = requireClient();
    const { data: { session }, error: sessionError } = await api.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session?.user) throw new Error("Il collegamento di recupero è scaduto. Richiedine uno nuovo.");
    const { error } = await api.auth.updateUser({ password });
    if (error) throw error;
    return activateSession(session);
  }

  async function signOut() {
    if (!isConfigured()) return;
    unsubscribeFromChanges();
    await requireClient().auth.signOut();
    currentSession = null;
    currentProfile = null;
    if (allowsPublicReading()) {
      authMode = "signin";
      hideGate();
      return;
    }
    showGate("Sessione chiusa. Accedi di nuovo con email e password.", "signin");
  }

  function unsubscribeFromChanges() {
    if (!liveChannel || !client) return;
    client.removeChannel(liveChannel);
    liveChannel = null;
  }

  function subscribeToChanges(onChange) {
    if (!isConfigured() || (!currentSession?.user && !allowsPublicReading())) return () => undefined;
    const api = requireClient();
    unsubscribeFromChanges();
    const notify = (payload) => {
      if (typeof onChange === "function") onChange(payload);
    };
    liveChannel = api
      .channel(`poetek-live-${currentSession?.user?.id || "public"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "works" }, notify)
      .on("postgres_changes", { event: "*", schema: "public", table: "collections" }, notify)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, notify)
      .on("postgres_changes", { event: "*", schema: "public", table: "weekly_metrics" }, notify);
    if (currentSession?.user) liveChannel.on("postgres_changes", { event: "*", schema: "public", table: "author_follows" }, notify);
    liveChannel.subscribe();
    return unsubscribeFromChanges;
  }

  function profileById(rows) {
    return new Map(rows.map((profile) => [profile.id, profile]));
  }

  function cardValue(value) {
    return value && typeof value === "object" ? value : {};
  }

  function readingValue(value) {
    return value && typeof value === "object" ? value : {};
  }

  const mediaReference = (path) => `storage://poetek-media/${path}`;
  const mediaPath = (reference) => {
    const prefix = "storage://poetek-media/";
    return typeof reference === "string" && reference.startsWith(prefix) ? reference.slice(prefix.length) : "";
  };

  async function signMediaReferences(references) {
    const api = requireClient();
    const unique = [...new Set(references.map(mediaPath).filter(Boolean))];
    const pairs = await Promise.all(unique.map(async (path) => {
      const { data, error } = await api.storage.from("poetek-media").createSignedUrl(path, 5 * 60);
      if (error) throw error;
      return [mediaReference(path), data.signedUrl];
    }));
    return Object.fromEntries(pairs);
  }

  async function loadSnapshot() {
    const api = requireClient();
    const userId = currentSession?.user?.id || "";
    if (!userId && !allowsPublicReading()) throw new Error("Accedi prima di caricare il catalogo.");
    const week = weekKey();
    // Ogni query paginata ordina fino a una chiave univoca. Senza quel
    // criterio di spareggio Postgres è libero di disporre diversamente le
    // righe a parità di valore, e pagine successive finirebbero per ripetere
    // alcune opere e perderne altre: le 40 poesie di una raccolta importata
    // in blocco condividono lo stesso published_at.
    const [profiles, collectionRows, workRows, libraryRows, metricRows, follows] = await Promise.all([
      fetchAllRows(() => api.from("profiles").select("id, display_name, handle, avatar_url, role, status").order("display_name").order("id")),
      fetchAllRows(() => api.from("collections").select("id, owner_id, author_name, title, description, note, card, published_at, status, created_at").order("published_at", { ascending: false }).order("id")),
      fetchAllRows(() => api.from("works").select("id, owner_id, collection_id, author_name, title, issue, tags, body, note, card, reading, position, published_at, status, created_at").order("published_at", { ascending: false }).order("id")),
      userId ? fetchAllRows(() => api.from("library_items").select("work_id").eq("user_id", userId).order("work_id")) : Promise.resolve([]),
      fetchAllRows(() => api.from("weekly_metrics").select("subject_type, subject_id, reads").eq("week_start", week).order("subject_type").order("subject_id")),
      userId ? fetchAllRows(() => api.from("author_follows").select("follower_id, author_id").order("follower_id").order("author_id")) : Promise.resolve([])
    ]);

    const profilesById = profileById(profiles);
    const collections = collectionRows.map((row) => ({
      id: row.id,
      ownerId: row.owner_id || "",
      author: row.author_name,
      title: row.title,
      description: row.description || "",
      note: row.note || "",
      card: cardValue(row.card),
      publishedAt: row.published_at || row.created_at || "1970-01-01",
      status: row.status
    }));
    const collectionsById = new Map(collections.map((collection) => [collection.id, collection]));
    const works = workRows.map((row) => ({
      id: row.id,
      ownerId: row.owner_id || "",
      collectionId: row.collection_id || "",
      collection: collectionsById.get(row.collection_id)?.title || "Testi singoli",
      number: row.position ? `${row.position}.` : "",
      author: row.author_name || profilesById.get(row.owner_id)?.display_name || "Autore",
      title: row.title || "",
      issue: row.issue || "Pubblicazione Beta",
      tags: Array.isArray(row.tags) ? row.tags : [],
      text: row.body,
      note: row.note || "",
      card: cardValue(row.card),
      reading: readingValue(row.reading),
      publishedAt: row.published_at || row.created_at || "1970-01-01",
      status: row.status
    }));
    const collectionPoems = new Map();
    works.forEach((work) => {
      if (!work.collectionId) return;
      if (!collectionPoems.has(work.collectionId)) collectionPoems.set(work.collectionId, []);
      collectionPoems.get(work.collectionId).push(work);
    });
    collections.forEach((collection) => {
      collection.poemIds = (collectionPoems.get(collection.id) || []).sort((a, b) => Number(a.number.replace(".", "")) - Number(b.number.replace(".", ""))).map((work) => work.id);
    });

    const mediaReferences = [
      ...profiles.map((profile) => profile.avatar_url),
      ...collections.map((collection) => collection.card?.imageId),
      ...works.map((work) => work.card?.imageId),
      ...works.map((work) => work.reading?.imageId)
    ];
    const mediaUrls = await signMediaReferences(mediaReferences);
    const homeItems = [
      ...collections.filter((collection) => collection.status === "published").map((collection) => ({ type: "collection", id: collection.id, popularity: 0, publishedAt: collection.publishedAt })),
      ...works.filter((work) => work.status === "published").map((work) => ({ type: "poem", id: work.id, popularity: 0, publishedAt: work.publishedAt }))
    ];
    const readCounts = Object.fromEntries(metricRows.map((metric) => [`${metric.subject_type}:${metric.subject_id}`, Number(metric.reads) || 0]));
    const followerCounts = follows.reduce((counts, follow) => {
      counts[follow.author_id] = (counts[follow.author_id] || 0) + 1;
      return counts;
    }, {});
    return {
      profile: currentProfile,
      profiles,
      works,
      collections,
      homeItems,
      savedWorkIds: libraryRows.map((entry) => entry.work_id),
      readCounts,
      followingAuthorIds: userId ? follows.filter((follow) => follow.follower_id === userId).map((follow) => follow.author_id) : [],
      followerCounts,
      mediaUrls
    };
  }

  function workRow(work, collectionByTitle) {
    const collection = work.collectionId || collectionByTitle.get(`${work.author}::${work.collection}`) || "";
    return {
      id: work.id,
      owner_id: work.ownerId || null,
      collection_id: collection || null,
      author_name: work.author,
      title: work.title || null,
      issue: work.issue || "Pubblicazione Beta",
      tags: Array.isArray(work.tags) ? work.tags.slice(0, 5) : [],
      body: work.text,
      note: work.note || "",
      card: cardValue(work.card),
      reading: readingValue(work.reading),
      position: Number.parseInt(String(work.number || ""), 10) || null,
      status: work.status || "published",
      published_at: work.publishedAt || new Date().toISOString()
    };
  }

  function collectionRow(collection) {
    return {
      id: collection.id,
      owner_id: collection.ownerId || null,
      author_name: collection.author,
      title: collection.title,
      description: collection.description || "",
      note: collection.note || "",
      card: cardValue(collection.card),
      status: collection.status || "published",
      published_at: collection.publishedAt || new Date().toISOString()
    };
  }

  // `changedIds` elenca ciò che è cambiato nel browser; null significa che
  // il chiamante non lo sa e preferisce mandare tutto. Il filtro di
  // proprietà resta comunque l'ultima parola: chi non è admin scrive solo
  // le proprie righe, e le policy del database lo verificano di nuovo.
  async function syncContent({ poems, collections, changedIds = null }) {
    const api = requireClient();
    if (!currentSession?.user) return;
    const accountId = currentSession.user.id;
    const canManageAll = currentProfile?.role === "admin";
    const daScrivere = (entry) => !changedIds || changedIds.has(entry.id);
    const editableCollections = collections.filter((collection) => canManageAll || collection.ownerId === accountId);
    const collectionsToWrite = editableCollections.filter(daScrivere);
    if (collectionsToWrite.length) {
      const { error } = await api.from("collections").upsert(collectionsToWrite.map(collectionRow), { onConflict: "id" });
      if (error) throw error;
    }
    // La mappa copre tutte le raccolte disponibili, non solo quelle in
    // scrittura: un'opera modificata dentro una raccolta ferma deve poterla
    // ancora ritrovare, altrimenti resterebbe orfana.
    const collectionByTitle = new Map(editableCollections.map((collection) => [`${collection.author}::${collection.title}`, collection.id]));
    const editableWorks = poems.filter((work) => (canManageAll || work.ownerId === accountId) && daScrivere(work));
    if (editableWorks.length) {
      const { error } = await api.from("works").upsert(editableWorks.map((work) => workRow(work, collectionByTitle)), { onConflict: "id" });
      if (error) throw error;
    }
  }

  async function syncLibrary(workIds) {
    const api = requireClient();
    if (!currentSession?.user) return;
    const userId = currentSession.user.id;
    const { error: deleteError } = await api.from("library_items").delete().eq("user_id", userId);
    if (deleteError) throw deleteError;
    if (!workIds.length) return;
    const { error: insertError } = await api.from("library_items").insert(workIds.map((workId) => ({ user_id: userId, work_id: workId })));
    if (insertError) throw insertError;
  }

  async function updateProfile(changes) {
    const api = requireClient();
    if (!currentSession?.user) throw new Error("Accedi prima di modificare il profilo.");
    const accepted = {};
    if (typeof changes?.display_name === "string") {
      const name = changes.display_name.trim().replace(/\s+/g, " ");
      if (!name || name.length > 80) throw new Error("Il nome profilo deve contenere da 1 a 80 caratteri.");
      accepted.display_name = name;
    }
    if (typeof changes?.avatar_url === "string" || changes?.avatar_url === null) accepted.avatar_url = changes.avatar_url;
    if (typeof changes?.last_author === "string" || changes?.last_author === null) {
      const lastAuthor = changes.last_author === null ? null : changes.last_author.slice(0, 80);
      const { error } = await api.from("profile_preferences").upsert({ user_id: currentSession.user.id, last_author: lastAuthor });
      if (error) throw error;
      currentProfile = { ...currentProfile, last_author: lastAuthor };
    }
    if (!Object.keys(accepted).length) return currentProfile;
    const { data, error } = await api.from("profiles")
      .update(accepted)
      .eq("id", currentSession.user.id)
      .select("id, display_name, handle, avatar_url, role, status")
      .single();
    if (error) throw error;
    currentProfile = { ...currentProfile, ...(data || accepted) };
    return currentProfile;
  }

  async function setAuthorFollow(authorId, shouldFollow) {
    const api = requireClient();
    if (!currentSession?.user) throw new Error("Accedi prima di seguire un autore.");
    if (!authorId || authorId === currentSession.user.id) throw new Error("Non puoi seguire il tuo stesso profilo.");
    if (shouldFollow) {
      const { error } = await api.from("author_follows").upsert({ follower_id: currentSession.user.id, author_id: authorId }, { onConflict: "follower_id,author_id", ignoreDuplicates: true });
      if (error) throw error;
      return true;
    }
    const { error } = await api.from("author_follows").delete().eq("follower_id", currentSession.user.id).eq("author_id", authorId);
    if (error) throw error;
    return false;
  }

  async function uploadMedia(file, kind = "covers") {
    const api = requireClient();
    if (!currentSession?.user) throw new Error("Accedi prima di caricare un’immagine.");
    if (!file?.type?.startsWith("image/")) throw new Error("Scegli un file immagine valido.");
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) throw new Error("Usa un file JPG, PNG, WebP o AVIF.");
    if (file.size > 10 * 1024 * 1024) throw new Error("L’immagine non può superare 10 MB.");
    const extension = (file.name.split(".").pop() || "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase();
    const filename = `${Date.now()}-${crypto.randomUUID()}.${extension || "jpg"}`;
    const path = `${currentSession.user.id}/${kind}/${filename}`;
    const { error } = await api.storage.from("poetek-media").upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type });
    if (error) throw error;
    const reference = mediaReference(path);
    const urls = await signMediaReferences([reference]);
    return { imageId: reference, previewUrl: urls[reference] };
  }

  async function recordReading(subjectType, subjectId) {
    if (!isConfigured() || !currentSession?.user) return 0;
    const { data, error } = await requireClient().rpc("record_reading", { p_subject_type: subjectType, p_subject_id: subjectId });
    if (error) throw error;
    return Number(data) || 0;
  }

  function bindAuthGate(onAuthenticated) {
    const form = document.querySelector("#beta-auth-form");
    const closeButton = document.querySelector("[data-auth-close]");
    const recoverButton = document.querySelector("[data-auth-recover]");
    const backButton = document.querySelector("[data-auth-back]");
    authSuccessHandler = onAuthenticated;
    configureAuthGate();
    if (closeButton && !closeButton.dataset.bound) {
      closeButton.dataset.bound = "true";
      closeButton.addEventListener("click", () => {
        if (allowsPublicReading()) hideGate();
      });
    }
    document.querySelectorAll("[data-auth-mode]").forEach((button) => {
      if (button.dataset.bound) return;
      button.dataset.bound = "true";
      button.addEventListener("click", () => {
        authMode = button.dataset.authMode === "signup" ? "signup" : "signin";
        if (gateMessage()) gateMessage().textContent = "";
        configureAuthGate();
        window.setTimeout(() => form?.elements[authMode === "signup" ? "displayName" : "email"]?.focus(), 0);
      });
    });
    if (recoverButton && !recoverButton.dataset.bound) {
      recoverButton.dataset.bound = "true";
      recoverButton.addEventListener("click", () => {
        authMode = "recovery";
        if (gateMessage()) gateMessage().textContent = "";
        configureAuthGate();
        window.setTimeout(() => form?.elements.email?.focus(), 0);
      });
    }
    if (backButton && !backButton.dataset.bound) {
      backButton.dataset.bound = "true";
      backButton.addEventListener("click", () => {
        authMode = "signin";
        if (gateMessage()) gateMessage().textContent = "";
        configureAuthGate();
        window.setTimeout(() => form?.elements.email?.focus(), 0);
      });
    }
    if (form && !form.dataset.bound) {
      form.dataset.bound = "true";
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = form.querySelector("[data-auth-submit]");
        button.disabled = true;
        try {
          let state = null;
          if (authMode === "signin") {
            state = await signInWithPassword(form.elements.email.value, form.elements.password.value);
          } else if (authMode === "signup") {
            if (!form.elements.acceptTerms?.checked) throw new Error("Accetta le condizioni d’uso prima di registrarti.");
            state = await signUpWithPassword({
              email: form.elements.email.value,
              password: form.elements.password.value,
              confirmation: form.elements.passwordConfirm.value,
              displayName: form.elements.displayName.value
            });
          } else if (authMode === "recovery") {
            const message = await requestPasswordRecovery(form.elements.email.value);
            showGate(message, "signin");
            return;
          } else if (authMode === "reset") {
            state = await completePasswordRecovery(form.elements.password.value, form.elements.passwordConfirm.value);
          }
          if (state?.pending) {
            showGate(state.message, "signin");
            return;
          }
          if (state?.session && typeof authSuccessHandler === "function") authSuccessHandler(state);
        } catch (error) {
          const fallback = authMode === "signup"
            ? "Non è possibile completare la registrazione."
            : authMode === "recovery" || authMode === "reset"
              ? "Non è possibile recuperare l’accesso."
              : "Non è possibile completare l’accesso.";
          showGate(readableAuthError(error, fallback), authMode);
        } finally {
          button.disabled = false;
        }
      });
    }
    if (isConfigured() && !authSubscription) {
      const { data } = requireClient().auth.onAuthStateChange((event, session) => {
        // L'avvio dell'app gestisce INITIAL_SESSION: qui rispondiamo soltanto
        // ai cambiamenti reali della sessione.
        if (event === "INITIAL_SESSION") return;
        if (event === "PASSWORD_RECOVERY" && session?.user) {
          currentSession = session;
          currentProfile = null;
          showGate("Scegli e conferma la nuova password.", "reset");
          return;
        }
        if (!session?.user) {
          unsubscribeFromChanges();
          currentSession = null;
          currentProfile = null;
          if (typeof authSuccessHandler === "function") {
            void authSuccessHandler({ configured: true, session: null, profile: null, public: allowsPublicReading() });
          }
          return;
        }
        void activateSession(session).then((state) => {
          if (state.session && typeof authSuccessHandler === "function") authSuccessHandler(state);
        });
      });
      authSubscription = data.subscription;
    }
  }

  window.setInterval(() => {
    if (document.visibilityState === "visible" && (currentSession?.user || allowsPublicReading())) {
      window.dispatchEvent(new Event("poetek-media-refresh"));
    }
  }, 4 * 60 * 1000);

  window.PoetekBackend = {
    isConfigured,
    start,
    bindAuthGate,
    openAuthGate() {
      showGate("", "signin");
      window.setTimeout(() => document.querySelector("#beta-auth-form [name='email']")?.focus(), 0);
    },
    signOut,
    loadSnapshot,
    syncContent,
    syncLibrary,
    updateProfile,
    setAuthorFollow,
    uploadMedia,
    recordReading,
    subscribeToChanges,
    unsubscribeFromChanges,
    get profile() { return currentProfile; },
    get session() { return currentSession; }
  };
}());
