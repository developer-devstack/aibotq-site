# Deployment Rollback, Bot-Aware Chat Deploys, Pricing Quotas, SAML SSO, Bitbucket & Monorepos

A complete implementation plan to upgrade aibotq.dev with instant artifact rollbacks, real-time agent build diagnostics, tiered subscription quota enforcement, enterprise SAML 2.0 single sign-on, full Bitbucket parity, and path-filtered monorepo builds.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were confirmed during the clarification interview:

- **Rollback Retention Window**: 7-day maximum age guard for rollbacks to previous "ready" deployments.
- **Chat Build Progress Experience**: Real-time status badge with live streaming build logs directly inside the chat message flow.
- **SAML SSO Configuration**: Support both IdP XML metadata upload/URL import and manual SSO Entity ID/URL/certificate entry.
- **Monorepo Management**: Visual monorepo app directory manager embedded in project settings, paired with path-filtered triggers.

---

## 1. Overview & Core Concept

**aibotq.dev** is a Cloudflare Worker (Nuxt 4 SSR + Nitro) deployment platform for AI agents with a D1 database, R2 upload bucket, agent chat with tool calling, and signed external build pipelines.

This release completes six mission-critical capabilities:
1. **Instant Deployment Rollbacks**: Restore any previous "ready" deployment from the last 7 days without triggering a rebuild, re-pointing the live production URL in milliseconds and broadcasting the signed rollback request to the build pipeline.
2. **Bot-Aware Chat Deployments**: Expand chat capabilities with tools (`deploy_project`, `list_deployments`, `get_build_log`, `rollback_deployment`, `set_env_var`). The assistant inspects live D1 deployment statuses, streams progress from queued to building to live, diagnoses errors from real build logs, and suggests actionable fixes.
3. **Pricing Tiers & Quota Enforcement**: Seed Hobby ($0/mo, 100 builds/mo), Pro ($20/mo, 1,000 builds/mo), and Team ($80/mo, unlimited builds) plans. Deploy paths (web and chat) strictly enforce quotas prior to dispatch and return upgrade guidance.
4. **Enterprise SAML 2.0 SSO**: SP-initiated login for Team organizations with XML metadata import, encrypted IdP credentials, signed SAML assertion verification, clock-skew protection (≤ 5 min), and Just-In-Time (JIT) provisioning while preserving GitHub identity linking.
5. **Bitbucket Full Parity**: First-class OAuth, repository search, branch detection, auto-deploy push webhooks for default branches, and preview deployments for PRs with fork gating and HMAC verification.
6. **Monorepo Multi-App Support**: Multiple app roots per project (each with dedicated framework, build command, and output directory) with path-filtered change detection so commits only rebuild affected apps.

---

## 2. User Experience & Visual Design

### Key User Flows

```
[Project Overview / Dashboard]
       │
       ├──► Deployments List ──► Select "Ready" deployment (< 7 days) ──► Click "Rollback"
       │                                                                      │
       │                                                                      ▼
       │                                                          Instant Live Pointer Updated
       │                                                          (Rollback badge & audit event)
       │
       ├──► Project Settings ──► Monorepo App Manager (Add apps, set root dirs & build configs)
       │                     └──► SAML SSO Settings (Team plan: upload XML / enter IdP URL)
       │
[Agent Chat Interface]
       │
       ├──► User: "Deploy my sales-agent project" ──► Bot checks quota & permissions
       │                                                   │
       │                                                   ▼
       │                                            Trigger deploy & stream real-time status:
       │                                            [Queued] ──► [Building] ──► [Live: URL]
       │
       └──► User: "Why did the latest build fail?" ──► Bot reads full log from D1
                                                           │
                                                           ▼
                                                    Identifies failing step + gives concrete fix
```

### Visual Identity & Theme
- **Theme**: Dark utilitarian developer console (`#09090b` canvas, `#18181b` elevated surfaces, `#27272a` hairline borders).
- **Typography**: Clean display sans (`Plus Jakarta Sans`), readable body text, and strict tabular monospace (`font-mono tabular-nums`) for timestamps, commit hashes, logs, and rate counters.
- **Badges & Rollback Status**: Clear, unboxed semantic badges:
  - `Live` (Emerald status)
  - `Rollback to #d_xxx` (Purple/Indigo indicator with clock reference)
  - `Queued / Building` (Amber / Blue pulsing spinner)
  - `Quota Exceeded` (Subtle warning alert linking to `/pricing`)
- **Top Bar Contract**: Breadcrumbs on the left, single-line navigation, and 1 primary CTA.

---

## 3. Key Product Decisions & Trade-Offs

- **Zero Rebuild Time for Rollbacks**: Rollback operations re-point the live project URL in D1 and dispatch an artifact restore event to the pipeline. They do not trigger a fresh compilation or source clone.
- **Write-Only Environment Variables**: The chat tool `set_env_var` accepts secret values and encrypts them via AES-GCM before writing to D1. Secrets are never echoed back in chat logs or responses.
- **Quota Check Before Dispatch**: Quota evaluation happens synchronously before writing a deployment record or making external calls. If a user on Hobby exceeds 100 builds in the monthly window, the API responds with a structured `quota_exceeded` error payload containing current usage and an upgrade link.
- **Encrypted SAML & Credentials in D1**: SAML signing certificates, IdP metadata, and webhook secrets are AES-GCM encrypted using the existing `SESSION_SECRET` key derivation before database insertion.

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        aibotq.dev Web Client                           │
│  (Nuxt 4 / Nuxt UI v4 / Vue 3 / Dashboard / Chat / New / Settings)     │
└───────────────────▲────────────────────────────────▲───────────────────┘
                    │                                │
             REST / API Calls                   WebSocket /
          (CSRF & Origin Checked)            Real-time Chat SSE
                    │                                │
┌───────────────────▼────────────────────────────────▼───────────────────┐
│                       Nitro / Cloudflare Worker                        │
│                                                                        │
│   ┌───────────────────────────┐    ┌───────────────────────────────┐   │
│   │ API Router (/server/lib)  │    │ Chat Agent & Tools            │   │
│   │ - Rollback Endpoint       │    │ - deploy_project              │   │
│   │ - Bitbucket Webhook       │    │ - list_deployments            │   │
│   │ - SAML SP & Metadata      │    │ - get_build_log               │   │
│   │ - Quota Guard             │    │ - rollback_deployment         │   │
│   │ - Monorepo Dispatcher     │    │ - set_env_var (write-only)    │   │
│   └─────────────┬─────────────┘    └───────────────┬───────────────┘   │
└─────────────────┼──────────────────────────────────┼───────────────────┘
                  │                                  │
                  ▼                                  ▼
┌──────────────────────────────────┐   ┌─────────────────────────────────┐
│      Cloudflare D1 Database      │   │   External Pipeline / Sandbox   │
│ - projects / monorepo_apps       │   │ - HMAC-signed deploy requests   │
│ - deployments (rollback badges)  │   │ - Artifact restore on rollback  │
│ - plans & usage quotas           │   │ - Push/PR build execution       │
│ - saml_configs & sessions        │   └─────────────────────────────────┘
└──────────────────────────────────┘
```

### Database Schema Updates (`migrations/0003_platform_v2.sql`)

1. **Plans & Subscriptions Table**:
   - `plans`: `id` (hobby, pro, team), `name`, `price_cents`, `builds_per_month`, `max_projects`, `max_custom_domains`, `seats`, `concurrent_builds`.
   - `user_subscriptions`: `user_id`, `plan_id`, `billing_cycle_start`, `billing_cycle_end`, `status`.
2. **Deployments Table Extensions**:
   - Add `is_rollback` (INTEGER DEFAULT 0), `rollback_from_id` (TEXT), `app_id` (TEXT NULL).
3. **Monorepo Apps Table**:
   - `project_apps`: `id`, `project_id`, `name`, `root_dir`, `framework`, `build_command`, `output_dir`, `created_at`.
4. **SAML Configurations Table**:
   - `saml_configs`: `id`, `org_id` / `user_id`, `entity_id`, `sso_url`, `cert_enc`, `idp_metadata_enc`, `role_mapping_json`, `created_at`.
5. **Bitbucket Columns**:
   - `bitbucket_id` support and webhook metadata in `projects`.

### Interactive Component & State Mapping

- **Rollback Handler (`POST /api/projects/:id/deployments/:did/rollback`)**:
  - Validates user ownership/membership.
  - Verifies target deployment `status === 'ready'` and `created_at >= Date.now() - 7 * 86400 * 1000`.
  - Dispatches signed `rollback` event to `DEPLOY_WEBHOOK_URL` with artifact pointer.
  - Updates project live URL and records a new deployment record flagged as `is_rollback = 1`.
- **Chat Tool Suite**:
  - `deploy_project`: Checks project ownership and plan quotas; dispatches build; returns initial status.
  - `list_deployments`: Retrieves latest deployment history, including environment and duration.
  - `get_build_log`: Retrieves log snippet or full build output for debugging.
  - `rollback_deployment`: Invokes rollback pipeline from chat with instant verification.
  - `set_env_var`: Encrypts and writes project environment variables safely.
- **SAML SP Endpoints**:
  - `GET /api/auth/saml/metadata`: Generates valid XML SP metadata.
  - `GET /api/auth/saml/login`: Initiates SP login with signed AuthnRequest.
  - `POST /api/auth/saml/acs`: Assertion Consumer Service validating signature, timestamps (≤ 5 min skew), and JIT user provisioning.
- **Bitbucket Integration**:
  - Webhook route: `/api/webhooks/bitbucket` handling `repo:push` and `pullrequest:created`/`updated`.
  - Fork filtering and branch matching.
- **Monorepo Path Filter**:
  - Compares changed files list in webhook commit payloads against registered `root_dir` values.
  - Skips builds for untouched apps.
- **Documentation & Changelog**:
  - Updates `/docs` with monorepo guides, SAML SSO setup, and rollback instructions.
  - Updates `/changelog` with release notes for the new capabilities.
