/**
 * S1 — scant de build-output op server-geheimen (masterplan §9).
 *
 *   npm run build && npm run security:scan-build
 *
 * Controleert:
 *   1. elk bestand in `.next/static` (alles wat de browser kan downloaden) op
 *      secret-patronen (lib/security/secret-scan.ts);
 *   2. geen `.map`-bestanden in `.next/static` (productionBrowserSourceMaps: false);
 *   3. alle `NEXT_PUBLIC_*`-namen in de broncode + de huidige env: naam mag niet
 *      naar een geheim wijzen, waarde mag geen secret-patroon bevatten.
 * Exit 1 bij een treffer. Het rapport toont nooit het volledige geheim.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { publicEnvNamesInSource, scanPublicEnv, scanText, SECRET_NAME_RE, type SecretFinding } from "../lib/security/secret-scan";

const ROOT = process.cwd();
const STATIC_DIR = path.join(ROOT, ".next", "static");
const SOURCE_DIRS = ["app", "components", "lib", "i18n", "sanity", "proxy.ts", "next.config.mjs", "instrumentation.ts"];
const SOURCE_EXT = /\.(?:ts|tsx|js|mjs|cjs)$/;

function walk(target: string, filter: (file: string) => boolean): string[] {
  let stat;
  try {
    stat = statSync(target);
  } catch {
    return [];
  }
  if (stat.isFile()) return filter(target) ? [target] : [];
  return readdirSync(target).flatMap((name) => (name === "node_modules" ? [] : walk(path.join(target, name), filter)));
}

const findings: SecretFinding[] = [];

const bundles = walk(STATIC_DIR, () => true);
if (bundles.length === 0) {
  console.error(`[scan-build] geen bestanden in ${path.relative(ROOT, STATIC_DIR)} — eerst \`npm run build\`.`);
  process.exit(1);
}
let bytes = 0;
for (const file of bundles) {
  const rel = path.relative(ROOT, file);
  if (file.endsWith(".map")) findings.push({ pattern: "sourcemap-in-static", where: rel, excerpt: path.basename(file) });
  if (!/\.(?:js|css|json|txt|html|mjs)$/.test(file)) continue;
  const text = readFileSync(file, "utf8");
  bytes += text.length;
  findings.push(...scanText(text, rel));
}

const sourceNames = new Set<string>();
for (const dir of SOURCE_DIRS) {
  for (const file of walk(path.join(ROOT, dir), (f) => SOURCE_EXT.test(f) && !/\.test\.tsx?$/.test(f))) {
    for (const name of publicEnvNamesInSource(readFileSync(file, "utf8"))) sourceNames.add(name);
  }
}
for (const name of sourceNames) {
  if (SECRET_NAME_RE.test(name.slice("NEXT_PUBLIC_".length))) {
    findings.push({ pattern: "secret-like-public-name", where: "broncode", excerpt: name });
  }
}
findings.push(...scanPublicEnv(process.env));

console.log(
  `[scan-build] ${bundles.length} bestanden (${(bytes / 1024 / 1024).toFixed(1)} MB) in .next/static, ` +
    `${sourceNames.size} NEXT_PUBLIC_-namen in broncode: ${[...sourceNames].sort().join(", ") || "-"}`
);
if (findings.length > 0) {
  for (const f of findings) console.error(`[scan-build] TREFFER ${f.pattern} in ${f.where}: ${f.excerpt}`);
  process.exit(1);
}
console.log("[scan-build] geen secret-patronen, geen sourcemaps.");
