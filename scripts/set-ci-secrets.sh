#!/usr/bin/env bash
# One-time: copy the staging e2e secrets from Railway into GitHub Actions
# secrets, without ever printing them. Needs `railway` (logged in, project
# linked) and `gh` (logged in). Re-run whenever a staging secret rotates.
#
#   bash scripts/set-ci-secrets.sh
set -euo pipefail
R="slyf3ll0w/knightlydigital"
STG_URL="https://streamflaire-staging.up.railway.app"

pick() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(String(JSON.parse(s)[process.argv[1]]||"")))' "$1"; }

app=$(railway variable list --service Streamflaire --environment staging --json)
pg=$(railway variable list --service Postgres --environment staging --json)
prod=$(railway variable list --service Streamflaire --environment production --json)

printf "%s" "$STG_URL"                          | gh secret set E2E_BASE_URL -R "$R"
printf "%s" "$app"  | pick AUTH_SECRET           | gh secret set E2E_AUTH_SECRET -R "$R"
printf "%s" "$app"  | pick CRON_SECRET           | gh secret set E2E_CRON_SECRET -R "$R"
printf "%s" "$pg"   | pick DATABASE_PUBLIC_URL   | gh secret set E2E_DATABASE_URL -R "$R"
# Finix SANDBOX keys (production runs sandbox today; staging inherits the same)
printf "%s" "$prod" | pick FINIX_API_USERNAME    | gh secret set FINIX_SANDBOX_API_USERNAME -R "$R"
printf "%s" "$prod" | pick FINIX_API_PASSWORD    | gh secret set FINIX_SANDBOX_API_PASSWORD -R "$R"
printf "%s" "$prod" | pick FINIX_APPLICATION_ID  | gh secret set FINIX_SANDBOX_APPLICATION_ID -R "$R"

echo "Set. Current GitHub secrets:"
gh secret list -R "$R"
