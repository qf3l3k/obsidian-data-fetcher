# Changelog

All notable changes to this project will be documented in this file.

## [1.1.5] - 2026-05-02

### Added
- Added endpoint list filtering in settings by alias, type, or URL.
- Added an export confirmation dialog with an explicit `Include headers` option for endpoint JSON exports.

### Changed
- Endpoint exports now omit headers by default to avoid accidentally sharing API keys or tokens.
- Frontmatter output is no longer applied from cached render results; it still writes after fresh fetches and manual refreshes.

## [1.1.4] - 2026-03-21

### Added
- Cache browser entries now display alias-aware labels in the form `<alias/direct> - <hash>`.
- Cache browser filtering now matches alias, hash, type, and URL.

### Changed
- Endpoint editor dialog now gives the URL field more horizontal space for long endpoints.
- Cache browser list and preview panes now use more of the available dialog space.
- New cache entries store lightweight query metadata so cache browser labels are easier to understand.

## [1.1.3] - 2026-03-21

### Fixed
- Cache keys now include endpoint identity and headers to avoid cross-endpoint cache collisions.
- RPC requests now always use `POST`, matching JSON-RPC expectations and improving mobile compatibility.
- Endpoint editor now blocks duplicate aliases, and endpoint import deduplicates aliases before merge/replace.
- `Save to Note` no longer falls back to replacing the first `data-query` block when source block location is unavailable.
- Large-response request errors now surface a clearer hint about reducing payload size or using a proxy.

## [1.1.2] - 2026-03-03

### Added
- Endpoint import/export in settings for moving alias configurations between devices.
- Import supports both full export payload (`{ version, exportedAt, endpoints }`) and plain endpoint array JSON.

### Changed
- Endpoint import now supports `Merge` (update by alias + append new) and `Replace` (overwrite all current endpoints) modes with validation/skip summary.

## [1.1.1] - 2026-03-03

### Added
- Added compact endpoint list view in settings with columns for name, type, URL, headers count, and row actions.
- Added endpoint editor modal for create/edit flows to keep advanced endpoint details out of the main settings list.
- Added endpoint row actions: Edit, Duplicate, and Delete.

### Changed
- Updated endpoint settings layout for better readability when many aliases exist.
- Reduced endpoint list font size and tightened spacing to better match Obsidian settings styling and avoid clipped action buttons.

## [1.1.0] - 2026-03-03

### Added
- Issue #5 (cache management): added Cache Browser modal with entry list, payload preview, single-entry deletion, and clear-all action.
- Added optional ribbon icon toggle for quick access to cache browser.

### Changed
- Improved cache browser UX with larger modal layout and cache-key filtering.

## [1.0.9] - 2026-03-03

### Added
- Issue #2 (first step): support `output: frontmatter` with `property` path to store selected query results in current note metadata.

## [1.0.8] - 2026-03-03

### Added
- Issue #6: added optional `path` selector and `format: table` rendering for array-of-object JSON responses.

### Changed
- Copy and Save actions now use transformed output (selected path / table view).
- Improved table readability by truncating long cell content in UI with full value on hover.

## [1.0.7] - 2026-03-03

### Added
- Issue #5: support inline call-site variables for endpoint aliases using `@alias({...})` and `=@alias({...})`.

### Changed
- Expanded README with full query syntax, endpoint reference, examples, troubleshooting, and development guidance.

## [1.0.6] - 2026-03-03

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
