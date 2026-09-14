# Social sign-in (Google now, Apple next) — 2026-09-14

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
- **Native shell**: buttons hide when the user agent is the Capacitor
  shell (`lib/sign-in-options.ts`) — web OAuth can't run in the webview.
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

## Next

- **Android**: native Google sign-in via a Capacitor plugin
  (`@capgo/capacitor-social-login`) → page posts the ID token to a second
  Credentials-style provider that verifies it and calls
  `resolveSocialSignIn`. Needs a Play update (SHA-1 of upload + app-signing
  keys registered as Android OAuth clients).
- **Apple** (web: no build; iOS: one build, and App Store rule 4.8 means
  Google can't appear in the iOS app until Apple does): Services ID +
  `.p8` key + Team ID; generate the client secret JWT at boot from env so
  the 6-month expiry never bites. Private-relay addresses won't match an
  owner-added teammate's email — the "no company attached" page must offer
  "sign in with password once to link".
- Profile "Sign-in email" change still requires the current password —
  Google-only logins can't change their address until they set one.
