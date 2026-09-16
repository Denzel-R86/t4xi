import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProcessingInput, ProcessingStore } from "./processor";

/** Server-only adapter, deliberately not wired to any route or worker. */
export function supabaseProcessingStore(client: SupabaseClient): ProcessingStore {
  return {
    async load(messageId) {
      const { data, error } = await client.rpc("load_whatsapp_processing", { p_message: messageId });
      if (error) throw new Error("WHATSAPP_PROCESSING_READ_FAILED");
      if (data === null) return null;
      if (!data || data.message?.id !== messageId || typeof data.processed !== "boolean"
        || !Number.isSafeInteger(data.conversation?.version)) throw new Error("INVALID_PROCESSING_SNAPSHOT");
      return data as ProcessingInput;
    },
    async commit(messageId, version, decision) {
      const { data, error } = await client.rpc("commit_whatsapp_processing", {
        p_message: messageId, p_version: version, p_decision: decision,
      });
      if (error) throw new Error("WHATSAPP_PROCESSING_COMMIT_UNCERTAIN");
      if (data !== "committed" && data !== "duplicate" && data !== "conflict") throw new Error("INVALID_PROCESSING_RECEIPT");
      return data;
    },
  };
}
