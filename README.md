# Data Fetcher

A plugin for [Obsidian](https://obsidian.md) that fetches data from external endpoints (REST, GraphQL, RPC, gRPC via proxy) and renders the results in notes.

## Features

- Fetch from:
  - REST APIs
  - GraphQL endpoints
  - RPC endpoints
  - gRPC services via REST proxy
- Two query modes:
  - Inline query definition in a `data-query` code block
  - Endpoint aliases configured in plugin settings
- Query result caching with configurable expiration
- Manual refresh, copy, and save-to-note actions
- Per-endpoint request headers for authentication and API keys

## Installation

### Community Plugins

1. Open Obsidian Settings.
2. Go to Community Plugins.
3. Search for `Data Fetcher`.
4. Install and enable.

### Manual

1. Download the latest release from the [repository](https://github.com/qf3l3k/obsidian-data-fetcher).
2. Place the release files in your vault at `.obsidian/plugins/data-fetcher`.
3. Enable the plugin in Obsidian settings.

## Usage

### 1. Inline Query

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

### 2. Endpoint Alias

1. Configure an endpoint alias in plugin settings.
2. Reference it in a note:

```data-query
@my-api-alias
body: {"id":123}
```

### 3. Alias With Call-Site Variables

For GraphQL aliases, you can pass variables inline from the call location:

```data-query
@github-api({"first": 5, "after": null})
```

You can also use the `=@alias(...)` variant:

```data-query
=@github-api({"first": 5})
```

### GraphQL Example

```data-query
{
  "type": "graphql",
  "url": "https://api.spacex.land/graphql",
  "query": "{ launchesPast(limit: 5) { mission_name launch_date_local } }",
  "variables": {}
}
```

## Configuration

Open `Settings -> Data Fetcher` to manage:

- Cache duration
- Endpoint aliases
- Endpoint headers
- Cache cleanup

## Data Disclosure

This plugin communicates with external services and stores response data:

- Network usage: Sends HTTP(S) requests to endpoint URLs defined in notes or settings.
- External dependencies: Uses Obsidian's built-in `requestUrl` API; no third-party analytics SDK is used.
- Data sent: Request URL, method, headers, and optional body/query you configure.
- Data stored locally: Cached responses in vault folder `.data-fetcher-cache` and plugin settings in Obsidian plugin data.
- Data shared externally: Only with endpoint services you explicitly configure.

## Support

- Issues and feature requests: [GitHub Issues](https://github.com/qf3l3k/obsidian-data-fetcher/issues)

## License

MIT
