// Turns raw Supabase / Postgres errors into Albanian copy that is safe to show
// a user. Server actions used to do `return { ok: false, error: error.message }`,
// which leaked English Postgres text ("duplicate key value violates unique
// constraint \"sections_slug_key\"") straight into the UI.
//
// Matching order is deliberate: the `code` first (SQLSTATE and Supabase Auth
// codes are stable, message wording is not), then a lowercase substring match
// on the message, then a generic fallback. dbError() NEVER returns the raw
// English message — the worst case is the fallback sentence.

// ------------------------------------------------------------------ types

/** The fields PostgrestError, AuthError and StorageError have in common. */
export type PgError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

/** True when the value is shaped like a Supabase / Postgres error object. */
export function isPgError(e: unknown): e is PgError {
  if (typeof e !== "object" || e === null) return false;
  const o = e as Record<string, unknown>;
  return typeof o.message === "string" || typeof o.code === "string";
}

/** Shown when nothing matched — deliberately vague but still actionable. */
export const GENERIC_DB_ERROR = "Veprimi nuk u krye. Provo sërish.";

/**
 * Thrown by our OWN validators (see parseNumField in lib/numeric.ts): the
 * message is finished Albanian copy naming the field, so dbError() must hand it
 * back untouched instead of flattening it into the generic sentence — which is
 * what `catch (e) { return { ok:false, error: dbError(e) } }` used to do.
 */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

// ------------------------------------------------------------------ code maps

// SQLSTATE codes with a single sensible message. Keys are UPPERCASE, matching
// what PostgREST returns (e.g. "22P02").
const PG_CODES: Record<string, string> = {
  "22001": "Teksti është shumë i gjatë. Shkurtoje dhe provo sërish.",
  "22003": "Numri është jashtë kufijve të lejuar.",
  "22007": "Data nuk është në formatin e duhur.",
  "22008": "Data ose ora nuk është e vlefshme.",
  "22P02": "Një vlerë ka format të gabuar. Kontrollo fushat dhe provo sërish.",
  "23502": "Një fushë e detyrueshme nuk është plotësuar.",
  "23514": "Të dhënat nuk i plotësojnë kushtet e kërkuara.",
  "42501": "Nuk ke leje për këtë veprim.",
  "40001": "Të dhënat u ndryshuan në të njëjtën kohë nga dikush tjetër. Provo sërish.",
  "53300": "Serveri është i mbingarkuar. Provo sërish pas pak.",
  "57014": "Veprimi zgjati shumë dhe u ndërpre. Provo sërish.",
  "08006": "Lidhja me serverin dështoi. Provo sërish.",
  // PostgREST-level codes (not SQLSTATE, but delivered in the same field).
  PGRST116: "Të dhënat nuk u gjetën.",
  PGRST301: "Sesioni ka skaduar. Kyçu sërish.",
  PGRST204: "Diçka nuk shkon me sistemin. Kontakto administratorin.",
};

// Supabase Auth error codes. Keys are lowercase, as the API sends them.
const AUTH_CODES: Record<string, string> = {
  invalid_credentials: "Email-i ose fjalëkalimi nuk është i saktë.",
  email_not_confirmed: "Email-i nuk është konfirmuar ende. Kontrollo email-in tënd.",
  email_exists: "Ky email është regjistruar tashmë.",
  user_already_exists: "Ky email është regjistruar tashmë.",
  user_not_found: "Përdoruesi nuk u gjet.",
  same_password: "Fjalëkalimi i ri duhet të jetë ndryshe nga i vjetri.",
  over_email_send_rate_limit: "Janë dërguar shumë email-e. Prit pak dhe provo sërish.",
  over_request_rate_limit: "Shumë kërkesa njëra pas tjetrës. Prit pak dhe provo sërish.",
  otp_expired: "Linku ka skaduar. Kërko një të ri.",
  session_not_found: "Sesioni ka skaduar. Kyçu sërish.",
  email_address_invalid: "Email-i nuk është i vlefshëm.",
  validation_failed: "Të dhënat e dërguara nuk janë të vlefshme.",
  signup_disabled: "Regjistrimet janë të mbyllura për momentin.",
};

// Substring rules, checked in order — first hit wins, so the specific ones
// come before the general ones. The needles are matched against a lowercased
// message + details + hint.
const MESSAGE_RULES: { match: string; message: string }[] = [
  // Storage
  { match: "resource already exists", message: "Ekziston tashmë një skedar me këtë emër." },
  { match: "payload too large", message: "Skedari është shumë i madh." },
  { match: "exceeded the maximum allowed size", message: "Skedari është shumë i madh." },
  { match: "mime type", message: "Ky lloj skedari nuk lejohet." },
  { match: "bucket not found", message: "Ngarkimi i skedarëve nuk është i rregulluar si duhet. Kontakto administratorin." },
  { match: "object not found", message: "Skedari nuk u gjet." },
  // Auth
  { match: "invalid login credentials", message: "Email-i ose fjalëkalimi nuk është i saktë." },
  { match: "user already registered", message: "Ky email është regjistruar tashmë." },
  { match: "email not confirmed", message: "Email-i nuk është konfirmuar ende. Kontrollo email-in tënd." },
  { match: "email rate limit exceeded", message: "Janë dërguar shumë email-e. Prit pak dhe provo sërish." },
  { match: "you can only request this after", message: "Prit pak para se ta provosh sërish." },
  { match: "new password should be different", message: "Fjalëkalimi i ri duhet të jetë ndryshe nga i vjetri." },
  { match: "user not found", message: "Përdoruesi nuk u gjet." },
  { match: "token has expired or is invalid", message: "Linku ka skaduar ose nuk është i vlefshëm. Kërko një të ri." },
  { match: "jwt expired", message: "Sesioni ka skaduar. Kyçu sërish." },
  { match: "invalid format", message: "Email-i nuk është i vlefshëm." },
  // Sentinels our own server actions throw (kept in English on purpose — they
  // are codes, not copy — so they must be mapped here or they reach the UI raw.
  { match: "forbidden", message: "Nuk ke leje për këtë veprim." },
  { match: "service_role_missing", message: "Konfigurimi i serverit nuk është i plotë. Kontakto administratorin." },
  { match: "supabase env vars missing", message: "Konfigurimi i serverit nuk është i plotë. Kontakto administratorin." },
  // Postgres, when the code is missing
  { match: "row-level security", message: "Nuk ke leje për këtë veprim." },
  { match: "permission denied", message: "Nuk ke leje për këtë veprim." },
  { match: "not-null constraint", message: "Një fushë e detyrueshme nuk është plotësuar." },
  { match: "value too long", message: "Teksti është shumë i gjatë. Shkurtoje dhe provo sërish." },
  { match: "invalid input syntax", message: "Një vlerë ka format të gabuar. Kontrollo fushat dhe provo sërish." },
  { match: "invalid input value", message: "Një vlerë ka format të gabuar. Kontrollo fushat dhe provo sërish." },
  { match: "check constraint", message: "Të dhënat nuk i plotësojnë kushtet e kërkuara." },
  { match: "results contain 0 rows", message: "Të dhënat nuk u gjetën." },
  // Network / transport
  { match: "failed to fetch", message: "Lidhja me serverin dështoi. Kontrollo internetin dhe provo sërish." },
  { match: "fetch failed", message: "Lidhja me serverin dështoi. Kontrollo internetin dhe provo sërish." },
  { match: "network", message: "Lidhja me serverin dështoi. Kontrollo internetin dhe provo sërish." },
  { match: "timeout", message: "Veprimi zgjati shumë dhe u ndërpre. Provo sërish." },
];

// ------------------------------------------------------------------ resolvers

// 23505. The constraint name (e.g. "sections_slug_key") and the failing column
// both show up in message/details, so we can say WHICH value is taken.
function uniqueViolation(haystack: string): string {
  if (haystack.includes("slug") || haystack.includes("url")) {
    return "Kjo adresë (URL) është e zënë. Zgjidh një tjetër.";
  }
  if (haystack.includes("email")) return "Ky email është përdorur tashmë.";
  return "Kjo e dhënë ekziston tashmë.";
}

// 23503. "update or delete on table ..." means the row is still referenced by
// someone else; anything else means the row we point AT does not exist.
function foreignKeyViolation(haystack: string): string {
  if (haystack.includes("update or delete")) {
    return "Kjo e dhënë përdoret edhe diku tjetër. Hiqi së pari lidhjet e saj.";
  }
  return "E dhëna e lidhur nuk ekziston ose është fshirë. Rifresko faqen dhe provo sërish.";
}

// "Password should be at least 6 characters." — keep the server's own minimum
// instead of hardcoding ours, so the two can never disagree.
function weakPassword(raw: string): string {
  const m = raw.match(/at least (\d+) character/i);
  return m
    ? `Fjalëkalimi duhet të ketë së paku ${m[1]} karaktere.`
    : "Fjalëkalimi është shumë i dobët — zgjidh një më të gjatë.";
}

function fromCode(code: string, haystack: string, raw: string): string | null {
  if (!code) return null;
  if (code === "23505") return uniqueViolation(haystack);
  if (code === "23503") return foreignKeyViolation(haystack);
  if (code.toLowerCase() === "weak_password") return weakPassword(raw);
  return PG_CODES[code.toUpperCase()] ?? AUTH_CODES[code.toLowerCase()] ?? null;
}

function fromMessage(haystack: string, raw: string): string | null {
  if (!haystack) return null;
  if (haystack.includes("duplicate key") || haystack.includes("unique constraint")) {
    return uniqueViolation(haystack);
  }
  if (haystack.includes("foreign key constraint")) return foreignKeyViolation(haystack);
  if (haystack.includes("password should be at least")) return weakPassword(raw);
  for (const rule of MESSAGE_RULES) {
    if (haystack.includes(rule.match)) return rule.message;
  }
  return null;
}

// ------------------------------------------------------------------ public API

/**
 * Friendly Albanian text for any Supabase / Postgres / JS error.
 * Pass `fallback` when the call site has a better generic sentence
 * ("Ruajtja e garës dështoi. Provo sërish.").
 */
export function dbError(err: unknown, fallback: string = GENERIC_DB_ERROR): string {
  if (err == null) return fallback;
  // Our own validators speak Albanian already — never translate them again.
  if (err instanceof UserError) return err.message;

  const e = isPgError(err) ? err : null;
  const raw = typeof err === "string" ? err : e?.message ?? "";
  const code = String(e?.code ?? "").trim();
  // Constraint and column names live in details/hint as often as in message,
  // so match against all three when we need to know which field blew up.
  const haystack = [raw, e?.details, e?.hint].filter(Boolean).join(" ").toLowerCase();

  return fromCode(code, haystack, raw) ?? fromMessage(haystack, raw) ?? fallback;
}

// React replaces every error thrown by a Server Action with this fixed English
// paragraph before the client ever sees it (see resolveErrorProd in
// react-server-dom-*). So in a production build the Albanian text a server
// action throws is unreachable — client catch blocks MUST swap it out.
const MASKED_SERVER_ERROR = [
  "server components render",
  "omitted in production",
  "digest property",
];

/**
 * Albanian text for an error caught in a client component right after awaiting
 * a Server Action. Returns `null` when the throw was Next.js' redirect sentinel
 * — that means the action actually succeeded and navigated away.
 */
export function actionError(err: unknown, fallback: string = GENERIC_DB_ERROR): string | null {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const low = raw.toLowerCase();
  // The message is masked in production but the digest survives, so check both.
  const digest = typeof (err as { digest?: unknown })?.digest === "string"
    ? (err as { digest: string }).digest
    : "";
  if (low.includes("next_redirect") || digest.startsWith("NEXT_REDIRECT")) return null;
  if (!raw || MASKED_SERVER_ERROR.some((m) => low.includes(m))) return fallback;
  // Anything else is the action's own message, which is already Albanian; run
  // it through dbError so a stray English DB string still gets translated.
  return dbError(raw, raw);
}
