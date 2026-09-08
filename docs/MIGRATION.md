# Independent CLI maintenance

Source: `carbonstop/ccdb-integrations` commit `b69f46b5b6f44c70067032a01edaafd13aa790d4`.
This is a source snapshot, not a history rewrite. The original repository is unchanged.

## Ownership

- This repository owns `ccdb-cli`, executable `ccdb-cli`.
- `carbonstop/ccdb-mcp` independently owns `ccdb-mcp-server`.
- `carbonstop/skills` contains instructions only and consumes the CLI command contract or MCP tools.
- Shared authentication, API contracts, HTTP and credential storage are maintained in `carbonstop/ccdb-client` and consumed from the public npm package [`ccdb-client`](https://www.npmjs.com/package/ccdb-client). The root build dependency is pinned to `0.1.1`; there is no copied client workspace to synchronize. Private GitHub source access is not required to install or build this repository.
- Fix shared logic in the client repository and publish a client version first. Then update the dependency and lockfile in CLI and MCP with linked upgrade PRs, and run both complete verification suites. Keep the consumer auth, callback, contract and error-redaction regression tests against the published package. CLI/MCP releases are still independent: publishing client alone does not update already installed consumers.
- Builds bundle the pinned client into the npm artifact and native binary, including its MIT license in third-party notices. End users do not install `ccdb-client` separately.
- MCP has its own copy of runner/output helpers. There are no cross-repository imports, symlinks, submodules or install-time downloads.

## Breaking migration from the legacy CLI

The old `carbonstop-ccdb` package / `ccdb` command in `skills/cli` is not overwritten or unpublished. Old release tags remain recoverable in that repository.
Install the new local tarball and update integrations to `ccdb-cli factor search` and `ccdb-cli factor detail`. There is no drop-in compatibility promise for old search/compare arguments. Comparison is performed by the Skill using the returned candidates and details, not a replacement legacy compare command.

OAuth requires the matching backend endpoints and registered client. API Keys still require backend permission. No fallback to the old unauthenticated API is included. The npm bundle requires Node.js 22+; independent SEA binaries embed the runtime. See [distribution](DISTRIBUTION.md).

## Release and verification

Run `npm ci` then `npm run verify`; local archives and checksums appear under `dist/releases`.
Publish only `packages/ccdb-cli` after build, never the private development root. The client package is released separately from its own repository. The final npm package name is `ccdb-cli`, matching the executable; the earlier scoped name was not published. Publishing requires package maintainer permissions, not membership in the `@carbonstop` organization. Build/CI does not publish npm or add release credentials.
Before public distribution, confirm company approval and the intended source license (the source snapshot has no LICENSE), and review third-party notices. The new repository starts private.

Tests use mock services and offline package installs. They do not prove production OAuth, macOS/Linux keychain, end-user host integration, revocation, quotas or audit behavior. Re-run real-backend acceptance for the deployment being released. No production account or token is included.
