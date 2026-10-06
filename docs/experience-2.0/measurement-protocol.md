# Meetprotocol lab-CWV (Experience 2.0)

Status: geldt vanaf H-2 voor alle performance-uitspraken en voor de >10%-regel uit
masterplan §10. Lost F-09 (onbetrouwbare mediaan van 5 runs) en F-10 (LCP-element niet
vastgelegd) op. Tooling: `scripts/baseline/measure.mjs` (meten en gate),
`scripts/baseline/lib/{lighthouse,stats}.mjs` (gedeeld, getest in `lib/stats.test.mjs`).

## 1. Vaste opzet

| Onderdeel | Waarde | Waar vastgelegd |
|---|---|---|
| Lighthouse | **13.5.0**, exact gepind via `npx --yes lighthouse@13.5.0` | `LH_VERSION`, per run `lighthouseVersion` |
| Chrome | lokale Chrome, `--headless=new`; versie staat per run in `userAgent` | `runs.json` |
| Throttling | `simulate` (lantern, zoals PSI). **Expliciet meegegeven**, niet de default: mobiel RTT 150 ms, 1638,4 kbps, CPU 4×; desktop RTT 40 ms, 10 240 kbps, CPU 1× | `THROTTLING`, per run `throttling` |
| Form factor | **mobiel** is de gate (§10-budget is mobiel); desktop alleen informatief | `--form-factors` |
| Categorie | alleen `performance` (a11y loopt via axe, `cwv-axe.mjs --only=axe`) | |
| Cache | **cold** is de gate (verse profielmap + storage reset per run). Warm: `--cache=warm`, gedeelde profielmap per cel, één priming-run die niet meetelt, `--disable-storage-reset` | `protocol.cache` |

Elke sessie controleert dat alle runs dezelfde versie en throttling hadden
(`protocol.consistent`). Een vergelijking (`--compare`) tussen sessies met een andere
versie, throttling-methode of cache-modus waarschuwt en is niet gate-waardig.

## 2. Isolatie (geen andere CPU-last)

Lantern schaalt de **waargenomen** CPU-taken uit de trace met 4×. Last op de host meet je dus
mee. Daarom:

1. Neem een build-slot (`~/Downloads/.t4xi-build-slots/slotN/owner`), zoals voor een build.
2. Het script wacht vóór **elke** run tot (a) de 1-minuut-loadavg ≤ 0,5 × aantal cores
   (`--max-load`, op deze machine 4,0) en (b) geen build-slot van een andere agent bezet is.
   Na 30 min wachten breekt het af. `--allow-busy` meet toch, maar markeert elke run met
   `env.quiet=false`. Zo'n meting is **niet gate-waardig**.
3. Vrije schijf < 3 GB → afbreken.
4. Achteraf: runs met `benchmarkIndex` < 85% van de sessiemediaan krijgen `excluded` (de host
   was op dat moment aantoonbaar trager). Ze blijven in `runs.json` en tellen niet mee in de
   statistiek. Het aantal staat in de tabel (`n (fout/uitgesl.)`).

## 3. Aantal herhalingen

**15 runs per cel**, standaard. Bij een gate-uitspraak "onbeslist" verdubbel je naar 30.

Onderbouwing uit de nulmeting 0.1 (`baseline/raw/cwv-runs.json`, mobiel):

- Unimodale pagina's (`/`, `/tarieven`): LCP-spreiding 0,06–0,09 s, CV ≈ 1–2%. Daar
  volstaan al 5 runs. 15 runs zijn ruim genoeg om een verschil van 10% te zien.
- `/boeken` is bimodaal: 2 van 5 runs in de snelle modus (~2,8 s), 3 in de trage (~6,0–6,5 s).
  De mediaan en de p75 hangen dan vooral af van het **aandeel** trage runs, niet van de
  spreiding binnen een modus. Bij n = 5 geeft één run meer of minder in een modus al een
  sprong van 3 s.
  - Bij n = 15 en een snel-aandeel van 0,4 is de kans op ≥ 3 runs in elke modus 97%. Dat
    is nodig voor de modusdetectie (`minShare` 15%).
  - Een verschuiving van het traag-aandeel van ~27% naar 60% is bij n = 15 nog niet
    significant. Bij n = 30 is ze dat wel (zie de test
    `gate_marks_slow_mode_shift_undecided_at_n15_and_regression_at_n30`). Daarom de
    verdubbelregel.
- Runs worden **geïnterleaved** met een roterende volgorde (A B, B A, …). Drift van het
  netwerk, het CDN of de host valt dan gelijk over de varianten.

## 4. Rapportage per cel

`summary.md` en `summary.json` geven per pagina × form factor × variant:

- LCP en FCP: **mediaan, p75, IQR** (p25–p75), min/max en CV. Kwantielen met lineaire
  interpolatie (type 7, zoals numpy en Excel).
- **Modusdetectie**: grootste sprong in de gesorteerde waarden. Die telt als bimodaal bij
  een sprong ≥ 25% van de mediaan én ≥ 300 ms, en ≥ 15% van de runs aan elke kant. Per
  modus worden n, aandeel en mediaan gerapporteerd.
- **LCP-element** per run (F-10). Lighthouse 13 levert het niet meer via
  `largest-contentful-paint-element` maar via `lcp-breakdown-insight` →
  `details.items[{type:"node"}]`. Daarbij komen de waargenomen subparts (TTFB, render
  delay, …).
- **Waargenomen** (ongethrottelde) FCP, LCP en load uit de trace. Lantern bouwt zijn
  simulatie op wat vóór de waargenomen FCP/LCP gebeurde. Een late waargenomen paint trekt
  dus alle eerdere netwerk- en CPU-knopen mee in de simulatie. Dit is het eerste wat je
  bekijkt bij bimodaliteit.
- TBT, score, third parties (bytes en main-thread-tijd per entity), loadavg en
  benchmarkIndex per run.

## 5. De >10%-regel toetsen (§10)

Vergelijk de **verdelingen**, niet één mediaan. Per cel en per metriek (LCP is leidend, FCP
diagnostisch), basis A tegen kandidaat B, beide volgens dit protocol en elk met n ≥ 15:

| Uitspraak | Voorwaarde |
|---|---|
| **regressie** (niet mergen) | p75(B) / p75(A) > 1,10 **én** Mann-Whitney eenzijdig (B > A) p < 0,05 |
| **onbeslist** | ratio > 1,10 maar p ≥ 0,05 → beide kanten naar n = 30 en opnieuw toetsen |
| **verbetering** | ratio < 0,90 én de omgekeerde toets p < 0,05 |
| **gelijk** | anders |
| **onvoldoende-runs** | n < 15 aan een van beide kanten |

Waarom zo:
- **p75**, omdat het budget in §10 een p75 is.
- **Mann-Whitney**, omdat die rangtoets de hele verdeling bekijkt. Hij ziet dus ook een groter
  aandeel trage runs, zonder aanname van normaliteit.
- Erbij staat een **bootstrap-95%-interval** van de p75-ratio (4000 trekkingen, vaste seed,
  reproduceerbaar), als maat voor de onzekerheid. Het interval zelf is geen gate-criterium.

Basis en kandidaat meet je bij voorkeur **in één sessie, geïnterleaved** (twee `--variant`'s),
zodat host en netwerk gelijk zijn. Twee aparte sessies vergelijken mag via `--compare`, maar
alleen met dezelfde versie, throttling en cache.

## 6. Doelen en hun grenzen

| Doel | Gebruik | Kanttekening |
|---|---|---|
| `https://www.t4xi.nl` | nulmeting, diagnose van productie | Alleen GET. Vercel-edge en CDN-cache tellen mee |
| `http://localhost:3112` (`next start`, productiebuild, `APP_ENV=development`, `CI=true`) | vóór/na een codewijziging met **dezelfde build-env**, geïnterleaved | Geen CDN, geen HTTP/2-edge, geen Vercel-compressie: absolute waarden wijken af van productie, het verschil vóór/na is de uitspraak |
| Vercel-preview (`*.vercel.app`) | infra die dichter bij productie zit | Preview ≠ productie-infra: andere env-variabelen (o.a. Stripe-key), andere cache-warmte, mogelijk deployment-protectie |

Lab ≠ veld. Gesimuleerde throttling is een gestandaardiseerd slechtste-geval-profiel. Een
lab-LCP boven 2,5 s betekent niet automatisch dat het veld-p75 faalt. Velddata (CrUX/PSI-key
of eigen RUM, B8) blijft de formele toets van §10. Dit protocol maakt **lab-vergelijkingen**
reproduceerbaar.

**Bijzonderheid van `simulate` (lantern).** Lantern schat FCP en LCP uit de waargenomen
trace. Een pagina waarvan de waargenomen eerste paint soms vóór en soms ná het laden van
grote scripts valt, levert twee modi op. Dat is dan een eigenschap van de pagina (veel werk
dat met de eerste paint concurreert), maar de grootte van de sprong is deels een
modelartefact. Bij twijfel controleer je met `--throttling=devtools` (echte throttling,
diagnostisch, niet gate-waardig wegens grotere hostgevoeligheid).

**Vastgesteld in H-2** (`h2-boeken-diagnose.md`): headless Chrome presenteert in een deel
van de runs pas rond **~2,54 s** het eerste frame (waargenomen FCP), terwijl de main thread
stil is. Op pagina's met veel vroeg werk (`/boeken`: Stripe.js en booking-JS) maakt lantern
daar een trage modus van. Regel: zie je in `runs.json` een cluster van `observed.fcpMs`
rond 2,5 s, behandel de gesimuleerde bimodaliteit dan als artefact. Meet die cel daarnaast
met `--throttling=devtools` (n = 15) en neem die uitkomst mee in de gate-uitspraak.

## 7. Commando's

```bash
# slot nemen (zie agentafspraken), dan:
node scripts/baseline/measure.mjs --label=<naam> --pages=/boeken --runs=15
# A/B in één sessie (bv. productie met en zonder een third-party-script):
node scripts/baseline/measure.mjs --label=<naam> --pages=/boeken --runs=15 \
  --variant="prod|https://www.t4xi.nl" --variant="zonder-x|https://www.t4xi.nl|*x.com*"
# vóór/na lokaal: twee next start-servers op verschillende poorten, één sessie:
node scripts/baseline/measure.mjs --label=<naam> --variant="voor|http://localhost:3113" --variant="na|http://localhost:3112"
# twee sessies vergelijken:
node scripts/baseline/measure.mjs --compare=docs/experience-2.0/perf/a/runs.json,docs/experience-2.0/perf/b/runs.json
# traces voor diagnose (buiten de repo): --assets-dir=/pad/buiten/repo
node --test scripts/baseline/lib/   # tests van statistiek en extractie
```

Output: `docs/experience-2.0/perf/<label>/{runs.json,summary.json,summary.md}`.
