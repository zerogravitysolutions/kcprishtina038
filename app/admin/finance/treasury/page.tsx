import { redirect } from "next/navigation";

// "Arka e klubit" and "Raportet financiare" were two read-only screens printing
// the same debt, the same billed total and the same collection rate from
// differently capped queries. They are now two views of one page. Bookmarks and
// old links must not 404 — and the year filter comes along with them.
//
// redirect (307), never permanentRedirect: a 308 would be cached in the owner's
// browser forever if the panel is reorganised again.
type SearchParams = Promise<{ y?: string }>;

export default async function TreasuryRedirect({ searchParams }: { searchParams: SearchParams }) {
  const { y } = await searchParams;
  redirect(y ? `/admin/finance/overview?y=${encodeURIComponent(y)}` : "/admin/finance/overview");
}
