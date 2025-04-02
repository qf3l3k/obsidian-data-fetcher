import { App, TFile, TFolder } from 'obsidian';
import { QueryParams, QueryResult } from './queryEngine';
import * as crypto from 'crypto';

export class CacheManager {
    private app: App;
    private plugin: any;
    private cacheFolder: string = '.data-fetcher-cache';

    constructor(app: App, plugin: any) {
        this.app = app;
        this.plugin = plugin;
        this.ensureCacheFolder();
    }

    /**
     * Ensure the cache folder exists
     */
    private async ensureCacheFolder(): Promise<void> {
        try {
            const folderExists = this.app.vault.getAbstractFileByPath(this.cacheFolder) instanceof TFolder;
            
            if (!folderExists) {
                await this.app.vault.createFolder(this.cacheFolder);
            }
        } catch (error) {
            console.error('Failed to create cache folder:', error);
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
            const cacheFilePath = `${this.cacheFolder}/${cacheKey}.json`;
            
            const cacheFile = this.app.vault.getAbstractFileByPath(cacheFilePath);
            
            if (!(cacheFile instanceof TFile)) {
                return null;
            }
            
            // Read the cache file
            const cacheContent = await this.app.vault.read(cacheFile);
            const cacheData = JSON.parse(cacheContent);
            
            // Check if cache is expired
            const now = Date.now();
            const cacheAge = now - cacheData.timestamp;
            const cacheDurationMs = this.plugin.settings.cacheDuration * 60 * 1000;
            
            if (cacheAge > cacheDurationMs) {
                return null; // Cache is expired
            }
            
            return cacheData;
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
            await this.ensureCacheFolder();
            const cacheKey = this.generateCacheKey(params);
            const cacheFilePath = `${this.cacheFolder}/${cacheKey}.json`;
            
            // Create or overwrite the cache file
            await this.app.vault.adapter.write(cacheFilePath, JSON.stringify(result));
        } catch (error) {
            console.error('Error saving to cache:', error);
        }
    }

    /**
     * Clear all cache files using the adapter's remove method
     */
    async clearAllCache(): Promise<void> {
        try {
            await this.ensureCacheFolder();
            
            // List all files in the cache folder using the adapter
            const files = await this.app.vault.adapter.list(this.cacheFolder);
            
            // Remove each file from the cache folder
            let deletedCount = 0;
            for (const file of files.files) {
                try {
                    await this.app.vault.adapter.remove(file);
                    deletedCount++;
                } catch (err) {
                    console.error(`Failed to delete cache file ${file}:`, err);
                }
            }
            
            console.log(`Cleared ${deletedCount} cache files`);
        } catch (error) {
            console.error("Error clearing cache:", error);
            throw error; // Re-throw to be handled by the caller
        }
    }

    /**
     * Get cache info - use file system adapter to count files
     */
    async getCacheInfo(): Promise<{count: number, size: number}> {
        try {
            await this.ensureCacheFolder();
            // Read directory contents via the adapter
            const fileNames = await this.app.vault.adapter.list(this.cacheFolder);
            
            let count = 0;
            let totalSize = 0;
            
            // For each file in the cache folder, gather stats
            for (const fileName of fileNames.files) {
                const stat = await this.app.vault.adapter.stat(fileName);
                
                if (stat) {
                    count++;
                    totalSize += stat.size;
                }
            }
            
            return { count, size: totalSize };
        } catch (error) {
            console.error("Error getting cache info:", error);
            return { count: 0, size: 0 };
        }
    }
}