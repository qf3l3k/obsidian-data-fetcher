import { App } from 'obsidian';
import { QueryParams, QueryResult } from './queryEngine';
import * as crypto from 'crypto';

export class CacheManager {
    private app: App;
    private plugin: any;
    private cache: Record<string, QueryResult> = {};

    constructor(app: App, plugin: any) {
        this.app = app;
        this.plugin = plugin;
        this.loadCache();
    }

    /**
     * Load cache from plugin data
     */
    private async loadCache(): Promise<void> {
        try {
            const data = await this.plugin.loadData();
            this.cache = data?.cache || {};
        } catch (error) {
            console.error('Failed to load cache:', error);
            this.cache = {};
        }
    }

    /**
     * Save cache to plugin data
     */
    private async saveCache(): Promise<void> {
        try {
            const data = await this.plugin.loadData() || {};
            data.cache = this.cache;
            await this.plugin.saveData(data);
        } catch (error) {
            console.error('Failed to save cache:', error);
        }
    }

    /**
     * Generate a cache key for a query
     */
    private generateCacheKey(params: QueryParams): string {
        // Create a unique key based on query parameters
        const stringToHash = JSON.stringify({
            url: params.url,
            type: params.type,
            method: params.method,
            body: params.body,
            query: params.query,
            variables: params.variables
        });
        
        return crypto.createHash('md5').update(stringToHash).digest('hex');
    }

    /**
     * Get cached result for a query
     */
    async getFromCache(params: QueryParams): Promise<QueryResult | null> {
        try {
            const cacheKey = this.generateCacheKey(params);
            const cachedItem = this.cache[cacheKey];
            
            if (!cachedItem) {
                return null;
            }
            
            // Check if cache is expired
            const now = Date.now();
            const cacheAge = now - cachedItem.timestamp;
            const cacheDurationMs = this.plugin.settings.cacheDuration * 60 * 1000;
            
            if (cacheAge > cacheDurationMs) {
                delete this.cache[cacheKey];
                await this.saveCache();
                return null; // Cache is expired
            }
            
            return cachedItem;
        } catch (error) {
            console.error('Error reading from cache:', error);
            return null;
        }
    }

    /**
     * Save result to cache
     */
    async saveToCache(params: QueryParams, result: QueryResult): Promise<void> {
        try {
            const cacheKey = this.generateCacheKey(params);
            this.cache[cacheKey] = result;
            await this.saveCache();
        } catch (error) {
            console.error('Error saving to cache:', error);
        }
    }

    /**
     * Clear a specific cache entry
     */
    async clearCacheEntry(params: QueryParams): Promise<void> {
        try {
            const cacheKey = this.generateCacheKey(params);
            delete this.cache[cacheKey];
            await this.saveCache();
        } catch (error) {
            console.error('Error clearing cache entry:', error);
        }
    }

    /**
     * Clear all cache
     */
    async clearAllCache(): Promise<void> {
        try {
            this.cache = {};
            await this.saveCache();
        } catch (error) {
            console.error('Error clearing all cache:', error);
        }
    }

    /**
     * Get cache size information
     * Returns the number of items and total size in bytes
     */
    async getCacheInfo(): Promise<{count: number, size: number}> {
        try {
            const count = Object.keys(this.cache).length;
            const cacheString = JSON.stringify(this.cache);
            const size = new TextEncoder().encode(cacheString).length;
            
            return { count, size };
        } catch (error) {
            console.error('Error getting cache info:', error);
            return { count: 0, size: 0 };
        }
    }
}