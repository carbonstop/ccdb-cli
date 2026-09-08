# CLI naming, native builds and npm

- npm package: `ccdb-cli`, version `0.1.1`.
- Command and standalone executable: `ccdb-cli` (`ccdb-cli.exe` on Windows).
- Version 0.1.1 selects OAuth client IDs by profile (`ccdb-cli-local`, `ccdb-cli-test`, `ccdb-cli-pre`, `ccdb-cli-prod`). Register them on the corresponding authorization server before use. Changing client ID requires a new login; `CCDB_CLIENT_ID` can explicitly retain a previously registered ID. See [client registration](CLIENT_REGISTRATION.md).

## Two distributions

The published npm package bundles JavaScript and needs Node.js 22+. Install with `npm install -g ccdb-cli` (or pin `ccdb-cli@0.1.1`). No source checkout or local tgz is needed. It does not download a native executable at installation time.

Native builds embed Node.js using SEA, so the end user does not need Node.js or npm. Build on the target OS/architecture using Node.js 24.19.0:

```sh
npm ci
npm run verify
npm run build:native
npm run test:native
```

Output: `dist/native/<platform>-<arch>/ccdb-cli` or `ccdb-cli.exe`, with dependency notices, the embedded Node license and `BUILD.json` containing the binary SHA-256. CI builds and tests Linux x64/arm64, macOS x64/arm64 and Windows x64. These are separate targets, not one universal executable; Windows arm64 and Linux musl are not currently provided.

Download the matching CI artifact (or maintainer-provided release archive) as a complete directory. GitHub artifact ZIPs do not preserve Unix executable permissions; run `chmod +x ccdb-cli` after extraction on macOS/Linux. Move the executable to a directory on PATH if desired. Keep the license files when redistributing.

Native smoke tests invoke a copy of the executable with an empty PATH, then query a local mock API for search/detail and diagnostics. They do not replace real OAuth and native keychain acceptance. OS tools used for browser/keychain operations still need to be available on the user's normal PATH.

macOS builds are ad-hoc signed, not Developer ID signed/notarized; Windows builds are not Authenticode signed. Public download distribution may trigger OS trust prompts. Do not disable OS security globally. Production signing requires the organization's certificates and release process.

## npm release

Use the official registry, not a package mirror. Authenticate using `npm login --registry=https://registry.npmjs.org/`; the account needs publish permission for `ccdb-cli`. The package is unscoped and does not depend on `@carbonstop` organization membership. Never commit tokens.

After reviewing the package contents and confirming company/license approval:

```sh
npm run verify
npm publish ./dist/releases/ccdb-cli-0.1.1.tgz --access public --registry=https://registry.npmjs.org/
```

Publishing is a separate explicit action: running build, tests or CI does not publish to npm. A 2FA prompt must be completed by the authorized maintainer. The source repository remains private unless separately approved for public visibility.
