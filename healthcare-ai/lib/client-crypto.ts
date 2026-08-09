"use client";

// Client-side encryption for journal notes (ClearSignal build spec, section 8).
// The AES-GCM key is generated on first use and stored ONLY in this browser's
// localStorage — it is never sent to the server, so Parse/Back4App only ever
// stores ciphertext for the `notes` field.
//
// KNOWN LIMITATION, stated plainly rather than hidden: because the key never
// leaves the browser, there is no server-side recovery path. Clearing browser
// storage, switching browsers, or switching devices without exporting the key
// makes every previously-encrypted note permanently unreadable — the ciphertext
// is still there, but nothing can decrypt it. This is the real tradeoff of
// "the server can never read this," not a bug to be fixed later. See
// docs/privacy.md for how this interacts with server-side retrieval query
// construction (the query is built from plaintext on the client before
// anything is encrypted, so retrieval never needs to decrypt stored notes).
const STORAGE_KEY = "healthai_journal_key_v1";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getOrCreateKey(): Promise<CryptoKey> {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) {
    const raw = base64ToBytes(existing);
    return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", true, ["encrypt", "decrypt"]);
  }
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const raw = await crypto.subtle.exportKey("raw", key);
  localStorage.setItem(STORAGE_KEY, bytesToBase64(new Uint8Array(raw)));
  return key;
}

// Returns "ivBase64:ciphertextBase64", or "" for empty input (nothing to hide).
export async function encryptText(plaintext: string): Promise<string> {
  if (!plaintext) return "";
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return `${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptText(stored: string): Promise<string> {
  if (!stored) return "";
  const [ivB64, ctB64] = stored.split(":");
  if (!ivB64 || !ctB64) return stored; // not our format (e.g. legacy plaintext) — show as-is rather than hide it
  try {
    const key = await getOrCreateKey();
    const iv = base64ToBytes(ivB64);
    const ciphertext = base64ToBytes(ctB64);
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ciphertext as BufferSource);
    return new TextDecoder().decode(plainBuf);
  } catch {
    return "[Unable to decrypt — this browser's encryption key doesn't match what this note was saved with.]";
  }
}
