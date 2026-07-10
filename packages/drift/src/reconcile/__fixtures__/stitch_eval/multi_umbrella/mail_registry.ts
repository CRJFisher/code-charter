// The mail-handler table is populated by the deployment framework at startup — a second,
// fully independent dispatch cluster sharing nothing with the orders cluster.
const mail_table = new Map<string, () => number>();

export function lookup_mail_handler(key: string): () => number {
  return mail_table.get(key)!;
}
