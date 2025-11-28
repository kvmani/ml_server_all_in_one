import { buildManifest, parseInstructions } from "../../src/plugins/pdf_stitch/parser";

describe("parseInstructions", () => {
  it("parses multiline plans", () => {
    const result = parseInstructions("pdf-1: 1-3,5\npdf-2: all;");
    expect(result.error).toBeUndefined();
    expect(result.instructions.length).toBe(2);
    expect(result.instructions[0]).toEqual({ alias: "pdf-1", pages: "1-3,5" });
  });

  it("rejects bad aliases", () => {
    const result = parseInstructions("pdf 1: 1-3");
    expect(result.error).toBeDefined();
  });
});

describe("buildManifest", () => {
  it("builds manifest with defaults when no instructions provided", () => {
    const files = [{ alias: "pdf-1", file: new File([], "a.pdf") }];
    const { manifest, error } = buildManifest([], files);
    expect(error).toBeUndefined();
    expect(manifest[0].pages).toBe("all");
  });

  it("errors when alias missing", () => {
    const files = [{ alias: "pdf-1", file: new File([], "a.pdf") }];
    const { error } = buildManifest([{ alias: "pdf-2", pages: "1" }], files);
    expect(error).toBeDefined();
  });
});
