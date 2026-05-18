import Image from "next/image";
import Link from "next/link";
import { PublicNav } from "@/components/nav/PublicNav";
import { Footer } from "@/components/public/Footer";
import { PageHero } from "@/components/public/PageHero";
import { FbFollowBand } from "@/components/fb/FbFollowBand";
import { getLegacyBody } from "@/lib/legacy";
import { createClient } from "@/lib/supabase/server";
import { memberInitials, memberPhotoUrl, type TeamMemberCard } from "@/lib/supabase/team";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Klubi",
  description: "Tre themelues, një ide e qartë: ta vendosim Prishtinën në hartën çiklistike të Ballkanit.",
  alternates: { canonical: "/about" },
};

const FOUNDER_SLUGS = ["qendrim-pllana", "albion-ymeri", "shqiponja-osmani-pllana"] as const;

const FOUNDER_ROLES: Record<string, string> = {
  "qendrim-pllana":         "Themelues · President",
  "albion-ymeri":           "Themelues · Trajner kryesor",
  "shqiponja-osmani-pllana": "Themelueze · Programe të femrave",
};

const FOUNDER_BLURBS: Record<string, string> = {
  "qendrim-pllana":          "Ish-çiklist Masters, organizator i Granfondo Sharri 2024 dhe 2025. Trajner i seksionit Gravel.",
  "albion-ymeri":            "Çiklist Elite në Rrugë. Trajner UCI Level 1 dhe trajner kryesor i seksionit Rrugë. Drejton planifikimin e sezonit.",
  "shqiponja-osmani-pllana": "Drejton Akademinë e të rinjve dhe programin e femrave. Çikliste e dikurshme XCO në kombëtare. Kryen kontaktet me FÇK dhe sponsorët.",
};

async function getFounders() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("team_members")
    .select(
      "id, slug, full_name, first_name, last_name, gender, dob, positions, section_slug, bio, status, ended_at, display_order, external_photo_url, photo:media!photo_media_id(storage_path)",
    )
    .in("slug", [...FOUNDER_SLUGS]);
  const byslug = new Map<string, TeamMemberCard>();
  for (const m of (data as unknown as TeamMemberCard[] | null) ?? []) {
    byslug.set(m.slug, m);
  }
  return FOUNDER_SLUGS
    .map((slug) => {
      const m = byslug.get(slug);
      return m ? { member: m, role: FOUNDER_ROLES[slug], blurb: FOUNDER_BLURBS[slug] } : null;
    })
    .filter((x): x is { member: TeamMemberCard; role: string; blurb: string } => x !== null);
}

export default async function AboutPage() {
  const [body, founders] = await Promise.all([
    getLegacyBody("about.html", { stripHero: true, stripFounders: true }),
    getFounders(),
  ]);

  return (
    <>
      <PublicNav />
      <PageHero
        eyebrow="Klubi"
        title="Tre themelues. Një ide e qartë."
        subtitle="Të vendosim Prishtinën në hartën çiklistike të Ballkanit — me kalendar, akademinë e të rinjve dhe ekip që garon jashtë kufirit."
        pickerKey="about"
      />
      <div dangerouslySetInnerHTML={{ __html: body }} />

      {founders.length > 0 && (
        <section className="founders-section" id="team">
          <div className="container">
            <div className="section-head">
              <div>
                <div className="eyebrow"><span>Themeluesit</span></div>
                <h2 className="display display-m" style={{ marginTop: 16 }}>Tre që e nisën.</h2>
              </div>
              <p className="lede">
                KÇ Prishtina 038 lindi në vitin 2022 nga tre çiklistë që besuan se Prishtina e meriton një klub me identitet të vetin —
                me kalendar, me akademinë e të rinjve dhe me një ekip që garon jashtë kufirit.
              </p>
            </div>
            <div className="founders-grid">
              {founders.map(({ member, role, blurb }) => {
                const photo = memberPhotoUrl(member);
                return (
                  <Link
                    key={member.slug}
                    href={`/team/${member.slug}` as never}
                    className={`founder-card ${photo ? "" : "founder-card--noimg"}`}
                  >
                    <div className="founder-photo">
                      {photo ? (
                        <Image
                          src={photo}
                          alt={member.full_name}
                          fill
                          sizes="(max-width: 900px) 100vw, 33vw"
                          quality={80}
                          style={{ objectFit: "cover" }}
                        />
                      ) : (
                        <span className="founder-initials">{memberInitials(member)}</span>
                      )}
                    </div>
                    <div className="founder-meta">
                      <div className="founder-role">{role}</div>
                      <div className="founder-name">{member.full_name}</div>
                      {blurb && <p className="founder-blurb">{blurb}</p>}
                      <span className="founder-go" aria-hidden="true">
                        <span>Lexo profilin</span>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M3 11 L11 3 M11 3 H5 M11 3 V9" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <FbFollowBand />
      <Footer />
    </>
  );
}
