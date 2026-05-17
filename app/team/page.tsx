import type { Metadata } from "next";
import { PublicNav } from "@/components/nav/PublicNav";
import { Footer } from "@/components/public/Footer";
import { TeamMemberCard } from "@/components/team/TeamMemberCard";
import { getTeamMembers } from "@/lib/supabase/team";

export const metadata: Metadata = {
  title: "Ekipi",
  description: "Çiklistët, trajnerët dhe bordi i KÇ Prishtina 038.",
  alternates: { canonical: "/team" },
};

export default async function TeamPage() {
  const [active, past] = await Promise.all([
    getTeamMembers("active"),
    getTeamMembers("past"),
  ]);

  // Group active members by role bucket for visual hierarchy.
  const board     = active.filter((m) => m.positions.includes("president"));
  const coaches   = active.filter((m) => m.positions.includes("coach") && !m.positions.includes("president"));
  const officials = active.filter((m) => m.positions.includes("commissaire") && !m.positions.includes("president") && !m.positions.includes("coach"));
  const ridersSet = new Set(active.filter((m) => m.positions.includes("rider")).map((m) => m.id));
  const placedIds = new Set([...board, ...coaches, ...officials].map((m) => m.id));
  const riders    = active.filter((m) => ridersSet.has(m.id) && !placedIds.has(m.id));

  return (
    <>
      <PublicNav />

      {/* Header */}
      <section style={{ paddingTop: 96, paddingBottom: 32 }}>
        <div className="container">
          <div className="eyebrow"><span>Ekipi</span></div>
          <h1
            className="display"
            style={{
              marginTop: 16,
              fontSize: "clamp(40px, 6vw, 72px)",
              letterSpacing: "-0.025em",
              lineHeight: 1.02,
              maxWidth: "18ch",
            }}
          >
            Çiklistët dhe stafi pas garave.
          </h1>
          <p className="lede" style={{ marginTop: 24, maxWidth: "60ch", color: "var(--ink-2)" }}>
            {active.length} anëtarë aktivë në klub. Trajnerë, komisarë dhe çiklistë në gjashtë seksione.
          </p>
        </div>
      </section>

      {board.length > 0 && (
        <TeamSection title="Bordi" members={board} />
      )}
      {coaches.length > 0 && (
        <TeamSection title="Trajnerët" members={coaches} />
      )}
      {officials.length > 0 && (
        <TeamSection title="Komisarët" members={officials} />
      )}
      {riders.length > 0 && (
        <TeamSection title="Çiklistët" members={riders} />
      )}

      {past.length > 0 && (
        <TeamSection
          title="Anëtarët e mëparshëm"
          subtitle="Pjesë e klubit deri më 31 dhjetor 2025."
          members={past}
          tone="muted"
        />
      )}

      <Footer />
    </>
  );
}

function TeamSection({
  title,
  subtitle,
  members,
  tone = "default",
}: {
  title: string;
  subtitle?: string;
  members: Awaited<ReturnType<typeof getTeamMembers>>;
  tone?: "default" | "muted";
}) {
  return (
    <section
      style={{
        paddingTop: 48,
        paddingBottom: 48,
        background: tone === "muted" ? "var(--paper-2)" : undefined,
      }}
    >
      <div className="container">
        <div className="section-head" style={{ marginBottom: 24 }}>
          <div>
            <div className="eyebrow"><span>{title}</span></div>
            <h2 className="display display-m" style={{ marginTop: 12 }}>
              {members.length} {members.length === 1 ? "person" : "persona"}.
            </h2>
          </div>
          {subtitle && (
            <p className="lede" style={{ color: "var(--ink-2)" }}>{subtitle}</p>
          )}
        </div>
        <div className="team-grid">
          {members.map((m) => (
            <TeamMemberCard key={m.id} member={m} />
          ))}
        </div>
      </div>
    </section>
  );
}
