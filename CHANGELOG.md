# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Issue #6: added optional `path` selector and `format: table` rendering for array-of-object JSON responses.

### Changed
- Copy and Save actions now use transformed output (selected path / table view).

## [1.0.7] - 2026-03-02

### Added
- Issue #5: support inline call-site variables for endpoint aliases using `@alias({...})` and `=@alias({...})`.

### Changed
- Expanded README with full query syntax, endpoint reference, examples, troubleshooting, and development guidance.

## [1.0.6] - 2026-03-02

### Fixed
- Issue #3: improved error block readability in dark/light themes by switching to normal text color with a clear error border.
- Fixed command refresh flow by implementing the missing `data-fetcher:refresh-query` event handler for active notes.
- Fixed code block section lookup used by "Save to Note" to correctly resolve source positions.

### Changed
- Replaced Node `crypto` cache-key dependency with a platform-safe in-code hash to stay compatible with desktop and mobile.
- Reduced noisy debug logging in plugin runtime output.
- Updated README examples and added explicit network/data disclosure notes.

### Metadata
- Bumped plugin version to `1.0.6`.
- Updated `manifest.json`, `versions.json`, `package.json`, and `package-lock.json` for release consistency.
