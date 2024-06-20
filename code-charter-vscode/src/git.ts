import * as vscode from 'vscode';
import { hashText } from './hashing';

interface GitExtension {
    getAPI(version: 1): GitAPI;
}

interface GitAPI {
    repositories: Repository[];
}

interface Repository {
    rootUri: vscode.Uri;
    state: RepositoryState;
    getBranch(branch: string): Promise<Branch>;
}

interface RepositoryState {
    HEAD: Branch | undefined;
    workingTreeChanges: Change[];
}

interface Branch {
    name: string;
    commit: string;
    remote?: string;
    ahead?: number;
    behind?: number;
}

interface Change {
    uri: vscode.Uri;
    status: ChangeStatus;
}

interface ChangeDiff {
    modified: string;
    original: string;
}

enum ChangeStatus {
    INDEX_MODIFIED,
    INDEX_ADDED,
    INDEX_DELETED,
    MODIFIED,
    DELETED,
    UNTRACKED,
    IGNORED,
    INTENT_TO_ADD,
    ADDED_BY_US,
    ADDED_BY_THEM,
    DELETED_BY_US,
    DELETED_BY_THEM,
    MODIFIED_BY_US,
    MODIFIED_BY_THEM,
}

export async function getFileVersionHash(): Promise<string | undefined> {
    const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git')?.exports;
    if (!gitExtension) {
        console.log('Git extension not found.');
        return;
    }

    const gitAPI = gitExtension.getAPI(1);
    if (!gitAPI.repositories.length) {
        console.log('No git repositories found.');
        return;
    }

    const repository = gitAPI.repositories[0];

    // Get the hash of the latest commit
    const latestCommitHash = repository.state.HEAD?.commit;
    if (!latestCommitHash) {
        console.log('No commits found.');
        return;
    }

    // Check for changes since the latest commit
    const changes = repository.state.workingTreeChanges;
    if (changes.length > 0) {
        console.log('There are changes since the latest commit:');
        let combinedChanges = '';
        for (const c of changes) {
            try {
                const fileContents = await vscode.workspace.fs.readFile(c.uri).then((buffer) => new TextDecoder().decode(buffer));
                combinedChanges += fileContents;
            } catch (e) {
                console.log('Error opening change:', e);
                continue;
            }
        }
        return `${latestCommitHash}-${hashText(combinedChanges)}`;
    } else {
        console.log('No changes since the latest commit.');
        return latestCommitHash;
    }
}