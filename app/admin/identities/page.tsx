import type { Metadata } from "next";
import Link from "next/link";
import ControlLogin from "@/components/control/ControlLogin";
import { IDENTITY_STATUSES, mayChangeRole } from "@/lib/control/identity-commands";
import { loadIdentityOverview } from "@/lib/control/identity-service";
import { changeStatusAction, grantRoleAction, revokeRoleAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "T4XI Control — Identities",
  robots: { index: false, follow: false },
};

export default async function IdentitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const result = await loadIdentityOverview();
  if (!result.ok) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <ControlLogin reason={result.reason} />
      </main>
    );
  }

  const { identities, grants, roleKeys, canManage, canChangeAdmin } = result.overview;
  const selectedId = (await searchParams).id;
  const selected = identities.find((identity) => identity.id === selectedId);

  const activeGrants = (identityId: string) =>
    grants.filter((grant) => grant.identity_id === identityId && grant.revoked_at === null);
  const revokedGrants = (identityId: string) =>
    grants.filter((grant) => grant.identity_id === identityId && grant.revoked_at !== null);

  const mayChange = (roleKey: string) => mayChangeRole(roleKey, canManage, canChangeAdmin);

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-950">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-baseline justify-between border-b border-slate-200 py-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              T4XI Control
            </p>
            <h1 className="mt-1 text-3xl font-semibold">Identities</h1>
          </div>
          <Link href="/admin" className="text-sm underline">
            Terug naar Control
          </Link>
        </header>

        {!canManage && (
          <p className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
            Je kunt identiteiten lezen maar niet beheren. Beheeracties vereisen
            <code className="mx-1">identity.manage</code>.
          </p>
        )}

        <section className="py-8">
          <table className="w-full border-separate border-spacing-y-2 text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3">Naam</th>
                <th className="px-3">Status</th>
                <th className="px-3">Actieve rollen</th>
                <th className="px-3" />
              </tr>
            </thead>
            <tbody>
              {identities.map((identity) => (
                <tr key={identity.id} className="rounded-lg bg-white">
                  <td className="px-3 py-3 font-medium">{identity.display_name}</td>
                  <td className="px-3 py-3">{identity.status}</td>
                  <td className="px-3 py-3 text-slate-600">
                    {activeGrants(identity.id)
                      .map((grant) => grant.role_key)
                      .join(", ") || "geen"}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link href={`/admin/identities?id=${identity.id}`} className="underline">
                      Openen
                    </Link>
                  </td>
                </tr>
              ))}
              {identities.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-slate-500">
                    Geen identiteiten zichtbaar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {selected && (
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-xl font-semibold">{selected.display_name}</h2>
            <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
              <div>
                <dt className="text-slate-500">Status</dt>
                <dd>{selected.status}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Laatst aangemeld</dt>
                <dd>{selected.last_authenticated_at ?? "nooit"}</dd>
              </div>
            </dl>

            <h3 className="mt-6 font-semibold">Rollen</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {activeGrants(selected.id).map((grant) => (
                <li key={grant.role_key} className="flex items-center justify-between">
                  <span>{grant.role_key}</span>
                  {mayChange(grant.role_key) && (
                    <form action={revokeRoleAction}>
                      <input type="hidden" name="identityId" value={selected.id} />
                      <input type="hidden" name="roleKey" value={grant.role_key} />
                      <button className="text-xs underline" type="submit">
                        Intrekken
                      </button>
                    </form>
                  )}
                </li>
              ))}
              {activeGrants(selected.id).length === 0 && <li className="text-slate-500">geen</li>}
            </ul>
            {revokedGrants(selected.id).length > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                Ingetrokken: {revokedGrants(selected.id).map((grant) => grant.role_key).join(", ")}
              </p>
            )}

            {canManage && (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <form action={changeStatusAction} className="space-y-2">
                  <input type="hidden" name="identityId" value={selected.id} />
                  <label className="block text-sm">
                    Status wijzigen
                    <select name="status" className="mt-1 w-full rounded-lg border p-2">
                      {IDENTITY_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="rounded-lg bg-slate-950 px-4 py-2 text-white" type="submit">
                    Toepassen
                  </button>
                </form>

                <form action={grantRoleAction} className="space-y-2">
                  <input type="hidden" name="identityId" value={selected.id} />
                  <label className="block text-sm">
                    Rol toekennen
                    <select name="roleKey" className="mt-1 w-full rounded-lg border p-2">
                      {roleKeys.filter(mayChange).map((roleKey) => (
                        <option key={roleKey} value={roleKey}>
                          {roleKey}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="rounded-lg bg-slate-950 px-4 py-2 text-white" type="submit">
                    Toekennen
                  </button>
                </form>
              </div>
            )}

            <p className="mt-6 text-xs text-slate-500">
              Je eigen identiteit en je eigen rollen kun je hier niet wijzigen; PostgreSQL
              weigert dat, niet alleen deze pagina.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
