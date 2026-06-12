// Satisfies the Exporter interface structurally — no `implements` clause, which would let
// Ariadne link run_export's interface call to this method and nothing would fragment.
export class CsvExporter {
  export_rows(count: number): number {
    return count * 2;
  }
}

// Module-level instance: the constructor call sits in no entrypoint's tree, so the caller's
// inventory entry carries no unresolved site — the fixture stays evidence-less end to end.
export const csv_exporter = new CsvExporter();
