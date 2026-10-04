const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const source = fs.readFileSync("lib/strava-match.ts", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const matchModule = {};
new Function("exports", compiled)(matchModule);

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
