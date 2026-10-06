import { adminAuth } from "@/lib/firebase/admin";
import { isAdminEmail } from "@/lib/config";
import { HttpError } from "./http";

export interface SessionUser {
  uid: string;
  email: string;
  name: string;
}

export async function requireUser(req: Request): Promise<SessionUser> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new HttpError(401, "Sign in required");
  let token;
  try {
    token = await adminAuth().verifyIdToken(header.slice(7));
  } catch {
    throw new HttpError(401, "Your session is invalid. Please sign in again.");
  }
  if (!token.email || !token.email_verified) throw new HttpError(401, "A verified Google email is required");
  return { uid: token.uid, email: token.email.toLowerCase(), name: (token.name as string | undefined) ?? "" };
}

export async function requireAdmin(req: Request): Promise<SessionUser> {
  const user = await requireUser(req);
  if (!isAdminEmail(user.email)) throw new HttpError(403, "Admins only");
  return user;
}
