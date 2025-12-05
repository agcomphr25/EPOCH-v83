#!/bin/bash
# Feature Branch Push Script
# Usage: bash push-feature.sh
# Or with custom slug: SLUG="my-change" bash push-feature.sh

slug="${SLUG:-my-change}"   # Use SLUG env var or default to "my-change"

echo "=== Feature Branch Push Script ==="
echo "Slug: $slug"
echo ""

git fetch origin
git switch main || git checkout main
git pull --ff-only origin main

branch="feature-$(date +%Y%m%d-%H%M)-$slug"
git switch -c "$branch" || git checkout -b "$branch"

# Stage & commit anything you changed
if git status --porcelain | grep -q .; then
  git add -A
  git commit -m "feat: $slug" --no-verify || true
else
  echo "No local changes detected to commit."
fi

# Push & show diff vs origin/main
git push -u origin HEAD
git fetch origin
git log --oneline --decorate --graph --left-right "origin/main...HEAD" || true
git diff --stat origin/main...HEAD || true

# Print PR link
repo_url="$(git remote get-url origin | sed 's/\.git$//')"
echo ""
echo "=== Open PR ==="
echo "$repo_url/compare/$branch?expand=1"
