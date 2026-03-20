export function symbolRepoLocalName(symbol: string): string {
  const parts = symbol.split(':');
  return parts[parts.length - 1] || symbol;
}