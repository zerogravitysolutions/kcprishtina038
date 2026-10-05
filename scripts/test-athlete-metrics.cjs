const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const source = fs.readFileSync("lib/athlete-metrics.ts", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const m = {};
new Function("exports", compiled)(m);

const row = (ride_date, best_power_20m_w, max_hr = null, ftp_w = null, participated = true) =>
  ({ ride_date, best_power_20m_w, max_hr, ftp_w, participated });

// 95% of the best 20-min power in the last 42 days.
assert.deepEqual(m.derivedFtp([row("2026-09-30", 340), row("2026-09-10", 359), row("2026-07-01", 400)], "2026-10-05"),
  { watts: 341, source: "estimate", date: "2026-09-10", best20: 359 });
// Older or skipped rides do not count; without power data the latest ride's FTP is used.
assert.deepEqual(m.derivedFtp([row("2026-08-01", 400, null, 390), row("2026-09-30", 300, null, null, false)], "2026-10-05"),
  { watts: 390, source: "latest", date: "2026-08-01" });
assert.equal(m.derivedFtp([], "2026-10-05"), null);
// Highest heart rate within 12 months.
assert.deepEqual(m.derivedMaxHr([row("2026-09-01", null, 177), row("2025-09-01", null, 195), row("2026-10-01", null, 170)], "2026-10-05"),
  { bpm: 177, date: "2026-09-01" });
assert.equal(m.estimateFtp(0), null);
console.log("Athlete metrics checks passed");
