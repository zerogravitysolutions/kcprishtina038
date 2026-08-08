import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Identifikohu",
  description: "Hyr në llogarinë e KÇ Prishtina 038.",
  robots: { index: false, follow: true },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const profile = await getProfile();
  const params = await searchParams;
  if (profile && profile.status === "active") {
    redirect((profile.role === "member" ? "/portal" : "/admin/dashboard") as never);
  }

  return (
    <div className="auth-layout">
      <aside className="auth-side">
        <Link href="/" className="auth-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/logo.jpg" alt="" />
          <div>
            <div className="kc">KÇ Prishtina 038</div>
            <div className="sub">Klubi Çiklistik · Prishtinë</div>
          </div>
        </Link>
        <div className="auth-side-cta">
          <span className="auth-eyebrow">Sezoni 2026 · në aksion</span>
          <h2 className="auth-title">
            Mbi qiellin e <em>Prishtinës</em>,<br />vetëm ne pedalojmë.
          </h2>
        </div>
      </aside>

      <main className="auth-form-side">
        <Link href="/" className="auth-back">← Kthehu te faqja kryesore</Link>
        <div className="auth-card">
          <h1 className="auth-card-title">Mirë se erdhe.</h1>
          <p className="auth-card-lede">Identifikohu për të hyrë në llogarinë tënde.</p>
          <div style={{ marginTop: 32 }}>
            <LoginForm next={params.next ?? null} />
          </div>
          <p className="auth-card-foot">
            Nuk ke ende llogari?{" "}
            <Link href="/join" className="auth-link">Apliko si anëtar →</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
