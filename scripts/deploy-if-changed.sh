#!/usr/bin/env bash
# Claude Code Stop hook: ship main to Vercel production when Claude leaves new
# commits behind. Skips when HEAD was already deployed or the tree is dirty
# (vercel uploads the working tree, so a dirty tree would ship uncommitted work).
# Runs the deploy detached; the log lands in .vercel/deploy.log.
set -euo pipefail
cd "$(dirname "$0")/.."

stamp=.vercel/last-deployed
head=$(git rev-parse HEAD)
[[ "$(git branch --show-current)" == main ]] || exit 0
[[ "$(cat "$stamp" 2>/dev/null)" == "$head" ]] && exit 0
[[ -z "$(git status --porcelain)" ]] || exit 0

echo "$head" > "$stamp"
nohup bash -c "vercel --prod --yes > .vercel/deploy.log 2>&1 || rm -f '$stamp'" >/dev/null 2>&1 &
echo "{\"systemMessage\": \"Deploying ${head:0:7} to Vercel production (log: .vercel/deploy.log)\"}"
