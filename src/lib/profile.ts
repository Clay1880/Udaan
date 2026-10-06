import { z } from "zod";
import { BRANCHES, YEARS } from "@/lib/config";

export const ProfileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  rollNo: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9\-_/]+$/, "Roll number may only contain letters, digits, - _ /"),
  year: z.enum(YEARS),
  branch: z.enum(BRANCHES),
});
export type Profile = z.infer<typeof ProfileSchema>;
