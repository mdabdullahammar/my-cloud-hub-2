# My Private Cloud Hub

A private, single-owner cloud storage hub. The repository now contains a Cloudflare Worker API scaffold, a D1 schema, an R2 storage binding, and a frontend wired for account login and device registration.

> **Deployment status:** Source code has been committed, but Cloudflare resources have not been provisioned and the service is not online yet. Do not use the app for real files until the Cloudflare setup below is completed and tested.

## Architecture

- **Frontend + API:** One Cloudflare Worker deployment. The Worker serves the static frontend and handles same-origin `/api/*` requests.
- **Backend:** Cloudflare Workers (`src/worker.js`).
- **Database:** Cloudflare D1 (`migrations/0001_initial.sql`).
- **Object storage:** Cloudflare R2 bucket binding named `BUCKET`.
- **Authentication:** First-owner-only registration, PBKDF2-SHA-256 password hashing, server-side session records, HttpOnly/Secure/SameSite cookie, and login throttling.
- **Devices:** Authenticated device registration and revocation endpoints.
- **Files:** Private R2 upload/download endpoints and D1 metadata. Initial upload endpoint limit: 100 MB per request.

## Features in source code

- `POST /api/auth/register` — create the first owner account only.
- `POST /api/auth/login` — authenticate and issue a server-side session cookie.
- `POST /api/auth/logout` — revoke the current session.
- `GET /api/auth/me` — return the signed-in owner.
- `GET /api/devices` and `POST /api/devices/register` — list/register devices.
- `DELETE /api/devices/:id` — revoke a registered device.
- `GET /api/files`, `PUT /api/files/upload`, and `GET /api/files/:id` — list, upload and download private objects.

External Google Drive, OneDrive, Dropbox, Google Photos, pCloud, MEGA and other provider integrations are **not implemented**. Native Android background backup / WorkManager is **not implemented**. Device registration records the browser/device that makes the authenticated request; it does not install or remotely inspect another device.

## Required Cloudflare setup (owner action)

1. Sign in to the Cloudflare dashboard and select your account.
2. Create a **D1 database** named `my-private-cloud-hub-db`.
3. Copy its Database ID and replace `REPLACE_WITH_CLOUDFLARE_D1_DATABASE_ID` in `wrangler.toml`.
4. Create a **private R2 bucket** named `my-private-cloud-hub-files`.
5. In GitHub, open this repository's **Settings → Secrets and variables → Actions** and add:
   - `CLOUDFLARE_API_TOKEN` — token with Workers Scripts:Edit, D1:Edit, R2:Edit, and Account:Read permissions for the correct account.
   - `CLOUDFLARE_ACCOUNT_ID` — your Cloudflare Account ID.
6. Confirm that the Cloudflare account has a Workers subdomain enabled. The Worker will be deployed with a `workers.dev` URL.
7. In GitHub, open **Actions → Deploy Cloudflare Worker → Run workflow** (or push a change to the deployment paths).
8. Wait for the deployment to finish. Open the resulting Worker URL on Android and desktop. The workflow applies the D1 migration before deploying.
9. On the first visit, create your Owner Account with a strong unique password of at least 12 characters. Public sign-up is closed after the first account exists.

**Never paste the Cloudflare API token or password into chat or commit it to this repository.** Add the token only as a GitHub Actions secret.

## Local development

Install Node.js 22+, then:

```bash
npm install
npx wrangler login
npx wrangler d1 migrations apply my-private-cloud-hub-db --local
mkdir -p public && cp index.html public/index.html
npm run dev
```

For production, provision the remote D1 and R2 resources first, then run the GitHub Actions deployment workflow.

## Important limitations before production use

- The deployment is not live until the owner completes Cloudflare provisioning and adds GitHub Actions secrets.
- The current UI's login and device-registration calls require the Worker to be deployed on the same origin as the frontend.
- The gallery now has a file picker, R2 upload action, and authenticated download links. These require a deployed Worker, D1 database, and R2 bucket, then must be tested with non-sensitive files.
- Device records are per browser installation. A native Android companion app is required for dependable background camera/photo backup, Android WorkManager scheduling, and system-level device management.
- Automatic backup, file deduplication, malware scanning, quota enforcement, external cloud-provider OAuth, multi-user support, account recovery and production security review are not yet complete.
- Test with non-sensitive files first. Keep local originals until upload, download and integrity checks have been verified.

## Security notes

- Never commit passwords, API keys, OAuth client secrets, access tokens, or private configuration.
- Do not show a provider, device, or upload as connected/completed unless the backend confirms it.
- Keep the R2 bucket private. Do not expose R2 credentials in browser JavaScript.
- Before storing important files, add and test checksum verification, backups and account recovery.
