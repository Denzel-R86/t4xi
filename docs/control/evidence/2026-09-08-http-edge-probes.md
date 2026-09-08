# HTTP edge default-deny — proven from outside the process boundary

2026-09-08. `npm run dev:staging` against `ztlhydagjqfzkyfiqgio`, branch `chore/control-staging-verification-v2`. No session cookie on any request.

| Path | Status | Origin of the response |
| --- | --- | --- |
| `/admin` | **200** | sign-in shell rendered ("T4XI Control", "Individueel aanmelden") |
| `/admin/whatever` | **404** | body `404 — niet gevonden` → our middleware, not the Next router |
| `/admin/dispatch` (unregistered future route) | **404** | our middleware |
| `/nl/admin` | **404** | body `404 — niet gevonden` → closed before locale rewriting |
| `/en/admin` | **404** | our middleware |
| `/admin/` | 308 → `/admin` | Next normalises the trailing slash before the middleware sees it |
| `/dashboard` | 404 | pre-existing behaviour intact |
| `/dashboard/brain` | 404 | fail-closed: no `BRAIN_DASHBOARD_*` in the staging env |
| `/klant` | 404 | pre-existing behaviour intact |
| `/` | 200 | public site unaffected |

Default-deny is therefore enforced by the real routing stack, not only by the unit test: an unregistered `/admin` subroute is refused at the edge, and a locale-prefixed Control path never reaches the locale middleware.

## Finding: `/admin` does not actually send `no-store`

`proxy.ts` sets `cache-control: no-store` on the Control response, but the response observed over HTTP is:

```
HTTP/1.1 200 OK
Cache-Control: no-cache, must-revalidate
x-robots-tag: noindex, nofollow
```

`x-robots-tag` survives; the cache header does not — Next replaces it for the dynamically rendered route. `no-cache, must-revalidate` forces revalidation but still permits the response to be written to disk, which `no-store` exists to prevent on an authenticated admin surface. The unit test could not catch this because it asserts the string in `proxy.ts`, not the header on the wire — a concrete example of why the regex assertions are not evidence.

Not yet fixed: changing a security header is its own change, kept separate from this proof.

## Note on the trailing-slash unit test

`security-foundation.test.ts` asserts `controlEdgeDecision("/admin/", []) === "not_found"`. That is correct for the function, but the runtime never reaches it: Next answers `/admin/` with a 308 to `/admin` first. The assertion is harmless but describes a path that does not occur in production.
