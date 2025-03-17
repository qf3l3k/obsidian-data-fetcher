export interface EndpointConfig {
    alias: string;
    url: string;
    method: string;
    type: 'rest' | 'graphql' | 'grpc' | 'rpc';
    headers: Record<string, string>;
    body?: string;
    query?: string;
}

export interface DataFetcherSettings {
    cacheDuration: number; // in minutes
    endpoints: EndpointConfig[];
}

export const DEFAULT_SETTINGS: DataFetcherSettings = {
    cacheDuration: 60,
    endpoints: []
}