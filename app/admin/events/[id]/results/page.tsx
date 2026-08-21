import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { ResultRow } from "./ResultRow";
import { PublishToggle } from "./PublishToggle";
import type { Signup } from "../signups/SignupRow";
import { CATEGORIES } from "@/lib/race-category";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = { title: "Rezultatet e eventit" };

export default async function EventResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin", "editor"].includes(profile.role)) redirect("/admin/dashboard");

  const { id } = await params;
  const supabase = await createClient();

  const [{ data: ev }, { data: signups }] = await Promise.all([
    supabase.from("events")
      .select("id, title_sq, slug, start_at, location, results_published, results_published_at")
      .eq("id", id).maybeSingle(),
    supabase.from("event_signups")
      .select("id, full_name, email, phone, dob, gender, category, club, status, bib_number, result_place, result_time, result_notes, notes, created_at")
      .eq("event_id", id)
      // Only confirmed riders show up in result entry (drafts/cancelled
      // shouldn't appear in startlists).
      .in("status", ["confirmed", "pending"])
      .order("bib_number", { ascending: true, nullsFirst: false }),
  ]);

  const event = ev as {
    id: string;
    title_sq: string;
    slug: string | null;
    start_at: string;
    location: string | null;
    results_published: boolean;
    results_published_at: string | null;
  } | null;
  if (!event) notFound();
  const rows = (signups as Signup[] | null) ?? [];

  // Sort: rows with a result_place come first (in order); the rest stay by bib.
  rows.sort((a, b) => {
    const ap = a.result_place ?? 9999;
    const bp = b.result_place ?? 9999;
    if (ap !== bp) return ap - bp;
    const ab = a.bib_number ?? 99999;
    const bb = b.bib_number ?? 99999;
    return ab - bb;
  });

  const labelByValue = new Map<string, string>();
  for (const c of CATEGORIES) labelByValue.set(c.v, c.label);

  const byCat = new Map<string, Signup[]>();
  for (const r of rows) {
    const key = r.category ?? "_none";
    if (!byCat.has(key)) byCat.set(key, []);
    byCat.get(key)!.push(r);
  }

  const orderedKeys: string[] = [];
  for (const c of CATEGORIES) if (byCat.has(c.v)) orderedKeys.push(c.v);
  for (const k of byCat.keys()) {
    if (k === "_none") continue;
    if (!labelByValue.has(k) && !orderedKeys.includes(k)) orderedKeys.push(k);
  }
  if (byCat.has("_none")) orderedKeys.push("_none");

  const withResults = rows.filter((r) => r.result_place != null).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Rezultatet</h1>
          <div className="mono" style={{ color: "var(--ink-3)", fontSize: 12, letterSpacing: ".08em" }}>
            {event.title_sq} · {new Date(event.start_at).toLocaleDateString("sq-AL", { day: "2-digit", month: "long", year: "numeric" })}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="btn btn-ghost btn-sm" href={`/admin/events/${event.id}/signups`}>← Regjistrimet</Link>
          <Link className="btn btn-ghost btn-sm" href={`/admin/events/${event.id}`}>← Te gara</Link>
        </div>
      </div>

      <PublishToggle
        eventId={event.id}
        initial={event.results_published}
        eventSlug={event.slug}
        publishedAt={event.results_published_at}
      />

      <div
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          margin: "12px 0 20px",
          padding: "12px 16px",
          background: "var(--paper-2)",
          borderRadius: 8,
        }}
      >
        <Stat label="Lista e startit" value={rows.length} />
        <Stat label="Me rezultate" value={withResults} />
        <Stat label="Pa rezultate" value={rows.length - withResults} />
      </div>

      {rows.length === 0 ? (
        <p style={{ color: "var(--ink-3)", padding: "32px 0" }}>
          Asnjë pjesëmarrës i konfirmuar — kthehu te <Link href={`/admin/events/${event.id}/signups`} style={{ color: "var(--ember)" }}>Regjistrimet</Link> për të konfirmuar pjesëmarrësit.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 32 }}>
          {orderedKeys.map((key) => {
            const list = byCat.get(key)!;
            const label = key === "_none" ? "Pa kategori" : labelByValue.get(key) ?? key;
            const done = list.filter((r) => r.result_place != null).length;
            return (
              <section key={key}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 12,
                    marginBottom: 8,
                    paddingBottom: 8,
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  <h2
                    className="display"
                    style={{ fontSize: 20, letterSpacing: "-0.015em", margin: 0 }}
                  >
                    {label}
                  </h2>
                  <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: ".12em" }}>
                    {done}/{list.length} të plotësuara
                  </span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ textAlign: "left", borderBottom: "2px solid var(--ink)" }}>
                        <Th>#</Th>
                        <Th>Bib</Th>
                        <Th>Pjesëmarrësi</Th>
                        <Th>Vendi</Th>
                        <Th>Koha</Th>
                        <Th>Shënim</Th>
                        <Th></Th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((s, i) => (
                        <ResultRow key={s.id} eventId={event.id} s={s} index={i} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th
      className="mono"
      style={{
        padding: "10px 8px",
        fontSize: 10,
        letterSpacing: ".14em",
        textTransform: "uppercase",
        color: "var(--ink-3)",
        fontWeight: 600,
      }}
    >
      {children}
    </th>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mono" style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-3)" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}
