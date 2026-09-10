"use server";

import { revalidatePath } from "next/cache";
import { grantRole, revokeRole, setIdentityStatus } from "@/lib/control/identity-service";

/**
 * Server actions are a thin transport. They read the form, call the
 * application service and revalidate; they hold no authorization logic of
 * their own, because PostgreSQL decides every write.
 */

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export async function changeStatusAction(form: FormData): Promise<void> {
  const outcome = await setIdentityStatus(field(form, "identityId"), field(form, "status"));
  revalidatePath("/admin/identities");
  if (!outcome.ok) console.warn(`[control-identity] status refused: ${outcome.reason}`);
}

export async function grantRoleAction(form: FormData): Promise<void> {
  const outcome = await grantRole(field(form, "identityId"), field(form, "roleKey"));
  revalidatePath("/admin/identities");
  if (!outcome.ok) console.warn(`[control-identity] grant refused: ${outcome.reason}`);
}

export async function revokeRoleAction(form: FormData): Promise<void> {
  const outcome = await revokeRole(field(form, "identityId"), field(form, "roleKey"));
  revalidatePath("/admin/identities");
  if (!outcome.ok) console.warn(`[control-identity] revoke refused: ${outcome.reason}`);
}
