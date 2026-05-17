"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

function pad(n: number) { return String(n).padStart(2, "0"); }

export function Countdown({ targetIso }: { targetIso: string }) {
  const t = useTranslations();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const target = new Date(targetIso).getTime();
  const ms = Math.max(0, target - now);
  const sec = Math.floor(ms / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return (
    <div className="countdown-digits">
      <div className="cd-unit"><div className="num">{pad(d)}</div><div className="label">{t("cd.days")}</div></div>
      <div className="cd-unit"><div className="num">{pad(h)}</div><div className="label">{t("cd.hours")}</div></div>
      <div className="cd-unit"><div className="num">{pad(m)}</div><div className="label">{t("cd.minutes")}</div></div>
      <div className="cd-unit"><div className="num">{pad(s)}</div><div className="label">{t("cd.seconds")}</div></div>
    </div>
  );
}
