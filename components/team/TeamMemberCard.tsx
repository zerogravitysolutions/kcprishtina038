import Image from "next/image";
import Link from "next/link";
import type { TeamMemberCard as Member } from "@/lib/supabase/team";
import { memberInitials, memberPhotoUrl, memberRoleSummary } from "@/lib/supabase/team";
import { uciCategoryLabel } from "@/lib/uci-category";

type Props = {
  member: Member;
  /** When true, the dob-derived UCI category renders as a chip. */
  showCategory?: boolean;
};

// Square card used on /team list. Click → /team/[slug].
export function TeamMemberCard({ member: m, showCategory = true }: Props) {
  const url = memberPhotoUrl(m);
  const initials = memberInitials(m);
  const roles = memberRoleSummary(m);
  // Only show a category badge for riders (other positions don't race).
  const isRider = m.positions.includes("rider");
  const category = isRider ? uciCategoryLabel(m.dob, m.gender, { isMaster: m.is_master }) : null;

  return (
    <Link href={`/team/${m.slug}` as never} className="team-card" aria-label={m.full_name}>
      <div className="team-card__photo">
        {url ? (
          <Image
            src={url}
            alt={m.full_name}
            fill
            sizes="(max-width: 600px) 50vw, (max-width: 1000px) 33vw, 25vw"
            quality={75}
            style={{ objectFit: "cover" }}
          />
        ) : (
          <span className="team-card__initials" aria-hidden="true">{initials}</span>
        )}
        {m.status === "past" && (
          <span className="team-card__past-flag">2025</span>
        )}
      </div>
      <div className="team-card__body">
        <h3 className="team-card__name">{m.full_name}</h3>
        <div className="team-card__roles mono">{roles}</div>
        {showCategory && category && (
          <span className="team-card__cat">{category}</span>
        )}
      </div>
    </Link>
  );
}
