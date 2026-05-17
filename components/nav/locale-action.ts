"use server";
import { cookies } from "next/headers";

export async function setLocale(locale: "sq" | "en") {
  (await cookies()).set("kc038_lang", locale, {
    path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax",
  });
}
