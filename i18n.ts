import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const raw = cookieStore.get("kc038_lang")?.value;
  const locale: "sq" | "en" = raw === "en" ? "en" : "sq";
  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
