import { createHash } from 'crypto';
import { promises as fs } from 'fs';

export function sha256(data: Buffer | string): string {
	return createHash('sha256').update(data).digest('hex');
}

export async function sha256File(filePath: string): Promise<string> {
	return sha256(await fs.readFile(filePath));
}
