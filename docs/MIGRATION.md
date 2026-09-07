# Independent CLI maintenance

Source: `carbonstop/ccdb-integrations` commit `b69f46b5b6f44c70067032a01edaafd13aa790d4`.
This is a source snapshot, not a history rewrite. The original repository is unchanged.

## Ownership

- This repository owns `ccdb-cli`, executable `ccdb-cli`.
- `carbonstop/ccdb-mcp` independently owns `ccdb-mcp-server`.
- `carbonstop/skills` contains instructions only and consumes the CLI command contract or MCP tools.
- `packages/ccdb-client` is private, bundled source, not an npm dependency to publish. Authentication and API fixes must be reviewed and ported to the matching directory in the MCP repository. Record the corresponding PR in both repositories. Run each repository's complete verify suite, particularly credential locking, refresh rotation, callback and error redaction tests.
- MCP has its own copy of runner/output helpers. There are no cross-repository imports, symlinks, submodules or install-time downloads.

## Breaking migration from the legacy CLI

The old `carbonstop-ccdb` package / `ccdb` command in `skills/cli` is not overwritten or unpublished. Old release tags remain recoverable in that repository.
Install the new local tarball and update integrations to `ccdb-cli factor search` and `ccdb-cli factor detail`. There is no drop-in compatibility promise for old search/compare arguments. Comparison is performed by the Skill using the returned candidates and details, not a replacement legacy compare command.

OAuth requires the matching backend endpoints and registered client. API Keys still require backend permission. No fallback to the old unauthenticated API is included. The npm bundle requires Node.js 22+; independent SEA binaries embed the runtime. See [distribution](DISTRIBUTION.md).

## Release and verification

Run `npm ci` then `npm run verify`; local archives and checksums appear under `dist/releases`.
Publish only `packages/ccdb-cli` after build, never the private root or client workspace. The final npm package name is `ccdb-cli`, matching the executable; the earlier scoped name was not published. Publishing requires package maintainer permissions, not membership in the `@carbonstop` organization. Build/CI does not publish npm or add release credentials.
Before public distribution, confirm company approval and the intended source license (the source snapshot has no LICENSE), and review third-party notices. The new repository starts private.

Tests use mock services and offline package installs. They do not prove production OAuth, macOS/Linux keychain, end-user host integration, revocation, quotas or audit behavior. Re-run real-backend acceptance for the deployment being released. No production account or token is included.
