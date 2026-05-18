// Helper: extract the inner content of <body>...</body> from a legacy
// HTML page in public/, stripped of its own <nav> and <footer> blocks
// (Next.js components provide those now). Used by app/<page>/page.tsx
// during the migration to render pixel-identical content without
// rewriting the markup as JSX.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

type Options = {
  /** When true, also strip the legacy <section class="hero">...</section>
   *  so a React-side <PageHero /> can take over without duplication. */
  stripHero?: boolean;
};

export async function getLegacyBody(filename: string, opts: Options = {}): Promise<string> {
  const path = join(process.cwd(), "public", filename);
  const src = await readFile(path, "utf-8");
  // Body content.
  const bodyMatch = src.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) return "";
  let body = bodyMatch[1];
  // Strip the legacy nav and footer — components handle them.
  body = body.replace(/<nav class="nav"[\s\S]*?<\/nav>/i, "");
  body = body.replace(/<footer class="foot"[\s\S]*?<\/footer>/i, "");
  if (opts.stripHero) {
    // The legacy hero is always <section class="hero" ...>...</section>
    body = body.replace(/<section class="hero"[\s\S]*?<\/section>/i, "");
  }
  // Strip <script> tags — Next.js doesn't execute them via dangerouslySetInnerHTML
  // anyway, and most of them are the old i18n/countdown/supabase hooks which we
  // replace at the React level.
  body = body.replace(/<script[\s\S]*?<\/script>/gi, "");
  return body;
}
