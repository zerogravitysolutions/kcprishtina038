import { redirect } from "next/navigation";

// The plans screen is a catalogue editor — it counts members per tier and has
// no money movement on it — so it moved out of Financat to /admin/plans, next
// to Njerëzit and Seksionet. Old bookmarks must not 404.
export default function FinancePlansRedirect() {
  redirect("/admin/plans");
}
