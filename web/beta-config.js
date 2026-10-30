/*
 * Configurazione pubblica della Beta.
 *
 * L'anon key di Supabase è pensata per stare nel browser: la sicurezza dei
 * dati dipende dalle policy RLS, non dal nasconderla.
 */
window.POETEK_BETA_CONFIG = {
  supabaseUrl: "https://ffxahnpgmmyuxssyqeoc.supabase.co",
  supabaseAnonKey: "sb_publishable_9TwOpwN4MuJPAYjaidJouQ_H17Ej72k",
  appName: "Poetek Beta",
  requireBackend: true,
  publicReading: true
};
