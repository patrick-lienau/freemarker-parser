#!/usr/bin/env bash
# Build, test, commit, tag, push, publish, and GitHub-release a freemarker-parser
# version.
#
# Usage: publish-release.sh <version> <commit-message-file>
#
# Preconditions (checked below, not assumed): run from the repo root, with
# package.json already bumped to <version> and docs/release/<version>/ already
# written. This script only does the mechanical last mile; it never decides the
# version or writes the release docs itself.
#
# Unlike the cx-tooling equivalent, this repo publishes a BUILT artifact (`lib/`,
# git-ignored, produced by `tsc -b`) and carries a real test suite. Both are gated
# here, before anything is committed.
set -euo pipefail

VERSION="${1:?usage: publish-release.sh <version> <commit-message-file>}"
MSG_FILE="${2:?usage: publish-release.sh <version> <commit-message-file>}"
RELEASE_DIR="docs/release/${VERSION}"
TAG="v${VERSION}"

# --- preconditions ----------------------------------------------------------

if [ ! -f "$MSG_FILE" ]; then
  echo "ERROR: commit message file '$MSG_FILE' not found." >&2
  exit 1
fi

if [ ! -d "$RELEASE_DIR" ]; then
  echo "ERROR: $RELEASE_DIR does not exist — write the release docs first (see /create-neptune-release)." >&2
  exit 1
fi

CURRENT_VERSION=$(node -p "require('./package.json').version")
if [ "$CURRENT_VERSION" != "$VERSION" ]; then
  echo "ERROR: package.json version is '$CURRENT_VERSION', expected '$VERSION'. Bump it first." >&2
  exit 1
fi

REGISTRY=$(node -p "require('./package.json').publishConfig && require('./package.json').publishConfig.registry || ''")
if [[ "$REGISTRY" != *"thirdwavellc.com"* ]]; then
  echo "ERROR: publishConfig.registry is '${REGISTRY:-<unset>}', not the private registry. Refusing to publish." >&2
  exit 1
fi

# A tag that already exists means this version was (at least partly) released.
# Re-running would fail mid-way; fail up front instead, while nothing has moved.
if git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null; then
  echo "ERROR: tag ${TAG} already exists locally. This version looks already released." >&2
  exit 1
fi
if git ls-remote --exit-code --tags origin "$TAG" >/dev/null 2>&1; then
  echo "ERROR: tag ${TAG} already exists on origin. This version is already released." >&2
  exit 1
fi

# Nothing uncommitted besides the two paths this release actually touches —
# otherwise `git add` below would silently sweep up unrelated WIP.
DIRTY=$(git status --porcelain -- . ":(exclude)package.json" ":(exclude)${RELEASE_DIR}")
if [ -n "$DIRTY" ]; then
  echo "ERROR: unrelated uncommitted changes present besides package.json and ${RELEASE_DIR}:" >&2
  echo "$DIRTY" >&2
  exit 1
fi

# --- build + test, before anything is committed -----------------------------

# `lib/` is what actually ships (package.json `files`) and is git-ignored, so a
# publish that skips this ships stale output — or nothing. Rebuild from scratch.
echo "==> Rebuilding lib/ from src/"
rm -rf lib
yarn build

echo "==> Running the test suite"
yarn test

# --- commit, tag, push ------------------------------------------------------

git add package.json "$RELEASE_DIR"

# The bump often lands alongside the fix it belongs to, so there may be nothing
# left to stage. That is a normal path here, not an error — tag HEAD instead.
if git diff --cached --quiet; then
  echo "==> Nothing left to commit; tagging HEAD ($(git rev-parse --short HEAD))"
else
  git commit -F "$MSG_FILE"
fi

git tag -a "$TAG" -m "Release ${VERSION}"
git push origin HEAD --follow-tags

# --- publish ----------------------------------------------------------------

# --userconfig is required: this environment's npm otherwise reads a bundled
# runtime npmrc that carries neither the @neptune: registry mapping nor its
# credentials, and the publish would go somewhere wrong or fail on auth.
echo "==> Publishing to ${REGISTRY}"
npm publish --userconfig "$HOME/.npmrc"

PKG_NAME=$(node -p "require('./package.json').name")
PUBLISHED=$(npm view "$PKG_NAME" version --registry "$REGISTRY" --userconfig "$HOME/.npmrc")
if [ "$PUBLISHED" != "$VERSION" ]; then
  echo "ERROR: registry shows '$PUBLISHED' after publish, expected '$VERSION'." >&2
  exit 1
fi

# --- GitHub release ---------------------------------------------------------

# Cosmetic relative to everything above, and the package is already published by
# this point — so a missing/unauthenticated gh is a warning, not a failure.
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  gh release create "$TAG" \
    --title "freemarker-parser ${VERSION}" \
    --notes-file "${RELEASE_DIR}/changes.md"
else
  echo "WARNING: gh unavailable or not authenticated — skipping the GitHub release." >&2
  echo "         Create it later with:" >&2
  echo "         gh release create ${TAG} --title 'freemarker-parser ${VERSION}' --notes-file ${RELEASE_DIR}/changes.md" >&2
fi

echo
echo "Released ${PKG_NAME} ${VERSION}: built, tested, committed, tagged ${TAG}, pushed, published to ${REGISTRY}."
echo "Consumers still pin the previous version — bump @neptune/cx-tooling's dependency separately."
