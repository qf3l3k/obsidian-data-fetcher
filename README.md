# Data Fetcher

Data Fetcher is an [Obsidian](https://obsidian.md) plugin that runs requests against external data endpoints and renders the result directly in notes.

Supported endpoint types:
- REST APIs
- GraphQL endpoints
- RPC endpoints
- gRPC-style endpoints via HTTP proxy

## Highlights

- `data-query` code block processor for live request execution
- Endpoint alias configuration in plugin settings
- Cache with configurable expiration
- Per-block refresh button
- Command to refresh all queries in current note
- Copy result and Save to Note actions
- Custom headers for authenticated requests

## Installation

### Community Plugins

1. Open `Settings -> Community Plugins`.
2. Search for `Data Fetcher`.
3. Install and enable.

### Manual

1. Download release assets from [GitHub releases](https://github.com/qf3l3k/obsidian-data-fetcher/releases).
2. Copy `manifest.json`, `main.js`, and `styles.css` into:
   `.obsidian/plugins/data-fetcher`
3. Reload Obsidian and enable the plugin.

## How It Works

Create a code block with language `data-query`.
The plugin parses the block, executes the query, caches the response, and renders output below the block.

## Query Syntax

### Direct JSON Query (all endpoint types)

```data-query
{
  "type": "rest",
  "url": "https://api.example.com/data",
  "method": "GET",
  "headers": {
    "Authorization": "Bearer your-token"
  }
}
```

### Alias Query

Configure alias in plugin settings, then reference it:

```data-query
@my-api-alias
body: {"id": 123}
```

### Alias With Inline Variables (Issue #5, v1.0.7)

```data-query
@github-api({"first": 5, "after": null})
query: query($first: Int, $after: String) { viewer { repositories(first: $first, after: $after) { nodes { name } } } }
```

Equivalent variant:

```data-query
=@github-api({"first": 5})
query: query($first: Int) { viewer { repositories(first: $first) { nodes { name } } } }
```

Notes:
- Inline variables must be a valid JSON object.
- Explicit `variables:` entry later in the block overrides inline variables.

## Endpoint Type Reference

### REST

Common fields:
- `type`: `rest`
- `url`: endpoint URL
- `method`: `GET` | `POST` | `PUT` | `DELETE`
- `headers`: object
- `body`: object or string

### GraphQL

Common fields:
- `type`: `graphql`
- `url`: GraphQL endpoint URL
- `query`: GraphQL query string
- `variables`: JSON object
- `headers`: object

Example:

```data-query
{
  "type": "graphql",
  "url": "https://indexer-bs721-base.bitsong.io/",
  "query": "query MyQuery { nftTokens { edges { node { id minter } } } }",
  "variables": {}
}
```

### RPC

Common fields:
- `type`: `rpc`
- `url`: RPC endpoint URL
- `query`: method name
- `body`: params object
- `headers`: object

### gRPC via proxy

Common fields:
- `type`: `grpc`
- `url`: proxy endpoint URL
- `body`: payload object
- `headers`: object

## Settings

Open `Settings -> Data Fetcher`.

Available options:
- Cache duration (minutes)
- Endpoint aliases
- Per-alias headers
- Cache clearing
- Cache info preview (item count/size)

## Commands

- `Refresh data query`: refreshes all `data-query` blocks in the active note and updates cache.

## Actions in Rendered Block

- `Refresh`: reruns that query and updates cached value.
- `Copy`: copies rendered response to clipboard.
- `Save to Note`: replaces/inserts static result in current markdown file.

## Caching Behavior

- Cache location: `.data-fetcher-cache` in vault root.
- Keying: deterministic hash of query parameters.
- Expiration: controlled by `Cache duration` setting.
- Manual refresh bypasses stale content by re-executing query and writing fresh cache.

## Troubleshooting

- `Endpoint alias "..." not found`: add or fix alias in settings.
- `Variables must be valid JSON`: ensure valid JSON syntax (`{"x": 1}` not `{x: 1}`).
- No result refresh from command: ensure active pane is a markdown file.
- Build fails on PowerShell script policy: run via `cmd /c npm run build`.

## Development

Build:

```powershell
cmd /c npm install
cmd /c npm run build
```

Watch mode:

```powershell
cmd /c npm run dev
```

Test in vault by linking/copying plugin files to:
`.obsidian/plugins/data-fetcher`

## Data Disclosure

This plugin communicates with external services and stores response data:

- Network usage: Sends HTTP(S) requests to endpoints configured in notes/settings.
- External dependencies: Uses Obsidian built-in `requestUrl` API.
- Data sent: URL, method, headers, and optional body/query/variables you configure.
- Data stored locally: plugin settings and cached responses in `.data-fetcher-cache`.
- Data shared externally: only with endpoints you configure.

## Support

- Issues and feature requests: [GitHub Issues](https://github.com/qf3l3k/obsidian-data-fetcher/issues)

## License

MIT
