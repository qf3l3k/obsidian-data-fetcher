import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { DataFetcherSettings, DEFAULT_SETTINGS } from './src/settings';
import { parseDataQuery, executeQuery, QueryParams, QueryResult } from './src/queryEngine';
import { CacheManager } from './src/cacheManager';

export default class DataFetcherPlugin extends Plugin {
	settings: DataFetcherSettings;
	cacheManager: CacheManager;
	// Store query data associated with DOM elements
	private queryButtonMap: WeakMap<HTMLElement, QueryParams> = new WeakMap();

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
                    this.renderResult(cachedResult, el, query, ctx);
                } else {
                    el.createEl('div', { text: 'Fetching data...', cls: 'data-fetcher-loading' });
                    const result = await executeQuery(query);
                    await this.cacheManager.saveToCache(query, result);
                    el.empty();
                    this.renderResult(result, el, query, ctx);
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

	renderResult(result: QueryResult, container: HTMLElement, query?: QueryParams, ctx?: any) {
	    // First clear the container
	    container.empty();
	    
	    // Check if we have actual data to display
	    if (!result || result.error) {
	        container.createEl('div', { 
	            text: result.error || 'No data returned from query', 
	            cls: 'data-fetcher-error' 
	        });
	        console.error("Query error:", result.error);
	        return;
	    }
	    
	    const resultContainer = container.createEl('div', { cls: 'data-fetcher-result' });
	    
	    // Store source information from context if available
	    if (ctx && ctx.sourcePath && ctx.getSectionInfo) {
	        try {
	            // Store section info for this code block in the container's dataset
	            const sectionInfo = ctx.getSectionInfo(ctx.getSectionInfo().lineStart);
	            if (sectionInfo) {
	                container.dataset.sourcePath = ctx.sourcePath;
	                container.dataset.lineStart = String(sectionInfo.lineStart);
	                container.dataset.lineEnd = String(sectionInfo.lineEnd);
	            }
	        } catch (e) {
	            console.warn("Failed to get section info:", e);
	        }
	    }
	    
	    // Create header with timestamp and refresh button
	    const header = resultContainer.createEl('div', { cls: 'data-fetcher-header' });
	    header.createEl('span', { 
	        text: `Last updated: ${new Date(result.timestamp).toLocaleString()}`, 
	        cls: 'data-fetcher-timestamp' 
	    });
	    
	    // Create action buttons container
	    const actionButtons = header.createEl('div', { cls: 'data-fetcher-actions' });
	    
	    // Add copy button
	    const copyBtn = actionButtons.createEl('button', {
	        text: 'Copy',
	        cls: 'data-fetcher-copy'
	    });
	    
	    // Add save to note button
	    const saveToNoteBtn = actionButtons.createEl('button', {
	        text: 'Save to Note',
	        cls: 'data-fetcher-save-note'
	    });
	    
	    // Add refresh button
	    const refreshBtn = actionButtons.createEl('button', { 
	        text: 'Refresh',
	        cls: 'data-fetcher-refresh' 
	    });
	    
	    refreshBtn.addEventListener('click', async () => {
	        // Existing refresh logic
	        try {
	            container.empty();
	            container.createEl('div', { text: 'Refreshing data...', cls: 'data-fetcher-loading' });
	            
	            const storedQuery = this.queryButtonMap.get(refreshBtn);
	            if (!storedQuery) {
	                throw new Error('Query data not found');
	            }
	            
	            const result = await executeQuery(storedQuery);
	            await this.cacheManager.saveToCache(storedQuery, result);
	            
	            container.empty();
	            this.renderResult(result, container, storedQuery, ctx);
	            
	            new Notice('Data refreshed successfully');
	        } catch (error) {
	            container.empty();
	            container.createEl('div', { text: `Error: ${error.message}`, cls: 'data-fetcher-error' });
	        }
	    });
	    
	    // Store the query with the button using our WeakMap
	    if (query) {
	        this.queryButtonMap.set(refreshBtn, query);
	    }
	    
	    // Add event listener for save to note button with proper data
	    saveToNoteBtn.addEventListener('click', () => {
	        console.log("Save to Note button clicked");
	        // Get the data as a string for saving to note
	        let dataString: string;
	        
	        if (typeof result.data === 'object') {
	            dataString = JSON.stringify(result.data, null, 2);
	        } else {
	            dataString = String(result.data);
	        }
	        
	        // Pass the container for position info and the formatted data string
	        this.saveResultToNote(dataString, container);
	    });
	    
	    // Create the content container
	    const content = resultContainer.createEl('div', { cls: 'data-fetcher-content' });
	    
	    // Get the data as a string for display and copying
	    let dataString: string;
	    console.log("Rendering data:", result.data);
	    
	    if (result.data === null || result.data === undefined) {
	        content.setText("No data returned");
	    } else if (typeof result.data === 'object') {
	        try {
	            dataString = JSON.stringify(result.data, null, 2);
	            const pre = content.createEl('pre');
	            pre.createEl('code', { text: dataString });
	        } catch (e) {
	            console.error("Error stringifying data:", e);
	            content.setText(`Error displaying data: ${e.message}`);
	        }
	    } else {
	        dataString = String(result.data);
	        content.setText(dataString);
	    }
	    
	    // Setup copy to clipboard functionality
	    copyBtn.addEventListener('click', () => {
	        // Re-get the data string to ensure it's current
	        let currentDataString: string;
	        if (typeof result.data === 'object') {
	            currentDataString = JSON.stringify(result.data, null, 2);
	        } else {
	            currentDataString = String(result.data);
	        }
	        
	        navigator.clipboard.writeText(currentDataString).then(() => {
	            new Notice('Copied to clipboard');
	        }).catch(err => {
	            console.error("Error copying to clipboard:", err);
	            new Notice('Failed to copy: ' + err.message);
	        });
	    });
	}
	
	saveResultToNote(dataString: string, container: HTMLElement): void {
        try {
            console.log("Save to Note clicked - attempting to save data");
            
            // Get the active view
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            
            if (!activeView) {
                console.log("No active markdown view found");
                new Notice('No active markdown view - please open a markdown file first');
                return;
            }
            
            const editor = activeView.editor;
            
            // Format the data if it's not already formatted
            let formattedData: string;
            try {
                // Check if the data looks like JSON
                JSON.parse(dataString);
                formattedData = '```json\n' + dataString + '\n```';
            } catch (e) {
                // If it's not valid JSON, treat as plain text
                formattedData = dataString;
            }
            
            // Add a comment with timestamp
            const timestamp = new Date().toLocaleString();
            const commentedData = `<!-- Data saved on ${timestamp} -->\n${formattedData}`;
            
            // Try to locate the code block position from container's dataset
            if (container.dataset.sourcePath && 
                container.dataset.lineStart && 
                container.dataset.lineEnd) {
                
                console.log("Found source info in container dataset");
                
                // Check if the source path matches the current file
                const currentPath = activeView.file?.path;
                if (currentPath === container.dataset.sourcePath) {
                    const start = { 
                        line: parseInt(container.dataset.lineStart), 
                        ch: 0 
                    };
                    const end = { 
                        line: parseInt(container.dataset.lineEnd), 
                        ch: editor.getLine(parseInt(container.dataset.lineEnd)).length 
                    };
                    
                    console.log(`Replacing content from line ${start.line} to ${end.line}`);
                    
                    // Use editor transaction for safer text replacement
                    editor.transaction({
                        changes: [
                            {
                                from: start,
                                to: end,
                                text: commentedData
                            }
                        ]
                    });
                    
                    new Notice('Data block replaced with static content');
                    return;
                } else {
                    console.log("Source path doesn't match current file");
                }
            } else {
                console.log("No source info found in container dataset");
            }
            
            // Fallback: Try to use the Obsidian view to locate the code block
            // This is a secondary approach that might work in some cases
            const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (markdownView && markdownView.getMode() === 'source') {
                // Try to find the code block in the source by looking for data-query blocks
                const text = editor.getValue();
                const lines = text.split('\n');
                
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].trim() === '```data-query') {
                        // Found a start marker, now find the end
                        let endLine = -1;
                        for (let j = i + 1; j < lines.length; j++) {
                            if (lines[j].trim() === '```') {
                                endLine = j;
                                break;
                            }
                        }
                        
                        if (endLine > i) {
                            console.log(`Found code block from line ${i} to ${endLine}`);
                            // Replace the entire code block
                            const start = { line: i, ch: 0 };
                            const end = { line: endLine, ch: lines[endLine].length };
                            
                            editor.transaction({
                                changes: [
                                    {
                                        from: start,
                                        to: end,
                                        text: commentedData
                                    }
                                ]
                            });
                            
                            new Notice('Data block replaced with static content');
                            return;
                        }
                    }
                }
            }
            
            // If all attempts to find the code block failed, insert at cursor position
            console.log("Falling back to cursor position insertion");
            const cursor = editor.getCursor();
            
            editor.transaction({
                changes: [
                    {
                        from: cursor,
                        to: cursor,
                        text: `\n${commentedData}\n`
                    }
                ]
            });
            
            new Notice('Data saved to note at cursor position');
            
        } catch (error) {
            console.error("Error saving data to note:", error);
            new Notice(`Error saving data: ${error.message}`);
        }
    }

	onunload() {
		console.log('Unloading Data Fetcher plugin');
		// WeakMap will be garbage collected automatically when plugin is unloaded
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