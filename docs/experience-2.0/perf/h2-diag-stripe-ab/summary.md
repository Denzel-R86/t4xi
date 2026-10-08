<!-- gegenereerd door scripts/baseline/measure.mjs (2026-10-06T17:45:44.971Z) -->
# Meting `h2-diag-stripe-ab`

Lighthouse 13.5.0, throttling `simulate`, cache `cold`, 15 runs per cel (geïnterleaved), max load1 4, benchmarkIndex-mediaan 2933, protocol consistent: ja.

| Cel | n (fout/uitgesl.) | LCP mediaan | LCP p75 | LCP IQR | LCP modi | FCP mediaan | FCP p75 | FCP modi | TBT mediaan | Score mediaan |
|---|---|---|---|---|---|---|---|---|---|---|
| `/boeken` mobile · prod | 15 (0/0) | 2,83 s | 4,51 s | 1,72 s | snel 11× ~2,82 s / traag 4× ~6,38 s | 1,12 s | 2,18 s | snel 11× ~1,11 s / traag 4× ~3,16 s | 65 ms | 95 |
| `/boeken` mobile · zonder-stripe | 15 (0/0) | 2,84 s | 3,58 s | 0,76 s | unimodaal | 1,11 s | 1,51 s | unimodaal | 12 ms | 95 |

LCP-elementen per cel:
- `/boeken` mobile · prod: `main#content > section.mx-auto > div > p.mt-4` (15×, "Vaste prijs vooraf, inclusief btw. Geen taxameter, geen verr")
- `/boeken` mobile · zonder-stripe: `main#content > section.mx-auto > div > p.mt-4` (15×, "Vaste prijs vooraf, inclusief btw. Geen taxameter, geen verr")

## Gate (§10, eerste variant = basis)

| Cel | Metriek | Basis → kandidaat | n | mediaan A → B | p75 A → B | ratio p75 (95%-BI) | p(slechter) | Uitspraak |
|---|---|---|---|---|---|---|---|---|
| `/boeken` mobile | lcpMs | prod → zonder-stripe | 15/15 | 2,83 → 2,84 s | 4,51 → 3,58 s | 0.79 (0.50–1.27) | 0.192 | **gelijk** |
| `/boeken` mobile | fcpMs | prod → zonder-stripe | 15/15 | 1,12 → 1,11 s | 2,18 → 1,51 s | 0.69 (0.38–1.52) | 0.796 | **gelijk** |
