"use client";

import { useEffect, useState } from "react";

/**
 * The only interactive thing on the invoice. Saving as PDF is the browser's own
 * print dialog ("Destination → Save as PDF" on desktop, the share sheet on
 * iOS), so there is no PDF library here on purpose.
 *
 * Rendered disabled until mount: window.print() does not exist during SSR, and
 * a button that silently does nothing on the first tap is worse than one that
 * is visibly not ready yet.
 */
export function PrintButton() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  return (
    <button
      type="button"
      className="inv-print no-print"
      disabled={!ready}
      onClick={() => window.print()}
    >
      Printo
    </button>
  );
}
