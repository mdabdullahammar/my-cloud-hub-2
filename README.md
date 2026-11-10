# My Private Cloud Hub

A private, single-owner cloud storage hub. The repository contains a Cloudflare Worker API scaffold, a D1 schema, an R2 storage binding, and a frontend for account login and device registration.

> **Deployment status:** Source code has been committed, but the service is not confirmed online. Do not use the app for real files until Cloudflare setup and live tests are complete.

## Architecture

- **Frontend + API:** One Cloudflare Worker deployment serving the static frontend and same-origin `/api/*` requests.
- **Backend:** Cloudflare Workers (`src/worker.js`).
- **Database:** Cloudflare D1 (`migrations/0001_initial.sql`).
- **Object storage:** Private Cloudflare R2 bucket binding named `BUCKET`.
- **Authentication:** First-owner-only registration, PBKDF2-SHA-256 password hashing, server-side sessions, secure HttpOnly cookie, and login throttling.
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

External Google Drive, OneDrive, Dropbox, Google Photos, pCloud, MEGA and other provider integrations are **not implemented**. Native Android background backup / WorkManager is **not implemented**.

## Required Cloudflare setup

1. Use the existing D1 database named `my-private-cloud-hub-db` with Database ID `dcd10925-8bd2-46bc-b229-e15bc3d90215`. This exact name and ID are configured in `wrangler.toml` and the deployment workflow.
2. Create a **private R2 bucket** named `my-private-cloud-hub-files`.
3. Add GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Never paste the token into chat or commit it.
4. Enable a Workers subdomain in Cloudflare if it is not already enabled.
5. In GitHub, open **Actions → Deploy Cloudflare Worker → Run workflow**, or push a change to a watched deployment path.
6. After deployment, test registration, login, file upload and download with non-sensitive test files before relying on the service.

The Cloudflare API token must have the required Workers, D1, R2 and account permissions for the correct account.

## Local development

Install Node.js 22+, then:

```bash
npm install
npx wrangler login
npx wrangler d1 migrations apply my-private-cloud-hub-db --local
mkdir -p public && cp index.html public/index.html
npm run dev
```

## Important limitations before production use

- Deployment and live API tests are not confirmed complete.
- Login and device-registration calls require the Worker to be deployed on the same origin as the frontend.
- The gallery's upload/download controls require a deployed Worker, D1 database and R2 bucket, and must be tested.
- Device records are per browser installation. Native Android background photo backup is not implemented.
- Automatic backup, deduplication, malware scanning, quota enforcement, external cloud-provider OAuth, multi-user support, account recovery and production security review are not complete.
- Keep local originals until upload, download and file-integrity checks are verified.

## Security notes

- Never commit passwords, API keys, OAuth client secrets or access tokens.
- Keep the R2 bucket private. Do not expose R2 credentials in browser JavaScript.
- Test with non-sensitive files first. Add and test checksum verification, backups and account recovery before storing important files.
