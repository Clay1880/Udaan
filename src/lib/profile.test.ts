import { describe, expect, it } from "vitest";
import { ProfileSchema } from "@/lib/profile";

const ok = { name: "Asha Patil", rollNo: "21CE1045", year: "TE", branch: "COMP" };

describe("ProfileSchema", () => {
  it("accepts a valid profile and trims", () => {
    expect(ProfileSchema.parse({ ...ok, name: "  Asha Patil  " }).name).toBe("Asha Patil");
  });
  it("accepts every branch and year", () => {
    for (const branch of ["COMP", "IT", "ENTC", "MECH", "ARE"]) expect(ProfileSchema.safeParse({ ...ok, branch }).success).toBe(true);
    for (const year of ["FE", "SE", "TE", "BE"]) expect(ProfileSchema.safeParse({ ...ok, year }).success).toBe(true);
  });
  it("rejects unknown year/branch, short name, spaces or symbols in roll number", () => {
    expect(ProfileSchema.safeParse({ ...ok, year: "ME" }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...ok, branch: "CIVIL" }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...ok, name: "A" }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...ok, rollNo: "21 CE" }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...ok, rollNo: "<script>" }).success).toBe(false);
  });
});
