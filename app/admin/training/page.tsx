import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { fmt, formatDurationShort } from "@/lib/training";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = { title: "Stërvitjet" };

const COACH_ROLES = ["admin", "editor", "staff", "coach"];
const PAGE_SIZE = 50;

type MetricKey = "distance_km" | "moving_seconds" | "elevation_m";
type EntryLite = {
  participated: boolean;
  distance_km: number | null;
  moving_seconds: number | null;
  elevation_m: number | null;
  athlete: { full_name: string } | null;
};
type RideRow = {
  id: string;
  ride_date: string;
  title: string | null;
  focus: string | null;
  distance_km: number | null;
  moving_seconds: number | null;
  elevation_m: number | null;
  review_status: "approved" | "under_review";
  has_pending_changes: boolean;
  section: { slug: string; name_sq: string } | null;
  entries: EntryLite[];
};

// Each row describes one session. Summing rider metrics would multiply a group
// ride's distance and duration by its participant count.
function sessionMetric(ride: RideRow, participants: EntryLite[], key: MetricKey, format: (value: number) => string): string {
  const values = participants.map((entry) => entry[key]).filter((value): value is number => value != null);
  if (values.length === 0) return ride[key] == null ? "—" : format(ride[key]);
  const low = Math.min(...values);
  const high = Math.max(...values);
  return low === high ? format(low) : `${format(low)}–${format(high)}`;
}

export default async function TrainingPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!COACH_ROLES.includes(profile.role)) redirect("/admin/dashboard");

  const query = await searchParams;
  const requestedPage = Number(query.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  const { data, count, error } = await supabase
    .from("training_rides")
    .select(
      "id, ride_date, title, focus, distance_km, moving_seconds, elevation_m, review_status, has_pending_changes, section:sections!section_id(slug, name_sq), entries:ride_entries(participated, distance_km, moving_seconds, elevation_m, athlete:team_members!athlete_id(full_name))",
      { count: "exact" },
    )
    .order("ride_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  if (error) throw error;

  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > pageCount) redirect(`/admin/training?page=${pageCount}`);

  const rows = (data as unknown as RideRow[] | null) ?? [];
  const view = rows.map((ride) => {
    const participants = ride.entries.filter((entry) => entry.participated);
    const names = participants
      .map((entry) => entry.athlete?.full_name ?? "Çiklist i panjohur")
      .sort((a, b) => a.localeCompare(b, "sq"));
    const title = ride.title?.trim() || ride.focus?.trim() || "Stërvitje";
    return {
      ride,
      title,
      names,
      date: new Date(`${ride.ride_date}T12:00:00`).toLocaleDateString("sq", { day: "2-digit", month: "short", year: "numeric" }),
      distance: sessionMetric(ride, participants, "distance_km", (value) => fmt(value, 1)),
      duration: sessionMetric(ride, participants, "moving_seconds", formatDurationShort),
      elevation: sessionMetric(ride, participants, "elevation_m", (value) => fmt(value)),
    };
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Stërvitjet</h1>
          <div className="sub">Stërvitjet e regjistruara dhe vlerat e çiklistëve në një vend.</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn btn-ghost" href="/admin/training/import">Importo nga Strava</Link>
          <Link className="btn btn-ember" href="/admin/training/new">+ Stërvitje e re</Link>
        </div>
      </div>

      <div className="filter-bar training-list-bar">
        <span className="meta">{total} stërvitje</span>
        {total > PAGE_SIZE && <span className="training-page-count">{offset + 1}–{Math.min(offset + PAGE_SIZE, total)} nga {total}</span>}
        <div className="spacer" />
        <Link className="meta" href="/admin/training/progress" style={{ color: "var(--ember)" }}>Progresi →</Link>
      </div>

      <div className="table-wrap training-table-wrap">
        <table className="t training-table">
          <thead>
            <tr>
              <th>Stërvitja</th>
              <th>Data</th>
              <th>Seksioni</th>
              <th>Çiklistët</th>
              <th className="num">Distanca</th>
              <th>Kohëzgjatja</th>
              <th className="num">Ngjitja</th>
              <th>Gjendja</th>
              <th>Hap</th>
            </tr>
          </thead>
          <tbody>
            {view.length === 0 ? (
              <tr><td colSpan={9} className="training-empty">Ende asnjë stërvitje. Fillo me “+ Stërvitje e re”.</td></tr>
            ) : view.map(({ ride, title, names, date, distance, duration, elevation }) => (
              <tr key={ride.id}>
                <td>
                  <Link href={`/admin/training/${ride.id}`} className="training-row-title">{title}</Link>
                  {(ride.title && ride.focus && ride.title !== ride.focus) && <span className="training-row-sub">{ride.focus}</span>}
                </td>
                <td className="mono" data-lab="Data">{date}</td>
                <td data-lab="Seksioni">{ride.section ? <span className={`tag-sec ${ride.section.slug}`}>{ride.section.name_sq}</span> : "—"}</td>
                <td data-lab="Çiklistët">
                  <span className="training-rider-names" title={names.join(", ")}>
                    {names.length ? `${names.slice(0, 2).join(", ")}${names.length > 2 ? ` +${names.length - 2}` : ""}` : "—"}
                  </span>
                  <span className="training-rider-count">{names.length} {names.length === 1 ? "çiklist" : "çiklistë"}</span>
                </td>
                <td className="num training-value" data-lab="Distanca"><span>{distance}{distance !== "—" && <span className="training-unit"> km</span>}</span></td>
                <td className="mono training-value" data-lab="Kohëzgjatja"><span>{duration}</span></td>
                <td className="num training-value" data-lab="Ngjitja"><span>{elevation}{elevation !== "—" && <span className="training-unit"> m</span>}</span></td>
                <td data-lab="Gjendja">
                  <span className={`badge-st ${ride.review_status === "under_review" ? "warn" : ride.has_pending_changes ? "ember" : "ok"}`}>
                    {ride.review_status === "under_review" ? "Në shqyrtim" : ride.has_pending_changes ? "Ndryshim i ri" : "Miratuar"}
                  </span>
                </td>
                <td className="actions training-row-action"><Link className="btn btn-ghost btn-sm" href={`/admin/training/${ride.id}`} aria-label={`Hap stërvitjen ${title}, ${date}`}>Hap →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <nav className="training-pagination" aria-label="Faqet e stërvitjeve">
          <span>Faqja {page} nga {pageCount}</span>
          <div>
            {page > 1 && <Link className="btn btn-ghost btn-sm" href={`/admin/training?page=${page - 1}`}>← Më të rejat</Link>}
            {page < pageCount && <Link className="btn btn-ghost btn-sm" href={`/admin/training?page=${page + 1}`}>Më të vjetrat →</Link>}
          </div>
        </nav>
      )}
    </>
  );
}
