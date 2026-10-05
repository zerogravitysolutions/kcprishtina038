/** Import a cycling activity as a training when either threshold is met. */
export function qualifiesAsTraining(activity: { distance: number; total_elevation_gain: number }): boolean {
  return activity.distance >= 20_000 || activity.total_elevation_gain >= 150;
}
