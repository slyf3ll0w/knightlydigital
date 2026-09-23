# Social sign-in (Google + Apple) — 2026-09-14, Apple added 2026-09-23

## 2026-09-23 — Sign in with Apple BUILT (web + iOS app), native Google on iOS

One `SocialSignIn` prop (`lib/sign-in-options.ts socialSignInFor`) now decides the
buttons per surface: web = OAuth redirect for both; Android shell = native Google;
iOS shell = native Apple + native Google, Google never without Apple (rule 4.8).
Web Apple: NextAuth Apple provider, client secret minted from the .p8 at boot
(`lib/apple-signin.ts`); Apple's form_post callback is bounced POST→GET by
`middleware.ts` so Lax cookies (PKCE, session, verify-intent) survive; the one-time
`user` field parks in `wb-apple-user`. Native: `lib/native-social-signin.ts` →
`apple-native` / `google-native` providers (`lib/apple-id-token.ts`, audience =
bundle id). Placeholder-adoption rule in `resolveSocialSignIn`: connecting an
identity that only opens an empty account moves it (Hide-My-Email teammates).
Console/env steps: `native-release-queue.md` § App Store. Store build 1.3 pending.


## What shipped (web Google, no store build)

- **Schema**: `Account.passwordHash` is nullable (social-only logins);
  new `AccountIdentity` table keyed on `(provider, providerAccountId)`.
  Both changes are additive — safe for the boot-time `prisma db push`.
- **Rules** — `lib/social-login.ts` `resolveSocialSignIn`:
  1. known identity → that Account;
  2. unknown identity + signed-in caller → link to the caller's Account;
  3. unknown identity + **verified** email match → link to that Account
     (security notice email sent);
  4. nobody home → new password-less Account + company-less placeholder
     `User` row (role OWNER, companyId null) so the session has a row to
     point at.
  Unverified provider emails never link to anything. Staff-only accounts are
  refused with the same generic error as the password path.
- **NextAuth** — `lib/auth-options.ts` `buildAuthOptions(ctx)`: Google
  provider included only when `GOOGLE_SIGNIN_CLIENT_ID/SECRET` are set;
  `signIn` callback runs the rules; `jwt` re-checks company-less tokens for
  a company on every read (so /apply's in-place adoption lands). The route
  handler builds options per request so "Connect Google" from the profile
  links to the *current* session's account (`linkIntent` = session has a
  company).
- **Surfaces**: login page (`Continue with Google` above the password
  form; the page is now a server `page.tsx` that passes `googleEnabled`
  to the client `LoginForm.tsx`), `/apply` and `/invite` (`Sign up with Google` → come back signed
  in, company-less → form drops email/password, POST opens the company on
  that login → `update({ switchToUserId })` → `/app/activate` or `/app`),
  `/app/register` copy for company-less Google logins (points at /apply),
  Settings → My Profile → **Connected sign-ins** card (connect /
  disconnect; disconnect refused when it's the only way in) and a
  "no password yet → Forgot password" card replacing Change password.
- **Native shell**: buttons hid when the user agent was the Capacitor
  shell (`lib/sign-in-options.ts`) — web OAuth can't run in the webview.
  Android now has its own path instead (below); iOS still hides.
- `lib/signup.ts` adopts the company-less placeholder row as the OWNER row
  instead of creating a sibling (no orphans; the live session id stays
  valid).

## David's side (Google Cloud Console, same project as Calendar sync)

1. APIs & Services → Credentials → Create OAuth client ID → **Web
   application**, name "WorkBench sign-in".
2. Authorized JavaScript origins: `https://workbenchfsm.com`,
   `http://localhost:3000`.
3. Authorized redirect URIs:
   `https://workbenchfsm.com/api/auth/callback/google`,
   `http://localhost:3000/api/auth/callback/google`.
4. Railway: `GOOGLE_SIGNIN_CLIENT_ID`, `GOOGLE_SIGNIN_CLIENT_SECRET`.
   (`NEXTAUTH_URL=https://workbenchfsm.com` is already set — NextAuth
   builds the redirect URI from it.)
5. OAuth consent screen **publishing status**: if "Testing", only listed
   test users can sign in with Google. Sign-in scopes (openid, email,
   profile) are non-sensitive, so pushing to "In production" is fine while
   the Calendar scope verification is pending.

## Verify on prod (after env is set)

- `/app/login` shows the Google button; `/api/auth/providers` lists
  `google`.
- Existing password login → Google with the same address → lands in the
  company, `AccountIdentity` row created, notice email received.
- Owner adds a teammate by email (Team page) → that person's first Google
  sign-in lands in the company (email match, rule 3).
- Brand-new Google account → `/app/register` copy → `/apply` attach form →
  company opens → `/app/activate`.
- Profile: Connect Google with a *different* Google address links it;
  Disconnect refused when no password; Forgot password sets one.
- Native shell (Android app): no Google button on the login page.

## Android native Google (built, ships in versionCode 4)

Google refuses OAuth inside an embedded webview, so the shell never runs the
redirect. Instead `@capgo/capacitor-social-login` opens the OS Credential
Manager sheet and returns an OIDC **ID token**, which is the only proof of
identity on that path — so it is verified before it means anything:

- `lib/google-id-token.ts` — signature against Google’s JWKS, issuer,
  audience, expiry. Audience is the **web** `GOOGLE_SIGNIN_CLIENT_ID`:
  Credential Manager is initialized with it as the *server* client id, so the
  token is addressed to our backend. That is why there is no new env var.
- `lib/auth-options.ts` — a `google-native` credentials provider (no redirect
  to run) that verifies, then calls the SAME `resolveSocialSignIn` rules as
  the web. One rule set, three doors in.
- `lib/native-google-signin.ts` — reaches the plugin through
  `window.Capacitor.Plugins`, never an `@capacitor/*` import, so the web
  bundle is untouched (same pattern as `NativeShell.tsx`).
- **Connect** from Settings is `POST /api/app/profile/identities`, not a
  sign-in. A credentials provider would re-mint the JWT and could land the
  person on a different company than the one they were looking at —
  connecting a sign-in method must not move you.
- **Old installs**: versionCode 3 is live with no plugin and loads this same
  web code. `useGoogleSignInOffered` resolves after mount and hides the whole
  block — button and "or" rule — when the plugin is missing.
- **Android only** (`isAndroidShellUserAgent`): both shells share the
  `StreamflaireHubShell` UA suffix, so the platform comes from the rest of the
  string. iOS waits for Apple (rule 4.8).

Console setup owed before the release is live: two **Android** OAuth clients
for `com.streamflaire.hub`, one per signing key — upload
(`D9:C7:8B:33:AC:C8:FF:32:33:BE:BC:28:55:52:D0:88:63:41:88:11`) and the Play
app-signing key from Play Console → Setup → App signing. Play re-signs every
upload, so the second one is what real users present.

## Next

- **Apple** (web: no build; iOS: one build, and App Store rule 4.8 means
  Google can't appear in the iOS app until Apple does): Services ID +
  `.p8` key + Team ID; generate the client secret JWT at boot from env so
  the 6-month expiry never bites. Private-relay addresses won't match an
  owner-added teammate's email — the "no company attached" page must offer
  "sign in with password once to link".
- Profile "Sign-in email" change still requires the current password —
  Google-only logins can't change their address until they set one.

## 2026-09-18 — "Verify it's you" (recent authentication)

Sensitive account changes now take a fresh proof of identity first, the way
Google, GitHub and Apple gate theirs, instead of a password field on each form
(which a Google-only login could never fill): connect / disconnect a sign-in
method, change the sign-in email, set or change the password, delete the
account.

- **Proof** = a ten-minute, account-bound HMAC grant cookie (`lib/reauth.ts`).
  Minted by `POST /api/app/auth/reauth` with the password, or with a native
  Google ID token whose identity is connected to this login, or — on the web —
  by the OAuth callback after a Google round-trip started with `{ method:
  "google", start: true, returnTo }` (intent cookie → `?reauth=ok` back on the
  page). Routes check it with `proveIdentity()`; a typed password still counts
  on its own.
- **UI** = `useVerifyIdentity()` + its dialog (`components/VerifyIdentity.tsx`):
  password and/or "Continue with Google", whichever the login has. Profile →
  **Sign-in methods** (`components/SignInMethodsCard.tsx`): Password (Add /
  Change), Google (Connect / Disconnect), Apple (coming with the iPhone app).
  A Google-only login adds its password right there.
- **Apple**: add the provider to `resolveSocialSignIn`, an `apple` branch in
  `POST /api/app/auth/reauth` (verify the Apple ID token, same identity-must-
  belong rule), and flip the Apple row from "coming" to Connect. Everything
  else — grants, the dialog, the routes — already handles `via: "apple"`.
