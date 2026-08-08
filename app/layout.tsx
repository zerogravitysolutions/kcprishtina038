import "./globals.css";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { TopProgress } from "@/components/public/TopProgress";

// Co-locate SSR/functions with the Supabase project (eu-central-1, Frankfurt)
// so DB round-trips are local (~ms) instead of transatlantic (~100ms each).
export const preferredRegion = "fra1";

export const metadata: Metadata = {
  metadataBase: new URL("https://prishtina038.cc"),
  title: { default: "KÇ Prishtina 038 — Klubi Çiklistik i Prishtinës", template: "%s · KÇ Prishtina 038" },
  description: "Klubi çiklistik i Prishtinës. Gjashtë disiplina, një ekip. Garojmë nën rregullat e UCI dhe FÇK.",
  icons: { icon: "/assets/logo.jpg" },
  openGraph: {
    type: "website",
    siteName: "KÇ Prishtina 038",
    url: "/",
    images: ["/assets/og-default.jpg"],
    locale: "sq_AL",
  },
  twitter: { card: "summary_large_image", images: ["/assets/og-default.jpg"] },
  other: { "theme-color": "#0F1A2E" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const locale = (cookieStore.get("kc038_lang")?.value === "en" ? "en" : "sq") as "sq" | "en";
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..125,400..900&family=Manrope:wght@400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <TopProgress />
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
