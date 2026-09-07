# Homebrew tap setup (one-time)

1. Create a public GitHub repo named `homebrew-tap` under your account.
2. Create a fine-grained personal access token with **Contents: read/write** on that repo only.
3. Add it to this repo's Actions secrets as `TAP_GITHUB_TOKEN`.
4. Add your npm automation token as `NPM_TOKEN`.
5. Bump `version` in `package.json`, commit, then `git tag v0.1.0 && git push --tags`.

The release workflow builds binaries, creates the GitHub release, publishes to npm, and pushes a rendered `Formula/fabpix.rb` to the tap.
Users then install with `brew install fabianmossberg/tap/fabpix`.
