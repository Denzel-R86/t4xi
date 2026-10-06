<!-- gegenereerd door scripts/baseline/measure.mjs (2026-10-06T18:43:27.531Z) -->
# Meting `h2-diag-stripe-devtools`

Lighthouse 13.5.0, throttling `devtools`, cache `cold`, 15 runs per cel (geïnterleaved), max load1 4, benchmarkIndex-mediaan 2854, protocol consistent: ja.

| Cel | n (fout/uitgesl.) | LCP mediaan | LCP p75 | LCP IQR | LCP modi | FCP mediaan | FCP p75 | FCP modi | TBT mediaan | Score mediaan |
|---|---|---|---|---|---|---|---|---|---|---|
| `/boeken` mobile · prod | 15 (0/0) | 2,20 s | 2,26 s | 0,10 s | unimodaal | 2,20 s | 2,26 s | unimodaal | 121 ms | 96 |
| `/boeken` mobile · zonder-stripe | 15 (0/0) | 2,18 s | 2,25 s | 0,11 s | unimodaal | 2,18 s | 2,25 s | unimodaal | 22 ms | 96 |

LCP-elementen per cel:
- `/boeken` mobile · prod: `main#content > section.mx-auto > div > p.mt-4` (15×, "Vaste prijs vooraf, inclusief btw. Geen taxameter, geen verr")
- `/boeken` mobile · zonder-stripe: `main#content > section.mx-auto > div > p.mt-4` (15×, "Vaste prijs vooraf, inclusief btw. Geen taxameter, geen verr")

## Gate (§10, eerste variant = basis)

| Cel | Metriek | Basis → kandidaat | n | mediaan A → B | p75 A → B | ratio p75 (95%-BI) | p(slechter) | Uitspraak |
|---|---|---|---|---|---|---|---|---|
| `/boeken` mobile | lcpMs | prod → zonder-stripe | 15/15 | 2,20 → 2,18 s | 2,26 → 2,25 s | 1.00 (0.95–1.06) | 0.712 | **gelijk** |
| `/boeken` mobile | fcpMs | prod → zonder-stripe | 15/15 | 2,20 → 2,18 s | 2,26 → 2,25 s | 1.00 (0.95–1.06) | 0.712 | **gelijk** |
