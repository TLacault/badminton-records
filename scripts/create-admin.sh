#!/usr/bin/env bash
# Creates a confirmed local auth user and promotes it to admin.
#
# There is no self-serve signup — /login only signs in, and profiles has no
# UPDATE policy on purpose (one would let any guest promote themselves). So the
# first admin has to be made out of band, which is what this does.
#
#   ./scripts/create-admin.sh you@example.com 'your-password'
#
# Local stack only: it uses the standard local service-role key, which is the
# same on every developer machine and is not a secret.
set -euo pipefail

EMAIL="${1:-}"
PASSWORD="${2:-}"

if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
  echo "usage: $0 <email> <password>" >&2
  exit 1
fi

API_URL="${SUPABASE_API_URL:-http://127.0.0.1:54321}"
SERVICE_KEY="$(pnpm exec supabase status -o json 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin)["SERVICE_ROLE_KEY"])')"

# email_confirm skips the mail round trip; Mailpit would hold it otherwise.
RESPONSE="$(curl -s -X POST "$API_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H 'Content-Type: application/json' \
  -d "$(python3 -c '
import json,sys
print(json.dumps({"email": sys.argv[1], "password": sys.argv[2], "email_confirm": True}))
' "$EMAIL" "$PASSWORD")")"

USER_ID="$(printf '%s' "$RESPONSE" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("id") or "")')"

if [[ -z "$USER_ID" ]]; then
  echo "Failed to create user:" >&2
  printf '%s\n' "$RESPONSE" >&2
  exit 1
fi

# The on_auth_user_created trigger already inserted the profile as 'guest'.
docker exec supabase_db_ust-blog-badminton psql -U postgres -d postgres -q \
  -c "update public.profiles set role = 'admin' where id = '$USER_ID';"

echo "Admin created: $EMAIL ($USER_ID)"
