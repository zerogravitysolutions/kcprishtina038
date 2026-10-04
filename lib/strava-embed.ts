export type StravaEmbedStats = {
  distance_km: number | null;
  elevation_m: number | null;
  moving_seconds: number | null;
};

function durationSeconds(value: string): number | null {
  const text = value.trim();
  if (text.includes(":")) {
    const parts = text.split(":").map(Number);
    if (parts.some((part) => !Number.isInteger(part))) return null;
    return parts.reduce((seconds, part) => seconds * 60 + part, 0);
  }
  const hours = text.match(/(\d+)\s*h/i);
  const minutes = text.match(/(\d+)\s*m(?!i)/i);
  const seconds = text.match(/(\d+)\s*s/i);
  if (!hours && !minutes && !seconds) return null;
  return Number(hours?.[1] ?? 0) * 3600 + Number(minutes?.[1] ?? 0) * 60 + Number(seconds?.[1] ?? 0);
}

/** Read the three summary values shown by Strava's official public embed. */
export function parseStravaEmbed(html: string): StravaEmbedStats {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

  const distance = text.match(/Distance\s+([\d.,]+)\s*(km|mi)\b/i);
  const elevation = text.match(/Elev(?:ation)?\s*(?:Gain)?\s+([\d.,]+)\s*(m|ft)\b/i);
  const time = text.match(/(?:Moving Time|Time)\s+(\d{1,2}:\d{2}(?::\d{2})?|\d+\s*h(?:\s*\d+\s*m)?(?:\s*\d+\s*s)?|\d+\s*m(?:\s*\d+\s*s)?|\d+\s*s)\b/i);

  const distanceValue = distance ? Number(distance[1].replace(/,/g, "")) : NaN;
  const elevationValue = elevation ? Number(elevation[1].replace(/,/g, "")) : NaN;
  return {
    distance_km: Number.isFinite(distanceValue)
      ? distance?.[2].toLowerCase() === "mi" ? Math.round(distanceValue * 1.60934 * 10) / 10 : distanceValue
      : null,
    elevation_m: Number.isFinite(elevationValue)
      ? Math.round(elevation?.[2].toLowerCase() === "ft" ? elevationValue * 0.3048 : elevationValue)
      : null,
    moving_seconds: time ? durationSeconds(time[1]) : null,
  };
}
