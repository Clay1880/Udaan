import { describe, expect, it } from "vitest";
import { adminCsv, filterRows, formatDuration, rankRows, posterFileName, quizLabel, sortByScore, summarise, type AdminRow } from "@/lib/admin/rows";

const row = (o: Partial<AdminRow> & { uid: string }): AdminRow => ({
  name: "Name",
  email: "e@x.y",
  rollNo: "1",
  year: "FE",
  branch: "IT",
  quiz: null,
  poster: null,
  ...o,
});

const rows: AdminRow[] = [
  row({ uid: "a", name: "Asha Rao", rollNo: "FE-12", year: "FE", branch: "IT", email: "asha@x.y", quiz: { status: "submitted", score: 12 } }),
  row({ uid: "b", name: "Bilal", rollNo: "7", year: "TE", branch: "COMP", quiz: { status: "in_progress", score: null }, poster: { uploadedAt: 1, fileType: "image/png", url: "u" } }),
  row({ uid: "c", name: "Chitra", rollNo: "9", year: "FE", branch: "COMP", quiz: { status: "submitted", score: 18 } }),
  row({ uid: "d", name: "Dev", rollNo: "3", year: "BE", branch: "MECH" }),
];

describe("filterRows", () => {
  it("filters by year and branch", () => {
    expect(filterRows(rows, { year: "FE", branch: "", q: "" }).map((r) => r.uid)).toEqual(["a", "c"]);
    expect(filterRows(rows, { year: "FE", branch: "COMP", q: "" }).map((r) => r.uid)).toEqual(["c"]);
    expect(filterRows(rows, { year: "", branch: "", q: "" })).toHaveLength(4);
  });
  it("searches name, registration number and email, case-insensitively", () => {
    expect(filterRows(rows, { year: "", branch: "", q: "  ASHA " }).map((r) => r.uid)).toEqual(["a"]);
    expect(filterRows(rows, { year: "", branch: "", q: "fe-12" }).map((r) => r.uid)).toEqual(["a"]);
    expect(filterRows(rows, { year: "", branch: "", q: "asha@" }).map((r) => r.uid)).toEqual(["a"]);
  });
});

describe("sortByScore", () => {
  it("puts submitted scores first, highest first, then in-progress and not started", () => {
    expect(sortByScore(rows).map((r) => r.uid)).toEqual(["c", "a", "b", "d"]);
  });
  it("breaks score ties by fastest time", () => {
    const t = (uid: string, score: number, timeMs: number | null) =>
      row({ uid, quiz: { status: "submitted", score, timeMs } });
    const tied = [t("slow", 20, 300_000), t("fast", 20, 120_000), t("best", 20, 60_000), t("low", 19, 1_000)];
    expect(sortByScore(tied).map((r) => r.uid)).toEqual(["best", "fast", "slow", "low"]);
    expect(formatDuration(tied[1].quiz?.timeMs)).toBe("2:00");
    expect(adminCsv([tied[1]]).split("\r\n")[1]).toContain(",20,120,");
  });
  it("ranks by score then time, ties share a rank, unfinished get none", () => {
    const t = (uid: string, score: number, timeMs: number) => row({ uid, quiz: { status: "submitted", score, timeMs } });
    const r = rankRows([t("a", 20, 100), t("b", 20, 100), t("c", 20, 50), t("d", 19, 10), row({ uid: "e" })]);
    expect([...r]).toEqual([["c", 1], ["a", 2], ["b", 2], ["d", 4]]);
  });
  it("does not mutate its input", () => {
    const copy = [...rows];
    sortByScore(rows);
    expect(rows).toEqual(copy);
  });
});

describe("quizLabel", () => {
  it("labels each state", () => {
    expect(quizLabel(rows[0])).toBe("12/20");
    expect(quizLabel(rows[1])).toBe("In progress");
    expect(quizLabel(rows[3])).toBe("Not started");
  });
});

describe("summarise", () => {
  it("counts registrations, quiz submissions and posters", () => {
    expect(summarise(rows)).toEqual({ registered: 4, quizDone: 2, quizInProgress: 1, posters: 1 });
  });
});

describe("adminCsv", () => {
  it("has one header row and one record per student", () => {
    const csv = adminCsv(rows);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Name,Registration No,Year,Branch,Email,Quiz status,Quiz score,Quiz time (sec),Poster submitted,Poster time (IST)");
    expect(lines).toHaveLength(5);
    expect(lines[1]).toBe("Asha Rao,FE-12,FE,IT,asha@x.y,submitted,12,,no,");
    expect(lines[2].startsWith("Bilal,7,TE,COMP,e@x.y,in progress,,,yes,")).toBe(true);
    expect(lines[4]).toBe("Dev,3,BE,MECH,e@x.y,not started,,,no,");
  });
  it("neutralises formula injection in names and roll numbers", () => {
    const csv = adminCsv([
      row({ uid: "x", name: '=HYPERLINK("http://evil","click")', rollNo: "-1+1" }),
      row({ uid: "y", name: "+cmd", rollNo: "@A1" }),
      row({ uid: "z", name: "\tTab", rollNo: "\r9" }),
    ]);
    const lines = csv.split("\r\n");
    expect(lines[1].startsWith(`"'=HYPERLINK(""http://evil"",""click"")",'-1+1,`)).toBe(true);
    expect(lines[2].startsWith("'+cmd,'@A1,")).toBe(true);
    // the CR is inside a quoted cell, so it doesn't break the record
    expect(csv).toContain("'\tTab,\"'\r9\",");
    expect(lines).toHaveLength(4); // header + 3 records; the lone \r inside quotes is not a record break
  });
  it("quotes commas, quotes and newlines in names and strips control characters", () => {
    const csv = adminCsv([row({ uid: "q", name: 'Rao, "Ash"\nKumar\u0000\u0007' })]);
    expect(csv.split("\r\n")[1].startsWith('"Rao, ""Ash""\nKumar",')).toBe(true);
    expect(csv).not.toMatch(/[\u0000\u0007]/);
  });
});

describe("posterFileName", () => {
  it("builds an ASCII, filesystem-safe name with the right extension", () => {
    const used = new Set<string>();
    const r = row({ uid: "u", name: "Ánanyā  Rāo/..", rollNo: "TE/12", year: "TE", branch: "ENTC", poster: { uploadedAt: 1, fileType: "image/jpeg", url: "" } });
    expect(posterFileName(r, used)).toBe("TE_ENTC_TE-12_Ananya_Rao.jpg");
  });
  it("never returns the same name twice", () => {
    const used = new Set<string>();
    const r = row({ uid: "u", name: "Same", poster: { uploadedAt: 1, fileType: "application/pdf", url: "" } });
    expect(posterFileName(r, used)).toBe("FE_IT_1_Same.pdf");
    expect(posterFileName(r, used)).toBe("FE_IT_1_Same-2.pdf");
    expect(posterFileName(r, used)).toBe("FE_IT_1_Same-3.pdf");
  });
  it("falls back when a name has no ASCII letters at all", () => {
    const r = row({ uid: "u", name: "अनन्या", poster: { uploadedAt: 1, fileType: "image/png", url: "" } });
    expect(posterFileName(r, new Set())).toBe("FE_IT_1_student.png");
  });
});
