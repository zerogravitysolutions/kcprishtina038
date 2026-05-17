"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale } from "./locale-action";

export function LangToggle({ current }: { current: "sq" | "en" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const switchTo = (l: "sq" | "en") => start(async () => {
    await setLocale(l);
    router.refresh();
  });
  return (
    <div className="lang-pill" role="group" aria-label="Language">
      {(["sq", "en"] as const).map(l => (
        <button
          key={l}
          type="button"
          onClick={() => switchTo(l)}
          className={l === current ? "active" : ""}
          disabled={pending}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
