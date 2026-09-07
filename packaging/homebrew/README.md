# Release setup (one-time)

1. The tap repo `fabianmossberg/homebrew-tap` exists (public).
2. Create a fine-grained GitHub token with **Contents: read/write** on `homebrew-tap` only,
   and add it to this repo: `gh secret set TAP_GITHUB_TOKEN`.
3. Create an npm granular access token with publish rights (bypass 2FA) and add it:
   `gh secret set NPM_TOKEN`. After the first publish you can switch to npm trusted
   publishing and delete the token.

# Releasing (every time)

Nothing to do by hand. Merge conventional commits into master (`feat:`, `fix:`, `feat!:`).
release-please keeps a "chore(main): release X.Y.Z" pull request open; merging it tags the
release, builds binaries, publishes to npm and updates the tap. Pre-1.0, `feat:` bumps the
minor version and `fix:` the patch.

Users install with `brew install fabianmossberg/tap/fabpix` or `npm i -g fabpix`.
