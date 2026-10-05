/** Show a cycling activity to the coach when either training threshold is met. */
export function qualifiesForReview(activity: { distance: number; total_elevation_gain: number }): boolean {
  return activity.distance >= 20_000 || activity.total_elevation_gain >= 150;
}
