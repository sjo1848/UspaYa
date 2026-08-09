# Security deployment baseline

This is the minimum browser-facing baseline required before a closed pilot. The API now applies
Helmet headers in `apps/api/src/configure-application.ts`; the static frontend still needs the
equivalent policy at its hosting or edge layer.

## Required response headers for the frontend origin

- `Content-Security-Policy`: start from a same-origin policy and explicitly allow only the API and
  assets required by the deployment. Do not add `unsafe-eval` or `unsafe-inline` as a workaround.
- `Content-Security-Policy: frame-ancestors 'none'` unless an approved embedding use case exists.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy`: disable capabilities not used by the product, at minimum camera,
  microphone and geolocation unless the product contract explicitly needs them.
- HTTPS at the edge, with HSTS enabled only after the production domain and certificate lifecycle
  are confirmed.

## Verification gate

Before authorizing the pilot, capture the deployed frontend response headers with a real HTTPS
request and attach them to the pilot evidence. A local Vite development server is not evidence of
the production header configuration.

## Current status

- API headers: implemented and covered by integration tests.
- Frontend hosting headers: pending deployment-provider configuration.
- Dependency audit: enforced by `pnpm audit:security` and the CI quality job.
