/**
 * Firestore security rules verification.
 *
 * Run with: npm run test:rules
 * (which wraps this in `firebase emulators:exec` using firebase.test.json, so FIRESTORE_EMULATOR_HOST is
 * already set — on a port distinct from the development emulators, so both can run at once).
 *
 * Why this file exists
 * --------------------
 * These rules are the only boundary between two users' data — there is no server tier. A rules
 * regression is silent: the app keeps working perfectly for its owner while leaking to everyone
 * else. Syntax-checking the file proves nothing about that, so this exercises the boundary with
 * two real identities.
 *
 * The suite has three jobs:
 *   1. ATTACCHI  — a second account must not be able to read, take over, or delete another's data.
 *      `hijack` is the regression test for the OR-branch bug: `update` used to be authorised by the
 *      INCOMING userId alone, so writing {userId: <mine>} over someone else's document was allowed.
 *   2. FLUSSI APP — every write and query useTaskStore actually performs must still pass. The
 *      cascade-delete queries matter most: they filter on parentStepId/taskId with NO userId
 *      clause, so tightening the rules can break deletion without breaking anything else.
 *   3. VALIDAZIONE — malformed documents are rejected at creation.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const NOW = "2026-08-27T08:00:00.000Z";

// RULES_FILE lets the same suite be pointed at an older revision of the rules, which is how you
// confirm the suite is not vacuous: run it against the pre-fix rules and the ATTACCHI group must go red.
const rulesPath = process.env.RULES_FILE ?? join(repoRoot, "firestore.rules");

const testEnv = await initializeTestEnvironment({
  projectId: "demo-chronostep",
  firestore: { rules: readFileSync(rulesPath, "utf8") },
});

const alice = testEnv.authenticatedContext("alice").firestore();
const bob = testEnv.authenticatedContext("bob").firestore();
const anon = testEnv.unauthenticatedContext().firestore();

const task = (userId, overrides = {}) => ({
  userId,
  title: "Preventivo Rossi Imballaggi",
  description: null,
  status: "in_progress",
  priority: "high",
  tags: ["cliente"],
  dueDate: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const step = (userId, taskId, overrides = {}) => ({
  userId,
  taskId,
  parentStepId: null,
  title: "Raccogliere costi materiali",
  description: null,
  status: "todo",
  order: 1,
  dueDate: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const workLog = (userId, taskId, overrides = {}) => ({
  userId,
  taskId,
  stepId: null,
  message: "Chiuse le quotazioni cartone.",
  tags: ["cliente"],
  type: "note",
  timestamp: NOW,
  durationMinutes: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

/**
 * Reset to a known two-account fixture, with rules bypassed so setup can never be mistaken for a
 * rules pass. Called before every group: when the rules are broken the ATTACCHI group MUTATES this
 * data (that is the whole point of an attack succeeding), and a later group inheriting a hijacked
 * document would report cascading failures that say nothing about the group under test.
 */
const seed = async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "tasks", "taskA"), task("alice"));
    await setDoc(doc(db, "steps", "stepA"), step("alice", "taskA"));
    await setDoc(
      doc(db, "steps", "stepA-child"),
      step("alice", "taskA", { parentStepId: "stepA", title: "Sottopasso", order: 1 }),
    );
    await setDoc(doc(db, "workLogs", "logA"), workLog("alice", "taskA"));
    await setDoc(doc(db, "workLogs", "logA-step"), workLog("alice", "taskA", { stepId: "stepA" }));
    await setDoc(doc(db, "tasks", "taskB"), task("bob", { title: "Task di Bob" }));
  });
};

const results = [];
let failures = 0;

const check = async (group, name, run) => {
  try {
    await run();
    results.push({ group, name, ok: true });
  } catch (error) {
    failures += 1;
    results.push({ group, name, ok: false, detail: error.message });
  }
};

// ── 1. ATTACCHI ────────────────────────────────────────────────────────────────
const ATTACK = "ATTACCHI";
await seed();

await check(ATTACK, "bob non legge il task di alice", () =>
  assertFails(getDoc(doc(bob, "tasks", "taskA"))));

await check(ATTACK, "bob NON dirotta il task di alice riscrivendo userId (regressione)", () =>
  assertFails(updateDoc(doc(bob, "tasks", "taskA"), { userId: "bob", updatedAt: NOW })));

await check(ATTACK, "bob non modifica il task di alice lasciando userId invariato", () =>
  assertFails(updateDoc(doc(bob, "tasks", "taskA"), { title: "compromesso" })));

await check(ATTACK, "bob non elimina il task di alice", () =>
  assertFails(deleteDoc(doc(bob, "tasks", "taskA"))));

await check(ATTACK, "bob NON dirotta lo step di alice", () =>
  assertFails(updateDoc(doc(bob, "steps", "stepA"), { userId: "bob", updatedAt: NOW })));

await check(ATTACK, "bob NON dirotta il work log di alice", () =>
  assertFails(updateDoc(doc(bob, "workLogs", "logA"), { userId: "bob", updatedAt: NOW })));

await check(ATTACK, "bob non inietta uno step nel task di alice", () =>
  assertFails(addDoc(collection(bob, "steps"), step("bob", "taskA"))));

await check(ATTACK, "bob non inietta un work log nel task di alice", () =>
  assertFails(addDoc(collection(bob, "workLogs"), workLog("bob", "taskA"))));

await check(ATTACK, "bob non legge gli step di alice", () =>
  assertFails(getDocs(query(collection(bob, "steps"), where("taskId", "==", "taskA")))));

await check(ATTACK, "alice non cede il proprio task a bob", () =>
  assertFails(updateDoc(doc(alice, "tasks", "taskA"), { userId: "bob", updatedAt: NOW })));

await check(ATTACK, "alice non sposta il proprio step su un altro task", () =>
  assertFails(updateDoc(doc(alice, "steps", "stepA"), { taskId: "taskB", updatedAt: NOW })));

await check(ATTACK, "un utente non autenticato non legge nulla", () =>
  assertFails(getDoc(doc(anon, "tasks", "taskA"))));

// ── 2. FLUSSI APP ──────────────────────────────────────────────────────────────
// Each of these mirrors a real call site in src/hooks/useTaskStore.ts.
const APP = "FLUSSI APP";
await seed();

await check(APP, "alice legge il proprio task", () =>
  assertSucceeds(getDoc(doc(alice, "tasks", "taskA"))));

await check(APP, "createTask", () =>
  assertSucceeds(addDoc(collection(alice, "tasks"), task("alice", { title: "Nuovo task" }))));

await check(APP, "updateTask", () =>
  assertSucceeds(updateDoc(doc(alice, "tasks", "taskA"), { title: "Titolo aggiornato", updatedAt: NOW })));

await check(APP, "createStep", () =>
  assertSucceeds(addDoc(collection(alice, "steps"), step("alice", "taskA", { order: 2 }))));

await check(APP, "createStep annidato", () =>
  assertSucceeds(
    addDoc(collection(alice, "steps"), step("alice", "taskA", { parentStepId: "stepA", order: 2 })),
  ));

await check(APP, "updateStep (auto-complete degli antenati)", () =>
  assertSucceeds(updateDoc(doc(alice, "steps", "stepA"), { status: "done", updatedAt: NOW })));

await check(APP, "updateStepOrders (writeBatch)", () => {
  const batch = writeBatch(alice);
  batch.update(doc(alice, "steps", "stepA"), { order: 3, updatedAt: NOW });
  batch.update(doc(alice, "steps", "stepA-child"), { order: 1, updatedAt: NOW });
  return assertSucceeds(batch.commit());
});

await check(APP, "createWorkLog dallo stop del timer (con durationMinutes)", () =>
  assertSucceeds(
    addDoc(
      collection(alice, "workLogs"),
      workLog("alice", "taskA", { type: "stop", durationMinutes: 45, stepId: "stepA" }),
    ),
  ));

await check(APP, "updateWorkLog", () =>
  assertSucceeds(updateDoc(doc(alice, "workLogs", "logA"), { message: "nota rivista", updatedAt: NOW })));

// The cascade-delete queries below carry NO userId clause. They are the reason the rules keep the
// "reachable through the owning task or parent step" branches on read/delete.
await check(APP, "query snapshot: tasks where userId", () =>
  assertSucceeds(getDocs(query(collection(alice, "tasks"), where("userId", "==", "alice")))));

await check(APP, "cascade: steps where parentStepId (senza filtro userId)", () =>
  assertSucceeds(getDocs(query(collection(alice, "steps"), where("parentStepId", "==", "stepA")))));

await check(APP, "cascade: workLogs where taskId (senza filtro userId)", () =>
  assertSucceeds(getDocs(query(collection(alice, "workLogs"), where("taskId", "==", "taskA")))));

await check(APP, "cascade: workLogs where stepId (senza filtro userId)", () =>
  assertSucceeds(getDocs(query(collection(alice, "workLogs"), where("stepId", "==", "stepA")))));

await check(APP, "deleteWorkLog / deleteStep / deleteTask", async () => {
  await assertSucceeds(deleteDoc(doc(alice, "workLogs", "logA-step")));
  await assertSucceeds(deleteDoc(doc(alice, "steps", "stepA-child")));
  await assertSucceeds(deleteDoc(doc(alice, "tasks", "taskA")));
});

// ── 3. VALIDAZIONE ─────────────────────────────────────────────────────────────
const VALID = "VALIDAZIONE";
await seed();

await check(VALID, "status fuori enum rifiutato", () =>
  assertFails(addDoc(collection(alice, "tasks"), task("alice", { status: "qualsiasi" }))));

await check(VALID, "titolo vuoto rifiutato", () =>
  assertFails(addDoc(collection(alice, "tasks"), task("alice", { title: "" }))));

await check(VALID, "titolo oltre il limite rifiutato", () =>
  assertFails(addDoc(collection(alice, "tasks"), task("alice", { title: "x".repeat(501) }))));

await check(VALID, "priority fuori enum rifiutata", () =>
  assertFails(addDoc(collection(alice, "tasks"), task("alice", { priority: "urgentissima" }))));

await check(VALID, "tipo di work log fuori enum rifiutato", () =>
  assertFails(addDoc(collection(alice, "workLogs"), workLog("alice", "taskB", { type: "boh" }))));

await check(VALID, "step con order non numerico rifiutato", () =>
  assertFails(addDoc(collection(alice, "steps"), step("alice", "taskB", { order: "primo" }))));

// ── Report ─────────────────────────────────────────────────────────────────────
await testEnv.cleanup();

let currentGroup = "";
for (const result of results) {
  if (result.group !== currentGroup) {
    currentGroup = result.group;
    console.log(`\n  ${currentGroup}`);
  }
  console.log(`   ${result.ok ? "PASS" : "FAIL"}  ${result.name}`);
  if (!result.ok) console.log(`         ${result.detail}`);
}

console.log(`\n  ${results.length - failures}/${results.length} verifiche superate\n`);
process.exit(failures > 0 ? 1 : 0);
