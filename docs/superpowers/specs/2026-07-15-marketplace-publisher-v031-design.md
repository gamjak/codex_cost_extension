# Marketplace publisher correction for v0.3.1

## Goal

Publish the extension through the Visual Studio Marketplace publisher account `gamjak`, matching the account under which the user is authenticated.

## Scope

- Change the extension manifest publisher from `gambjako` to `gamjak`.
- Raise the extension version from `0.3.0` to `0.3.1`.
- Add a regression assertion for the publisher identity and version.
- Add a `0.3.1` changelog entry explaining the Marketplace publisher correction.
- Validate through the existing cross-platform CI and package contract before creating a new GitHub release with the generated VSIX.

## Release behavior

`v0.3.0` remains immutable because its VSIX manifest contains the old publisher ID. `v0.3.1` will represent the Marketplace-ready package and will be published under the Marketplace identifier `gamjak.codex-cost-extension`.

## Non-goals

- Do not overwrite or remove the existing `v0.3.0` GitHub release.
- Do not publish to the VS Code Marketplace automatically.
- Do not change extension runtime behavior or its display name.

## Verification

The existing workflow must pass package creation, package-content verification, and validation on Ubuntu, macOS, and Windows. The v0.3.1 release asset must be the VSIX produced by that passing CI run.
