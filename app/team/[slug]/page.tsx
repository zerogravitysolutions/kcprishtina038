import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PublicNav } from "@/components/nav/PublicNav";
import { Footer } from "@/components/public/Footer";
import { TeamMemberCard } from "@/components/team/TeamMemberCard";
import {
  getTeamMemberBySlug, getTeamMembers,
  memberInitials, memberPhotoUrl, memberRoleSummary, positionLabel,
} from "@/lib/supabase/team";
import { getUciCategory } from "@/lib/uci-category";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const m = await getTeamMemberBySlug(slug);
  if (!m) return { title: "Anëtari nuk u gjet" };
  const url = memberPhotoUrl(m);
  return {
    title: m.full_name,
    description: `${m.full_name} — ${memberRoleSummary(m)} në KÇ Prishtina 038.`,
    alternates: { canonical: `/team/${m.slug}` },
    openGraph: url ? { images: [url] } : undefined,
  };
}

export default async function TeamMemberPage({ params }: { params: Params }) {
  const { slug } = await params;
  const m = await getTeamMemberBySlug(slug);
  if (!m) notFound();

  const url = memberPhotoUrl(m);
  const initials = memberInitials(m);
  const isRider = m.positions.includes("rider");
  const cat = isRider ? getUciCategory(m.dob, m.gender, { isMaster: m.is_master }) : null;

  // Sibling cards — same status (active or past), excluding the current one.
  const siblings = (await getTeamMembers(m.status)).filter((x) => x.slug !== m.slug).slice(0, 4);

  return (
    <>
      <PublicNav />

      <article style={{ paddingTop: 56, paddingBottom: 80 }}>
        <div className="container">
          <Link
            href="/team"
            className="mono"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase",
              color: "var(--ink-2)", textDecoration: "none",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M11 11 L3 3 M3 3 H9 M3 3 V9" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <span>Kthehu te ekipi</span>
          </Link>

          <div className="member-hero">
            <div className="member-hero__photo">
              {url ? (
                <Image
                  src={url}
                  alt={m.full_name}
                  fill
                  sizes="(max-width: 800px) 100vw, 380px"
                  priority
                  quality={85}
                  style={{ objectFit: "cover" }}
                />
              ) : (
                <span className="member-hero__initials" aria-hidden="true">{initials}</span>
              )}
            </div>
            <div className="member-hero__body">
              <div className="eyebrow">
                <span style={{ color: m.status === "past" ? "var(--ink-3)" : "var(--ember)" }}>
                  {m.status === "past" ? "Anëtar i mëparshëm" : "Anëtar aktiv"}
                </span>
              </div>
              <h1
                className="display"
                style={{
                  marginTop: 16,
                  fontSize: "clamp(36px, 5vw, 56px)",
                  letterSpacing: "-0.025em",
                  lineHeight: 1.05,
                }}
              >
                {m.full_name}
              </h1>

              <div className="member-roles">
                {m.positions.map((p) => (
                  <span key={p} className="member-role-chip">
                    {positionLabel(p, m.gender)}
                  </span>
                ))}
              </div>

              <div className="member-stats mono">
                {cat && (
                  <div>
                    <div className="member-stat__num">{cat.label}</div>
                    <div className="member-stat__label">Kategoria UCI</div>
                  </div>
                )}
                {m.section_slug && (
                  <div>
                    <div className="member-stat__num">{m.section_slug.toUpperCase()}</div>
                    <div className="member-stat__label">Seksioni</div>
                  </div>
                )}
                {m.status === "past" && m.ended_at && (
                  <div>
                    <div className="member-stat__num">{m.ended_at.slice(0, 4)}</div>
                    <div className="member-stat__label">Sezoni i fundit</div>
                  </div>
                )}
              </div>

              {m.bio && (
                <p
                  style={{
                    marginTop: 32, fontSize: 16, lineHeight: 1.65,
                    color: "var(--ink-2)", maxWidth: "60ch",
                  }}
                >
                  {m.bio}
                </p>
              )}
            </div>
          </div>
        </div>
      </article>

      {siblings.length > 0 && (
        <section style={{ paddingTop: 48, paddingBottom: 80, background: "var(--paper-2)" }}>
          <div className="container">
            <div className="section-head" style={{ marginBottom: 24 }}>
              <div>
                <div className="eyebrow"><span>{m.status === "past" ? "Anëtarë të tjerë të mëparshëm" : "Të tjerë në ekip"}</span></div>
              </div>
              <Link href="/team" className="btn btn-ghost" style={{ justifySelf: "start" }}>
                <span>Shiko të gjithë ekipin</span>
                <svg className="arrow" viewBox="0 0 14 14" fill="none">
                  <path d="M3 11 L11 3 M11 3 H5 M11 3 V9" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </Link>
            </div>
            <div className="team-grid">
              {siblings.map((s) => (
                <TeamMemberCard key={s.id} member={s} />
              ))}
            </div>
          </div>
        </section>
      )}

      <Footer />
    </>
  );
}
