# ETHYLNET Clean-Room UI and Admin Compatibility Design

## Goal
Build an ETHYLNET-owned responsive customer portal and admin interface for the Orange Pi One clean-room application without decoding or depending on the opaque original UI bundle.

## Verified compatibility evidence
The frozen Orange Pi One Nginx contract proves these compatibility facts:
- static/public root `/tmp/i/public`
- `/admin`
- `/reseller`
- `/`
- `@backend`
- `/tty-terminal`
- redirect to `/admin?page=dashboard`
- existing application listeners `localhost:3000` and `localhost:3001`

These facts do not prove business API endpoints or payload schemas.

## Source boundary
Only evidence from `ETHYLNET-OrangePiOne-Audit-20261005-031126` defines compatibility. Do not copy UI/business behavior from MiniPC, TarakiFi, LPB, WIFIngBAYAN, Ruijie, or another firmware project.

## Opaque UI boundary
Do not decode the opaque original `public.tar.gz`, patch opaque frontend bytecode, guess proprietary request payloads, or fabricate successful API responses. Build a new ETHYLNET UI from verified routing facts and explicitly designed clean-room interfaces.

## Source layout
`src/ui/ui-contract.js`
`src/ui/admin/index.html`
`src/ui/admin/admin.css`
`src/ui/admin/admin.js`
`src/ui/portal/index.html`
`src/ui/portal/portal.css`
`src/ui/portal/portal.js`
Tests live under `tests/ui/`.

## UI contract
Expose a deeply immutable contract containing verified routes `/`, `/admin`, `/reseller`, `/tty-terminal`, dashboard entry `/admin?page=dashboard`, static root evidence `/tmp/i/public`, and empty arrays for verified business/admin/portal mutation APIs.

## Admin information architecture
The clean-room admin shell contains Dashboard, Sales, Sessions, Vouchers, PPPoE, ELOAD, Sub-vendo / Rental, and Settings. These labels are ETHYLNET-owned design choices, not claims about the original UI.

Dashboard cards may include system status, sales, active sessions, vouchers, PPPoE, and ELOAD. Until backend contracts exist, unavailable data must display `Backend integration pending` and never fabricated counts, balances, uptime, transactions, or success states.

Feature pages are presentation shells only. Sales and Sessions use empty states. Voucher creation, PPPoE mutation, ELOAD purchase, rental control, and settings mutation remain disabled until separate backend contracts exist.

## Customer portal
Provide an ETHYLNET branding area, connection/status presentation, primary customer action area, rates/info shell, and responsive mobile-first layout. Do not fabricate remaining time, balance, MAC address, session state, voucher result, or payment result.

## Route preservation
Do not remove or repurpose `/reseller`, `/tty-terminal`, PPPoE routing, existing Nginx listener ownership, or HTTP listener ownership on ports 3000 and 3001. The UI layer creates no new public TCP listener.

## Authentication boundary
The original admin-authentication contract is unverified. Do not introduce default administrator credentials, bypass authentication, expose privileged mutations without a later authentication design, or claim compatibility with an unknown login protocol.

## Design system
Use semantic HTML, local CSS, and local JavaScript only. No CDN, remote fonts, analytics, tracking scripts, or external runtime dependency. Desktop uses left navigation, top bar, content workspace, cards, and responsive tables. Tablet navigation collapses. Mobile uses a drawer/single-column layout with touch-friendly controls. Use CSS custom properties for background, surface, text, muted text, border, accent, success, warning, danger, spacing, and radius.

## Accessibility
Include semantic landmarks, keyboard-accessible navigation, visible focus states, usable contrast, meaningful labels, responsive viewport metadata, and `aria-current` where appropriate. Critical state must not rely on color alone.

## Security
Do not inject untrusted data with `innerHTML`, execute backend HTML, store credentials in source, put secrets in URLs, embed external scripts, log tokens, use `eval`, or use dynamic `Function`.

## Static asset safety
During UI foundation work, do not modify firmware `/tmp/i/public`, the raw image, frozen `index.o`, or opaque `public.tar.gz`. Firmware installation is a later integration milestone.

## Initial implementation milestone
1. immutable UI compatibility contract
2. shared design tokens and responsive admin shell
3. dashboard and feature-page shells
4. responsive portal shell
5. security/accessibility/route regression guards

It excludes real business API calls, admin mutations, portal payment actions, voucher creation, PPPoE mutation, ELOAD purchase submission, rental control, authentication implementation, reseller business logic, and firmware integration.

## Testing
All behavior-changing production work is test-first. Tests must verify immutable contract, exact verified route set, dashboard compatibility, zero invented business APIs, no external runtime assets, no `eval`/dynamic `Function`, no hard-coded secrets, required admin navigation, integration-pending behavior, viewport metadata, accessibility basics, no new listener ownership, no HTTP compatibility mutation, and no change to `bin/ethyl-core.js` during foundation work.

## Acceptance
UI-specific and full regression suites pass; admin and portal are responsive; verified compatibility routes remain; `/admin?page=dashboard` is supported; unavailable features never fabricate results; no external runtime assets or embedded credentials exist; no product-license subsystem is introduced; no protected route is removed; and firmware remains unchanged until explicit integration.