"use client";

import { useRouter } from "next/navigation";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { addToRoster } from "./actions";
import { POSITION_LABEL, startingPosition } from "./positions";

/** Contextual action for an account that has no roster row: put the person on
 * the public roster and link the two. That link is also what makes them
 * selectable in the training athlete picker. */
export function AddToRoster({ profileId, name, role, open, onClose }: {
  profileId: string; name: string; role: string; open: boolean; onClose: () => void;
}) {
  const router = useRouter();
  // Same mapping the server action uses, so the sentence cannot lie.
  const position = POSITION_LABEL[startingPosition(role)];

  return (
    <>
      <ConfirmModal
        open={open}
        onClose={onClose}
        title="Shto në ekip"
        confirmLabel="Shto"
        message={
          <>
            <strong>{name}</strong> shtohet në regjistrin e ekipit si <strong>{position}</strong> aktiv dhe lidhet me
            këtë llogari. Që nga ai moment shfaqet edhe në faqen publike <em>Ekipi</em> dhe, po qe çiklist, mund të
            zgjidhet në stërvitje. Pozicionet, foton dhe renditjen ndryshoji menjëherë me “Ndrysho”.
          </>
        }
        onConfirm={async () => {
          const r = await addToRoster(profileId);
          if (!r.ok) return { ok: false as const, error: r.error ?? "Veprimi dështoi." };
          router.refresh();
          return { ok: true as const };
        }}
      />
    </>
  );
}
