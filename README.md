# Data Fetcher

Data Fetcher is an [Obsidian](https://obsidian.md) plugin that fetches data from external endpoints and renders it directly inside notes.

<a href="https://buymeacoffee.com/qf3l3k">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" width="180">
</a>

Use it to query REST APIs, GraphQL endpoints, JSON-RPC APIs, or gRPC-style HTTP proxy endpoints from `data-query` code blocks. Results can be rendered as JSON, tables, Markdown templates, copied to clipboard, saved into the note, cached, or written into note frontmatter.

## Features

- Query REST, GraphQL, RPC, and gRPC-style HTTP proxy endpoints.
- Use direct JSON requests or reusable endpoint aliases from plugin settings.
- Pass REST query-string parameters with `params` (available from 1.3.0).
- Configure custom headers for authenticated APIs.
- Test endpoint configuration before saving it.
- Shape output with dot-path selection.
- Render output as JSON, table, or Markdown template.
- Write selected values into note frontmatter/properties.
- Cache responses with configurable expiration.
- Browse, preview, filter, delete, or clear cached responses.
- Refresh one rendered block or all `data-query` blocks in the active note.
- Copy rendered output or save it as static Markdown in the current note.
- Import/export endpoint aliases between devices, with headers excluded by default.

## Installation

### Community Plugins

1. Open `Settings -> Community Plugins` in Obsidian.
2. Search for `Data Fetcher`.
3. Install and enable the plugin.

### Manual Install

1. Download `manifest.json`, `main.js`, and `styles.css` from the latest [GitHub release](https://github.com/qf3l3k/obsidian-data-fetcher/releases).
2. Copy those files into `.obsidian/plugins/data-fetcher` in your vault.
3. Reload Obsidian and enable `Data Fetcher`.

## Quick Start

Create a fenced code block with language `data-query`:

```data-query
{
  "type": "rest",
  "url": "https://api.github.com/users/octocat/repos",
  "method": "GET",
  "path": "0",
  "template": "First repo: [{{name}}]({{html_url}})"
}
```

When the note is rendered, Data Fetcher executes the request, caches the response, and renders the selected output below the block.

## Endpoint Aliases

For repeated use, configure endpoints in `Settings -> Data Fetcher` and reference them by alias.

Example endpoint:

- Alias: `github-repos`
- Type: `REST`
- URL: `https://api.github.com/users/octocat/repos`
- Method: `GET`

Then use it in a note:

```data-query
@github-repos
path: 0
template: First repo: [{{name}}]({{html_url}})
```

Endpoint settings support:

- Alias, type, URL, method, and headers.
- Compact endpoint list with filtering by alias, type, or URL.
- Edit, duplicate, and delete actions.
- Endpoint test button in the add/edit dialog.
- Import/export for moving endpoint lists between devices.

Header exports are disabled by default so API keys and tokens are not accidentally shared.

## Query Types

### REST

```data-query
{
  "type": "rest",
  "url": "https://api.example.com/items",
  "method": "GET",
  "params": {
    "page": 1,
    "tag": "obsidian"
  },
  "headers": {
    "Authorization": "Bearer your-token"
  }
}
```

REST supports `GET`, `POST`, `PUT`, and `DELETE`. Use `params` for query-string parameters and `body` for request payloads.

#### Query Parameters (1.3.0)

REST aliases use an explicit `params:` line. For the `github-repos` alias configured above:

```data-query
@github-repos
params: {"per_page": 5, "sort": "updated"}
format: table
```

This requests `https://api.github.com/users/octocat/repos?per_page=5&sort=updated`.

For an alias named `some-api` pointing to `https://api.example.com/items`, multiple parameters work like this:

```data-query
@some-api
params: {"foo": "one", "bar": "two"}
format: json
```

The resulting URL is `https://api.example.com/items?foo=one&bar=two`. The `example.com` URL is a placeholder; replace it with your API endpoint.

Parameter rules:

- Values can be strings, numbers, booleans, or arrays of those types. Nested objects and `null` are not supported.
- Arrays produce repeated keys: `{"tag": ["one", "two"]}` becomes `tag=one&tag=two`. Your API must support this array convention.
- Values are automatically URL-encoded. Pass ordinary text such as `{"search": "hello world"}` without pre-encoding it.
- Existing URL parameters are preserved unless the same key appears in `params`; explicit values replace all existing values for that key.
- An empty array removes that key from the URL. An empty string sends an empty value, such as `foo=`.
- `params` affects REST requests only and is included in cache keys.

For REST, use `params: {...}` or the direct JSON `"params"` field. Neither `query: "foo=bar"` nor `@some-api({"foo":"bar"})` supplies REST URL parameters. Inline alias arguments retain their existing GraphQL variable behavior.

`params` controls the request URL, `path` selects part of the returned JSON, and `format` controls how that result is displayed. Put API routes such as `/cosmos/staking/v1beta1/validators` in the endpoint URL, not in `path`.

### GraphQL

```data-query
{
  "type": "graphql",
  "url": "https://api.example.com/graphql",
  "query": "query($first: Int) { viewer { repositories(first: $first) { nodes { name url } } } }",
  "variables": {
    "first": 5
  },
  "path": "data.viewer.repositories.nodes",
  "format": "table"
}
```

With an alias, inline variables can be passed at the call site:

```data-query
@github-api({"first": 5})
query: query($first: Int) { viewer { repositories(first: $first) { nodes { name url } } } }
path: viewer.repositories.nodes
format: table
```

`=@alias({...})` is also supported as the first line inside a `data-query` block.

### RPC / JSON-RPC

```data-query
{
  "type": "rpc",
  "url": "https://rpc.example.com",
  "query": "status",
  "body": {}
}
```

RPC requests are sent as JSON-RPC-style `POST` requests. `query` is used as the RPC method name and `body` is used as params.

### gRPC via HTTP Proxy

```data-query
{
  "type": "grpc",
  "url": "https://proxy.example.com/my.Service/GetItem",
  "body": {
    "id": "123"
  }
}
```

Obsidian does not provide native gRPC transport. This mode is intended for gRPC services exposed through an HTTP/JSON proxy.

## Output Options

### Select Data With `path`

Use dot notation to select nested response data:

```data-query
@github-repos
path: 0.owner.login
```

Paths can include array indexes, for example `items.0.name`.

### Render as JSON

JSON is the default output format:

```data-query
@github-repos
path: 0
format: json
```

### Render as a Table

Tables work best with arrays of objects:

```data-query
@github-repos
params: {"per_page": 5}
format: table
```

If table rendering cannot find an array of objects, the plugin falls back to JSON output.

### Render With a Markdown Template

Templates turn API data into note-ready Markdown:

```data-query
@github-repos
params: {"per_page": 5}
template: - [{{name}}]({{html_url}}) by {{owner.login}}
```

Template rules:

- `{{field}}` inserts a field from the selected object.
- `{{owner.login}}` supports nested fields.
- Missing values render as empty strings.
- Arrays render one template result per item, joined with new lines.
- Primitive values can be referenced with `{{value}}`.
- `template` takes precedence over `format: table`.

### Write to Frontmatter

Use `output: frontmatter` to write selected data into note properties:

```data-query
@github-repos
path: 0.name
output: frontmatter
property: external.firstRepo
```

Notes:

- `property` is required.
- Dot-path properties are supported, for example `external.github.firstRepo`.
- Frontmatter writes use raw selected data, not rendered template text.
- Cached render results do not write frontmatter; fresh fetches and manual refreshes do.

## Rendered Block Actions

Each rendered result includes:

- `Refresh`: reruns the query and updates the cache.
- `Copy`: copies the rendered output.
- `Save to Note`: inserts/replaces static Markdown output in the current note.

## Commands

Data Fetcher adds these commands:

- `Refresh data query`: refresh all `data-query` blocks in the active note.
- `Open cache browser`: inspect and manage cached responses.

## Cache Management

Data Fetcher stores cached responses in `.data-fetcher-cache` in the vault root.

In settings, you can:

- Set cache duration in minutes.
- Clear all cached responses.
- Open the cache browser.
- Enable an optional ribbon icon for quick cache browser access.

The cache browser can:

- List cached entries with alias-aware labels, size, date, type, and URL.
- Filter entries by alias, hash, type, or URL.
- Preview cached payloads.
- Delete individual entries.
- Clear all entries.

## Import and Export

Endpoint configurations can be exported to JSON and imported on another device.

Export behavior:

- Headers are excluded by default.
- Enable `Include headers` only when you intentionally want to export secrets such as Authorization tokens.

Import behavior:

- `Merge` updates matching aliases and adds new ones.
- `Replace` overwrites the current endpoint list.
- Invalid or duplicate entries are skipped with a summary.

## Troubleshooting

- `Endpoint alias "..." not found`: add the alias in settings or fix the alias name in the note.
- `Variables must be valid JSON`: use valid JSON, for example `{"first": 5}`.
- Params errors: provide a JSON object with strings, numbers, booleans, or arrays of those values, for example `params: {"page": 2}`.
- REST filters have no effect: use explicit `params`, check the API's supported parameter names, and confirm you installed version 1.3.0 or newer.
- `Path "..." not found`: verify the response shape and the selected path.
- `Table format requires an array of objects`: point `path` at an array of objects or use JSON/template output.
- Blank template placeholders: check field names against the data selected by `path`.
- `property is required when output: frontmatter is used`: add a `property` value.
- GraphQL endpoint test fails with missing query: endpoint testing checks the saved endpoint draft; run complete GraphQL queries from a note block.
- `Response too large for this device`: reduce payload size, add filters/limits, or use a proxy endpoint.
- No command refresh happens: make sure the active pane is a Markdown note.

## Privacy and Data Disclosure

This plugin communicates with external services and stores response data locally.

- Network usage: sends HTTP(S) requests to endpoints configured in notes or settings.
- External dependency: uses Obsidian's built-in `requestUrl` API.
- Data sent: URL (including REST `params`), method, headers, body, query, and variables you configure.
- Data stored locally: plugin settings and cached responses in `.data-fetcher-cache`.
- Data shared externally: only with endpoints you configure.

## Development

Build:

```bash
npm install
npm run build
```

Watch mode:

```bash
npm run dev
```

Test in a vault by linking or copying plugin files to `.obsidian/plugins/data-fetcher`.

## Support

- Issues and feature requests: [GitHub Issues](https://github.com/qf3l3k/obsidian-data-fetcher/issues)

## License

MIT
