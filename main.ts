import { App, Editor, EventRef, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import { DataFetcherSettings, DEFAULT_SETTINGS } from './src/settings';
import { parseDataQuery, executeQuery, QueryParams, QueryResult } from './src/queryEngine';
import { CacheManager } from './src/cacheManager';

export default class DataFetcherPlugin extends Plugin {
	settings: DataFetcherSettings;
	cacheManager: CacheManager;
	// Store query data associated with DOM elements
	private queryButtonMap: WeakMap<HTMLElement, QueryParams> = new WeakMap();

	async onload() {
		await this.loadSettings();
		this.cacheManager = new CacheManager(this.app, this);

		// Register the data fetcher processor for codeblocks
        this.registerMarkdownCodeBlockProcessor('data-query', async (source, el, ctx) => {
            try {
                const query = parseDataQuery(source, this.settings);
                const cachedResult = await this.cacheManager.getFromCache(query);
                
                if (cachedResult) {
                    await this.applyOutputTargetSafely(query, cachedResult, ctx);
                    this.renderResult(cachedResult, el, query, ctx);
                } else {
                    el.createEl('div', { text: 'Fetching data...', cls: 'data-fetcher-loading' });
                    const result = await executeQuery(query);
                    await this.cacheManager.saveToCache(query, result);
                    await this.applyOutputTargetSafely(query, result, ctx);
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

		// Handle refresh events triggered by command or other plugin actions.
		const workspaceEvents = this.app.workspace as unknown as {
			on(name: string, callback: (...args: unknown[]) => unknown, ctx?: unknown): EventRef;
		};
		this.registerEvent(workspaceEvents.on('data-fetcher:refresh-query', async () => {
			await this.refreshQueriesInActiveNote();
		}));

		// Add settings tab
		this.addSettingTab(new DataFetcherSettingTab(this.app, this));
	}

	private extractDataQueryBlocks(markdown: string): string[] {
		const queryBlocks: string[] = [];
		const dataQueryRegex = /```data-query[^\n]*\n([\s\S]*?)```/g;
		let match: RegExpExecArray | null;

		while ((match = dataQueryRegex.exec(markdown)) !== null) {
			queryBlocks.push(match[1].trim());
		}

		return queryBlocks;
	}

	private rerenderActiveView(view: MarkdownView): void {
		const previewMode = (view as any).previewMode;
		if (previewMode && typeof previewMode.rerender === 'function') {
			previewMode.rerender(true);
			return;
		}

		// Fallback that still refreshes markdown render output.
		this.app.workspace.trigger('layout-change');
	}

	private async refreshQueriesInActiveNote(): Promise<void> {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		const activeFile = activeView?.file;

		if (!activeView || !activeFile) {
			new Notice('No active markdown file to refresh');
			return;
		}

		const content = await this.app.vault.cachedRead(activeFile);
		const queryBlocks = this.extractDataQueryBlocks(content);

		if (queryBlocks.length === 0) {
			new Notice('No data-query blocks found in the current note');
			return;
		}

		let refreshedCount = 0;
		let failedCount = 0;

		for (const querySource of queryBlocks) {
			try {
				const query = parseDataQuery(querySource, this.settings);
				const result = await executeQuery(query);
				await this.cacheManager.saveToCache(query, result);
				await this.applyOutputTargetSafely(query, result, { sourcePath: activeFile.path });

				if (result.error) {
					failedCount++;
				} else {
					refreshedCount++;
				}
			} catch (error) {
				failedCount++;
				console.error('Failed to refresh query block:', error);
			}
		}

		this.rerenderActiveView(activeView);

		if (failedCount === 0) {
			new Notice(`Refreshed ${refreshedCount} data quer${refreshedCount === 1 ? 'y' : 'ies'}`);
			return;
		}

		new Notice(`Refreshed ${refreshedCount}; ${failedCount} failed`);
	}

	private valuesEqual(a: any, b: any): boolean {
		return JSON.stringify(a) === JSON.stringify(b);
	}

	private setNestedPropertyValue(target: Record<string, any>, propertyPath: string, value: any): boolean {
		const segments = propertyPath.split('.').map(segment => segment.trim()).filter(Boolean);
		if (segments.length === 0) {
			throw new Error('Property path cannot be empty');
		}

		let current: Record<string, any> = target;
		for (let i = 0; i < segments.length - 1; i++) {
			const segment = segments[i];
			const next = current[segment];
			if (next === null || next === undefined) {
				current[segment] = {};
			} else if (typeof next !== 'object' || Array.isArray(next)) {
				throw new Error(`Property path conflict at "${segment}"`);
			}
			current = current[segment] as Record<string, any>;
		}

		const finalSegment = segments[segments.length - 1];
		if (this.valuesEqual(current[finalSegment], value)) {
			return false;
		}

		current[finalSegment] = value;
		return true;
	}

	private async writeToFrontmatter(sourcePath: string, propertyPath: string, value: any): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) {
			throw new Error(`Source file not found: ${sourcePath}`);
		}

		let changed = false;
		await this.app.fileManager.processFrontMatter(file, frontmatter => {
			changed = this.setNestedPropertyValue(frontmatter, propertyPath, value);
		});

		return changed;
	}

	private async applyOutputTarget(query: QueryParams, result: QueryResult, ctx: any): Promise<void> {
		if (query.output !== 'frontmatter') {
			return;
		}

		if (result.error) {
			return;
		}

		if (!query.property) {
			throw new Error('`property` is required when `output: frontmatter` is used');
		}

		if (!ctx || !ctx.sourcePath) {
			throw new Error('Frontmatter output requires a note source path');
		}

		const selectedData = this.selectDataByPath(result.data, query.path);
		await this.writeToFrontmatter(ctx.sourcePath, query.property, selectedData);
	}

	private async applyOutputTargetSafely(query: QueryParams, result: QueryResult, ctx: any): Promise<void> {
		try {
			await this.applyOutputTarget(query, result, ctx);
		} catch (error) {
			console.error('Failed to apply output target:', error);
			new Notice(`Frontmatter output failed: ${error.message}`);
		}
	}

	private selectDataByPath(data: any, path?: string): any {
		if (!path || path.trim() === '') {
			return data;
		}

		const resolvePath = (root: any, targetPath: string): any => {
			const segments = targetPath.split('.').map(segment => segment.trim()).filter(Boolean);
			let current: any = root;

			for (const segment of segments) {
				if (current === null || current === undefined) {
					throw new Error(`Path "${targetPath}" not found`);
				}

				if (Array.isArray(current)) {
					const index = Number(segment);
					if (!Number.isInteger(index) || index < 0 || index >= current.length) {
						throw new Error(`Invalid array index "${segment}" in path "${targetPath}"`);
					}
					current = current[index];
					continue;
				}

				if (typeof current === 'object' && segment in current) {
					current = current[segment];
					continue;
				}

				throw new Error(`Path "${targetPath}" not found`);
			}

			return current;
		};

		try {
			return resolvePath(data, path);
		} catch (error) {
			// Common GraphQL envelope fallback: { data: ... }
			if (
				data &&
				typeof data === 'object' &&
				'data' in data &&
				(data as any).data &&
				typeof (data as any).data === 'object'
			) {
				return resolvePath((data as any).data, path);
			}
			throw error;
		}
	}

	private buildTableData(data: any): { headers: string[]; rows: Record<string, any>[] } | null {
		if (!Array.isArray(data) || data.length === 0) {
			return null;
		}

		const rows: Record<string, any>[] = [];
		const headers: string[] = [];
		const seenHeaders = new Set<string>();

		for (const item of data) {
			if (!item || typeof item !== 'object' || Array.isArray(item)) {
				return null;
			}
			rows.push(item as Record<string, any>);

			for (const key of Object.keys(item)) {
				if (!seenHeaders.has(key)) {
					seenHeaders.add(key);
					headers.push(key);
				}
			}
		}

		return { headers, rows };
	}

	private tryResolveTableInput(data: any): any {
		if (Array.isArray(data)) {
			return data;
		}

		if (!data || typeof data !== 'object') {
			return data;
		}

		// Common GraphQL envelope: { data: ... }
		if ('data' in data && data.data && typeof data.data === 'object') {
			const unwrapped = this.tryResolveTableInput(data.data);
			if (Array.isArray(unwrapped)) {
				return unwrapped;
			}
		}

		// If object has exactly one property, keep drilling into it.
		const keys = Object.keys(data);
		if (keys.length === 1) {
			const singleValue = data[keys[0]];
			const drilled = this.tryResolveTableInput(singleValue);
			if (Array.isArray(drilled)) {
				return drilled;
			}
		}

		// GraphQL connections: { edges: [...] }
		if (Array.isArray((data as any).edges)) {
			return (data as any).edges;
		}

		// Generic object containing any array field.
		for (const key of keys) {
			if (Array.isArray((data as any)[key])) {
				return (data as any)[key];
			}
		}

		return data;
	}

	private findFirstArrayOfObjects(data: any, depth: number = 0): Record<string, any>[] | null {
		if (depth > 8 || data === null || data === undefined) {
			return null;
		}

		if (Array.isArray(data)) {
			if (data.length > 0 && data.every(item =>
				item &&
				typeof item === 'object' &&
				!Array.isArray(item)
			)) {
				return data as Record<string, any>[];
			}

			for (const item of data) {
				const nested = this.findFirstArrayOfObjects(item, depth + 1);
				if (nested) {
					return nested;
				}
			}
			return null;
		}

		if (typeof data !== 'object') {
			return null;
		}

		const objectData = data as Record<string, any>;
		const priorityKeys = ['edges', 'nodes', 'items', 'results', 'data'];

		for (const key of priorityKeys) {
			if (key in objectData) {
				const nested = this.findFirstArrayOfObjects(objectData[key], depth + 1);
				if (nested) {
					return nested;
				}
			}
		}

		for (const value of Object.values(objectData)) {
			const nested = this.findFirstArrayOfObjects(value, depth + 1);
			if (nested) {
				return nested;
			}
		}

		return null;
	}

	private normalizeTableRows(rows: Record<string, any>[]): Record<string, any>[] {
		// Common GraphQL edge shape: [{ node: {...} }]
		const canUnwrapNode = rows.length > 0 && rows.every(row =>
			row &&
			typeof row === 'object' &&
			!Array.isArray(row) &&
			Object.keys(row).length === 1 &&
			row.node &&
			typeof row.node === 'object' &&
			!Array.isArray(row.node)
		);

		if (canUnwrapNode) {
			return rows.map(row => row.node as Record<string, any>);
		}

		return rows;
	}

	private tableCellValue(value: any): string {
		if (value === null || value === undefined) {
			return '';
		}
		if (typeof value === 'object') {
			return JSON.stringify(value);
		}
		return String(value);
	}

	private tableCellDisplayValue(value: any): string {
		const raw = this.tableCellValue(value).replace(/\s+/g, ' ').trim();
		const maxLength = 120;
		if (raw.length <= maxLength) {
			return raw;
		}
		return `${raw.substring(0, maxLength - 3)}...`;
	}

	private toMarkdownTable(headers: string[], rows: Record<string, any>[]): string {
		const headerLine = `| ${headers.join(' | ')} |`;
		const dividerLine = `| ${headers.map(() => '---').join(' | ')} |`;
		const rowLines = rows.map(row => {
			const cells = headers.map(header => this.tableCellValue(row[header]).replace(/\|/g, '\\|'));
			return `| ${cells.join(' | ')} |`;
		});

		return [headerLine, dividerLine, ...rowLines].join('\n');
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
	            const sectionInfo = ctx.getSectionInfo(container);
	            if (sectionInfo) {
	                container.dataset.sourcePath = ctx.sourcePath;
	                container.dataset.lineStart = String(sectionInfo.lineStart);
	                container.dataset.lineEnd = String(sectionInfo.lineEnd);
	            }
	        } catch (e) {
	            console.warn("Failed to get section info:", e);
	        }
	    }
	    
	    let outputText = '';
	    
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
	            await this.applyOutputTargetSafely(storedQuery, result, ctx);
	            
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
	        this.saveResultToNote(outputText, container);
	    });
	    
	    // Create the content container
	    const content = resultContainer.createEl('div', { cls: 'data-fetcher-content' });
	    
	    try {
	        const selectedData = this.selectDataByPath(result.data, query?.path);
	        const format = query?.format || 'json';
	        
	        if (selectedData === null || selectedData === undefined) {
	            outputText = 'No data returned';
	            content.setText(outputText);
	        } else if (format === 'table') {
	            const tableInput = this.tryResolveTableInput(selectedData);
	            const resolvedTableInput = this.buildTableData(tableInput)
	                ? tableInput
	                : (this.findFirstArrayOfObjects(tableInput) || tableInput);
	            const initialTable = this.buildTableData(resolvedTableInput);
	            const tableData = initialTable
	                ? this.buildTableData(this.normalizeTableRows(initialTable.rows))
	                : null;
	            if (tableData) {
	                const tableEl = content.createEl('table', { cls: 'data-fetcher-table' });
	                const thead = tableEl.createEl('thead');
	                const headerRow = thead.createEl('tr');
	                for (const headerName of tableData.headers) {
	                    headerRow.createEl('th', { text: headerName });
	                }
	                const tbody = tableEl.createEl('tbody');
	                for (const row of tableData.rows) {
	                    const tr = tbody.createEl('tr');
	                    for (const headerName of tableData.headers) {
	                        const fullValue = this.tableCellValue(row[headerName]);
	                        const cell = tr.createEl('td');
	                        cell.createEl('span', {
	                            text: this.tableCellDisplayValue(row[headerName]),
	                            cls: 'data-fetcher-table-cell',
	                            attr: { title: fullValue }
	                        });
	                    }
	                }
	                outputText = this.toMarkdownTable(tableData.headers, tableData.rows);
	            } else {
	                outputText = JSON.stringify(selectedData, null, 2);
	                content.createEl('div', {
	                    text: 'Table format requires an array of objects. Showing JSON output instead.',
	                    cls: 'data-fetcher-format-note'
	                });
	                const pre = content.createEl('pre');
	                pre.createEl('code', { text: outputText });
	            }
	        } else if (typeof selectedData === 'object') {
	            outputText = JSON.stringify(selectedData, null, 2);
	            const pre = content.createEl('pre');
	            pre.createEl('code', { text: outputText });
	        } else {
	            outputText = String(selectedData);
	            content.setText(outputText);
	        }
	    } catch (e) {
	        const errorMessage = `Error displaying data: ${e.message}`;
	        outputText = errorMessage;
	        content.createEl('div', { text: errorMessage, cls: 'data-fetcher-error' });
	    }
	    
	    // Setup copy to clipboard functionality
	    copyBtn.addEventListener('click', () => {
	        navigator.clipboard.writeText(outputText).then(() => {
	            new Notice('Copied to clipboard');
	        }).catch(err => {
	            console.error("Error copying to clipboard:", err);
	            new Notice('Failed to copy: ' + err.message);
	        });
	    });
	}
	
	saveResultToNote(dataString: string, container: HTMLElement): void {
        try {
            // Get the active view
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            
            if (!activeView) {
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
                }
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
