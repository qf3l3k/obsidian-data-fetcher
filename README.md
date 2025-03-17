# Obsidian Data Fetcher

A plugin for [Obsidian](https://obsidian.md) that allows users to fetch data from multiple sources (REST APIs, GraphQL, gRPC, RPC) and insert the results into notes.

## Features

- Support for multiple data sources:
  - REST APIs
  - GraphQL endpoints
  - gRPC services (via REST proxies)
  - RPC services
- Two modes of operation:
  - Directly define queries within notes
  - Predefine endpoints in settings and reference them in notes
- Automatic caching of query results to reduce redundant requests
- Cache expiration settings
- Manual refresh capabilities
- Customizable headers for authentication

## Installation

### From Obsidian Community Plugins

1. Open Obsidian Settings
2. Go to Community Plugins
3. Search for "Data Fetcher"
4. Click Install, then Enable

### Manual Installation

1. Download the latest release from the [releases page](https://github.com/qf3l3k/obsidian-api-fetcher/releases)
2. Extract the zip file into your Obsidian vault's `.obsidian/plugins` folder
3. Enable the plugin in Obsidian settings

## Usage

### Method 1: Direct Query Definition

Create a code block with the language set to `data-query` and define your query in JSON format:

```
​```data-query
{
  "type": "rest",
  "url": "https://api.example.com/data",
  "method": "GET",
  "headers": {
    "Authorization": "Bearer your-token"
  }
}
​```
```

### Method 2: Using Aliases

1. First, define an endpoint alias in the plugin settings
2. Then reference it in your notes:

```
​```data-query
@my-api-alias
body: {"id": 123}
​```
```

## Configuration

Go to Settings > Data Fetcher to configure:

- Cache duration
- Pre-defined endpoint aliases
- Default headers

## Examples

### REST API Example

```
​```data-query
{
  "type": "rest",
  "url": "https://jsonplaceholder.typicode.com/posts/1",
  "method": "GET"
}
​```
```

### GraphQL Example

```
​```data-query
{
  "type": "graphql",
  "url": "https://api.spacex.land/graphql",
  "query": "{ launchesPast(limit: 5) { mission_name launch_date_local } }",
  "variables": {}
}
​```
```

### Using Aliases

```
​```data-query
@github-api
query: query { viewer { repositories(first: 5) { nodes { name } } } }
​```
```

## Support

If you encounter any issues or have feature requests, please file them on the [GitHub issues page](https://github.com/qf3l3k/obsidian-api-fetcher/issues).


<a href="https://www.buymeacoffee.com/qf3l3k" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style=" height: 60px !important;width: 217px !important;" ></a>



## License

MIT
