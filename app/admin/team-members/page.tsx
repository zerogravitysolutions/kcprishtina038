import { redirect } from "next/navigation";

// The roster list lives on /admin/people now. The roster EDITORS
// (/admin/team-members/new and /admin/team-members/[id]) are unchanged and are
// still reached from there.
export default function TeamMembersRedirect() {
  redirect("/admin/people");
}
