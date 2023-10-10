import { file, write } from "bun";
import { mkdir } from "node:fs/promises";
import Log from "./log";

let hashTable: {
  [file: string]: string
} | undefined = undefined;

export async function generateHash(fromFile: string): Promise<string | undefined> {
  Log.debug(`Fetching hash for ${fromFile}`);
  const fileToHash = await file(fromFile);

  if (!await fileToHash.exists()) {
    Log.debug(`File ${file} does not exist.`);
    return undefined;
  }

  const fileArrayBuffer = await fileToHash.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', fileArrayBuffer);
  const hashBytes = Array.from(new Uint8Array(digest));
  const hashHex = hashBytes.map(b => b.toString(16).padStart(2, '0')).join('');

  Log.debug(`${fromFile}: ${hashHex}`);
  return hashHex;
}

export async function checkHash(forFile: string, save: boolean = false): Promise<boolean> {
  const hashFolder = file('./.bunative');
  const hashTableFile = file('./.bunative/hash');

  // Ensure the hashtable file exists
  if (!hashTable && !(await hashTableFile.exists())) {
    Log.debug(`Could not find hash cache - creating.`);
    await mkdir('./.bunative', {
      recursive: true
    }); 
    hashTable = {};
    await write(hashTableFile, JSON.stringify('{}'));
  }

  // Load the hash table
  if (!hashTable) {
    Log.debug(`Loading hash table from cache.`);
    hashTable = { ...await hashTableFile.json() };
  } else {
    Log.debug(`Loading hash table from memory.`);
  }

  Log.debug('Hash Table:', JSON.stringify(hashTable, null, 2));
  const hash = await generateHash(forFile);

  if (!hash) {
    Log.debug(`Failed to load hash for ${forFile}`);
    return false;
  }

  if (hashTable[forFile] === hash) {
    return true;
  } else {
    if (save) {
      hashTable[forFile] = hash;
      write(hashTableFile, JSON.stringify(hashTable));
    }
  }
  return false;
}