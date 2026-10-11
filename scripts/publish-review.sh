#!/usr/bin/env bash
# Publish a tested Git bundle without touching main; create/reuse exactly one final PR.
set -euo pipefail
REPO='CinthiaOchoa/ClearCircle'
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Works when copied next to the bundle in the review package.
BUNDLE="$ROOT/ClearCircle.git.bundle"
DEST="${1:-$ROOT/ClearCircle-review}"
EXPECTED_MAIN='f7cd57d6bad7a7d586694650dd14a53fa9dda60c'
BRANCHES=(feat/photon-integration feat/document-ai feat/family-coordination feat/clearcircle-web)
for command in git gh; do
  command -v "$command" >/dev/null || { echo "Install $command before publishing." >&2; exit 2; }
done
gh auth status --hostname github.com >/dev/null || { echo 'Authenticate with gh auth login first.' >&2; exit 2; }
[[ -f "$BUNDLE" ]] || { echo 'Run the copy of this script next to ClearCircle.git.bundle in the review ZIP.' >&2; exit 2; }
[[ ! -e "$DEST" ]] || { echo 'Use a new destination directory; this script never overwrites a checkout.' >&2; exit 2; }
git clone "$BUNDLE" "$DEST"
git -C "$DEST" remote set-url origin "https://github.com/$REPO.git"
for branch in "${BRANCHES[@]}"; do
  if ! git -C "$DEST" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$DEST" branch "$branch" "refs/remotes/origin/$branch"
  fi
done
git -C "$DEST" switch feat/clearcircle-web
# The credential helper is scoped to each command; no token enters the remote URL or output.
run_git(){ git -C "$DEST" -c credential.helper= -c 'credential.helper=!gh auth git-credential' "$@"; }
run_git fetch origin main
ACTUAL_MAIN="$(git -C "$DEST" rev-parse refs/remotes/origin/main)"
[[ "$ACTUAL_MAIN" == "$EXPECTED_MAIN" ]] || {
  echo 'Remote main changed since this package was tested. Reconcile changes on a feature branch and rerun checks before publishing.' >&2; exit 3;
}
for branch in "${BRANCHES[@]}"; do
  remote="$(run_git ls-remote origin "refs/heads/$branch" | awk '{print $1}')"
  local="$(git -C "$DEST" rev-parse "$branch")"
  [[ -z "$remote" || "$remote" == "$local" ]] || { echo "Remote branch has different work: $branch. No force push will be used." >&2; exit 3; }
done
# These are the ONLY refs ever pushed by this script.
run_git push origin "${BRANCHES[@]}"
EXISTING="$(gh pr list --repo "$REPO" --base main --head feat/clearcircle-web --state all --json state,url --jq '.[0] | if . == null then "" else .state + " " + .url end')"
if [[ "$EXISTING" == OPEN\ * ]]; then
  echo "Existing final PR: ${EXISTING#OPEN }"
elif [[ -n "$EXISTING" ]]; then
  echo "A final PR already exists ($EXISTING). Refusing to create another." >&2; exit 3
else
  gh pr create --repo "$REPO" --base main --head feat/clearcircle-web \
    --title 'ClearCircle: Photon/Gemini family coordination and protected Next.js dashboard' \
    --body-file "$DEST/docs/pr-body.md"
fi
echo 'Feature branches published. No push to main or PR merge was performed.'
