import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertLocalDomainEnvironment, runLocalDomainWorker } from './domain-worker';
import { STAGING_SUPABASE_REF, PRODUCTION_SUPABASE_REF, type EnvLike } from '../config/environment';
import type { WorkerStore } from './worker';
const local: EnvLike = { APP_ENV: 'development', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:65530' };
const staging: EnvLike = { APP_ENV: 'staging', NODE_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_SUPABASE_REF}.supabase.co`, WHATSAPP_STAGING_WORKER_ENABLED: 'true' };
const allowed: [string, EnvLike][] = [
  ['existing local', local],
  ['local CI fallback', { ...local, APP_ENV: undefined, NODE_ENV: 'test' }],
  ['local localhost', { ...local, NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321' }],
  ['local IPv6', { ...local, NEXT_PUBLIC_SUPABASE_URL: 'http://[::1]:54321' }],
  ['explicit staging with production build mode', staging],
  ['existing staging aliases', { ...staging, APP_ENV: 'stage', NEXT_PUBLIC_APP_ENV: 'staging' }],
];
const denied: [string, EnvLike][] = [
  ['local remote target', { ...local, NEXT_PUBLIC_SUPABASE_URL: staging.NEXT_PUBLIC_SUPABASE_URL }],
  ['production even with staging opt-in', { ...staging, APP_ENV: 'production' }],
  ['production alias', { ...staging, APP_ENV: 'prod' }],
  ['production database', { ...staging, NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_REF}.supabase.co` }],
  ['unknown database', { ...staging, NEXT_PUBLIC_SUPABASE_URL: 'https://other.supabase.co' }],
  ['missing opt-in', { ...staging, WHATSAPP_STAGING_WORKER_ENABLED: undefined }],
  ['disabled opt-in', { ...staging, WHATSAPP_STAGING_WORKER_ENABLED: 'false' }],
  ['non-exact opt-in', { ...staging, WHATSAPP_STAGING_WORKER_ENABLED: 'TRUE' }],
  ['missing environment', { ...staging, APP_ENV: undefined }],
  ['unknown environment falls closed', { ...local, APP_ENV: 'stagign' }],
  ['blank environment', { ...local, APP_ENV: '' }],
  ['conflicting environments', { ...staging, NEXT_PUBLIC_APP_ENV: 'production' }],
  ['unknown public environment', { ...staging, NEXT_PUBLIC_APP_ENV: 'preview' }],
  ['unknown node environment', { ...local, NODE_ENV: 'preview' }],
  ['missing URL', { ...local, NEXT_PUBLIC_SUPABASE_URL: undefined }],
  ['malformed URL', { ...local, NEXT_PUBLIC_SUPABASE_URL: 'invalid' }],
  ['non-http local URL', { ...local, NEXT_PUBLIC_SUPABASE_URL: 'ftp://localhost' }],
  ['insecure staging URL', { ...staging, NEXT_PUBLIC_SUPABASE_URL: `http://${STAGING_SUPABASE_REF}.supabase.co` }],
  ['lookalike hostname', { ...staging, NEXT_PUBLIC_SUPABASE_URL: `${staging.NEXT_PUBLIC_SUPABASE_URL}.evil.invalid` }],
  ['URL credentials', { ...staging, NEXT_PUBLIC_SUPABASE_URL: `https://user@${STAGING_SUPABASE_REF}.supabase.co` }],
  ['URL path', { ...staging, NEXT_PUBLIC_SUPABASE_URL: `${staging.NEXT_PUBLIC_SUPABASE_URL}/rest/v1` }],
  ['URL query', { ...staging, NEXT_PUBLIC_SUPABASE_URL: `${staging.NEXT_PUBLIC_SUPABASE_URL}?target=other` }],
  ['URL fragment', { ...staging, NEXT_PUBLIC_SUPABASE_URL: `${staging.NEXT_PUBLIC_SUPABASE_URL}#other` }],
  ['URL port', { ...staging, NEXT_PUBLIC_SUPABASE_URL: `${staging.NEXT_PUBLIC_SUPABASE_URL}:8443` }],
  ['local communication allowlist', { ...local, COMMUNICATION_RECIPIENT_ALLOWLIST: 'test@example.invalid' }],
  ['staging communication allowlist', { ...staging, COMMUNICATION_RECIPIENT_ALLOWLIST: 'test@example.invalid' }],
  ['local sender credential', { ...local, RESEND_API_KEY: 'test-only' }],
  ['staging sender credential', { ...staging, RESEND_API_KEY: 'test-only' }],
];
for (const [name, env] of allowed) test(`worker environment allows ${name}`, () => assert.doesNotThrow(() => assertLocalDomainEnvironment(env)));
for (const [name, env] of denied) test(`worker environment rejects ${name}`, () => assert.throws(() => assertLocalDomainEnvironment(env), /LOCAL_DOMAIN_ENVIRONMENT_REQUIRED/));
test('all rejected configurations stop before claim; allowed configurations use the existing worker', async () => {
  const names = ['APP_ENV','NEXT_PUBLIC_APP_ENV','NODE_ENV','NEXT_PUBLIC_SUPABASE_URL','COMMUNICATION_RECIPIENT_ALLOWLIST','RESEND_API_KEY','WHATSAPP_STAGING_WORKER_ENABLED'];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  let claims = 0;
  const store = { async claim() { claims++; return null; } } as unknown as WorkerStore;
  try {
    for (const [permitted, cases] of [[false, denied], [true, allowed]] as const) {
      for (const [, env] of cases) {
        for (const name of names) delete process.env[name];
        for (const [name, value] of Object.entries(env)) if (value !== undefined) process.env[name] = value;
        const before = claims;
        if (permitted) { await runLocalDomainWorker(store, 'test-command'); assert.equal(claims, before + 1); }
        else { await assert.rejects(runLocalDomainWorker(store, 'test-command'), /LOCAL_DOMAIN_ENVIRONMENT_REQUIRED/); assert.equal(claims, before); }
      }
    }
  } finally {
    for (const name of names) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; }
  }
});
