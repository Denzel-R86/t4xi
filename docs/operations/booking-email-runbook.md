# Runbook boekingsmail

De boekingsmail is een server-only, best-effort notificatie via de Resend REST-API. Een ontbrekende configuratie of verzendfout mag de boeking en de API-response nooit beïnvloeden. De REST-payload gebruikt bewust `reply_to` (snake_case).

## Environment-contract

| Variabele | Verplicht | Contract |
| --- | --- | --- |
| `RESEND_API_KEY` | Voor verzending | Server-only API-key. Leeg: beide mails worden stil overgeslagen. Nooit loggen of committen. |
| `RESEND_FROM` | Aanbevolen voor productie | Afzender, bijvoorbeeld `T4XI <boeking@t4xi.nl>`. Voor echte klantlevering moet het domein in Resend geverifieerd zijn. Zonder waarde wordt de Resend-sandboxafzender gebruikt. |
| `OPS_EMAIL` | Nee | Interne ontvanger. Zonder waarde: `booking@t4xi.nl`. |
| `OPS_DASHBOARD_USERNAME` | Optioneel | Aparte server-only gebruikersnaam voor `/dashboard/invoices`; anders wordt de bestaande Brain-inlog gebruikt. |
| `OPS_DASHBOARD_PASSWORD` | Optioneel | Apart sterk server-only wachtwoord; anders wordt de bestaande Brain-inlog gebruikt. |

## Eenmalige productie-inrichting (handmatig)

1. Voeg `t4xi.nl` in Resend toe als verzenddomein en plaats de door Resend opgegeven SPF- en DKIM-records bij de DNS-provider.
2. Wacht tot Resend alle domeinrecords als geverifieerd toont.
3. Let op: `onboarding@resend.dev` is alleen een sandboxafzender en levert uitsluitend aan het e-mailadres van het eigen Resend-account. Gebruik die niet voor een echte klanttest.
4. Voeg in Vercel bij het juiste project en de juiste Production-environment `RESEND_API_KEY`, `RESEND_FROM` en zo nodig `OPS_EMAIL` toe. Gebruik voor `RESEND_FROM` een adres op het geverifieerde domein.
5. Start daarna zelf een nieuwe production deployment zodat de environment-waarden actief worden. Controleer dat er geen secret in buildlogs of repository staat.

## Verificatiechecklist

- [ ] Voer `npx tsx scripts/verify-booking-email.ts` uit zonder `--send`; er vindt geen netwerkverkeer plaats.
- [ ] Open de drie gemelde bestanden onder `tmp/booking-email-previews/` in een browser en controleer NL retour, EN luchthaven-arrival en offerte op aanvraag.
- [ ] Voer `npm run test:notifications`, `npm run test:rates` en `npm run test:payments` uit.
- [ ] Voer `npm run typecheck`, `npm run lint` en `npm run build` uit.
- [ ] Controleer in Resend dat `t4xi.nl` inclusief SPF/DKIM geverifieerd is en dat `RESEND_FROM` dit domein gebruikt.
- [ ] Zet voor een gecontroleerde live test lokaal `RESEND_API_KEY` en `RESEND_FROM`, en voer `npx tsx scripts/verify-booking-email.ts --send --to=<eigen-testadres>` uit. Beide door de mailer gemaakte berichten (klant en ops) moeten uitsluitend in dat testpostvak aankomen.
- [ ] Controleer onderwerp, inhoud, links en afzender in het testpostvak; controleer ook de twee succesvolle afleveringen in Resend.
- [ ] Maak daarna via de normale boekingsflow een testboeking en controleer dat een eventuele mailfout de boeking en HTTP-response niet verandert.
- [ ] Controleer dat `bookings.email_sent` alleen `true` wordt wanneer beide mails succesvol zijn verzonden.

## Factuurworkflow

1. De klantmail bevat altijd een PDF-boekingsbevestiging; dit document is nadrukkelijk geen factuur.
2. Open `/dashboard/invoices` en vul factuurnaam, volledig factuuradres en uitvoerend taxibedrijf in.
3. Is de boeking al betaald, dan wordt de definitieve factuur direct uitgegeven en verzonden. Anders gebeurt dit best-effort na het succesvolle Stripe-event.
4. Een uitgegeven factuur is in het scherm vergrendeld. Corrigeer deze nooit door het bestaande nummer te overschrijven; gebruik voor financiële correcties een afzonderlijke creditfactuurworkflow.
5. Controleer in Resend dat de factuurmail één PDF-bijlage heeft en op Delivered staat.
