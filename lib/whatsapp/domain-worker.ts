import { getAppEnv, STAGING_SUPABASE_REF, type EnvLike } from '@/lib/config/environment';
import { bookingAdapter } from './booking-adapter';
import { pricingAdapter } from './pricing-adapter';
import { runCommandWorker, type WorkerStore } from './worker';
/** Historical entrypoint name retained for Gate 3 callers; same worker path for staging.
 * Staging requires an explicit opt-in and the pinned project. Communication stays off.
 */
export function assertLocalDomainEnvironment(env: EnvLike = process.env) {
  const deny = () => { throw new Error('LOCAL_DOMAIN_ENVIRONMENT_REQUIRED'); };
  const aliases: Record<string, string> = {
    development: 'development', dev: 'development', staging: 'staging', stage: 'staging',
    production: 'production', prod: 'production',
  };
  for (const value of [env.APP_ENV, env.NEXT_PUBLIC_APP_ENV]) {
    if (value !== undefined && !aliases[value.trim().toLowerCase()]) deny();
  }
  if (env.APP_ENV !== undefined && env.NEXT_PUBLIC_APP_ENV !== undefined
    && aliases[env.APP_ENV.trim().toLowerCase()] !== aliases[env.NEXT_PUBLIC_APP_ENV.trim().toLowerCase()]) deny();
  if (env.NODE_ENV !== undefined && !['development', 'test', 'production'].includes(env.NODE_ENV)) deny();
  let url: URL;
  try { url = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? ''); } catch { return deny(); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
    || url.pathname !== '/' || env.COMMUNICATION_RECIPIENT_ALLOWLIST?.trim() || env.RESEND_API_KEY) deny();
  const appEnv = getAppEnv(env);
  if (appEnv === 'development' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return;
  if (appEnv === 'staging' && env.WHATSAPP_STAGING_WORKER_ENABLED === 'true'
    && url.origin === `https://${STAGING_SUPABASE_REF}.supabase.co`) return;
  deny();
}
export async function runLocalDomainWorker(store: WorkerStore, id: string) {
  assertLocalDomainEnvironment();
  const pricing = pricingAdapter(), booking = bookingAdapter();
  return runCommandWorker(store,id,{
    prepare: command => (command.kind === 'request_quote' ? pricing : booking).prepare(command),
    execute: command => (command.kind === 'request_quote' ? pricing : booking).execute(command),
  });
}
