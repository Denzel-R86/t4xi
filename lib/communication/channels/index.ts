/**
 * Kanaalregister. `whatsapp` en `sms` staan hier bewust niet in: ze zijn in de
 * policy gemodelleerd maar hebben geen provider, en de orchestrator legt zo'n
 * bericht vast als `skipped` in plaats van te doen alsof het verstuurd is.
 */

import type { Channel } from "@/lib/communication/channels/types";
import { emailChannel, internalChannel } from "@/lib/communication/channels/resend";
import type { ChannelId } from "@/lib/communication/policies/channel";

const REGISTRY: Partial<Record<ChannelId, Channel>> = {
  email: emailChannel,
  internal: internalChannel,
};

export function channelFor(id: ChannelId): Channel | null {
  return REGISTRY[id] ?? null;
}
