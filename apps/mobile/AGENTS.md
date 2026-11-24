# Genealogiq Mobile — Agent Guide

One Expo / React Native app that contains all three systems: **Genealogiq** (consumer APP), **Sequoia** (SEQ) and **BMS**. The user picks a system on the sign-in screen; each system has its own backend origin, its own session token and its own brand theme. Read the [root guide](../../AGENTS.md) first.

## Stack

Expo SDK 58, React Native 0.88, React 19.3, Expo Router (file routes in `src/app`), HeroUI Native + Uniwind (Tailwind v4 class names), TanStack Query, `use-intl`, Zustand, `expo-secure-store`.

## How it talks to the backends

The web apps have no REST API; the mobile app reuses their queries and server actions through a thin bridge in each Next.js app:

| Route (in each of `apps/app`, `apps/bms`, `apps/seq`) | Purpose |
| --- | --- |
| `POST /api/mobile/v1/auth/login` | Email + password → bearer token (same lockout, rate limit and per-system gate as web sign-in) |
| `GET /api/mobile/v1/auth/me` | Live session for the presented token |
| `GET /api/mobile/v1/views/<name>` | One screen's data. Registry: `apps/<app>/src/mobile/views*.ts` |
| `POST /api/mobile/v1/actions/<name>` | One server action. Registry: `apps/<app>/src/mobile/actions.ts` |

- `packages/auth/src/mobile.ts` owns the token and the bridge. A mobile token is the session JWT encrypted with a mobile-only salt; the identity row is reloaded on every request, so deactivation and role changes apply immediately.
- Each app's `auth()` accepts a cookie session **or** a bearer token, so every existing guard, query, action and upload route works unchanged.
- **Every view must apply the same guard as the web page it mirrors.** Tenant and user ids come from the session, never from client parameters. Operations need an `Authorization` header unless listed in `publicViews` / `publicActions`.
- The typed client contracts live in `src/api/app.ts`, `src/api/seq.ts`, `src/api/bms.ts` (hand-written DTOs; dates are ISO strings, Decimals are strings). Never import server code into the mobile app.

## Layout

| Path | Contents |
| --- | --- |
| `src/app/(auth)` | Sign-in with the system selector, sign-up (Genealogiq only), forgot/reset password, verify email |
| `src/app/(app)` | Genealogiq screens. URLs match the web (`/home`, `/profile/[id]/…`, `/qr/[genCode]`) so emailed links and QR plaques open the right screen |
| `src/app/seq`, `src/app/bms` | Sequoia and BMS screens (URL prefix `/seq`, `/bms`) |
| `src/features/<area>` | Components and hooks owned by one area |
| `src/features/shared` | `QrExport` (presets, PNG/SVG/photos/copy), `charts` (`BarChart`, `DonutChart`) |
| `src/ui` | The shared UI kit. Build screens from it |
| `src/lib` | `upload` (pick/compress/upload media), `share` (share sheet, print, clipboard, in-app browser, protected downloads), `qr`, `format`, `query` |
| `src/auth` | Per-system session store and the `RequireSession` guard |
| `src/i18n` | Bundles the three web catalogues plus mobile-only strings |
| `themes/systems.css` | The six brand themes (`app|seq|bms` × light/dark) |

## Conventions

- **Data:** `useView(system, key, () => xApi.someView(...))` for reads; `useAction().run(() => xApi.someAction(...), { success, onSuccess })` for writes, then `useInvalidate(system)(...)`. Render reads with `<QueryView query={...}>`.
- **Errors:** never show raw errors. `ErrorState`, `useNotify().error` and `useErrorMessage` localise everything, including 403 (no permission) and network failures.
- **Translations:** reuse the web catalogue first: `useT('Namespace')` reads `apps/<system>/messages/<locale>.json` of the system on screen. Mobile-only strings go in `src/i18n/messages/areas/<area>.<locale>.json` and are read as `useT('Mobile.<area>')`; shared ones are under `Mobile.common`, `Mobile.errors`, `Mobile.auth`, `Mobile.account`, `Mobile.qr`. Keep all three locales (`en-US`, `pt-BR`, `es-MX`) in step. No hard-coded user-facing strings.
- **Styling:** Tailwind classes via `className` on React Native core components and HeroUI components, using theme tokens only (`bg-background`, `bg-surface`, `text-foreground`, `text-muted`, `bg-accent`, `text-accent-foreground`, `border-border`, `text-danger`, `bg-default`). No hard-coded colours except inside charts/SVG, where `usePalette(system)` supplies them. Third-party components take `style`, not `className`.
- **Navigation:** each system's `_layout.tsx` wraps its navigator in `<RequireSession system="…">` and renders a `Stack`/`Tabs` with headers; screens set their title with `<Stack.Screen options={{ title }} />`. Genealogiq public profile screens are reachable signed out.
- **Destructive actions** always go through `confirm({...})` first.
- **Permissions and capability flags** come from the server views (`canManage`, `isAdmin`, `canManageAccess`…). Hide controls the user cannot use, and still handle a 403.
- **Payments:** Stripe checkout and the billing portal open with `openInBrowser(url)`; entitlement is only ever read back from the server afterwards.
- **Accessibility:** every pressable has a role and label; touch targets are at least 44pt.

## Defaults

- The sign-in screen opens on **Genealogiq**; the system is chosen from a dropdown. A link such as `sequoia.genealogiq.com.br/reset-password` preselects its own system.
- The app starts in **Portuguese (pt-BR)**, whatever the device language, until the user picks another language in Account. Server messages follow the same choice through `Accept-Language`.

## Commands

| Command (from `apps/mobile`) | Use |
| --- | --- |
| `pnpm start` / `pnpm android` / `pnpm ios` / `pnpm web` | Run with Expo |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Unit tests for pure logic (`src/**/*.test.ts`) |
| `pnpm export:check` | Bundle for Android without a device (catches import and Metro errors) |

Backends default to the three local apps in development (`localhost`, or `10.0.2.2` on the Android emulator) and to production hosts in release builds; override with `EXPO_PUBLIC_*_URL` (see `.env.example`).

## Before a store release

These steps need accounts or decisions that are not in the repository:

1. **EAS project:** run `eas init` and `eas build:configure`; the project id it writes to `app.json` is also what push tokens need.
2. **Universal links:** emailed links and QR plaques open the app only after the web hosts serve the association files. Add `/.well-known/apple-app-site-association` (Apple team id + `br.com.genealogiq.mobile`) and `/.well-known/assetlinks.json` (the release signing certificate's SHA-256) to APP, BMS and SEQ. Until then links open the website.
3. **Payments:** decide how consumer plans are sold on iOS (see MOBILE-API-G3 in [docs/MOBILE-API.md](../../docs/MOBILE-API.md)).
4. **Maps on Android:** `react-native-maps` needs a Google Maps API key in `app.json` (`android.config.googleMaps.apiKey`).
5. **Device pass:** walk every screen on a real device; none has been run on one yet (MOBILE-API-G1).
