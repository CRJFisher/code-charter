import { exec } from 'child_process';

async function checkDockerInstalled(): Promise<boolean> {
    return new Promise((resolve, reject) => {
        exec('docker --version', (error, stdout, stderr) => {
            if (error) {
                console.error("Error executing 'docker --version':", error);
                // reject(new Error('Docker is not installed. Please install Docker to use this extension.'));
                resolve(false);
            } else {
                console.log('Docker version detected:', stdout.trim());
                resolve(true);
            }
        });
    });
}

export { checkDockerInstalled };
