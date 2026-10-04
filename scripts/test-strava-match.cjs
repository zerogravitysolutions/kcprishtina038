const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const source = fs.readFileSync("lib/strava-match.ts", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const matchModule = {};
new Function("exports", compiled)(matchModule);

const cyclingSource = fs.readFileSync("lib/strava-cycling.ts", "utf8");
const cyclingCompiled = ts.transpileModule(cyclingSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const cyclingModule = {};
new Function("exports", cyclingCompiled)(cyclingModule);
for (const sport_type of ["Ride", "MountainBikeRide", "GravelRide", "EBikeRide", "EMountainBikeRide"]) {
  assert.equal(cyclingModule.cyclingMode({ sport_type }), "outdoor");
}
assert.equal(cyclingModule.cyclingMode({ sport_type: "Ride", trainer: true }), "indoor");
assert.equal(cyclingModule.cyclingMode({ sport_type: "VirtualRide" }), "indoor");
for (const sport_type of ["Run", "VirtualRun", "Swim", "Walk", "Workout", "WeightTraining"]) {
  assert.equal(cyclingModule.cyclingMode({ sport_type }), null);
}
const suggestionSource = fs.readFileSync("lib/strava-suggestions.ts", "utf8");
const suggestionCompiled = ts.transpileModule(suggestionSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const suggestionModule = {};
new Function("exports", suggestionCompiled)(suggestionModule);
const indoorActivity = { name: "", sport_type: "VirtualRide" };
assert.equal(suggestionModule.suggestedFocus([indoorActivity], true), "Stërvitje indoor");
assert.equal(suggestionModule.suggestedTitle([indoorActivity], "2026-10-04", true), "Stërvitje indoor · 2026-10-04");
const soloActivity = { name: "", sport_type: "Ride" };
assert.equal(suggestionModule.suggestedFocus([soloActivity]), "Dalje individuale");
assert.equal(suggestionModule.suggestedTitle([soloActivity], "2026-10-04"), "Dalje individuale · 2026-10-04");

const route = Array.from({ length: 101 }, (_, i) => [42.65, 21.16 + i * 0.001]);
const different = route.map(([lat, lon]) => [lat + 0.03, lon]);
const partlyDifferent = route.map(([lat, lon], i) => [lat + (i > 70 ? (i - 70) * 0.001 : 0), lon]);
const shared64Percent = route.map(([lat, lon], i) => [lat + (i > 60 ? Math.min((i - 60) * 0.0002, 0.002) : 0), lon]);
const shared54Percent = route.map(([lat, lon], i) => [lat + (i > 50 ? Math.min((i - 50) * 0.0002, 0.002) : 0), lon]);
const base = {
  athleteId: "a", activityId: "1", startMs: Date.parse("2026-10-04T09:00:00Z"),
  elapsedSeconds: 7200, distanceMeters: 9000, elevationMeters: 400, route,
};
const partner = { ...base, athleteId: "b", activityId: "2", startMs: base.startMs + 5 * 60_000 };

assert.ok(matchModule.routeOverlap(route, route) >= 0.99);
assert.equal(matchModule.routeOverlap(route, different), 0);
assert.ok(matchModule.matchRides(base, partner) >= 0.6);
assert.ok(matchModule.matchRides(base, { ...partner, route: shared64Percent }) >= 0.6);
assert.equal(matchModule.matchRides(base, { ...partner, route: shared54Percent }), null);
assert.equal(matchModule.matchRides(base, { ...partner, route: different }), null);
assert.equal(matchModule.matchRides(base, { ...partner, route: partlyDifferent }), null);
assert.equal(matchModule.matchRides(base, { ...partner, startMs: base.startMs + 2 * 60 * 60_000 }), null);
assert.equal(matchModule.matchRides(base, { ...partner, elevationMeters: 800 }), null);
assert.equal(matchModule.groupMatchingRides([base, partner, { ...partner, athleteId: "c", activityId: "3" }])[0].rides.length, 3);
assert.equal(matchModule.groupMatchingRides([{ ...partner, athleteId: "late", activityId: "4" }, base, partner])[0].rides.length, 3);
const indoor = { ...base, route: [], distanceMeters: 0, elevationMeters: 0, elapsedSeconds: 3600 };
const indoorPartner = { ...indoor, athleteId: "b", activityId: "indoor-2", startMs: indoor.startMs + 5 * 60_000, elapsedSeconds: 3500 };
assert.ok(matchModule.matchIndoorRides(indoor, indoorPartner) >= 0.8);
assert.equal(matchModule.matchIndoorRides(indoor, { ...indoorPartner, startMs: indoor.startMs + 11 * 60_000 }), null);
assert.equal(matchModule.matchIndoorRides(indoor, { ...indoorPartner, elapsedSeconds: 2700 }), null);
assert.equal(matchModule.matchIndoorRides(indoor, { ...indoorPartner, athleteId: "a" }), null);
assert.equal(matchModule.matchRides(indoor, indoorPartner), null);
assert.equal(matchModule.groupMatchingIndoorRides([indoor, indoorPartner, { ...indoorPartner, athleteId: "c", activityId: "indoor-3" }])[0].rides.length, 3);
assert.equal(matchModule.groupMatchingIndoorRides([{ ...indoorPartner, athleteId: "late", activityId: "indoor-4" }, indoor, indoorPartner])[0].rides.length, 3);
assert.equal(matchModule.groupMatchingIndoorRides([indoor])[0], undefined);
const metricsSource = fs.readFileSync("lib/strava-metrics.ts", "utf8");
const metricsCompiled = ts.transpileModule(metricsSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const metricsModule = {};
new Function("exports", "require", metricsCompiled)(metricsModule, () => ({
  computeIntensity: (np, ftp) => np && ftp ? Math.round(np / ftp * 100) / 100 : null,
  computeTss: (seconds, np, ftp) => seconds && np && ftp ? Math.round(seconds * np * np / (ftp * ftp * 3600) * 100) : null,
}));
const times = Array.from({ length: 121 }, (_, i) => i);
const watts = times.map((time) => time < 60 ? 300 : 100);
assert.equal(metricsModule.bestPower(watts, times)[60], 300);
assert.equal(metricsModule.bestPower(watts, times)[180], null);
assert.equal(metricsModule.bestPower([300, 300, 300], [0, 1, 120])[60], null);
const imported = metricsModule.metricsFromStrava({
  distance: 63700, moving_time: 7200, elapsed_time: 7400, total_elevation_gain: 414,
  average_heartrate: 141.5, max_heartrate: 179, average_watts: 205,
  weighted_average_watts: 230, average_cadence: 82.3,
}, { time: { data: times }, watts: { data: watts } }, 250);
assert.equal(imported.distance_km, 63.7);
assert.equal(imported.best_power_1m_w, 300);
assert.equal(imported.ftp_w, 250);
assert.equal(imported.intensity_factor, 0.92);
assert.equal(imported.tss, 169);
assert.equal(imported.avg_hr, 142);
assert.equal(imported.avg_cadence, 82);
assert.equal(imported.best_power_3m_w, null);
console.log("Strava route matching and metric checks passed");
