#!/usr/bin/env bash
# Start PlusOne locally: the Vite dev server and `convex dev` side by side.
# Usage: ./start.sh            (web on http://localhost:5173, or the next free port)
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "node is not installed — install Node 20+ and try again." >&2
  exit 1
fi

node_major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$node_major" -lt 20 ]; then
  echo "Node $node_major found — PlusOne needs Node 20 or later." >&2
  exit 1
fi

if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

if [ ! -f .env.local ] || ! grep -q '^CONVEX_DEPLOYMENT=' .env.local; then
  cat >&2 <<'MSG'
No Convex deployment yet. Run this once, in another terminal:

  npx convex dev --once    # log in and create a dev deployment

It writes CONVEX_DEPLOYMENT and VITE_CONVEX_URL into .env.local. Backend keys
are set on the deployment (npx convex env set NAME value) — see the README.
MSG
  exit 1
fi

if ! grep -q '^VITE_CLERK_PUBLISHABLE_KEY=' .env.local; then
  echo "warning: VITE_CLERK_PUBLISHABLE_KEY is missing from .env.local — sign-in won't work." >&2
fi

# Only the names are read, never the values.
set_on_deployment=$(npx convex env list 2>/dev/null | cut -d= -f1 || true)
for key in CLERK_JWT_ISSUER_DOMAIN ANTHROPIC_API_KEY FIRECRAWL_API_KEY AGENTMAIL_API_KEY; do
  if ! grep -qx "$key" <<<"$set_on_deployment"; then
    echo "warning: $key is not set on the Convex deployment — npx convex env set $key ..." >&2
  fi
done

exec npm run dev
