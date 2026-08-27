/**
 * Runs tests/dates.test.mts once per timezone.
 *
 * TZ has to be set before the process starts — assigning process.env.TZ afterwards does not
 * reliably move Date/Intl — so each zone gets its own child process. The zones are chosen to sit
 * on either side of Greenwich and to include one that observes DST, since a date bug in this app
 * is invisible from UTC.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const suite = join(here, "dates.test.mts");

const ZONES = ["America/Los_Angeles", "Asia/Tokyo", "Europe/Rome", "UTC"];

let failed = 0;
for (const zone of ZONES) {
  const run = spawnSync(process.execPath, [suite], {
    env: { ...process.env, TZ: zone },
    stdio: "inherit",
  });
  if (run.status !== 0) failed += 1;
}

console.log(failed === 0 ? `\n  Tutti i fusi orari OK (${ZONES.length})\n` : `\n  ${failed} fusi falliti\n`);
process.exit(failed > 0 ? 1 : 0);
