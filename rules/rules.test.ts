import { afterAll, beforeAll, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";
import { readFileSync } from "node:fs";

let env: RulesTestEnvironment;
const bytes = (n: number) => new Uint8Array(n);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-udaan",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    storage: { rules: readFileSync("storage.rules", "utf8"), host: "127.0.0.1", port: 9199 },
  });
});
afterAll(() => env.cleanup());

describe("storage rules", () => {
  it("owner can create an allowed file", async () => {
    const s = env.authenticatedContext("alice").storage();
    await assertSucceeds(uploadBytes(ref(s, "posters/alice/1-a.png"), bytes(100), { contentType: "image/png" }));
    await assertSucceeds(uploadBytes(ref(s, "posters/alice/1-b.pdf"), bytes(100), { contentType: "application/pdf" }));
  });
  it("owner cannot overwrite an existing file", async () => {
    const s = env.authenticatedContext("alice").storage();
    await uploadBytes(ref(s, "posters/alice/once.png"), bytes(10), { contentType: "image/png" });
    await assertFails(uploadBytes(ref(s, "posters/alice/once.png"), bytes(10), { contentType: "image/png" }));
  });
  it("another user cannot write into alice's folder", async () => {
    const s = env.authenticatedContext("bob").storage();
    await assertFails(uploadBytes(ref(s, "posters/alice/2-a.png"), bytes(10), { contentType: "image/png" }));
  });
  it("anonymous users cannot upload", async () => {
    const s = env.unauthenticatedContext().storage();
    await assertFails(uploadBytes(ref(s, "posters/alice/3-a.png"), bytes(10), { contentType: "image/png" }));
  });
  it("rejects non-poster content types", async () => {
    const s = env.authenticatedContext("alice").storage();
    await assertFails(uploadBytes(ref(s, "posters/alice/4-a.txt"), bytes(10), { contentType: "text/plain" }));
    await assertFails(uploadBytes(ref(s, "posters/alice/4-b.exe"), bytes(10), { contentType: "application/octet-stream" }));
  });
  it("rejects files over 10 MB", async () => {
    const s = env.authenticatedContext("alice").storage();
    await assertFails(uploadBytes(ref(s, "posters/alice/5-a.png"), bytes(10 * 1024 * 1024 + 1), { contentType: "image/png" }));
  });
  it("nobody can read posters from the client", async () => {
    const s = env.authenticatedContext("alice").storage();
    await assertFails(getBytes(ref(s, "posters/alice/1-a.png")));
  });
  it("paths outside posters/ are closed", async () => {
    const s = env.authenticatedContext("alice").storage();
    await assertFails(uploadBytes(ref(s, "other/alice.png"), bytes(10), { contentType: "image/png" }));
  });
});

describe("firestore rules", () => {
  it("clients can neither read nor write", async () => {
    const db = env.authenticatedContext("alice").firestore();
    await assertFails(getDoc(doc(db, "users/alice")));
    await assertFails(setDoc(doc(db, "users/alice"), { name: "x" }));
    await assertFails(getDoc(doc(db, "attempts/alice")));
  });
});
