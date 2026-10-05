// Strava API brand guidelines (https://developers.strava.com/guidelines):
// the official Connect button, "Powered by Strava" attribution kept apart
// from the club's own branding, and "View on Strava" links back to the
// original data. The labels stay in English as the guidelines require.

export const STRAVA_ORANGE = "#FC5200";

export const stravaActivityUrl = (id: number | string) => `https://www.strava.com/activities/${id}`;
export const stravaSegmentUrl = (id: number | string) => `https://www.strava.com/segments/${id}`;

export function ConnectWithStrava({ href }: { href: string }) {
  return (
    <a href={href} style={{ display: "inline-block", lineHeight: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- official asset, served as is */}
      <img src="/strava/connect-with-strava.svg" width={237} height={48} alt="Connect with Strava" />
    </a>
  );
}

export function PoweredByStrava({ style }: { style?: React.CSSProperties }) {
  return (
    <div style={{ lineHeight: 0, ...style }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- official asset, served as is */}
      <img src="/strava/powered-by-strava.svg" width={118} height={12} alt="Powered by Strava" />
    </div>
  );
}

export function ViewOnStrava({ href, style }: { href: string; style?: React.CSSProperties }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      style={{ color: STRAVA_ORANGE, fontWeight: 700, fontSize: 12, fontFamily: "var(--font-body, inherit)", letterSpacing: "normal", textTransform: "none", textDecoration: "underline", whiteSpace: "nowrap", ...style }}>
      View on Strava
    </a>
  );
}
