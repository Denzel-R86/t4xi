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

UITVOER — public/social/, één bestand per post.

Een tekstkaart is een volwaardige postvorm, geen terugval. Zonder eigen,
geregisseerde fotografie draagt typografie het beeld beter dan voorraadmateriaal
dat een tweede of derde keer langskomt: herhaling valt de kijker eerder op dan
een kaart. Vandaar MAX_HERHALING = 1.

HUISSTIJL — Design System v14 "Stone Premium licht", gelijk aan t4xi.nl.
    kleuren   overgenomen uit tailwind.config.ts, niet hier bedacht
    letters   scripts/social/fonts/ (zie HERKOMST.md)
    monogram  T4XI_Brand_Assets/Fase_1_Core_Identity/01_Master_Monogram_Navy.svg
    watermerk conventie uit Fase_3_Digital_Assets/05_Watermerk_Navy.svg
    clear space  1x bovenbalkhoogte (Fase_2/02_Clear_Space.svg)

Creative Direction v1.1 die in de code zit: koppen breken op betekenis (regel 7,
zie de kolom `regels` in posts.csv), lijnen zijn 1px en horizontaal (regel 18),
cijfers zijn exact (regel 22).

Tekst gaat via ImageMagick met een expliciet fontpad. Niet via rsvg-convert:
dat gebruikt op macOS CoreText, vindt Playfair Display en Outfit niet en valt
stil terug op Helvetica. Het monogram gaat wel door rsvg-convert — pure paden.
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

# tokens, letterlijk uit tailwind.config.ts ("Stone Premium licht")
FOG        = "#F5F3F1"              # bg-base      — warm stone canvas
INK        = "#1F2730"              # ink          — primaire tekst
ACCENT     = "#28313B"              # accent navy  — ook de merkkleur uit README.txt
STONE_TEXT = "#5F666D"              # stone.text   — secundaire tekst
LIJN       = "rgba(31,39,48,0.18)"  # line-strong  — de horizonlijn
WIT        = "#FFFFFF"
LIJN_WIT   = "rgba(255,255,255,0.32)"
TEKST_WIT  = "rgba(255,255,255,0.82)"

FONTS    = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")
PLAYFAIR = os.path.join(FONTS, "PlayfairDisplay-Regular.ttf")
OUTFIT   = os.path.join(FONTS, "Outfit-Medium.ttf")
INTER    = os.path.join(FONTS, "Inter-Regular.ttf")

# monogram: paden uit 01_Master_Monogram_Navy.svg, bbox x52-438 / y34-414
MONO = ('<path d="M52 74L92 34H382L342 74Z"/>'
        '<path d="M132 88H196V258L132 322Z"/>'
        '<path d="M132 362L378 116V312H438L398 352H378V414H314V352H232'
        'L272 312H314V220L196 338L172 362Z"/>')
MONO_B, MONO_H, BALK = 386, 380, 40   # bbox + bovenbalk = 1x clear space

MARGE, MAAT, BASIS = 96, 1080, 872   # BASIS = onderste tekstregel op foto

# --- kleurbewerking --------------------------------------------------------
# Bronfoto's komen uit verschillende hoeken: eigen campagnebeelden (donker,
# ingetogen) naast CC0-materiaal (helderder, warmer, verzadigder). Zonder
# bewerking staan er twee merken in één feed. Deze grade trekt ze samen en
# maakt tegelijk de witte koptekst leesbaarder.
#
# Het is een BOUWSTAP, geen bewerking van assets/social/: de originelen blijven
# onaangeroerd, dus bijstellen is een parameter wijzigen en opnieuw draaien.
# Gemeten over assets/social/ (2026-08-27): eigen beeld zit gemiddeld op 28%
# verzadiging en 34% helderheid, CC0-materiaal op 29% en 38% — als groepen
# vrijwel gelijk. De toonbreuk in de feed komt niet van de herkomst maar van
# uitschieters in BEIDE sets: dagtochten--dusseldorf staat op 68% helderheid,
# dagtochten--keulen op 64% verzadiging, luchthavens--vleugel op 51/56.
#
# Een vaste correctie helpt daar niet: te zwak voor de uitschieters en te
# sterk voor beeld dat al goed zit (de Model Y verloor er schaduwdetail door).
# Daarom per foto naar een gemeenschappelijk doel toe, gedempt zodat beeld dat
# al klopt vrijwel onaangeroerd blijft.
DOEL_S, DOEL_L = 28.0, 34.0   # verzadiging en helderheid in procent
DEMPING = 0.7                 # 1.0 = volledig naar het doel, 0 = niets
GRENS = (0.55, 1.00)          # uitsluitend temperen: nooit optrekken
#
# De bovengrens staat bewust op 1.00. Beeld dat al donker en ingetogen is —
# de Model Y, de achterbank — is een bewuste keuze en geen afwijking; dat
# lichter maken zou de grade tegen het merk in laten werken.
CONTRAST = "2x50%"            # zachte S-curve; houdt de schaduwen open
LOGO_H, WM_H = 72, 640
WM_KAART, WM_FOTO = 0.08, 0.09        # watermerkdekking
KOPMAAT = {1: 104, 2: 96, 3: 84, 4: 72}

# Curatie: deze posts krijgen bewust een specifieke achtergrond, ongeacht de
# pijler. Sleutel is de kolom `idx` in posts.csv. De waarde "kaart" dwingt een
# tekstkaart af — voor posts waar geen enkele foto past, of waar typografie het
# betere beeld IS.
CURATIE = {
    2:  "vasteprijs+fairfare--dashboard",                           # leeg scherm bij "geen taxameter"
    8:  "schiphol+luchthavens+bagage+chauffeur--transfer-terminal",  # chauffeur ontvangt iemand
    9:  "vloot+station--lynk-co",                                   # Den Haag: geen stadsfoto in de set
    14: "schiphol+luchthavens+bagage+chauffeur--transfer-terminal",  # koffer bij bagagepost
    36: "kaart",   # Sinterklaas: kerstverlichting leest half november als te vroeg
    41: "kaart",   # Black Friday: "geen korting" werkt als typografie, niet als foto
}

KAART = "kaart"   # curatiewaarde die een tekstkaart afdwingt

# Hoe vaak dezelfde foto in de hele reeks mag terugkeren.
#
# Op 1: elke foto verschijnt precies één keer. Een post waarvoor geen ongebruikte
# foto meer is, wordt een tekstkaart — en dat is de betere uitkomst. Op 3 stond
# de feed vol drievoudige herhalingen (hetzelfde regenraam, dezelfde roltrap),
# wat harder afstraalt dan een kaart.
#
# Meer eigen fotografie in assets/social/ verschuift de verhouding vanzelf naar
# meer foto's, zonder dat deze waarde omhoog hoeft.
MAX_HERHALING = 1


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
    """Gebalanceerd afbreken: zo min mogelijk regels, dan zo gelijk mogelijk lang.

    Noodgreep. Creative Direction v1.1 regel 7 wil de regelval op betekenis
    geschreven zien, niet berekend. Zet de regels in de kolom `regels` van
    posts.csv, gescheiden door een sluisteken:

        Waarom er geen|taxameter in|onze auto's zit

    Wat daar leeg blijft komt hier terecht en wordt na afloop geteld gemeld.
    """
    beste = None
    for w in range(14, 34):
        r = textwrap.wrap(kop, width=w)
        if not r:
            continue
        score = (len(r), max(map(len, r)) - min(map(len, r)))
        if beste is None or score < beste[0]:
            beste = (score, r)
    return beste[1] if beste else [kop]


def monogram(pad, kleur, hoogte):
    """Monogram op maat. Alleen paden, dus geen fontafhankelijkheid."""
    breedte = round(hoogte * MONO_B / MONO_H)
    svg = pad + ".svg"
    open(svg, "w", encoding="utf-8").write(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{breedte}" height="{hoogte}" '
        f'viewBox="52 34 {MONO_B} {MONO_H}"><g fill="{kleur}">{MONO}</g></svg>')
    run("rsvg-convert", "-w", str(breedte), "-h", str(hoogte), svg, "-o", pad)
    os.remove(svg)
    return breedte


def merkframe(cmd, kleur, kleur_lijn, dekking):
    """Het frame dat elke T4XI-post deelt: watermerk, monogram, woordmerk, lijn."""
    logo, wm = os.path.join(TMP, "_logo.png"), os.path.join(TMP, "_wm.png")
    logo_b = monogram(logo, kleur, LOGO_H)
    wm_b = monogram(wm, kleur, WM_H)
    run("magick", wm, "-alpha", "set", "-channel", "A",
        "-evaluate", "multiply", str(dekking), "+channel", wm)
    vrij = round(LOGO_H * BALK / MONO_H)          # clear space, geschaald
    return cmd + [
        # watermerk gecentreerd achter de inhoud — conform 05_Watermerk_*.svg
        wm, "-geometry", f"+{(MAAT - wm_b)//2}+{(MAAT - WM_H)//2}", "-composite",
        logo, "-geometry", f"+{MARGE}+72", "-composite",
        # woordmerk, letterspacing 0.19em zoals de eyebrow op de site
        "-font", OUTFIT, "-pointsize", "22", "-fill", kleur,
        "-kerning", "4.18",
        "-annotate", f"+{MARGE + logo_b + vrij * 2}+{72 + LOGO_H//2 + 8}", "T4XI",
        # de horizonlijn: 1px, horizontaal, vanaf de linkermarge (regel 18)
        "-fill", kleur_lijn,
        "-draw", f"rectangle {MARGE},{72 + LOGO_H + 34} {MAAT - MARGE},{72 + LOGO_H + 34}",
    ]


def grade(pad):
    """Per foto de factoren om naar DOEL_S/DOEL_L te bewegen, gedempt en begrensd."""
    r = subprocess.run(["magick", pad, "-colorspace", "HSL", "-format",
                        "%[fx:mean.g*100] %[fx:mean.b*100]", "info:"],
                       capture_output=True, text=True, check=True)
    sat, licht = (float(v) for v in r.stdout.split())
    laag, hoog = GRENS

    def factor(nu, doel):
        if nu <= 0.5:
            return 1.0
        return min(hoog, max(laag, 1 + DEMPING * (doel / nu - 1)))

    return factor(licht, DOEL_L) * 100, factor(sat, DOEL_S) * 100


def breedte_van(tekst, px):
    """Werkelijke tekstbreedte in pixels, gemeten door ImageMagick zelf."""
    r = subprocess.run(["magick", "-font", PLAYFAIR, "-pointsize", str(px),
                        f"label:{tekst}", "-format", "%w", "info:"],
                       check=True, capture_output=True, text=True)
    return int(r.stdout.strip())


def pas_maat(regels):
    """Grootste maat waarbij de breedste regel binnen de kolom past.

    De maat per regelaantal is het uitgangspunt; lange koppen krimpen tot ze
    passen. Meten in plaats van schatten, omdat posts.csv koppen bevat die veel
    langer zijn dan de geschreven koppen waarvoor KOPMAAT is gekozen.
    """
    kolom = MAAT - 2 * MARGE
    px = KOPMAAT.get(len(regels), 60)
    while px > 40 and max(breedte_van(r, px) for r in regels) > kolom:
        px -= 2
    return px


def beeld(doel, kop, regels, achtergrond):
    """Eén post. achtergrond=None levert een tekstkaart op stone-canvas."""
    op_foto = achtergrond is not None
    if op_foto:
        # Scrim met de verloopstops van de vorige pijplijn: die zijn afgestemd op
        # tekst die onderaan staat. Het onderste verloop loopt tot ruim boven de
        # helft door, zodat ook een kop van drie regels op donker rust.
        scrim, basis = os.path.join(TMP, "_scrim.png"), os.path.join(TMP, "_basis.png")
        open(scrim + ".svg", "w", encoding="utf-8").write(f'''<svg xmlns="http://www.w3.org/2000/svg" width="{MAAT}" height="{MAAT}">
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
<rect width="{MAAT}" height="{MAAT}" fill="url(#onder)"/>
<rect width="{MAAT}" height="{MAAT}" fill="url(#boven)"/></svg>''')
        run("rsvg-convert", "-w", str(MAAT), "-h", str(MAAT), scrim + ".svg", "-o", scrim)
        os.remove(scrim + ".svg")
        run("magick", achtergrond, scrim, "-composite", basis)
        cmd = merkframe(["magick", basis], WIT, LIJN_WIT, WM_FOTO)
        kleur_kop, kleur_slot, kwaliteit = WIT, TEKST_WIT, 88
    else:
        cmd = merkframe(["magick", "-size", f"{MAAT}x{MAAT}", f"xc:{FOG}"],
                        ACCENT, LIJN, WM_KAART)
        kleur_kop, kleur_slot, kwaliteit = INK, STONE_TEXT, 90

    n = len(regels)
    px = pas_maat(regels)
    lh = int(px * 1.18)
    # Op foto onderaan, waar het scrim zit; op een vlak doek gecentreerd.
    top = (BASIS - (n - 1) * lh) if op_foto else (MAAT - n * lh) // 2 + int(px * 0.74) + 20
    cmd += ["-font", PLAYFAIR, "-pointsize", str(px), "-fill", kleur_kop, "-kerning", "0"]
    for i, r in enumerate(regels):
        cmd += ["-annotate", f"+{MARGE}+{top + i * lh}", r]
    cmd += ["-font", INTER, "-pointsize", "24", "-fill", kleur_slot,
            "-annotate", f"+{MARGE}+{MAAT - 96}", "t4xi.nl",
            "-quality", str(kwaliteit), doel]
    run(*cmd)


def toewijzen(posts, pool):
    """Per post een achtergrond kiezen, of None voor een tekstkaart.

    Volgorde: curatie, dan een foto uit de eigen pijler, dan een vulfoto.
    Nooit dezelfde achtergrond binnen een gridrij (venster van 3).

    Foto's worden over de hele kalender uitgesmeerd, niet op volgorde
    opgemaakt. Zonder die rem raakt de voorraad halverwege op en bestaat de
    staart van het jaar volledig uit kaarten — precies de maanden (december)
    waar het meeste van afhangt. De rem houdt het opgenomen aandeel gelijk aan
    het aandeel dat over de hele reeks haalbaar is.
    """
    keuze, gebruik, reeks = {}, {}, 0
    recent = []

    beschikbaar = len(set(sum(pool.values(), []))) * MAX_HERHALING
    tempo = min(1.0, beschikbaar / max(1, len(posts)))
    gezien = genomen = 0

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
        gezien += 1
        gekozen = None

        # Curatie gaat voor, maar mag de herhaalgrens niet omzeilen: een
        # bewuste keuze voor dezelfde foto bij drie posts is nog steeds
        # drie keer dezelfde foto in de feed.
        if CURATIE.get(i) == KAART:
            gekozen = None
        elif (i in CURATIE and CURATIE[i] in sum(pool.values(), [])
                and gebruik.get(CURATIE[i], 0) < MAX_HERHALING):
            gekozen = CURATIE[i]
        elif groep in pool and genomen < tempo * gezien:
            gekozen = vrij(pool[groep])

        if p["kanaal"] == "instagram":
            if gekozen is None:
                reeks += 1
                if reeks >= 3 and pool.get("algemeen") and genomen < tempo * gezien:
                    gekozen = vrij(pool["algemeen"])
                    reeks = 0
            else:
                reeks = 0

        if gekozen:
            recent.append(gekozen)
            gebruik[gekozen] = gebruik.get(gekozen, 0) + 1
            genomen += 1
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
            "-extent", f"{MAAT}x{MAAT}",
            "-modulate", "{:.1f},{:.1f},100".format(*grade(src)),
            "-sigmoidal-contrast", CONTRAST,
            "-quality", "92", doel)
        achtergrond[stam] = doel

    for f in os.listdir(UIT):
        os.remove(os.path.join(UIT, f))

    manifest, ongeschreven = [], []
    for p in posts:
        i = int(p["idx"])
        stam = keuze[i]
        # STABIELE naam: datum + idx, verder niets. Eerder stond er -foto/-kaart
        # in, maar of een post een foto krijgt verschuift bij elke herbouw
        # (MAX_HERHALING, nieuwe bronfoto's). Daardoor veranderde de URL en
        # braken alle concepten die al in de planner stonden. Deze naam blijft
        # gelijk zolang datum en idx gelijk blijven.
        naam = f"{p['datum']}-{i:02d}.jpg"
        # regelval bij voorkeur geschreven (regel 7); anders berekend en gemeld
        geschreven = [r.strip() for r in (p.get("regels") or "").split("|") if r.strip()]
        if not geschreven:
            geschreven = breek(p["kop"]); ongeschreven.append(i)
        beeld(os.path.join(UIT, naam), p["kop"], geschreven,
              achtergrond[stam] if stam else None)
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
    if ongeschreven:
        print(f"\nLET OP: {len(ongeschreven)} van de {len(manifest)} koppen zijn "
              f"automatisch afgebroken.\nCreative Direction regel 7 wil die regelval "
              f"geschreven zien — vul de kolom `regels` in posts.csv.\nidx: "
              f"{', '.join(map(str, ongeschreven))}")


if __name__ == "__main__":
    main()
