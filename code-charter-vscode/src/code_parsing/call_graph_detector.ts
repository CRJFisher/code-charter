import * as vscode from 'vscode';
import { promises as fs } from 'fs';
import * as path from 'path';
import { CallGraph, CallGraphItem, DefinitionNode } from '../../shared/codeGraph';
import { Project, ScopeGraph, Def, Ref } from 'refscope';

export class RefScopeCallGraphDetector {
    private project: Project;

    constructor() {
        this.project = new Project();
    }

    async detect_call_graph(project_path: vscode.Uri): Promise<CallGraph> {
        console.time('refscope-index-generation');
        
        // Clear any existing files in the project
        this.project = new Project();
        
        // Find all source files in the project
        const source_files = await this.find_source_files(project_path);
        
        // Add all files to the project
        for (const file_path of source_files) {
            const content = await fs.readFile(file_path, 'utf-8');
            const relative_path = path.relative(project_path.fsPath, file_path);
            this.project.add_or_update_file(relative_path, content);
        }
        
        console.timeEnd('refscope-index-generation');

        // Extract call graph from the project
        const call_graph = await this.extract_call_graph_from_project(project_path);
        
        return call_graph;
    }

    private async find_source_files(project_path: vscode.Uri): Promise<string[]> {
        const files: string[] = [];
        const extensions = ['.py', '.js', '.ts', '.jsx', '.tsx', '.rs'];
        
        async function walk(dir: string) {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const full_path = path.join(dir, entry.name);
                
                // Skip common directories we don't want to parse
                if (entry.isDirectory()) {
                    if (!['node_modules', '.git', '__pycache__', '.venv', 'venv', 'dist', 'build'].includes(entry.name)) {
                        await walk(full_path);
                    }
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name);
                    if (extensions.includes(ext)) {
                        files.push(full_path);
                    }
                }
            }
        }
        
        await walk(project_path.fsPath);
        return files;
    }

    private async extract_call_graph_from_project(project_path: vscode.Uri): Promise<CallGraph> {
        const top_level_nodes: string[] = [];
        const call_graph_items: CallGraphItem[] = [];
        const definition_nodes: Record<string, DefinitionNode> = {};
        
        // Process each file in the project
        const source_files = await this.find_source_files(project_path);
        
        for (const file_path of source_files) {
            const relative_path = path.relative(project_path.fsPath, file_path);
            
            // Get all definitions in the file
            const defs = this.get_all_definitions_in_file(relative_path);
            
            for (const def of defs) {
                const symbol_name = this.create_symbol_name(relative_path, def);
                
                // Check if this is a top-level function
                if (this.is_top_level_function(def, relative_path)) {
                    top_level_nodes.push(symbol_name);
                }
                
                // Create definition node
                definition_nodes[symbol_name] = {
                    docstring: '', // TODO: Extract docstrings when refscope supports it
                    signature: def.name, // TODO: Extract full signature when available
                    source: await this.extract_source_code(file_path, def),
                    containerSymbol: '', // TODO: Extract container when available
                    filePath: file_path,
                    lineNumber: def.range.start.row + 1, // Convert 0-indexed to 1-indexed
                };
                
                // Find all references from this definition
                const refs = this.project.find_references(relative_path, def.range.start);
                
                for (const ref of refs) {
                    // For each reference, find what it's calling
                    const called_def = this.project.go_to_definition(ref.file, ref.start);
                    if (called_def) {
                        const called_symbol = this.create_symbol_name(called_def.file, called_def);
                        call_graph_items.push({
                            from: symbol_name,
                            to: called_symbol,
                        });
                    }
                }
            }
        }
        
        return {
            topLevelNodes: top_level_nodes,
            callGraphItems: call_graph_items,
            definitionNodes: definition_nodes,
        };
    }
    
    private get_all_definitions_in_file(file_path: string): Def[] {
        // This is a workaround since refscope doesn't expose a direct method to get all definitions
        // We'll need to scan the file for common definition patterns
        const defs: Def[] = [];
        
        // For now, we'll use a placeholder implementation
        // In a real implementation, we'd need to either:
        // 1. Extend refscope to expose this functionality
        // 2. Use tree-sitter directly to find definitions
        // 3. Scan through the file looking for definition patterns
        
        return defs;
    }
    
    private is_top_level_function(def: Def, file_path: string): boolean {
        // Check if the definition is at the top level of the file
        // This would need to be implemented based on the symbol kind and scope
        return def.symbol_kind === 'function' && !file_path.includes('test');
    }
    
    private create_symbol_name(file_path: string, def: Def): string {
        // Create a unique symbol name that includes the file path
        // This matches the format expected by the rest of the extension
        const module_path = file_path.replace(/\.[^/.]+$/, '').replace(/\//g, '.');
        return `${module_path}#${def.name}`;
    }
    
    private async extract_source_code(file_path: string, def: Def): Promise<string> {
        const content = await fs.readFile(file_path, 'utf-8');
        const lines = content.split('\n');
        
        // Extract the source code for the definition
        const start_line = def.range.start.row;
        const end_line = def.range.end.row;
        
        return lines.slice(start_line, end_line + 1).join('\n');
    }
}