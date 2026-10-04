// Strava's sport_type is the authoritative activity category. A trainer ride
// can still have sport_type Ride, while VirtualRide can contain virtual GPS.
const CYCLING_TYPES = new Set([
  "Ride", "MountainBikeRide", "GravelRide", "EBikeRide", "EMountainBikeRide", "VirtualRide",
]);

export function cyclingMode(activity: { sport_type: string; trainer?: boolean }): "indoor" | "outdoor" | null {
  if (!CYCLING_TYPES.has(activity.sport_type)) return null;
  return activity.sport_type === "VirtualRide" || activity.trainer === true ? "indoor" : "outdoor";
}
