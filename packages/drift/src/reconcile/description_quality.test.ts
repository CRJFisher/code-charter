import { describe, expect, it } from "@jest/globals";

import { is_name_restatement, member_name_of } from "./description_quality";

describe("member_name_of", () => {
  it("takes the short member name off a qualified anchor path", () => {
    expect(member_name_of("csv_exporter.ts#CsvExporter.export_rows:method")).toBe("export_rows");
    expect(member_name_of("dispatcher.ts#dispatch:function")).toBe("dispatch");
    expect(member_name_of("bare_name")).toBe("bare_name");
  });
});

describe("is_name_restatement", () => {
  it("rejects a bare name echo", () => {
    expect(is_name_restatement("create_handler.ts#handle_create:function", "Handles create.")).toBe(true);
  });

  it("rejects an echo hidden behind stopwords and inflection", () => {
    expect(is_name_restatement("registry.ts#lookup_handler:function", "Looks up the handler.")).toBe(true);
    expect(is_name_restatement("dispatcher.ts#dispatch:function", "Dispatches.")).toBe(true);
  });

  it("rejects an empty or whitespace description", () => {
    expect(is_name_restatement("a.ts#f:function", "   ")).toBe(true);
  });

  it("rejects a camelCase echo of a camelCase name", () => {
    expect(is_name_restatement("s.ts#runScheduled:function", "Runs the scheduled.")).toBe(true);
  });

  it("accepts a description that adds real vocabulary", () => {
    expect(
      is_name_restatement(
        "registry.ts#lookup_handler:function",
        "Looks up the registered handler for a key and runs it.",
      ),
    ).toBe(false);
    expect(
      is_name_restatement(
        "create_handler.ts#handle_create:function",
        "Validates the payload and writes a new record.",
      ),
    ).toBe(false);
  });

  it("accepts a method description that reframes behaviour beyond the short name", () => {
    expect(
      is_name_restatement("processor.py#Item.process:method", "Applies the configured transforms to one item."),
    ).toBe(false);
  });

  it("never lets a short name fragment absorb unrelated content words", () => {
    // Every content word here shares the 2-char name fragment "on" as a prefix; only the >=3
    // guard keeps "once"/"online"/"onboard" as content instead of zeroing the residual.
    expect(is_name_restatement("hooks.ts#on_event:function", "Once online, events onboard.")).toBe(false);
  });
});
