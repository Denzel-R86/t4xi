<!-- gegenereerd door scripts/baseline/measure.mjs (2026-10-06T18:27:23.199Z) -->
# Meting `h2-diag-js-ab`

Lighthouse 13.5.0, throttling `simulate`, cache `cold`, 15 runs per cel (geïnterleaved), max load1 4, benchmarkIndex-mediaan 2869, protocol consistent: ja.

| Cel | n (fout/uitgesl.) | LCP mediaan | LCP p75 | LCP IQR | LCP modi | FCP mediaan | FCP p75 | FCP modi | TBT mediaan | Score mediaan |
|---|---|---|---|---|---|---|---|---|---|---|
| `/boeken` mobile · prod | 15 (0/0) | 5,11 s | 5,73 s | 2,87 s | snel 6× ~2,83 s / traag 9× ~5,39 s | 1,24 s | 2,20 s | snel 11× ~1,12 s / traag 4× ~3,33 s | 106 ms | 80 |
| `/boeken` mobile · zonder-js | 15 (0/0) | 1,82 s | 2,40 s | 0,65 s | snel 10× ~1,76 s / traag 5× ~2,42 s | 1,09 s | 1,23 s | unimodaal | 0 ms | 99 |
| `/tarieven` mobile · prod | 15 (0/0) | 2,85 s | 2,90 s | 0,08 s | unimodaal | 1,16 s | 1,18 s | unimodaal | 30 ms | 95 |
| `/tarieven` mobile · zonder-js | 15 (0/0) | 2,36 s | 2,41 s | 0,14 s | unimodaal | 1,12 s | 1,15 s | unimodaal | 0 ms | 98 |

LCP-elementen per cel:
- `/boeken` mobile · prod: `main#content > section.mx-auto > div > p.mt-4` (15×, "Vaste prijs vooraf, inclusief btw. Geen taxameter, geen verr")
- `/boeken` mobile · zonder-js: `main#content > section.mx-auto > div > p.mt-4` (15×, "Vaste prijs vooraf, inclusief btw. Geen taxameter, geen verr")
- `/tarieven` mobile · prod: `section.border-b > div.mx-auto > header.max-w-3xl > p.mt-6` (15×, "Comfortabel vervoer met een professionele chauffeur en een v")
- `/tarieven` mobile · zonder-js: `section.border-b > div.mx-auto > header.max-w-3xl > p.mt-6` (15×, "Comfortabel vervoer met een professionele chauffeur en een v")

## Gate (§10, eerste variant = basis)

| Cel | Metriek | Basis → kandidaat | n | mediaan A → B | p75 A → B | ratio p75 (95%-BI) | p(slechter) | Uitspraak |
|---|---|---|---|---|---|---|---|---|
| `/boeken` mobile | lcpMs | prod → zonder-js | 15/15 | 5,11 → 1,82 s | 5,73 → 2,40 s | 0.42 (0.29–0.47) | 1.000 | **verbetering** |
| `/boeken` mobile | fcpMs | prod → zonder-js | 15/15 | 1,24 → 1,09 s | 2,20 → 1,23 s | 0.56 (0.35–0.99) | 0.992 | **verbetering** |
| `/tarieven` mobile | lcpMs | prod → zonder-js | 15/15 | 2,85 → 2,36 s | 2,90 → 2,41 s | 0.83 (0.81–0.85) | 1.000 | **verbetering** |
| `/tarieven` mobile | fcpMs | prod → zonder-js | 15/15 | 1,16 → 1,12 s | 1,18 → 1,15 s | 0.98 (0.95–1.00) | 0.974 | **gelijk** |
