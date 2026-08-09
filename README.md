# T4XI.nl — Next.js

Migratie van de statische site (v14) naar Next.js 14 App Router + Supabase,
met het T4XI design system v2 (officieel Stone-schema).

## Starten

```bash
npm install
cp .env.example .env.local   # vul Supabase anon key + Google Places key in
npm run dev                  # http://localhost:3000
```

## Wat zit erin

- **Design system** als Tailwind tokens (`tailwind.config.ts`) — fog, card, ink, stone, line, type scale
- **Scroll reveal** via IntersectionObserver in React (`components/ui/ScrollReveal.tsx`) — de v14 Safari race condition is hiermee structureel opgelost, met prefers-reduced-motion support
- **Adres-autocomplete** (`components/booking/AddressAutocomplete.tsx`):
  - PDOK BAG Locatieserver als primary (geen key nodig)
  - Google Places API (New) als fallback via `/api/places` — key blijft server-side
- **Security headers** in `next.config.mjs` conform CLAUDE.md (CSP, HSTS, X-Frame-Options)
- **Supabase client** (`lib/supabase.ts`) voor project `t4xi-address-system`
- **Sanity CMS** voor de gelokaliseerde dienstenpagina en vloot, met ingebedde
  Studio op `/studio`, conceptweergave en een volledige codefallback
- Pagina's: home, diensten, tarieven, over-ons, boeken

## Build & deploy

```bash
npm install
cp .env.example .env.local        # vul waarden in (zie hieronder)
npm run lint
npm run typecheck
npm run build                     # alles groen vóór deploy
npm run start                     # lokale productie-check op :3000
```

Database (na review van de migratie):

```bash
supabase link --project-ref ajdsiklxfmmgisdvarhv
supabase db pull                  # bestaande 6 migraties in de repo halen
supabase db push                  # past 20260705_fix_addresses_rls.sql toe
```

Zie `SECURITY_NOTES.md` voor het waarom, de testqueries na deploy en de
rollback-procedure (`supabase/rollback_20260705_addresses_rls.sql`).

### .env.local

| Variabele | Waar te vinden | Client/server |
|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | Supabase dashboard → Settings → API | client (publiek) |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | idem | client (publiek, RLS is leidend) |
| GOOGLE_PLACES_API_KEY | Google Cloud Console | ALLEEN server — nooit NEXT_PUBLIC |
| NEXT_PUBLIC_SANITY_PROJECT_ID | Sanity projectinstellingen | client (publiek) |
| SANITY_API_READ_TOKEN | Sanity Viewer-token | ALLEEN server — nooit NEXT_PUBLIC |

### Vóór productie (owner)

- [x] Telefoonnummer ingevuld: 0634 74 45 22 (Header, Footer, error.tsx, JSON-LD)
- [ ] RLS-migratie reviewen en pushen
- [ ] `supabase db pull` gedraaid zodat het volledige schema in de repo staat
- [ ] Logo aanleveren voor favicon + OG-image

## Roadmap

1. Prijsberekening in `/boeken`: PDOK lookup → afstand → tarief (Ride/Business/Vaste Klant)
2. Boeking opslaan via bestaande `create_booking` RPC
3. Volgende CMS-fase: overige redactionele pagina's na evaluatie van diensten en vloot

## CMS

De CMS-architectuur, veilige eerste import, redactionele workflow en productie-
activering staan in [`docs/sanity-cms.md`](docs/sanity-cms.md).

## Audit 2026-07-05

Zie het eindrapport in de chat. Kernpunten:
- `supabase/migrations/20260705_fix_addresses_rls.sql` — kritieke RLS-fix, NOG NIET toegepast
- Telefoonnummer 0634 74 45 22 is ingevuld (Header, Footer, error.tsx, JSON-LD)
- next-sanity voedt diensten en vloot; tarieven en boekingen blijven buiten het CMS
