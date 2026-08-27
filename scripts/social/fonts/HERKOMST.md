# Letters

Dezelfde snedes als de site, zodat een social beeld en t4xi.nl dezelfde
typografie tonen. Afgeleid uit de `next/font`-cache van deze repo en op één
gewicht vastgezet, omdat ImageMagick geen variabele assen kiest:

| Bestand | Bron | Gewicht | Rol |
|---|---|---|---|
| `PlayfairDisplay-Regular.ttf` | `next/font/google` — Playfair Display | 400 | koppen |
| `Outfit-Medium.ttf` | `next/font/google` — Outfit | 500 | woordmerk |
| `Inter-Regular.ttf` | `next/font/google` — Inter | 400 | `t4xi.nl` |

Alle drie SIL Open Font License 1.1.

Ze staan hier omdat ze niet in `~/Library/Fonts` zitten: `rsvg-convert` gebruikt
op macOS CoreText en zou stil terugvallen op Helvetica. `build-images.py` geeft
ImageMagick daarom een expliciet pad naar het bestand.
