/**
 * Communicatielog — de idempotency-rail en de meetbaarheid in één.
 *
 * Claimen gebeurt VÓÓR het verzenden. De unieke `dedup_key` in de database is
 * de echte garantie: twee gelijktijdige pogingen kunnen niet allebei claimen,
 * dus een dubbele webhook of een retry levert nooit een tweede bericht op.
 *
 * **Gedrag als de store niet bereikbaar is** — dit is bewust géén fail-open:
 *
 *   · De RPC bestaat nog niet én `COMMUNICATION_SCHEMA_READY` staat niet aan →
 *     `degraded`. Dat is uitsluitend het overgangsmoment: er valt niets te
 *     dedupliceren omdat de store nog niet bestaat. Zodra die vlag aan staat is
 *     een ontbrekende RPC géén migratiemoment meer maar een schema-regressie,
 *     en die faalt hard.
 *   · De RPC bestaat maar de aanroep faalt (verbinding, timeout, permissie) →
 *     `unavailable`. Dan is er wél iets te beschermen en is de bescherming weg.
 *     De orchestrator blokkeert dan de verzending en slaat alarm, want juist bij
 *     een databasestoring ontstaat anders dubbele klantcommunicatie.
 *
 * **Deduplicatie en observability zijn twee verantwoordelijkheden.** `claim()`
 * dient de eerste, `record()` de tweede. Mag er zonder claim toch verstuurd
 * worden (zie `duplicatesArePossible`), dan blijft vastleggen alsnog verplicht:
 * `record()` probeert de regel na verzending alsnog te schrijven. Lukt ook dat
 * niet, dan is dat een eigen alert — nooit een stille aanname dat logging
 * optioneel was.
 *
 * Er belandt bewust geen boekingsinhoud in het log — geen adressen, prijzen,
 * vluchten of berichttekst. Alleen welk event, welke template, welk kanaal,
 * welke taal, welke ontvanger en welke stand.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Audience, CommunicationEventType, SubjectType } from "@/lib/communication/events";
import type { ChannelId } from "@/lib/communication/policies/channel";
import type { Locale } from "@/i18n/routing";
import { operationalAlert } from "@/lib/communication/alerting";
import { communicationSchemaReady } from "@/lib/config/environment";

export type ClaimInput = {
  dedupKey: string;
  eventType: CommunicationEventType;
  subjectType: SubjectType;
  subjectId: string;
  bookingId: string | null;
  templateId: string;
  audience: Audience;
  channel: ChannelId;
  locale: Locale;
  recipient: string;
};

export type ClaimResult =
  /** Dit bericht is van ons; versturen mag. */
  | { outcome: "claimed"; id: string }
  /** Een eerdere poging heeft dit bericht al opgepakt. */
  | { outcome: "duplicate"; id: string | null; existingStatus?: string }
  /** Store bestaat nog niet: versturen zonder dedup en zonder meting. */
  | { outcome: "degraded"; reason: string }
  /** Store hoort te bestaan maar antwoordt niet: bescherming weg, dus niet versturen. */
  | { outcome: "unavailable"; reason: string };

export type SettleInput = {
  provider?: string;
  providerMessageId?: string | null;
  error?: string;
  skipReason?: string;
};

export type DeliveryLog = {
  /** Deduplicatie: mag dit bericht verstuurd worden? */
  claim(input: ClaimInput): Promise<ClaimResult>;
  settle(id: string | null, status: string, extra?: SettleInput): Promise<void>;
  /**
   * Observability: leg een verzending vast die zónder claim is uitgegaan.
   * Retourneert false wanneer vastleggen niet lukte — de aanroeper moet dat
   * als verlies behandelen, niet als "hoefde niet".
   */
  record(input: ClaimInput, status: string, extra?: SettleInput): Promise<boolean>;
};

/**
 * Onderscheidt "de migratie is nog niet toegepast" van "de database hapert".
 * PostgREST meldt een onbekende functie als PGRST202, Postgres zelf als 42883.
 */
export function isMissingStore(error: { code?: string | null; message?: string }): boolean {
  const code = error.code ?? "";
  if (code === "PGRST202" || code === "42883") return true;
  return /could not find the function|does not exist/i.test(error.message ?? "");
}

export function supabaseDeliveryLog(supabase: SupabaseClient): DeliveryLog {
  return {
    async claim(input) {
      const { data, error } = await supabase.rpc("claim_communication_delivery", {
        p_dedup_key: input.dedupKey,
        p_event_type: input.eventType,
        p_subject_type: input.subjectType,
        p_subject_id: input.subjectId,
        p_booking_id: input.bookingId,
        p_template_id: input.templateId,
        p_audience: input.audience,
        p_channel: input.channel,
        p_locale: input.locale,
        p_recipient: input.recipient,
      });

      if (error) {
        if (isMissingStore(error)) {
          // Ná de uitrol is een ontbrekende RPC een regressie, geen overgang.
          if (communicationSchemaReady()) {
            operationalAlert(
              "schema_regression",
              `${input.dedupKey}: claim_communication_delivery ontbreekt terwijl het schema als uitgerold is gemarkeerd.`
            );
            return { outcome: "unavailable", reason: "schema_regression" };
          }
          operationalAlert(
            "idempotency_store_missing",
            `${input.dedupKey}: claim_communication_delivery bestaat niet — migratie nog niet toegepast.`
          );
          return { outcome: "degraded", reason: "store_not_installed" };
        }
        operationalAlert(
          "idempotency_store_unavailable",
          `${input.dedupKey}: ${error.message}`
        );
        return { outcome: "unavailable", reason: error.message };
      }

      const row = data as { claimed?: boolean; id?: string; status?: string } | null;
      if (row?.claimed === true && typeof row.id === "string") {
        return { outcome: "claimed", id: row.id };
      }
      return {
        outcome: "duplicate",
        id: typeof row?.id === "string" ? row.id : null,
        existingStatus: typeof row?.status === "string" ? row.status : undefined,
      };
    },

    async settle(id, status, extra) {
      if (!id) return;
      const { error } = await supabase.rpc("settle_communication_delivery", {
        p_id: id,
        p_status: status,
        p_provider: extra?.provider ?? null,
        p_provider_message_id: extra?.providerMessageId ?? null,
        p_error: extra?.error ?? null,
        p_skip_reason: extra?.skipReason ?? null,
      });
      // Een mislukte settle betekent dat het bericht wél uitging maar de stand
      // niet klopt. Dat is een meetprobleem, geen verzendprobleem — daarom een
      // alert en geen blokkade.
      if (error) operationalAlert("settle_failed", `${id} → ${status}: ${error.message}`);
    },

    async record(input, status, extra) {
      // Tweede kans: de claim kon mislukken terwijl de database inmiddels weer
      // bereikbaar is. Dezelfde RPC, dus de unieke sleutel blijft de rem — dit
      // kan nooit een dubbele regel opleveren.
      const claim = await this.claim(input);
      const id = claim.outcome === "claimed" || claim.outcome === "duplicate" ? claim.id : null;
      if (!id) return false;
      await this.settle(id, status, extra);
      return true;
    },
  };
}

/**
 * Voor aanroepers zonder databaseverbinding. Meldt zichzelf als `degraded`,
 * zodat de orchestrator weet dat er geen dedup-bescherming is en dat expliciet
 * kan wegen in plaats van het aan te nemen.
 */
export const unloggedDeliveryLog: DeliveryLog = {
  async claim() {
    return { outcome: "degraded", reason: "no_database_client" };
  },
  async settle() {},
  async record() {
    // Eerlijk: hier wordt niets vastgelegd. De orchestrator slaat daarop alarm.
    return false;
  },
};
