import { DataFetcherSettings } from './settings';
import { requestUrl, RequestUrlParam } from 'obsidian';

export interface QueryParams {
    endpoint: string;
    type: 'rest' | 'graphql' | 'grpc' | 'rpc';
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

/**
 * Parse the data query from the codeblock
 */
export function parseDataQuery(source: string, settings: DataFetcherSettings): QueryParams {
    try {
        // Check if using reference or direct definition
        if (source.trim().startsWith('@')) {
            // Using a reference to predefined endpoint
            const lines = source.trim().split('\n');
            const aliasLine = lines[0].trim();
            const alias = aliasLine.substring(1); // Remove the @ prefix
            
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
            
            // Process remaining lines as additional parameters
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                
                // Skip empty lines
                if (!line) continue;
                
                // Check if it's a parameter assignment
                if (line.includes(':')) {
                    const [key, ...valueParts] = line.split(':');
                    let value = valueParts.join(':').trim();
                    
                    // Handle multi-line values (especially for GraphQL queries)
                    if (key.trim() === 'query' && i + 1 < lines.length) {
                        // Collect all lines until we hit a line that looks like a new parameter
                        for (let j = i + 1; j < lines.length; j++) {
                            const nextLine = lines[j].trim();
                            if (nextLine && !nextLine.includes(':')) {
                                value += '\n' + nextLine;
                                i = j; // Update the outer loop counter
                            } else if (nextLine.includes(':')) {
                                break; // Stop when we hit a new parameter
                            }
                        }
                    }
                    
                    if (key.trim() === 'body') {
                        try {
                            queryParams.body = JSON.parse(value);
                        } catch {
                            queryParams.body = value;
                        }
                    } else if (key.trim() === 'query') {
                        queryParams.query = value;
                    } else if (key.trim() === 'variables') {
                        try {
                            queryParams.variables = JSON.parse(value);
                        } catch {
                            throw new Error('Variables must be valid JSON');
                        }
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
            error: error.message
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
    
    // Parse response based on content type
    const contentType = response.headers['content-type'];
    
    if (contentType && contentType.includes('application/json')) {
        return response.json;
    } else {
        return response.text;
    }
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
        method: params.method || 'POST',
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