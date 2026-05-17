// Diagnostic page — reports what the server runtime can see.
// Safe to keep in production: only reports presence + first 12 chars, never the full key.
export const dynamic = "force-dynamic";

export default async function DebugPage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const mask = (s: string | undefined) => s ? `${s.slice(0, 12)}…(${s.length} chars)` : "MISSING";

  return (
    <pre style={{ padding: 32, fontSize: 13, fontFamily: "monospace" }}>
{`Runtime env check:

NEXT_PUBLIC_SUPABASE_URL:       ${mask(url)}
NEXT_PUBLIC_SUPABASE_ANON_KEY:  ${mask(key)}

NODE_ENV:                       ${process.env.NODE_ENV}
VERCEL:                         ${process.env.VERCEL ?? "not set"}
VERCEL_ENV:                     ${process.env.VERCEL_ENV ?? "not set"}
VERCEL_GIT_COMMIT_SHA:          ${(process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 12)}
`}
    </pre>
  );
}
