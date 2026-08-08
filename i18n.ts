import { getRequestConfig } from "next-intl/server";

// Single-locale site: Albanian only. There is no language switcher and no
// locale cookie — resolving this statically also keeps pages out of the
// forced-dynamic path that a cookies() read would put them in.
export default getRequestConfig(async () => ({
  locale: "sq",
  messages: (await import("./messages/sq.json")).default,
}));
