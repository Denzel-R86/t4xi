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

## Corrected: `/admin` does send `no-store` — the earlier finding was a dev artifact

A first probe against `next dev` observed `Cache-Control: no-cache, must-revalidate` on `/admin` and this file recorded it as a defect. Re-probed against a real production build (`next build` + `next start`, staging env injected):

```
/admin           200   cache=no-store                                          robots=noindex, nofollow
/admin/whatever  404   robots=noindex, nofollow
/en/admin        404   robots=noindex, nofollow
/nl/admin        404   robots=noindex, nofollow
/dashboard       404   robots=noindex, nofollow
/                200   cache=private, no-cache, no-store, max-age=0, must-revalidate
```

`/admin` carries exactly the `no-store` that `proxy.ts` sets. The dev server rewrites that header; a production build does not. **No code change was needed**, and none was made — adding a redundant header rule would have been change for its own sake.

The edge behaviour is identical in the production build: unregistered `/admin` subroutes and locale-prefixed Control paths are refused, the public site is unaffected. That doubles as the no-routing-regression proof.

The general lesson stands: header and routing claims must be probed against a production build, because the dev server is not representative.

## Note on the trailing-slash unit test

`security-foundation.test.ts` asserts `controlEdgeDecision("/admin/", []) === "not_found"`. That is correct for the function, but the runtime never reaches it: Next answers `/admin/` with a 308 to `/admin` first. The assertion is harmless but describes a path that does not occur in production.
