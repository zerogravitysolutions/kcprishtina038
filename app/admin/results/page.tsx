import { redirect } from "next/navigation";

// This was a second results editor, unreachable from anywhere in the UI: no nav
// row, no link. It wrote public.results, and nothing in the app reads that
// table — not the public event page (which renders event_signups.result_place),
// not the portal, not /races. A working editor feeding storage no surface
// renders is not capability, and keeping two of them guarantees that one day
// the same race is recorded twice and the public page shows one of them.
//
// Per-rider results live on event_signups and are edited at
// /admin/events/[id]/results, which is reachable from the event detail page and
// publishes straight to /events/[slug].
//
// The public.results rows are NOT dropped: they may be the only record of some
// 2023–2025 placings, and removing the editor already stops the divergence.
//
// redirect (307), never permanentRedirect: a 308 would be cached in the owner's
// browser forever if the panel is reorganised again.
export default function ResultsRedirect() {
  redirect("/admin/events");
}
