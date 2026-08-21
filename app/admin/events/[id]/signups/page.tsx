import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { SignupRow, type Signup } from "./SignupRow";
import { CATEGORIES } from "@/lib/race-category";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = { title: "Regjistrimet e eventit" };

export default async function EventSignupsPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin", "editor"].includes(profile.role)) redirect("/admin/dashboard");

  const { id } = await params;
  const supabase = await createClient();

  const [{ data: ev }, { data: signups }] = await Promise.all([
    supabase.from("events").select("id, title_sq, slug, start_at, location").eq("id", id).maybeSingle(),
    supabase.from("event_signups")
      .select("id, full_name, email, phone, dob, gender, category, club, status, bib_number, result_place, result_time, result_notes, notes, created_at")
      .eq("event_id", id)
      .order("created_at", { ascending: true }),
  ]);

  const event = ev as { id: string; title_sq: string; slug: string | null; start_at: string; location: string | null } | null;
  if (!event) notFound();
  const rows = (signups as Signup[] | null) ?? [];

  // Quick header stats
  const byStatus = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  // Build label map from the preset, then group rows by category.
  const labelByValue = new Map<string, string>();
  for (const c of CATEGORIES) labelByValue.set(c.v, c.label);

  const byCat = new Map<string, Signup[]>();
  for (const r of rows) {
    const key = r.category ?? "_none";
    if (!byCat.has(key)) byCat.set(key, []);
    byCat.get(key)!.push(r);
  }

  // Render order: preset categories first (only those with signups), then any
  // unknown categories, then the catch-all "no category" bucket last.
  const orderedKeys: string[] = [];
  for (const c of CATEGORIES) if (byCat.has(c.v)) orderedKeys.push(c.v);
  for (const k of byCat.keys()) {
    if (k === "_none") continue;
    if (!labelByValue.has(k) && !orderedKeys.includes(k)) orderedKeys.push(k);
  }
  if (byCat.has("_none")) orderedKeys.push("_none");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Regjistrimet</h1>
          <div className="mono" style={{ color: "var(--ink-3)", fontSize: 12, letterSpacing: ".08em" }}>
            {event.title_sq} · {new Date(event.start_at).toLocaleDateString("sq-AL", { day: "2-digit", month: "long", year: "numeric" })}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="btn btn-ghost btn-sm" href={`/admin/events/${event.id}`}>← Te gara</Link>
          <Link className="btn btn-ember btn-sm" href={`/admin/events/${event.id}/results`}>
            Rezultatet →
          </Link>
          {event.slug && (
            <Link className="btn btn-ghost btn-sm" href={`/events/${event.slug}`} target="_blank">Faqja publike ↗</Link>
          )}
        </div>
      </div>

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
        <Stat label="Gjithsej" value={rows.length} />
        <Stat label="Konfirmuar" value={byStatus.confirmed ?? 0} />
        <Stat label="Në pritje" value={byStatus.pending ?? 0} />
        <Stat label="Listë pritjeje" value={byStatus.waitlisted ?? 0} />
        <Stat label="Anuluar" value={byStatus.cancelled ?? 0} />
      </div>

      {rows.length === 0 ? (
        <p style={{ color: "var(--ink-3)", padding: "32px 0" }}>
          Asnjë regjistrim ende. Shpërnda linkun publik për të nisur regjistrimet.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 32 }}>
          {orderedKeys.map((key) => {
            const list = byCat.get(key)!;
            const label =
              key === "_none"
                ? "Pa kategori"
                : labelByValue.get(key) ?? key;
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
                    {list.length} pjesëmarrës
                  </span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ textAlign: "left", borderBottom: "2px solid var(--ink)" }}>
                        <Th>#</Th>
                        <Th>Pjesëmarrësi</Th>
                        <Th>Gjinia</Th>
                        <Th>Datëlindja</Th>
                        <Th>Klubi</Th>
                        <Th>Statusi</Th>
                        <Th>Bib</Th>
                        <Th>Regj.</Th>
                        <Th>Veprime</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((s, i) => (
                        <SignupRow key={s.id} eventId={event.id} s={s} index={i} />
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
