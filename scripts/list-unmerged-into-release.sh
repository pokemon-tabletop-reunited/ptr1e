#!/usr/bin/env bash
set -euo pipefail

# Usage: ./list-unmerged-into-release.sh [branch]
# Defaults to 'release' if no branch is provided.

BRANCH=${1:-release}

git fetch --prune

echo "Local branches not merged into '$BRANCH':"
git branch --no-merged "$BRANCH" | sed 's/^[ *]*//'

#echo
#echo "Remote branches (origin/*) not merged into 'origin/$BRANCH':"
#git branch -r --no-merged "origin/$BRANCH" | sed 's#^[ *]*origin/##; s/^[ *]*//' || true
