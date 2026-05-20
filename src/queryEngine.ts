import { DataFetcherSettings } from './settings';
import { requestUrl, RequestUrlParam } from 'obsidian';

export interface QueryParams {
    endpoint: string;
    type: 'rest' | 'graphql' | 'grpc' | 'rpc';
    output?: 'render' | 'frontmatter';
    property?: string;
    format?: 'json' | 'table';
    template?: string;
    path?: string;
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: any;
    query?: string;
    variables?: Record<string, any>;
}

export interface QueryResult {
    data: any;
    timestamp: number;
    error?: string;
}

function findHeaderValue(headers: Record<string, string>, targetName: string): string | undefined {
    const normalizedTarget = targetName.toLowerCase();

    for (const [name, value] of Object.entries(headers || {})) {
        if (name.toLowerCase() === normalizedTarget) {
            return value;
        }
    }

    return undefined;
}

function tryParseJsonText(text: string): any | undefined {
    const trimmed = text.trim();

    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        return undefined;
    }

    try {
        return JSON.parse(trimmed);
    } catch {
        return undefined;
    }
}

function formatRequestError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const normalized = message.toLowerCase();

    if (normalized.includes('resource exceeds maximum size')) {
        return 'Response too large for this device. Reduce payload size, add filters/limits, or use a proxy endpoint.';
    }

    return message;
}

function parseOutputFormat(value: string): 'json' | 'table' {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'json' || normalized === 'table') {
        return normalized;
    }
    throw new Error(`Unsupported format "${value}". Use "json" or "table"`);
}

function parseOutputTarget(value: string): 'render' | 'frontmatter' {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'render' || normalized === 'frontmatter') {
        return normalized;
    }
    throw new Error(`Unsupported output "${value}". Use "render" or "frontmatter"`);
}

function parseAliasReferenceLine(aliasLine: string): { alias: string; inlineVariables?: Record<string, any> } {
    const normalizedAliasLine = aliasLine.startsWith('=@') ? aliasLine.substring(1).trim() : aliasLine;
    const inlineCallPattern = /^@([A-Za-z0-9._-]+)\s*(?:\(([\s\S]*)\))?\s*$/;
    const match = normalizedAliasLine.match(inlineCallPattern);

    if (!match) {
        throw new Error(`Invalid endpoint alias reference: "${aliasLine}"`);
    }

    const alias = match[1];
    const inlineVariablesJson = match[2];

    if (inlineVariablesJson === undefined) {
        return { alias };
    }

    try {
        const parsedVariables = JSON.parse(inlineVariablesJson.trim());
        if (!parsedVariables || typeof parsedVariables !== 'object' || Array.isArray(parsedVariables)) {
            throw new Error('Inline variables must be a JSON object');
        }

        return {
            alias,
            inlineVariables: parsedVariables as Record<string, any>
        };
    } catch (error) {
        throw new Error(`Invalid inline variables JSON: ${error.message}`);
    }
}

function isKnownParameterLine(line: string): boolean {
    return /^(body|query|variables|path|format|output|property|template)\s*:/i.test(line.trim());
}

function collectMultilineValue(lines: string[], startIndex: number, initialValue: string): { value: string; endIndex: number } {
    let value = initialValue;
    let endIndex = startIndex;

    for (let j = startIndex + 1; j < lines.length; j++) {
        const nextLine = lines[j];
        const trimmedNextLine = nextLine.trim();

        if (trimmedNextLine && isKnownParameterLine(trimmedNextLine)) {
            break;
        }

        value += '\n' + nextLine;
        endIndex = j;
    }

    return {
        value: value.trim(),
        endIndex
    };
}

/**
 * Parse the data query from the codeblock
 */
export function parseDataQuery(source: string, settings: DataFetcherSettings): QueryParams {
    try {
        const trimmedSource = source.trim();
        // Check if using reference or direct definition
        if (trimmedSource.startsWith('@') || trimmedSource.startsWith('=@')) {
            // Using a reference to predefined endpoint
            const lines = trimmedSource.split('\n');
            const aliasLine = lines[0].trim();
            const { alias, inlineVariables } = parseAliasReferenceLine(aliasLine);
            
            // Find the endpoint by alias
            const endpoint = settings.endpoints.find(e => e.alias === alias);
            if (!endpoint) {
                throw new Error(`Endpoint alias "${alias}" not found in settings`);
            }
            
            // Parse additional parameters if any
            const queryParams: QueryParams = {
                endpoint: alias,
                type: endpoint.type,
                url: endpoint.url,
                method: endpoint.method,
                headers: { ...endpoint.headers }
            };

            if (inlineVariables) {
                queryParams.variables = inlineVariables;
            }
            
            // Process remaining lines as additional parameters
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                
                // Skip empty lines
                if (!line) continue;
                
                // Check if it's a parameter assignment
                if (line.includes(':')) {
                    const [key, ...valueParts] = line.split(':');
                    const normalizedKey = key.trim().toLowerCase();
                    let value = valueParts.join(':').trim();
                    
                    if ((normalizedKey === 'query' || normalizedKey === 'template') && i + 1 < lines.length) {
                        const collected = collectMultilineValue(lines, i, value);
                        value = collected.value;
                        i = collected.endIndex;
                    }
                    
                    if (normalizedKey === 'body') {
                        try {
                            queryParams.body = JSON.parse(value);
                        } catch {
                            queryParams.body = value;
                        }
                    } else if (normalizedKey === 'query') {
                        queryParams.query = value;
                    } else if (normalizedKey === 'variables') {
                        try {
                            queryParams.variables = JSON.parse(value);
                        } catch {
                            throw new Error('Variables must be valid JSON');
                        }
                    } else if (normalizedKey === 'path') {
                        queryParams.path = value;
                    } else if (normalizedKey === 'format') {
                        queryParams.format = parseOutputFormat(value);
                    } else if (normalizedKey === 'output') {
                        queryParams.output = parseOutputTarget(value);
                    } else if (normalizedKey === 'property') {
                        queryParams.property = value;
                    } else if (normalizedKey === 'template') {
                        queryParams.template = value;
                    }
                }
            }
            
            return queryParams;
        } else {
            // Direct definition
            try {
                const queryObj = JSON.parse(source);
                
                // Validate required fields
                if (!queryObj.type) {
                    throw new Error('Query type is required');
                }
                
                if (!queryObj.url) {
                    throw new Error('URL is required');
                }

                if (queryObj.format !== undefined) {
                    queryObj.format = parseOutputFormat(String(queryObj.format));
                }

                if (queryObj.output !== undefined) {
                    queryObj.output = parseOutputTarget(String(queryObj.output));
                }
                
                return {
                    endpoint: 'direct',
                    ...queryObj
                };
            } catch (error) {
                throw new Error(`Invalid query format: ${error.message}`);
            }
        }
    } catch (error) {
        throw new Error(`Failed to parse query: ${error.message}`);
    }
}

/**
 * Execute the query based on the parsed parameters
 */
export async function executeQuery(params: QueryParams): Promise<QueryResult> {
    try {
        let data: any;
        
        switch (params.type) {
            case 'rest':
                data = await executeRestQuery(params);
                break;
            case 'graphql':
                data = await executeGraphQLQuery(params);
                break;
            case 'grpc':
                data = await executeGrpcQuery(params);
                break;
            case 'rpc':
                data = await executeRpcQuery(params);
                break;
            default:
                throw new Error(`Unsupported query type: ${params.type}`);
        }
        
        return {
            data,
            timestamp: Date.now()
        };
    } catch (error) {
        console.error('Query execution error:', error);
        return {
            data: null,
            timestamp: Date.now(),
            error: formatRequestError(error)
        };
    }
}

/**
 * Execute REST API query
 */
async function executeRestQuery(params: QueryParams): Promise<any> {
    if (!params.url) {
        throw new Error('URL is required for REST queries');
    }
    
    const requestParams: RequestUrlParam = {
        url: params.url,
        method: params.method || 'GET',
        headers: params.headers || {},
    };
    
    if (params.body) {
        if (typeof params.body === 'object') {
            requestParams.body = JSON.stringify(params.body);
            if (!requestParams.headers) {
              requestParams.headers = {};
            }
            
            if (!requestParams.headers['Content-Type']) {
              requestParams.headers['Content-Type'] = 'application/json';
            }
        } else {
            requestParams.body = params.body;
        }
    }
    
    const response = await requestUrl(requestParams);
    
    // Mobile builds may expose response headers with different casing, so
    // treat Content-Type lookup as case-insensitive and fall back to parsing
    // the body when JSON-looking payloads arrive without a usable header.
    const contentType = findHeaderValue(response.headers || {}, 'content-type');

    if (contentType && contentType.toLowerCase().includes('application/json')) {
        return response.json;
    }

    const parsedText = tryParseJsonText(response.text);
    return parsedText !== undefined ? parsedText : response.text;
}

/**
 * Execute GraphQL query
 */
async function executeGraphQLQuery(params: QueryParams): Promise<any> {
    if (!params.url) {
        throw new Error('URL is required for GraphQL queries');
    }
    
    if (!params.query) {
        throw new Error('Query is required for GraphQL queries');
    }
    
    const requestParams: RequestUrlParam = {
        url: params.url,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(params.headers || {})
        },
        body: JSON.stringify({
            query: params.query,
            variables: params.variables || {}
        })
    };
    
    const response = await requestUrl(requestParams);
    return response.json;
}

/**
 * Execute gRPC query
 * Note: This is a simplified implementation as Obsidian doesn't have direct gRPC support
 * This will use a REST proxy approach for gRPC
 */
async function executeGrpcQuery(params: QueryParams): Promise<any> {
    if (!params.url) {
        throw new Error('URL is required for gRPC queries');
    }
    
    // For gRPC, we're assuming a REST proxy is set up
    // We'll send a POST request with the appropriate parameters
    const requestParams: RequestUrlParam = {
        url: params.url,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(params.headers || {})
        },
        body: JSON.stringify(params.body || {})
    };
    
    const response = await requestUrl(requestParams);
    return response.json;
}

/**
 * Execute RPC query
 */
async function executeRpcQuery(params: QueryParams): Promise<any> {
    if (!params.url) {
        throw new Error('URL is required for RPC queries');
    }
    
    const requestParams: RequestUrlParam = {
        url: params.url,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(params.headers || {})
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            method: params.query || 'method',
            params: params.body || {},
            id: 1
        })
    };
    
    const response = await requestUrl(requestParams);
    return response.json;
}
