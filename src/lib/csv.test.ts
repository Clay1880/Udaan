import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";

describe("csvCell", () => {
  it("leaves plain values alone", () => {
    expect(csvCell("Asha")).toBe("Asha");
    expect(csvCell(12)).toBe("12");
    expect(csvCell(0)).toBe("0");
  });
  it("renders null and undefined as empty", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell("line1\r\nline2")).toBe('"line1\r\nline2"');
    expect(csvCell('"')).toBe('""""');
  });
  it("neutralises spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tcmd")).toBe("'\tcmd");
  });
  it("neutralises formulas hidden behind leading whitespace or fullwidth characters", () => {
    expect(csvCell(" =1+1")).toBe("' =1+1");
    expect(csvCell("  @SUM(A1)")).toBe("'  @SUM(A1)");
    for (const c of ["＝", "＋", "－", "＠"]) expect(csvCell(`${c}1`)).toBe(`'${c}1`);
    expect(csvCell("  ＝1")).toBe("'  ＝1");
    expect(csvCell("Asha Rao")).toBe("Asha Rao");
    expect(csvCell(" Asha")).toBe(" Asha");
  });
  it("neutralises a leading carriage return, and quotes the cell because of it", () => {
    expect(csvCell("\r=1+1")).toBe("\"'\r=1+1\"");
  });
  it("neutralises formulas that also need quoting", () => {
    expect(csvCell("=1,2")).toBe("\"'=1,2\"");
    expect(csvCell("-cmd|' /C calc'!A0")).toBe("'-cmd|' /C calc'!A0");
  });
  it("only looks at the first character", () => {
    expect(csvCell("Anne-Marie")).toBe("Anne-Marie");
    expect(csvCell("a=b")).toBe("a=b");
    expect(csvCell("TE/12-B")).toBe("TE/12-B");
  });
  it("strips control characters but keeps tab, CR and LF", () => {
    expect(csvCell("As\u0000ha\u0007")).toBe("Asha");
    expect(csvCell("A\u001bB\u007fC\u0085D")).toBe("ABCD");
    expect(csvCell("a\tb")).toBe("a\tb");
  });
  it("checks for a formula after stripping control characters", () => {
    expect(csvCell("\u0000=cmd")).toBe("'=cmd");
    expect(csvCell("\u0001\u0002+1")).toBe("'+1");
  });
  it("keeps non-ASCII names intact", () => {
    expect(csvCell("Ánanyā Rāo")).toBe("Ánanyā Rāo");
    expect(csvCell("अनन्या")).toBe("अनन्या");
  });
});

describe("toCsv", () => {
  it("joins with CRLF", () => {
    expect(toCsv(["a", "b"], [["1", "x,y"]])).toBe('a,b\r\n1,"x,y"');
  });
  it("escapes headers and every row, and keeps embedded newlines inside one record", () => {
    expect(toCsv(["Name", "Note"], [["=evil", "two\nlines"], [null, 3]])).toBe("Name,Note\r\n'=evil,\"two\nlines\"\r\n,3");
  });
  it("renders headers only when there are no rows", () => {
    expect(toCsv(["a", "b"], [])).toBe("a,b");
  });
});
