<!-- gegenereerd door scripts/baseline/measure.mjs (2026-10-08T23:12:45.578Z) -->
# Meting `1-4-hero-devtools`

Lighthouse 13.5.0, throttling `devtools`, cache `cold`, 15 runs per cel (geïnterleaved), max load1 4, benchmarkIndex-mediaan 2901, protocol consistent: ja.

| Cel | n (fout/uitgesl.) | LCP mediaan | LCP p75 | LCP IQR | LCP modi | FCP mediaan | FCP p75 | FCP modi | TBT mediaan | Score mediaan |
|---|---|---|---|---|---|---|---|---|---|---|
| `/` mobile · basis | 15 (0/0) | 1,67 s | 1,70 s | 0,04 s | unimodaal | 1,65 s | 1,66 s | unimodaal | 16 ms | 99 |
| `/` mobile · kandidaat | 15 (0/0) | 1,68 s | 1,70 s | 0,03 s | unimodaal | 1,65 s | 1,67 s | unimodaal | 14 ms | 99 |

LCP-elementen per cel:
- `/` mobile · basis: `main#content > section.grid > figure.relative > img.object-cover` (15×, "Passagier ontspannen op de achterbank, chauffeur staat klaar")
- `/` mobile · kandidaat: `main#content > section.grid > figure.relative > img.object-cover` (15×, "Passagier ontspannen op de achterbank, chauffeur staat klaar")

## Gate (§10, eerste variant = basis)

| Cel | Metriek | Basis → kandidaat | n | mediaan A → B | p75 A → B | ratio p75 (95%-BI) | p(slechter) | Uitspraak |
|---|---|---|---|---|---|---|---|---|
| `/` mobile | lcpMs | basis → kandidaat | 15/15 | 1,67 → 1,68 s | 1,70 → 1,70 s | 1.00 (0.99–1.02) | 0.085 | **geen-regressie** (gate gehaald) |
| `/` mobile | fcpMs | basis → kandidaat | 15/15 | 1,65 → 1,65 s | 1,66 → 1,67 s | 1.00 (0.99–1.01) | 0.320 | **geen-regressie** (gate gehaald) |
