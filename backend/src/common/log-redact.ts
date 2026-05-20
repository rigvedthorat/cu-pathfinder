import { createHash } from 'node:crypto';

// Returns after logging user input text
export interface RedactedPrompt {
    length: number;
    hash: string;
    preview: string;
}

const PREVIEW_CHARS = 12;
const HASH_CHARS = 8;

// convert into hash and take the first 8 hash chars
export function redactPrompt(text: string): RedactedPrompt {
    const safeText = text ?? '';
    const hash = createHash('sha256')
        .update(safeText)
        .digest('hex')
        .slice(0, HASH_CHARS);
    const preview =
        safeText.length > PREVIEW_CHARS
        ? `${safeText.slice(0, PREVIEW_CHARS)}...`
        : safeText;
    return {
        length: safeText.length,
        hash,
        preview,
    };
}