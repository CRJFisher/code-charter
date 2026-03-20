/**
 * Strips JSDoc tags from raw JSDoc comment text, returning only the body description.
 */
export function strip_jsdoc_tags(raw: string): string {
  const cleaned = raw
    .replace(/^\/\*\*\s*/, '')
    .replace(/\s*\*\/$/, '')
    .split('\n')
    .map(line => line.replace(/^\s*\*\s?/, ''))
    .join('\n')
    .trim();

  const lines = cleaned.split('\n');
  const body_lines: string[] = [];

  for (const line of lines) {
    if (/^\s*@\w+/.test(line)) {
      break;
    }
    body_lines.push(line);
  }

  return body_lines.join('\n').trim();
}
