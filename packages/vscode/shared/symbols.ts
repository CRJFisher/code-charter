export function symbolRepoLocalName(symbol: string): string {
  const hash_index = symbol.indexOf('#');
  if (hash_index !== -1) {
    return symbol.substring(hash_index + 1);
  }
  return symbol;
}