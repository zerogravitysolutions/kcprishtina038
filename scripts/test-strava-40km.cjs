const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

function load(path) {
  const source = fs.readFileSync(path, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  new Function("exports", compiled)(exports);
  return exports;
}

const { bestFortyKm, fortyKmSpeed } = load("lib/strava-forty-km.ts");
const { qualifiesAsTraining } = load("lib/strava-qualify.ts");
const leaderboardSource = fs.readFileSync("lib/forty-km-leaderboard.ts", "utf8");
const leaderboardCompiled = ts.transpileModule(leaderboardSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const leaderboard = {};
new Function("exports", "require", leaderboardCompiled)(leaderboard, () => ({ fortyKmSpeed }));

const distance = Array.from({ length: 86 }, (_, km) => km * 1000);
const time = [0];
for (let km = 1; km <= 85; km++) time.push(time.at(-1) + (km <= 20 ? 240 : km <= 60 ? 60 : 120));
const best = bestFortyKm({ time: { data: time }, distance: { data: distance } });
assert.equal(best.durationSeconds, 2400);
assert.equal(best.startSecond, time[20]);
assert.equal(best.endSecond, time[60]);
assert.equal(fortyKmSpeed(best.durationSeconds), 60);

const stopped = {
  time: { data: [0, 1200, 1800, 3000, 4200] },
  distance: { data: [0, 20000, 20000, 40000, 60000] },
  moving: { data: [true, false, true, true, true] },
};
assert.equal(bestFortyKm(stopped).durationSeconds, 2400);
assert.equal(bestFortyKm({ time: stopped.time, distance: stopped.distance }).durationSeconds, 3000);
assert.equal(bestFortyKm({ time: { data: [0, 1200] }, distance: { data: [0, 39999] } }), null);

assert.equal(qualifiesAsTraining({ distance: 19999, total_elevation_gain: 149 }), false);
assert.equal(qualifiesAsTraining({ distance: 20000, total_elevation_gain: 0 }), true);
assert.equal(qualifiesAsTraining({ distance: 0, total_elevation_gain: 150 }), true);
const effort = (athlete_id, strava_activity_id, ride_started_at, duration_seconds) => ({
  athlete_id, strava_activity_id, ride_started_at, ride_date: ride_started_at.slice(0, 10), duration_seconds,
});
const rows = leaderboard.buildFortyKmLeaderboard(
  [{ id: "a", name: "Ana" }, { id: "b", name: "Besa" }, { id: "c", name: "Dora" }],
  new Set(["a", "b"]), new Set(["a"]), [
    effort("a", 1, "2025-01-01T10:00:00Z", 2400),
    effort("a", 2, "2026-01-01T10:00:00Z", 2600),
    effort("b", 3, "2026-01-02T10:00:00Z", 2500),
  ],
);
assert.deepEqual(rows.map((row) => [row.id, row.rank]), [["a", 1], ["b", 2], ["c", null]]);
assert.equal(rows[0].latest.strava_activity_id, 2);
assert.equal(rows[0].latestIsPb, false);
assert.equal(rows[1].latestIsPb, false); // incomplete history cannot confirm a crown
assert.equal(rows[2].connected, false);
console.log("Strava 40 km window and training import thresholds passed");
