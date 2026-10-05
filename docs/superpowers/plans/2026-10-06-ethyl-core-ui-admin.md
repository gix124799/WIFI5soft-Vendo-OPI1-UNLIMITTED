# ETHYLNET UI/Admin Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a clean-room responsive ETHYLNET admin and customer portal that preserves verified Orange Pi One routing compatibility without inventing business APIs.

**Architecture:** Static semantic HTML/CSS/JS lives under `src/ui`. A frozen JavaScript contract records compatibility facts. Tests inspect exported data and static assets directly; no frontend build system, network calls, or new listeners are introduced. Firmware installation is a separate integration task after branch verification.

**Tech Stack:** Node.js >=18, CommonJS, `node:test`, `node:assert/strict`, semantic HTML, CSS, vanilla JavaScript.

**Spec:** `docs/superpowers/specs/2026-10-06-ethyl-core-ui-admin-design.md`

## Global Constraints
- Preserve `/`, `/admin`, `/reseller`, `/tty-terminal`, `/admin?page=dashboard`, and existing port ownership.
- Zero verified business/admin/portal mutation APIs until independently specified.
- No CDN, remote fonts, analytics, external runtime dependency, `eval`, dynamic `Function`, embedded credentials, or fabricated data.
- No new public listener and no modification of `bin/ethyl-core.js` during foundation tasks.
- All unavailable business actions are disabled or say `Backend integration pending`.
- TDD: watched RED before production code for every behavior-changing task.

## Review Focus
- Query strings other than `page=dashboard` must not create invented backend behavior.
- Navigation changes must remain accessible on narrow screens without hiding content permanently.
- Static pages must work with JavaScript disabled for core status/navigation content.
- Disabled controls must not become clickable through JavaScript event handlers.
- Security guard must reject external runtime URLs and dangerous dynamic-code primitives.

---

### Task 1: Immutable UI compatibility contract
**Files:** Create `tests/ui/ui-contract.test.js`, `src/ui/ui-contract.js`.
**Produces:** `getUiContract()` returning a deeply frozen object with verified routes, dashboard entry, static root evidence, listener ownership, and empty verified API arrays.
- [ ] Write contract tests first, including deep immutability and zero invented APIs.
- [ ] Run `node --test tests/ui/ui-contract.test.js`; expect RED because module is missing.
- [ ] Implement minimal contract.
- [ ] Run target test and `npm test`; expect all green.
- [ ] Commit `feat: add UI compatibility contract`.

### Task 2: Responsive admin shell and design tokens
**Files:** Create `tests/ui/admin-shell.test.js`, `src/ui/admin/index.html`, `src/ui/admin/admin.css`, `src/ui/admin/admin.js`.
**Consumes:** Task 1 route/compatibility concepts; static files do not call business APIs.
**Produces:** Responsive admin shell with Dashboard, Sales, Sessions, Vouchers, PPPoE, ELOAD, Sub-vendo / Rental, Settings; dashboard/feature shells; integration-pending states.
- [ ] Write static markup/CSS/JS tests first for viewport, nav labels, accessibility hooks, disabled mutations, local assets, and responsive media rules.
- [ ] Run target test; expect RED because assets are missing.
- [ ] Implement minimal semantic admin assets.
- [ ] Run target test and full suite.
- [ ] Commit `feat: add responsive admin shell`.

### Task 3: Responsive customer portal shell
**Files:** Create `tests/ui/portal-shell.test.js`, `src/ui/portal/index.html`, `src/ui/portal/portal.css`, `src/ui/portal/portal.js`.
**Produces:** ETHYLNET-branded portal shell with status/action/rates areas, no fabricated session/balance values, disabled unavailable mutations, responsive layout.
- [ ] Write portal tests first.
- [ ] Run target test; expect RED because assets are missing.
- [ ] Implement minimal portal assets.
- [ ] Run target test and full suite.
- [ ] Commit `feat: add responsive customer portal shell`.

### Task 4: UI security, route and regression guard
**Files:** Create `tests/ui/ui-compatibility-guard.test.js`.
**Consumes:** Tasks 1-3.
**Produces:** Guard proving no external runtime assets, `eval`, dynamic `Function`, hard-coded secrets, invented APIs, new listener ownership, or `bin/ethyl-core.js` modification.
- [ ] Add guard tests; if any fail, treat as RED and fix only the owning asset.
- [ ] Run `node --test tests/ui/*.test.js` and `npm test`.
- [ ] Run syntax checks and `git diff --check`.
- [ ] Commit `test: guard UI compatibility boundaries`.

### Task 5: Branch verification and firmware integration
**Files:** Add clean-room static assets into a new firmware-owned path; modify only the minimum Nginx/static routing configuration needed to serve the new admin/portal while preserving verified fallback routes.
**Consumes:** Verified branch from Tasks 1-4 and frozen Nginx contracts.
**Produces:** One raw integration candidate; original candidate remains preserved. No final `.img.gz` packaging.
- [ ] Whole-branch review and full tests before merge.
- [ ] Merge UI branch to `main` only after verification.
- [ ] Copy the current raw candidate to a new integration raw image without changing geometry/trailer.
- [ ] Install UI assets into a new ETHYLNET-owned rootfs path and update routing conservatively; do not remove `/reseller`, `/tty-terminal`, PPPoE routing, or backend fallback.
- [ ] Verify exact image size, partition table, trailer hash, protected-file contract, raw filesystem structural class, and static UI contents.
- [ ] Run strict original/current comparison and create a release-verification report.
- [ ] Do not create the final gzip; final `.img.gz` remains the literal last packaging step.