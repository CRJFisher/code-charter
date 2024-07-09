import { CallGraph, ProjectEnvironmentId, TreeAndContextSummaries } from '../../shared/models';

interface VsCodeApi {
    postMessage(message: any): void;
    // Add other methods and properties as needed
}
declare function acquireVsCodeApi(): VsCodeApi;
const vscode = acquireVsCodeApi();

// Define a type for the response messages
type ResponseMessage = {
    id: string;
    command: string;
    data?: any;
    [key: string]: any;
};

const messageQueue: Map<string, (response: ResponseMessage) => void> = new Map();

window.addEventListener('message', (event) => {
    const message: ResponseMessage = event.data;
    const { id } = message;

    if (messageQueue.has(id)) {
        const resolve = messageQueue.get(id)!;
        resolve(message);
        messageQueue.delete(id);
    } else {
        // console.error('Message not handled:', message);
    }
});

function sendMessageWithResponse(command: string, payload: any = {}): Promise<ResponseMessage> {
    return new Promise((resolve) => {
        const messageId = Math.random().toString(36).substring(7);
        messageQueue.set(messageId, resolve);
        vscode.postMessage({ id: messageId, command, ...payload });
    });
}

// TODO: create a Stream version of this using RxJS

// TODO: make all of these calls much higher level - instead of exposing low level node api calls, expose higher level api calls as if it were a web server api
// These should be at the level where we want to display status corresponding to the processing in the api call

// TODO: how to share models accross the webview and extension so their types are in sync? Some way of importing the types from some top-level TS folder into both projects?

async function detectEnvironments(): Promise<ProjectEnvironmentId[]> {
    try {
        console.log('Detecting environments...');
        const response = await sendMessageWithResponse('detectEnvironments');
        return response.data;
    } catch (error) {
        console.error('Error detecting environments:', error);
        return [];
    }
}

async function getCallGraphForEnvironment(env: ProjectEnvironmentId): Promise<CallGraph | undefined> {
    try {
        console.log('Getting top level functions for environment...');
        const response = await sendMessageWithResponse('getCallGraphForEnvironment', { env });
        return response.data;
    } catch (error) {
        console.error('Error getting top level functions for environment:', error);
    }
}

async function summariseCodeTree(topLevelFunctionSymbol: string): Promise<TreeAndContextSummaries | undefined> {
    try {
        console.log('Summarising code tree...');
        const response = await sendMessageWithResponse('summariseCodeTree', { topLevelFunctionSymbol });
        return response.data;
    } catch (error) {
        console.error('Error summarising code tree:', error);
    }
}

// async function runCommand(command: string): Promise<string> {
//     try {
//         console.log('Running command...');
//         const response = await sendMessageWithResponse('runCommand', { commandToRun: command });
//         return response.data;
//     } catch (error) {
//         console.error('Error running command:', error);
//         throw error;
//     }
// }

// async function readFile(filePath: string): Promise<string | undefined> {
//     try {
//         console.log('Requesting data...');
//         const response = await sendMessageWithResponse('readFile', { filePath });
//         return response.data as string;
//     } catch (error) {
//         console.error('Error fetching data:', error);
//     }
// }

// async function writeFile(filePath: string, content: string): Promise<boolean> {
//     try {
//         console.log('Writing file...');
//         const response = await sendMessageWithResponse('writeFile', { filePath, content });
//         if (response.status === 'success') {
//             console.log('File written successfully');
//             return true;
//         } else {
//             console.error('Error writing file:', response.message);
//             return false;
//         }
//     } catch (error) {
//         console.error('Error writing file:', error);
//         return false;
//     }
// }

// async function doesFileExist(filePath: string): Promise<boolean> {
//     try {
//         console.log('Checking file existence...');
//         const response = await sendMessageWithResponse('doesFileExist', { filePath });
//         return response.data;
//     } catch (error) {
//         console.error('Error checking file existence:', error);
//         return false;
//     }
// }

// async function getFilesAtPath(path: string): Promise<string[]> {
//     try {
//         console.log('Requesting files at path...');
//         const response = await sendMessageWithResponse('getFilesAtPath', { path });
//         return response.data;
//     } catch (error) {
//         console.error('Error getting files at path:', error);
//         return [];
//     }
// }

// async function getWorkspaceDirs(): Promise<string[]> {
//     try {
//         console.log('Requesting workspace directories...');
//         const response = await sendMessageWithResponse('getWorkspaceDirs');
//         return response.data;
//     } catch (error) {
//         console.error('Error getting workspace directories:', error);
//         return [];
//     }
// }

// async function getExtensionFilePaths(workspaceDir: string, projectDir: string): Promise<ExtensionUris> {
//     try {
//         console.log('Requesting extension file paths...');
//         const response = await sendMessageWithResponse('getExtensionFilePaths', { workspaceDir, projectDir });
//         const data = (response.data) as IExtensionUris;
//         return ExtensionUris.fromData(data);
//     } catch (error) {
//         console.error('Error getting extension file paths:', error);
//         throw error;
//     }
// }

// async function getBottomLevelFolder(uri: string): Promise<string> {
//     try {
//         console.log('Requesting bottom level folder...');
//         const response = await sendMessageWithResponse('getBottomLevelFolder', { uri });
//         return response.data;
//     } catch (error) {
//         console.error('Error getting bottom level folder:', error);
//         return '';
//     }
// }

// async function getFileVersionHash(): Promise<string> {
//     try {
//         console.log('Requesting file version hash...');
//         const response = await sendMessageWithResponse('getFileVersionHash');
//         return response.data;
//     } catch (error) {
//         console.error('Error getting file version hash:', error);
//         return '';
//     }
// }

// async function getPythonPath(): Promise<string> {
//     try {
//         console.log('Requesting python path...');
//         const response = await sendMessageWithResponse('getPythonPath');
//         return response.data;
//     } catch (error) {
//         console.error('Error getting python path:', error);
//         return '';
//     }
// }

export {
    // readFile,
    // writeFile,
    // doesFileExist,
    // getExtensionFilePaths,
    // getWorkspaceDirs,
    // getFilesAtPath,
    // getBottomLevelFolder,
    // runCommand,
    // getFileVersionHash,
    // getPythonPath,
    detectEnvironments,
    getCallGraphForEnvironment,
    summariseCodeTree,
};
