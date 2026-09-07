import type { Metadata } from "next";
import ControlLogin from "@/components/control/ControlLogin";
import { authorizeControl } from "@/lib/control/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "T4XI Control", robots: { index: false, follow: false } };

export default async function ControlPage() {
  const auth = await authorizeControl();
  if (!auth.ok) {
    return <main className="min-h-screen bg-slate-50 p-6"><ControlLogin reason={auth.reason} /></main>;
  }
  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-950">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between border-b border-slate-200 py-6">
          <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">T4XI Control</p><h1 className="mt-1 text-3xl font-semibold">Security foundation</h1></div>
          <div className="text-right text-sm"><p>{auth.principal.email ?? "Individuele gebruiker"}</p><p className="text-emerald-700">MFA · {auth.principal.aal.toUpperCase()}</p></div>
        </header>
        <section className="grid gap-4 py-8 md:grid-cols-3">
          {[['Identity','Individuele Supabase-identiteiten'],['Authorization','RBAC en fijnmazige permissions'],['Governance','Audit, classificatie en retention']].map(([title, body]) => <article key={title} className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">{title}</h2><p className="mt-2 text-sm text-slate-600">{body}</p></article>)}
        </section>
        <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Sprint 1 shell: operationele modules blijven bewust uitgeschakeld totdat staging-bewijs en de exit gate zijn afgerond.</p>
      </div>
    </main>
  );
}
