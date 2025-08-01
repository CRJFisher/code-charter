import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function runCommand(command: string): Promise<string> {
    try {
        const { stdout, stderr } = await execAsync(command);
        if (stderr) {
            console.error(`stderr: ${stderr}`);
        }
        return stdout;
    } catch (error) {
        console.error(`exec error: ${error}`);
        throw error;
    }
}

export { runCommand, execAsync };