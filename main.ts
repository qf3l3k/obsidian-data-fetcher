import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { DataFetcherSettings, DEFAULT_SETTINGS } from './src/settings';
import { parseDataQuery, executeQuery, QueryParams, QueryResult } from './src/queryEngine';
import { CacheManager } from './src/cacheManager';

export default class DataFetcherPlugin extends Plugin {
	settings: DataFetcherSettings;
	cacheManager: CacheManager;

	async onload() {
		console.log('Loading Data Fetcher plugin');
		
		await this.loadSettings();
		this.cacheManager = new CacheManager(this.app, this);

		// Register the data fetcher processor for codeblocks
        this.registerMarkdownCodeBlockProcessor('data-query', async (source, el, ctx) => {
            try {
                const query = parseDataQuery(source, this.settings);
                const cachedResult = await this.cacheManager.getFromCache(query);
                
                if (cachedResult) {
                    this.renderResult(cachedResult, el, query);
                } else {
                    el.createEl('div', { text: 'Fetching data...', cls: 'data-fetcher-loading' });
                    const result = await executeQuery(query);
                    await this.cacheManager.saveToCache(query, result);
                    el.empty();
                    this.renderResult(result, el, query);
                }
            } catch (error) {
                el.createEl('div', { text: `Error: ${error.message}`, cls: 'data-fetcher-error' });
            }
        });

		// Add the command to manually refresh data
		this.addCommand({
			id: 'refresh-data-query',
			name: 'Refresh data query', // Changed to sentence case
			editorCallback: (editor: Editor, view: MarkdownView) => {
				new Notice('Refreshing data queries in the current note...');
				this.app.workspace.trigger('data-fetcher:refresh-query');
			}
		});

		// Add settings tab
		this.addSettingTab(new DataFetcherSettingTab(this.app, this));
	}

	renderResult(result: QueryResult, container: HTMLElement, query?: QueryParams) {
	    const resultContainer = container.createEl('div', { cls: 'data-fetcher-result' });
	    
	    // Create header with timestamp and refresh button
	    const header = resultContainer.createEl('div', { cls: 'data-fetcher-header' });
	    header.createEl('span', { 
	        text: `Last updated: ${new Date(result.timestamp).toLocaleString()}`, 
	        cls: 'data-fetcher-timestamp' 
	    });
	    
	    const refreshBtn = header.createEl('button', { 
	        text: 'Refresh',
	        cls: 'data-fetcher-refresh' 
	    });
	    
	    refreshBtn.addEventListener('click', async () => {
	        try {
	            // Clear the container and show loading
	            container.empty();
	            container.createEl('div', { text: 'Refreshing data...', cls: 'data-fetcher-loading' });
	            
	            // Re-execute the query using the stored query data
	            const storedQuery = (refreshBtn as any).query;
	            if (!storedQuery) {
	                throw new Error('Query data not found');
	            }
	            
	            const result = await executeQuery(storedQuery);
	            
	            // Update the cache
	            await this.cacheManager.saveToCache(storedQuery, result);
	            
	            // Re-render the result
	            container.empty();
	            this.renderResult(result, container, storedQuery);
	            
	            new Notice('Data refreshed successfully');
	        } catch (error) {
	            container.empty();
	            container.createEl('div', { text: `Error: ${error.message}`, cls: 'data-fetcher-error' });
	        }
	    });
	    
	    // Store the query with the button for later use
	    if (query) {
	        (refreshBtn as any).query = query;
	    }
	    
	    // Create the content container
	    const content = resultContainer.createEl('div', { cls: 'data-fetcher-content' });
	    
	    // Render the data based on type
	    if (typeof result.data === 'object') {
	        const pre = content.createEl('pre');
	        pre.createEl('code', { text: JSON.stringify(result.data, null, 2) });
	    } else {
	        content.setText(String(result.data));
	    }
	}

	onunload() {
		console.log('Unloading Data Fetcher plugin');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class DataFetcherSettingTab extends PluginSettingTab {
	plugin: DataFetcherPlugin;

	constructor(app: App, plugin: DataFetcherPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		// Cache Management section
		new Setting(containerEl)
			.setName('Cache management')
			.setHeading();
        
        const cacheInfoEl = containerEl.createEl('div', {
            cls: 'data-fetcher-cache-info'
        });
        
        // Get and display cache info
        this.updateCacheInfo(cacheInfoEl);
        
        // Clear cache button
        new Setting(containerEl)
            .setName('Clear cache')
            .setDesc('Remove all cached API responses')
            .addButton(button => button
                .setButtonText('Clear cache')
                .setClass('data-fetcher-clear-cache')
                .onClick(async () => {
                    try {
                        await this.plugin.cacheManager.clearAllCache();
                        new Notice('Cache cleared successfully');
                        this.updateCacheInfo(cacheInfoEl);
                    } catch (error) {
                        new Notice('Failed to clear cache: ' + error.message);
                    }
                }));

		// General settings
		new Setting(containerEl)
			.setName('Cache duration')
			.setDesc('How long to cache results (in minutes)')
			.addText(text => text
				.setPlaceholder('60')
				.setValue(this.plugin.settings.cacheDuration.toString())
				.onChange(async (value) => {
					this.plugin.settings.cacheDuration = parseInt(value) || 60;
					await this.plugin.saveSettings();
				}));
				
		// Endpoint aliases section
		new Setting(containerEl)
			.setName('Endpoint aliases')
			.setHeading();
		
		const endpointList = containerEl.createEl('div', {cls: 'endpoint-list'});
		
		// Create UI for each existing endpoint
		this.plugin.settings.endpoints.forEach((endpoint, index) => {
			this.createEndpointSetting(endpointList, endpoint, index);
		});
		
		// Add new endpoint button
		new Setting(containerEl)
			.addButton(button => button
				.setButtonText('Add endpoint')
				.onClick(async () => {
					this.plugin.settings.endpoints.push({
						alias: '',
						url: '',
						method: 'GET',
						type: 'rest',
						headers: {}
					});
					await this.plugin.saveSettings();
					this.display();
				}));
	}
	
	createEndpointSetting(container: HTMLElement, endpoint: any, index: number) {
		const endpointEl = container.createEl('div', {cls: 'endpoint-item'});
		
		new Setting(endpointEl)
			.setName('Alias')
			.addText(text => text
				.setPlaceholder('api-name')
				.setValue(endpoint.alias)
				.onChange(async (value) => {
					this.plugin.settings.endpoints[index].alias = value;
					await this.plugin.saveSettings();
				}));
				
		new Setting(endpointEl)
			.setName('Type')
			.addDropdown(dropdown => dropdown
				.addOption('rest', 'REST')
				.addOption('graphql', 'GraphQL')
				.addOption('grpc', 'gRPC')
				.addOption('rpc', 'RPC')
				.setValue(endpoint.type)
				.onChange(async (value) => {
					const validTypes = ["rest", "graphql", "grpc", "rpc"];
                    if (validTypes.includes(value)) {
                        this.plugin.settings.endpoints[index].type = value as "rest" | "graphql" | "grpc" | "rpc";
                    } else {
                        // Default to REST if invalid type
                        this.plugin.settings.endpoints[index].type = "rest";
                    }
					await this.plugin.saveSettings();
					this.display();
				}));
				
		new Setting(endpointEl)
			.setName('URL')
			.addText(text => text
				.setPlaceholder('https://api.example.com')
				.setValue(endpoint.url)
				.onChange(async (value) => {
					this.plugin.settings.endpoints[index].url = value;
					await this.plugin.saveSettings();
				}));
				
		// Add different fields based on endpoint type
		if (endpoint.type === 'rest' || endpoint.type === 'rpc') {
			new Setting(endpointEl)
				.setName('Method')
				.addDropdown(dropdown => dropdown
					.addOption('GET', 'GET')
					.addOption('POST', 'POST')
					.addOption('PUT', 'PUT')
					.addOption('DELETE', 'DELETE')
					.setValue(endpoint.method)
					.onChange(async (value) => {
						this.plugin.settings.endpoints[index].method = value;
						await this.plugin.saveSettings();
					}));
		}
		
		// Add headers section
		new Setting(endpointEl)
			.setName('Headers')
			.setDesc('Add headers for this endpoint')
			.addButton(button => button
				.setButtonText('Manage headers')
				.onClick(() => {
					new HeadersModal(this.app, endpoint.headers, async (headers) => {
						this.plugin.settings.endpoints[index].headers = headers;
						await this.plugin.saveSettings();
					}).open();
				}));
				
		// Delete button
		new Setting(endpointEl)
			.addButton(button => button
				.setButtonText('Delete')
				.setClass('data-fetcher-delete-btn')
				.onClick(async () => {
					this.plugin.settings.endpoints.splice(index, 1);
					await this.plugin.saveSettings();
					this.display();
				}));
	}

    async updateCacheInfo(containerEl: HTMLElement) {
        const cacheInfo = await this.plugin.cacheManager.getCacheInfo();
        containerEl.empty();
        
        const formatSize = (bytes: number): string => {
            if (bytes < 1024) return bytes + ' bytes';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
            return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
        };
        
        containerEl.createEl('div', {
            text: `Cache contains ${cacheInfo.count} items (${formatSize(cacheInfo.size)})`
        });
    }	
}

class HeadersModal extends Modal {
	headers: Record<string, string>;
	onSubmit: (headers: Record<string, string>) => void;

	constructor(app: App, headers: Record<string, string>, onSubmit: (headers: Record<string, string>) => void) {
		super(app);
		this.headers = {...headers};
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const {contentEl} = this;
		
		// Use Setting for heading to maintain consistency
		new Setting(contentEl)
			.setName('Manage headers')
			.setHeading();
		
		// Display existing headers
		Object.entries(this.headers).forEach(([key, value]) => {
			this.createHeaderRow(contentEl, key, value);
		});
		
		// Add new header button
		const addBtn = contentEl.createEl('button', {text: 'Add header'});
		addBtn.addEventListener('click', () => {
			this.createHeaderRow(contentEl, '', '');
		});
		
		// Save button
		const saveBtn = contentEl.createEl('button', {text: 'Save', cls: 'mod-cta'});
		saveBtn.addEventListener('click', () => {
			this.onSubmit(this.headers);
			this.close();
		});
	}
	
	createHeaderRow(container: HTMLElement, key: string, value: string) {
		const row = container.createEl('div', {cls: 'header-row'});
		
		const keyInput = row.createEl('input', {
			attr: {
				type: 'text',
				placeholder: 'Header name',
				value: key
			}
		});
		
		const valueInput = row.createEl('input', {
			attr: {
				type: 'text',
				placeholder: 'Value',
				value: value
			}
		});
		
		const deleteBtn = row.createEl('button', {text: 'X'});
		
		// Event listeners
		const oldKey = key;
		
		keyInput.addEventListener('change', () => {
			if (oldKey) {
				delete this.headers[oldKey];
			}
			this.headers[keyInput.value] = valueInput.value;
		});
		
		valueInput.addEventListener('change', () => {
			this.headers[keyInput.value] = valueInput.value;
		});
		
		deleteBtn.addEventListener('click', () => {
			if (keyInput.value) {
				delete this.headers[keyInput.value];
			}
			row.remove();
		});
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}