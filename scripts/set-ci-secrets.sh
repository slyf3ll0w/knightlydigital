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

# Everything comes from STAGING, never production: the card specs move money
# through whatever Finix keys land here, and this is a public repo's CI. The
# day production flips to live keys, a re-run for an unrelated rotation must
# not carry them along.
finix_env=$(printf "%s" "$app" | pick FINIX_ENVIRONMENT)
if [ "${finix_env:-sandbox}" != "sandbox" ]; then
  echo "Refusing: staging FINIX_ENVIRONMENT is '$finix_env', not sandbox." >&2
  exit 1
fi

printf "%s" "$STG_URL"                          | gh secret set E2E_BASE_URL -R "$R"
printf "%s" "$app"  | pick AUTH_SECRET           | gh secret set E2E_AUTH_SECRET -R "$R"
printf "%s" "$app"  | pick CRON_SECRET           | gh secret set E2E_CRON_SECRET -R "$R"
printf "%s" "$pg"   | pick DATABASE_PUBLIC_URL   | gh secret set E2E_DATABASE_URL -R "$R"
printf "%s" "$app"  | pick FINIX_API_USERNAME    | gh secret set FINIX_SANDBOX_API_USERNAME -R "$R"
printf "%s" "$app"  | pick FINIX_API_PASSWORD    | gh secret set FINIX_SANDBOX_API_PASSWORD -R "$R"
printf "%s" "$app"  | pick FINIX_APPLICATION_ID  | gh secret set FINIX_SANDBOX_APPLICATION_ID -R "$R"

echo "Set. Current GitHub secrets:"
gh secret list -R "$R"
