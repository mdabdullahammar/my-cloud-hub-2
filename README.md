# My Private Cloud Hub

A personal, device-first cloud storage hub prototype. The long-term goal is to provide one place to organize files, connect supported cloud providers, and manage backups across devices.

> **Current status:** This repository currently contains an early frontend prototype. It is not yet a working cloud-storage service. Real authentication, cloud-provider connections, file uploads/downloads, database persistence, and automatic backups have not been implemented or verified.

## Project goals

- Provide a unified interface for personal files and storage providers.
- Make it easier to organize and find files across connected storage services.
- Support secure upload, download, and backup workflows.
- Plan for use across multiple devices.
- Keep provider credentials and private data secure.

## Current technology

- HTML, CSS, and JavaScript in a single-page frontend.
- Tailwind CSS is loaded from its public CDN in the current prototype.
- No production backend or database is connected at this stage.

## Repository structure

```text
my-cloud-hub-2/
├── index.html          # Main frontend page (current prototype)
├── README.md           # Project overview and setup notes
├── assets/             # Future images, icons, and static assets
└── docs/               # Project notes and technical documentation
```

The frontend is currently kept in one HTML file. A separate `src/` folder will only be introduced if the app is later split into maintainable CSS and JavaScript modules. Backend folders will be added when a real backend is implemented.

## Run the current prototype

1. Open the repository.
2. Open `index.html`.
3. Use GitHub's **Download raw file** option or download the repository ZIP, then open `index.html` in a modern browser.

Some interface elements may be demonstration-only. Do not enter real passwords, API keys, access tokens, or sensitive personal information into this prototype.

## Planned architecture (not connected yet)

The following are possible future components, not services that are currently active:

- **Frontend hosting:** GitHub Pages or Cloudflare Pages.
- **Backend/API:** Cloudflare Workers.
- **Database:** Cloudflare D1.
- **Primary object storage:** Cloudflare R2.
- **External providers:** integrations such as Google Drive, OneDrive, and Dropbox, subject to their APIs and authorization requirements.

The final choices will depend on free-tier limits, security requirements, provider terms, and testing.

## Security principles

- Never commit passwords, API keys, OAuth client secrets, access tokens, or private configuration files.
- Keep server-side secrets in the hosting provider's secret/environment-variable settings.
- Do not describe a provider as connected unless a real authenticated connection has been tested.
- Do not treat demo files, sample accounts, or preview statuses as real user data.

## Development roadmap

1. Establish a clean frontend entry point and repository structure.
2. Review the prototype and clearly separate demo UI from working features.
3. Publish a static preview for testing.
4. Design and implement secure authentication and backend APIs.
5. Connect database and object storage.
6. Add and test external cloud-provider integrations.
7. Implement multi-device management and backup workflows.
8. Test permissions, privacy, reliability, and usage limits before production use.

## Contributions and changes

Keep commits focused and descriptive. Update this README whenever the actual architecture, setup steps, or implemented features change.
