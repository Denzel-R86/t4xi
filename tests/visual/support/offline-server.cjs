/**
 * Preload voor `next start` tijdens de visual-regression-run (PR 0.3, §10b).
 *
 * Maakt de server deterministisch en offline: elke DNS-lookup naar een host
 * buiten localhost faalt direct. Daardoor vallen server-side bronnen die niet
 * via page.route() te onderscheppen zijn (Sanity CMS, eventuele Supabase-reads)
 * altijd terug op hun codefallback — dezelfde toestand op macOS, in Docker en
 * in CI, en nooit een call naar een productie-API.
 *
 * Geladen via NODE_OPTIONS="--require ./tests/visual/support/offline-server.cjs".
 * Geen productiecode: alleen actief in de visual-testrun.
 */
"use strict";

const dns = require("node:dns");

const ALLOWED = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
const reported = new Set();

function blocked(hostname) {
  if (!reported.has(hostname)) {
    reported.add(hostname);
    process.stderr.write(`[visual-offline] geblokkeerd: ${hostname}\n`);
  }
  const err = new Error(`getaddrinfo ENOTFOUND ${hostname} (visual-offline)`);
  err.code = "ENOTFOUND";
  err.hostname = hostname;
  return err;
}

const originalLookup = dns.lookup;
dns.lookup = function lookup(hostname, options, callback) {
  const cb = typeof options === "function" ? options : callback;
  if (hostname && !ALLOWED.has(String(hostname))) {
    process.nextTick(() => cb(blocked(String(hostname))));
    return {};
  }
  return originalLookup.apply(this, arguments);
};

const originalPromisesLookup = dns.promises.lookup;
dns.promises.lookup = function lookup(hostname, ...rest) {
  if (hostname && !ALLOWED.has(String(hostname))) {
    return Promise.reject(blocked(String(hostname)));
  }
  return originalPromisesLookup.call(this, hostname, ...rest);
};
