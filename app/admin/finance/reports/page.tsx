import { redirect } from "next/navigation";

// The earnings report is now the "Të hyrat e akademisë" view of the Pasqyra
// financiare, which it shares with the club balance and with the debts it used
// to report twice. Bookmarks and old links must not 404 — and the month filter
// comes along with them.
//
// redirect (307), never permanentRedirect: a 308 would be cached in the owner's
// browser forever if the panel is reorganised again.
type SearchParams = Promise<{ p?: string }>;

export default async function FinanceReportsRedirect({ searchParams }: { searchParams: SearchParams }) {
  const { p } = await searchParams;
  redirect(
    p
      ? `/admin/finance/overview?v=anetaresia&p=${encodeURIComponent(p)}`
      : "/admin/finance/overview?v=anetaresia",
  );
}
