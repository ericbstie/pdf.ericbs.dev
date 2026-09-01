import { afterEach, expect, test } from "bun:test";
import type { Command } from "../../lib/edits";
import { forgetSession, keepEdits, keepFile, loadSession } from "./session";

type Fire = (() => void) | null;

/** How this browser answers a write: it keeps it, or succeeds the request and gives up at commit. */
type Behaviour = "keeps" | "gives up at commit";

/** A request answers a turn later, as IndexedDB's do, so the caller has time to listen for it. */
function fakeRequest(result: unknown): IDBRequest {
  const request = { result, error: null, onsuccess: null as Fire, onerror: null as Fire, onupgradeneeded: null as Fire };
  queueMicrotask(() => request.onsuccess?.());
  return request as unknown as IDBRequest;
}

/**
 * Enough IndexedDB to ask one question of it: what a store does when every request succeeds and
 * the transaction then gives up. Writes are held until the commit, which is where the real thing
 * puts them too — a transaction that aborts leaves nothing behind.
 */
function fakeIndexedDB(behaviour: Behaviour): { factory: IDBFactory; kept: Map<string, unknown> } {
  const kept = new Map<string, unknown>();
  const openTransaction = (mode: IDBTransactionMode) => {
    const pending: Array<() => void> = [];
    const store = {
      put: (value: unknown, key: string) => {
        pending.push(() => kept.set(key, value));
        return fakeRequest(undefined);
      },
      get: (key: string) => fakeRequest(kept.get(key)),
      delete: (key: string) => {
        pending.push(() => kept.delete(key));
        return fakeRequest(undefined);
      },
    };
    const transaction = {
      error: null,
      oncomplete: null as Fire,
      onabort: null as Fire,
      onerror: null as Fire,
      objectStore: () => store as unknown as IDBObjectStore,
    };
    setTimeout(() => {
      if (mode === "readwrite" && behaviour === "gives up at commit") return transaction.onabort?.();
      pending.forEach(write => write());
      transaction.oncomplete?.();
    }, 0);
    return transaction as unknown as IDBTransaction;
  };
  const database = {
    transaction: (_store: string, mode: IDBTransactionMode) => openTransaction(mode),
    close: () => {},
  };
  return { factory: { open: () => fakeRequest(database) } as unknown as IDBFactory, kept };
}

const file = { id: "one", name: "form.pdf", bytes: new Uint8Array([37, 80, 68, 70]) };
const drawn: Command = { kind: "draw", stroke: { id: "line", page: 1, points: [{ x: 1, y: 2 }], width: 2 } };

const realIndexedDB = globalThis.indexedDB;

function browserThat(behaviour: Behaviour): Map<string, unknown> {
  const fake = fakeIndexedDB(behaviour);
  globalThis.indexedDB = fake.factory;
  return fake.kept;
}

afterEach(() => {
  globalThis.indexedDB = realIndexedDB;
});

test("a file the browser keeps is reported as kept, and comes back", async () => {
  browserThat("keeps");
  expect(await keepFile(file)).toBe(true);
  expect(await loadSession()).toEqual({ file, commands: [], saved: false });
});

test("a file the browser gives up on at commit is reported as not kept", async () => {
  browserThat("gives up at commit");
  expect(await keepFile(file)).toBe(false);
});

test("a write given up on at commit leaves nothing behind to come back", async () => {
  const kept = browserThat("gives up at commit");
  await keepFile(file);
  expect(kept.size).toBe(0);
  expect(await loadSession()).toBeNull();
});

test("edits are kept beside the file they were made on", async () => {
  browserThat("keeps");
  expect(await keepFile(file)).toBe(true);
  expect(await keepEdits(file.id, [drawn], false)).toBe(true);
  expect(await loadSession()).toEqual({ file, commands: [drawn], saved: false });
});

test("edits the browser gives up on at commit are reported as not kept", async () => {
  browserThat("gives up at commit");
  expect(await keepEdits(file.id, [drawn], false)).toBe(false);
});

test("forgetting takes back the file and its edits together", async () => {
  const kept = browserThat("keeps");
  await keepFile(file);
  await keepEdits(file.id, [drawn], true);
  expect(await forgetSession()).toBe(true);
  expect(kept.size).toBe(0);
  expect(await loadSession()).toBeNull();
});

test("a forgetting the browser gives up on at commit is reported as not done", async () => {
  browserThat("gives up at commit");
  expect(await forgetSession()).toBe(false);
});
