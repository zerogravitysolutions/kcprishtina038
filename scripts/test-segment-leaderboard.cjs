const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const source = fs.readFileSync("lib/segment-leaderboard.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const moduleExports = {};
new Function("exports", compiled)(moduleExports);

const segmentId = 11076508;
const effort = (athlete, activity, date, seconds, power) => ({
  athlete_id: athlete, strava_activity_id: activity, segment_id: segmentId,
  started_at: `${date}T12:00:00Z`, local_date: date,
  elapsed_seconds: seconds, avg_power_w: power, avg_hr: 150,
  max_hr: 170, avg_cadence: 80,
});
const riders = [
  { id: "b", name: "Besa" }, { id: "a", name: "Albion" },
  { id: "d", name: "Dona" }, { id: "c", name: "Dren" },
];
const efforts = [
  effort("a", 99, "2023-03-22", 404, 423),
  effort("a", 1, "2026-07-29", 440, 437),
  effort("a", 2, "2026-09-24", 670, 257),
  effort("b", 3, "2026-09-20", 550, 290),
  effort("b", 4, "2026-10-02", 420, 360),
  effort("d", 5, "2026-10-02", 510, 300),
];
const stats = [
  { athlete_id: "a", segment_id: segmentId, pr_activity_id: 99, pr_elapsed_seconds: 404,
    pr_date: "2023-03-22", effort_count: 205 },
  { athlete_id: "b", segment_id: segmentId, pr_activity_id: 4, pr_elapsed_seconds: 420,
    pr_date: "2026-10-02", effort_count: 2 },
];
const rows = moduleExports.buildSegmentLeaderboard(riders, new Set(["a", "b", "d"]), efforts, stats, segmentId);
assert.deepEqual(rows.map((row) => [row.id, row.rank]), [["a", 1], ["b", 2], ["d", 3], ["c", null]]);
assert.equal(rows[0].pb.elapsedSeconds, 404); // all-time Strava PR beats local history
assert.equal(rows[0].pb.avgPowerW, 423); // hydrated PB effort supplies its own watts
assert.equal(rows[0].latest.elapsedSeconds, 670);
assert.equal(rows[0].latestIsPb, false);
assert.equal(rows[1].latestIsPb, true);
assert.equal(rows[1].latest.avgPowerW, 360);
assert.equal(rows[2].pbVerified, false); // partial import must not claim an all-time PB
assert.equal(rows[2].latestIsPb, false);
assert.equal(rows[3].connected, false);
assert.equal(rows[3].pb, null);
console.log("Strava segment leaderboard checks passed");
