# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

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
