import * as crypto from 'crypto';

function hashText(...args: string[]): string {
    const hash = crypto.createHash('sha256');
    hash.update(args.join(''));
    const fullHash = hash.digest('hex');
    return fullHash.substring(0, 20);
}

export { hashText };