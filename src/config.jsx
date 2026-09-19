// Coach-PTapp — build-wide settings.
//
// The only file that knows which Supabase project this app talks to, and the
// only place the colour and type tokens live. Everything else imports from
// here, so moving projects or adjusting the palette is a one-file change.

export const SUPABASE_URL = "https://qpkdqyazdzhoohowkouy.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_VCvYuYUAC9Dnf3kiLNB93g_tP_5c473";

// Where the signed-in session is kept in browser storage.
//
// The three client apps all live on yellowg-dev.github.io and therefore share
// a single storage namespace — which is the whole reason STORAGE_PREFIX is so
// load-bearing over there. This app is served from coach.yellowg.fi, its own
// origin, so a collision is structurally impossible. The distinct key is kept
// anyway: it costs nothing and keeps the convention intact if this app is ever
// moved back under the shared domain.
export const AUTH_STORAGE_KEY = "ptAppCoach_auth";

// Versioned independently of the client apps. The three of them share one
// APP_VERSION line because they ship the same engine; this one does not.
export const COACH_VERSION = "0.1.0";

// Same palette and type as the client apps, so a client's day looks the same
// to the coach as it does to them. Kept as plain values rather than Tailwind
// theme config to match how the client apps already do it.
export const THEME = {
  bg: "#10131A",
  card: "#1A1F29",
  border: "#2A3140",
  textPrimary: "#EEF0F3",
  textSecondary: "#8891A3",
  textMuted: "#5C6577",
  accent: "#E3A23C",
  accentAlt: "#4CB6C4",
};

export const FONT_DISPLAY = "'Space Grotesk', system-ui, sans-serif";
export const FONT_BODY = "'IBM Plex Sans', system-ui, sans-serif";
export const FONT_MONO = "'IBM Plex Mono', ui-monospace, monospace";
