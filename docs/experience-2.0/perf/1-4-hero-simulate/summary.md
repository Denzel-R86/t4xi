<!-- gegenereerd door scripts/baseline/measure.mjs (2026-10-08T22:59:10.462Z) -->
# Meting `1-4-hero-simulate`

Lighthouse 13.5.0, throttling `simulate`, cache `cold`, 15 runs per cel (geïnterleaved), max load1 4, benchmarkIndex-mediaan 2909, protocol consistent: ja.

| Cel | n (fout/uitgesl.) | LCP mediaan | LCP p75 | LCP IQR | LCP modi | FCP mediaan | FCP p75 | FCP modi | TBT mediaan | Score mediaan |
|---|---|---|---|---|---|---|---|---|---|---|
| `/` mobile · basis | 15 (0/0) | 3,70 s | 3,70 s | 0,01 s | unimodaal | 1,21 s | 1,21 s | unimodaal | 8 ms | 89 |
| `/` mobile · kandidaat | 15 (0/0) | 3,70 s | 3,71 s | 0,01 s | unimodaal | 1,21 s | 1,22 s | unimodaal | 8 ms | 89 |
| `/` desktop · basis | 15 (0/0) | 0,77 s | 0,78 s | 0,01 s | unimodaal | 0,33 s | 0,33 s | unimodaal | 0 ms | 100 |
| `/` desktop · kandidaat | 15 (0/0) | 0,78 s | 0,79 s | 0,01 s | unimodaal | 0,33 s | 0,34 s | unimodaal | 0 ms | 100 |

LCP-elementen per cel:
- `/` mobile · basis: `main#content > section.grid > figure.relative > img.object-cover` (15×, "Passagier ontspannen op de achterbank, chauffeur staat klaar")
- `/` mobile · kandidaat: `main#content > section.grid > figure.relative > img.object-cover` (15×, "Passagier ontspannen op de achterbank, chauffeur staat klaar")
- `/` desktop · basis: `main#content > section.grid > figure.relative > img.object-cover` (15×, "Passagier ontspannen op de achterbank, chauffeur staat klaar")
- `/` desktop · kandidaat: `main#content > section.grid > figure.relative > img.object-cover` (15×, "Passagier ontspannen op de achterbank, chauffeur staat klaar")

## Gate (§10, eerste variant = basis)

| Cel | Metriek | Basis → kandidaat | n | mediaan A → B | p75 A → B | ratio p75 (95%-BI) | p(slechter) | Uitspraak |
|---|---|---|---|---|---|---|---|---|
| `/` mobile | lcpMs | basis → kandidaat | 15/15 | 3,70 → 3,70 s | 3,70 → 3,71 s | 1.00 (1.00–1.00) | 0.170 | **geen-regressie** (gate gehaald) |
| `/` mobile | fcpMs | basis → kandidaat | 15/15 | 1,21 → 1,21 s | 1,21 → 1,22 s | 1.00 (1.00–1.00) | 0.455 | **geen-regressie** (gate gehaald) |
| `/` desktop | lcpMs | basis → kandidaat | 15/15 | 0,77 → 0,78 s | 0,78 → 0,79 s | 1.01 (1.00–1.02) | 0.026 | **geen-regressie** (gate gehaald) |
| `/` desktop | fcpMs | basis → kandidaat | 15/15 | 0,33 → 0,33 s | 0,33 → 0,34 s | 1.01 (1.00–1.02) | 0.018 | **geen-regressie** (gate gehaald) |
