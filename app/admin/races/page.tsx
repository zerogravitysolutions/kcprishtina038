import { createClient, getProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DeleteButton } from "./DeleteButton";
import { RaceSuggestionActions } from "./RaceSuggestion";
import { detectRaceSignal } from "@/lib/race-detect";
import { mediaUrl } from "@/lib/supabase/fb";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type NewsCand = {
  id: string; title_sq: string | null; body_sq: string | null; published_at: string | null;
  gallery_media_ids: string[] | null; cover_media_id: string | null; external_url: string | null;
  cover: { storage_path: string } | null;
};

// Build the pre-filled "new race" URL for an approved suggestion. The editor
// reviews it (esp. the real race date) before creating — nothing hits /races
// until they save.
function approveHref(c: NewsCand, nameGuess: string | null): string {
  const p = new URLSearchParams();
  p.set("link_news_id", c.id);
  p.set("name", (nameGuess || c.title_sq || "").slice(0, 120));
  if (c.published_at) p.set("date", c.published_at.slice(0, 10));
  if (c.body_sq) p.set("description", c.body_sq.slice(0, 1500));
  if (c.cover_media_id) p.set("cover_media_id", c.cover_media_id);
  if (c.external_url) p.set("external_url", c.external_url);
  if (c.gallery_media_ids?.length) p.set("gallery", c.gallery_media_ids.join(","));
  return `/admin/races/new?${p.toString()}`;
}

type Row = {
  id: string;
  slug: string;
  name: string;
  race_date: string;
  location: string | null;
  race_type: string | null;
  organizer: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  road: "Rrugore",
  mtb: "MTB",
  tt: "Kronometër",
  stage: "Etapa",
  gravel: "Gravel",
  cyclocross: "Cyclocross",
};

export default async function RacesAdminPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin","editor"].includes(profile.role)) redirect("/admin/dashboard");
  const supabase = await createClient();
  const { data } = await supabase.from("race_events")
    .select("id, slug, name, race_date, location, race_type, organizer")
    .order("race_date", { ascending: false }).limit(300);
  const rows = (data as Row[] | null) ?? [];

  // Suggestions: FB posts that look like races but aren't a race yet (and not declined).
  const { data: newsData } = await supabase
    .from("news")
    .select("id, title_sq, body_sq, published_at, gallery_media_ids, cover_media_id, external_url, cover:media!cover_media_id(storage_path)")
    .eq("source", "facebook").is("race_event_id", null).eq("race_dismissed", false).eq("status", "published")
    .order("published_at", { ascending: false }).limit(200);
  const suggestions = ((newsData as unknown as NewsCand[] | null) ?? [])
    .map((c) => ({ c, sig: detectRaceSignal({ title: c.title_sq ?? "", body: c.body_sq ?? "" }) }))
    .filter((x) => x.sig.likely)
    .sort((a, b) => b.sig.score - a.sig.score || (b.c.published_at ?? "").localeCompare(a.c.published_at ?? ""));

  return (
    <>
      <div className="page-head">
        <div><h1>Garat</h1><div className="sub">{rows.length} në bazë · katalog i kuruar i garave të klubit</div></div>
        <Link className="btn btn-ember" href="/admin/races/new">+ Gara e re</Link>
      </div>

      {suggestions.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}>
          <div className="card-head" style={{ padding: "15px 18px", marginBottom: 0, borderBottom: "1px solid var(--line)" }}>
            <h3>Sugjerime nga Facebook</h3>
            <span className="kicker">{suggestions.length} postime që duken si gara</span>
          </div>
          {suggestions.map(({ c, sig }) => {
            const coverUrl = mediaUrl(c.cover?.storage_path);
            return (
            <div key={c.id} className="rs-item">
              {coverUrl
                ? <img className="rs-thumb" src={coverUrl} alt="" />
                : <div className="rs-thumb rs-thumb--empty" />}
              <div className="rs-body">
                <div className="rs-title">{sig.nameGuess || c.title_sq || "Postim"}</div>
                <div className="rs-meta">
                  {c.published_at ? new Date(c.published_at).toLocaleDateString("sq", { day: "2-digit", month: "short", year: "numeric" }) : ""}
                  {" · "}{c.gallery_media_ids?.length ?? 0} foto
                  {" · shenja: "}{sig.matches.slice(0, 3).join(", ") || sig.score}
                </div>
              </div>
              <RaceSuggestionActions newsId={c.id} approveHref={approveHref(c, sig.nameGuess)} />
            </div>
            );
          })}
        </div>
      )}
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Emri</th><th>Data</th><th>Vendi</th><th>Tipi</th><th>Organizatori</th><th>Veprime</th></tr></thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={6} style={{ padding: 18, color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Nuk ka gara — shtoni një.</td></tr>
              : rows.map(r => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/admin/races/${r.id}`} style={{ fontWeight: 600 }}>{r.name}</Link>
                    <small style={{ display: "block", color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 10.5, marginTop: 2 }}>/races/{r.slug}</small>
                  </td>
                  <td className="mono">{new Date(r.race_date).toLocaleDateString("sq")}</td>
                  <td>{r.location ?? "—"}</td>
                  <td className="mono">{r.race_type ? (TYPE_LABEL[r.race_type] ?? r.race_type) : "—"}</td>
                  <td>{r.organizer ?? "—"}</td>
                  <td className="actions">
                    <Link className="btn btn-ghost btn-sm" href={`/admin/races/${r.id}`}>Edit</Link>
                    <DeleteButton id={r.id} name={r.name} />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
