
interface EntryPoint {
    symbol: string;
    displayName: string;
    file: string;
    metadata: Record<string, any>;
}

interface IExtensionUris {
    workDir: string; // the .code-charter directory
    extensionDir: string; // for accessing the extension files e.g. assets
    workspaceDir: string;  // the root of the workspace
    projectDir: string; // the root of the project; workspaces can have multiple projects
}

export type { EntryPoint, IExtensionUris };

export class ExtensionUris implements IExtensionUris {
    static fromData(data: IExtensionUris): ExtensionUris {
        return new ExtensionUris(data.workDir, data.extensionDir, data.workspaceDir, data.projectDir);
    }

    workDir: string;
    extensionDir: string;
    workspaceDir: string;
    projectDir: string;

    constructor(workDir: string, extensionDir: string, workspaceDirs: string, projectDir: string) {
        this.workDir = workDir;
        this.extensionDir = extensionDir;
        this.workspaceDir = workspaceDirs;
        this.projectDir = projectDir;
    }

    asRelativePath(absolutePath: string): string {
        // only match rootDir at the start of the string
        const rootDirMatch = new RegExp(`^${this.workspaceDir}`);
        const trimmed = absolutePath.replace(rootDirMatch, '');
        if (trimmed.startsWith('/')) {
            return trimmed.slice(1);
        }
        return trimmed;
    }
}