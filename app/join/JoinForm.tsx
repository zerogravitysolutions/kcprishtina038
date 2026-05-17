"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { submitApplication, type JoinResult } from "./actions";

export function JoinForm() {
  const t = useTranslations();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const result: JoinResult = await submitApplication({
        name: String(fd.get("name") ?? ""),
        email: String(fd.get("email") ?? ""),
        phone: String(fd.get("phone") ?? ""),
        age: fd.get("age") ? Number(fd.get("age")) : null,
        section: String(fd.get("section") ?? ""),
        experience: String(fd.get("experience") ?? ""),
        notes: String(fd.get("notes") ?? ""),
        gotcha: String(fd.get("_gotcha") ?? ""),
      });
      if (result.ok) {
        setMsg({ kind: "ok", text: "Faleminderit! Aplikimi u dërgua. Ju kontaktojmë brenda 5 ditëve pune." });
        (e.target as HTMLFormElement).reset();
      } else {
        setMsg({ kind: "err", text: "Gabim: " + result.error });
      }
    });
  };

  const msgStyle: React.CSSProperties = msg
    ? msg.kind === "ok"
      ? { display: "block", marginBottom: 16, padding: "12px 14px", borderRadius: 8, fontSize: 13.5, background: "color-mix(in oklab,#6FAAA8 18%,white)", color: "#0F1A2E", border: "1px solid color-mix(in oklab,#6FAAA8 36%,transparent)" }
      : { display: "block", marginBottom: 16, padding: "12px 14px", borderRadius: 8, fontSize: 13.5, background: "color-mix(in oklab,#C25A2D 12%,white)", color: "#9B4220", border: "1px solid color-mix(in oklab,#C25A2D 30%,transparent)" }
    : { display: "none" };

  return (
    <form onSubmit={onSubmit} style={{ marginTop: 32 }}>
      <input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" style={{ position: "absolute", left: -9999, width: 1, height: 1 }} />
      <div style={msgStyle}>{msg?.text}</div>

      <div className="form-row">
        <div className="field">
          <label htmlFor="f-name">{t("jp.form.name")}</label>
          <input id="f-name" name="name" type="text" placeholder="P.sh. Albion Ymeri" required />
        </div>
        <div className="field">
          <label htmlFor="f-age">{t("jp.form.age")}</label>
          <input id="f-age" name="age" type="number" placeholder="P.sh. 28" min={9} max={80} required />
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="f-email">{t("jp.form.email")}</label>
          <input id="f-email" name="email" type="email" placeholder="ti@email.com" required />
        </div>
        <div className="field">
          <label htmlFor="f-phone">{t("jp.form.phone")}</label>
          <input id="f-phone" name="phone" type="tel" placeholder="+383 4_ ___ ___" />
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="f-section">{t("jp.form.section")}</label>
          <select id="f-section" name="section" required defaultValue="road">
            <option value="road">Rrugë</option>
            <option value="mtb">MTB</option>
            <option value="gravel">Gravel</option>
            <option value="track">Trek</option>
            <option value="youth">Akademia e të rinjve (9–17)</option>
            <option value="women">Programi i femrave</option>
            <option value="unsure">Nuk jam i sigurt — më këshilloni</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-experience">{t("jp.form.exp")}</label>
          <select id="f-experience" name="experience" required defaultValue="beginner">
            <option value="beginner">{t("jp.exp.beg")}</option>
            <option value="intermediate">{t("jp.exp.int")}</option>
            <option value="advanced">{t("jp.exp.adv")}</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="f-notes">{t("jp.form.notes")}</label>
        <textarea id="f-notes" name="notes" rows={4} placeholder="Disiplinat tjera, biçikleta që ke, garat ku ke marrë pjesë, etj." />
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn btn-ember" type="submit" disabled={pending}>
          <span>{pending ? "Po dërgon…" : t("jp.form.submit")}</span>
          <svg className="arrow" viewBox="0 0 14 14" fill="none"><path d="M3 11 L11 3 M11 3 H5 M11 3 V9" stroke="currentColor" strokeWidth="1.5" /></svg>
        </button>
        <span className="kicker">Marrim përgjigje brenda 5 ditëve pune</span>
      </div>
    </form>
  );
}
