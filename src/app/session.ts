import { type Command, newId } from "../lib/edits";

/** The file an editing session started from. Its id ties the edits below to this exact opening. */
export type KeptFile = { id: string; name: string; bytes: Uint8Array };

/** `saved` records whether these edits have already gone to disk as a PDF. */
export type Session = { file: KeptFile; commands: Command[]; saved: boolean };

type KeptEdits = { id: string; commands: Command[]; saved: boolean };

/** Edits kept before a writing carried an id: give each one, so it can be taken hold of again. */
function named(commands: readonly Command[]): Command[] {
  return commands.map(command =>
    command.kind === "write" && !command.writing.id
      ? { ...command, writing: { ...command.writing, id: newId() } }
      : command,
  );
}

const DATABASE = "pdf.ericbs.dev";
const STORE = "session";
const FILE_KEY = "file";
const EDITS_KEY = "edits";

/** IndexedDB predates promises, and this is the whole of the adaptation. */
function settled<Result>(request: IDBRequest<Result>): Promise<Result> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open(DATABASE, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE);
  return settled(request);
}

/**
 * Waits for the whole transaction rather than the requests inside it. A request can succeed and
 * the transaction still give up at commit — which is how a browser out of room answers a large
 * write — so this, not the request, is what says the writing landed. Asked for only once the
 * requests have been answered, and awaited straight away, so an abort is nobody's to miss.
 */
function committed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("The write was given up on."));
    transaction.onerror = () => reject(transaction.error ?? new Error("The write was refused."));
  });
}

/**
 * Runs one transaction and hands the connection back. Every request has to be made before the
 * first await: a transaction closes itself as soon as the queue drains, and an await drains it.
 */
async function inStore<Result>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => Promise<Result>,
): Promise<Result> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE, mode);
    const result = await work(transaction.objectStore(STORE));
    await committed(transaction);
    return result;
  } finally {
    database.close();
  }
}

/** What the last visit left behind. Nothing kept and storage refused look alike: there is nothing to put back. */
export async function loadSession(): Promise<Session | null> {
  try {
    return await inStore("readonly", async store => {
      const wanted = [settled<KeptFile | undefined>(store.get(FILE_KEY)), settled<KeptEdits | undefined>(store.get(EDITS_KEY))] as const;
      const [file, edits] = await Promise.all(wanted);
      if (!file) return null;
      const mine = edits?.id === file.id ? edits : null;
      return { file, commands: named(mine?.commands ?? []), saved: mine?.saved ?? false };
    });
  } catch {
    return null;
  }
}

/** Reports whether the file could be kept: a browser may refuse the room, and then a reload loses the work. */
export async function keepFile(file: KeptFile): Promise<boolean> {
  return kept("readwrite", store => store.put(file, FILE_KEY));
}

export async function keepEdits(id: string, commands: readonly Command[], saved: boolean): Promise<boolean> {
  return kept("readwrite", store => store.put({ id, commands: [...commands], saved }, EDITS_KEY));
}

/** Puts the editor back to holding nothing, on disk as well as on screen. */
export async function forgetSession(): Promise<boolean> {
  return kept("readwrite", store => {
    store.delete(FILE_KEY);
    return store.delete(EDITS_KEY);
  });
}

async function kept(mode: IDBTransactionMode, write: (store: IDBObjectStore) => IDBRequest): Promise<boolean> {
  try {
    await inStore(mode, store => settled(write(store)));
    return true;
  } catch {
    return false;
  }
}
