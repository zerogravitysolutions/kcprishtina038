"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { deleteRide } from "../actions";

export function RideDeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--err)" }} onClick={() => setOpen(true)}>
        Fshij stërvitjen
      </button>
      <ConfirmModal
        open={open}
        onClose={() => setOpen(false)}
        title="Fshij stërvitjen"
        tone="danger"
        confirmLabel="Fshij"
        message={<>Kjo do të fshijë stërvitjen dhe të gjitha vlerat e çiklistëve në të. Veprimi s’kthehet.</>}
        onConfirm={async () => {
          const r = await deleteRide(id);
          if (r.ok) { router.push("/admin/training"); return { ok: true }; }
          return { ok: false, error: r.error };
        }}
      />
    </>
  );
}
