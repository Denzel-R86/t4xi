#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Bouwt de socialbeelden in public/social/ — één merksysteem over alle posts.

    python3 scripts/social/build-images.py

BRONFOTO'S — assets/social/
    Bestandsnaam bepaalt waar een foto terechtkomt:

        <pijler>--<omschrijving>.jpg

    De pijler vóór het dubbele streepje moet overeenkomen met de kolom
    `pijler` in posts.csv, kleine letters en zonder spaties:

        schiphol--avond.jpg              -> posts met pijler "Schiphol"
        vasteprijs--dashboard.jpg        -> pijler "Vaste prijs"
        schiphol+bagage--terminal.jpg    -> beide pijlers
        algemeen--nachtstraat.jpg        -> vulfoto, bruikbaar bij elke pijler

    Foto's bijplaatsen = bestand in assets/social/ zetten en dit script
    opnieuw draaien. Meer foto's per pijler betekent minder tekstkaarten.
    Vierkant werkt het beste; de rest wordt centraal bijgesneden.

UITVOER — public/social/, één bestand per post. Posts zonder passende foto
krijgen een tekstkaart in dezelfde huisstijl.
"""
import csv
import html
import os
import subprocess
import sys
import textwrap

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BRON = os.path.join(ROOT, "assets", "social")
UIT = os.path.join(ROOT, "public", "social")
DATA = os.path.join(ROOT, "scripts", "social", "posts.csv")
TMP = os.path.join(ROOT, ".next", "cache", "social-build")

GROND, INKT, AMBER, ZACHT = "#0F1519", "#F2F5F6", "#DCA24C", "#9AA8B0"
MARGE, BASIS, MAAT = 96, 872, 1080

# Curatie: deze posts krijgen bewust een specifieke foto, ongeacht de pijler.
# Sleutel is de kolom `idx` in posts.csv.
CURATIE = {
    2:  "vasteprijs+fairfare--dashboard",                       # leeg scherm bij "geen taxameter"
    8:  "schiphol+luchthavens+bagage+chauffeur--transfer-terminal",  # chauffeur ontvangt iemand
    14: "schiphol+luchthavens+bagage+chauffeur--transfer-terminal",  # koffer bij bagagepost
}

# Hoe vaak dezelfde foto in de hele reeks mag terugkeren. Is elke kandidaat
# op, dan wint een tekstkaart: liever variatie dan een feed vol dezelfde auto.
# Plaats je foto's bij in assets/social/, dan verschuift dit vanzelf.
MAX_HERHALING = 3


def sleutel(pijler):
    return pijler.lower().replace(" ", "").replace("&", "")


def pools():
    """Bronfoto's groeperen op de pijler vóór het dubbele streepje."""
    if not os.path.isdir(BRON):
        sys.exit(f"Bronmap ontbreekt: {BRON}")
    p = {}
    for f in sorted(os.listdir(BRON)):
        if not f.lower().endswith((".jpg", ".jpeg", ".png")):
            continue
        stam = os.path.splitext(f)[0]
        kop = stam.split("--")[0] if "--" in stam else "algemeen"
        # Een foto mag meerdere pijlers bedienen: schiphol+bagage--terminal.jpg
        for groep in kop.split("+"):
            p.setdefault(groep, []).append(stam)
    return p


def breek(kop):
    """Gebalanceerd afbreken: zo min mogelijk regels, dan zo gelijk mogelijk lang."""
    beste = None
    for w in range(14, 34):
        r = textwrap.wrap(kop, width=w)
        if not r:
            continue
        score = (len(r), max(map(len, r)) - min(map(len, r)))
        if beste is None or score < beste[0]:
            beste = (score, r)
    return beste[1] if beste else [kop]


def overlay(kop, op_foto):
    regels = breek(kop)
    px = {1: 74, 2: 66, 3: 56}.get(len(regels), 46)
    lh = int(px * 1.20)
    top = BASIS - (len(regels) - 1) * lh
    tekst = "".join(
        f'<text x="{MARGE}" y="{top + i * lh}" font-family="Baskerville, Georgia, serif" '
        f'font-size="{px}" fill="{INKT}">{html.escape(r)}</text>'
        for i, r in enumerate(regels))
    scrim = ('<rect width="1080" height="1080" fill="url(#boven)"/>'
             '<rect width="1080" height="1080" fill="url(#onder)"/>') if op_foto else ""
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{MAAT}" height="{MAAT}" viewBox="0 0 1080 1080">
<defs>
 <linearGradient id="onder" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0.34" stop-color="#0B1114" stop-opacity="0"/>
  <stop offset="0.68" stop-color="#0B1114" stop-opacity="0.74"/>
  <stop offset="1" stop-color="#0B1114" stop-opacity="0.95"/>
 </linearGradient>
 <linearGradient id="boven" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#0B1114" stop-opacity="0.58"/>
  <stop offset="0.20" stop-color="#0B1114" stop-opacity="0"/>
 </linearGradient>
</defs>
{scrim}
<text x="{MARGE}" y="132" font-family="Helvetica Neue, Helvetica, sans-serif" font-size="26"
      font-weight="600" letter-spacing="6" fill="{AMBER}">T4XI</text>
<rect x="{MARGE}" y="158" width="78" height="3" fill="{AMBER}"/>
{tekst}
<text x="{MARGE}" y="972" font-family="Helvetica Neue, Helvetica, sans-serif" font-size="25" fill="{ZACHT}">t4xi.nl</text>
</svg>'''


def toewijzen(posts, pool):
    """Per post een achtergrond kiezen, of None voor een tekstkaart.

    Volgorde: curatie, dan een foto uit de eigen pijler, dan een vulfoto om
    te voorkomen dat er meer dan twee kaarten op rij in de feed staan.
    Nooit dezelfde achtergrond binnen een gridrij (venster van 3).
    """
    keuze, gebruik, reeks = {}, {}, 0
    recent = []

    def vrij(kandidaten):
        """Minst gebruikte foto die niet in de vorige twee posts zat."""
        opties = [k for k in kandidaten
                  if gebruik.get(k, 0) < MAX_HERHALING and k not in recent[-2:]]
        if not opties:
            return None
        return min(opties, key=lambda k: gebruik.get(k, 0))

    for p in posts:
        i = int(p["idx"])
        groep = sleutel(p["pijler"])
        gekozen = None
        if i in CURATIE and CURATIE[i] in sum(pool.values(), []):
            gekozen = CURATIE[i]
        elif groep in pool:
            gekozen = vrij(pool[groep])
        if p["kanaal"] == "instagram":
            if gekozen is None:
                reeks += 1
                if reeks >= 3 and pool.get("algemeen"):
                    gekozen = vrij(pool["algemeen"])
                    reeks = 0
            else:
                reeks = 0
        if gekozen:
            recent.append(gekozen)
            gebruik[gekozen] = gebruik.get(gekozen, 0) + 1
        keuze[i] = gekozen
    return keuze


def run(*a):
    subprocess.run(a, check=True, capture_output=True)


def main():
    posts = list(csv.DictReader(open(DATA, encoding="utf-8")))
    pool = pools()
    keuze = toewijzen(posts, pool)

    os.makedirs(TMP, exist_ok=True)
    os.makedirs(UIT, exist_ok=True)

    # achtergronden eenmalig naar vierkant
    achtergrond = {}
    for stam in {v for v in keuze.values() if v}:
        for ext in (".jpg", ".jpeg", ".png"):
            src = os.path.join(BRON, stam + ext)
            if os.path.exists(src):
                break
        doel = os.path.join(TMP, stam + ".jpg")
        run("magick", src, "-resize", f"{MAAT}x{MAAT}^", "-gravity", "center",
            "-extent", f"{MAAT}x{MAAT}", "-quality", "92", doel)
        achtergrond[stam] = doel

    vlak = os.path.join(TMP, "_vlak.png")
    run("magick", "-size", f"{MAAT}x{MAAT}", f"xc:{GROND}", vlak)

    for f in os.listdir(UIT):
        os.remove(os.path.join(UIT, f))

    manifest = []
    for p in posts:
        i = int(p["idx"])
        stam = keuze[i]
        naam = f"{p['datum']}-{i:02d}-{'foto' if stam else 'kaart'}.jpg"
        svg, png = os.path.join(TMP, "_o.svg"), os.path.join(TMP, "_o.png")
        open(svg, "w", encoding="utf-8").write(overlay(p["kop"], bool(stam)))
        run("rsvg-convert", "-w", str(MAAT), "-h", str(MAAT), svg, "-o", png)
        run("magick", achtergrond[stam] if stam else vlak, png, "-composite",
            "-quality", "88", os.path.join(UIT, naam))
        manifest.append([i, p["datum"], p["kanaal"], naam, stam or "kaart", p["kop"]])

    with open(os.path.join(os.path.dirname(DATA), "manifest.csv"), "w",
              newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["idx", "datum", "kanaal", "bestand", "achtergrond", "kop"])
        w.writerows(manifest)

    fotos = sum(1 for r in manifest if r[4] != "kaart")
    mb = sum(os.path.getsize(os.path.join(UIT, f)) for f in os.listdir(UIT)) / 1024 / 1024
    print(f"bronfoto's  : {sum(len(v) for v in pool.values())} in {len(pool)} pijlers "
          f"({', '.join(sorted(pool))})")
    print(f"beelden     : {len(manifest)}  ({fotos} op foto, {len(manifest)-fotos} kaart)")
    print(f"public/social: {len(os.listdir(UIT))} bestanden, {mb:.1f} MB")


if __name__ == "__main__":
    main()
