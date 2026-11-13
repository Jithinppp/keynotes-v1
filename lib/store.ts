import { get, push, ref, remove, set, update } from "firebase/database";
import { firebaseDatabase } from "./firebase";

export type Workspace = { id: string; name: string; created_at: string };
export type Note = { id: string; title: string; content: string; updated_at: string };

// A note's share secret lives in the owner's private index; the public mirror is
// only ever read through the exact token, so it can never be listed.
export type ShareRecord = { token: string; createdAt: string };
export type PublicShare = {
  ownerId: string;
  workspaceId: string;
  noteId: string;
  title: string;
  content: string;
  updated_at: string;
};

const now = () => new Date().toISOString();

// 24 random bytes is far beyond guessable and fits in a URL as base64url.
function shareToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const workspacesRef = (uid: string) =>
  ref(firebaseDatabase(), `users/${uid}/workspaces`);
const workspaceRef = (uid: string, workspaceId: string) =>
  ref(firebaseDatabase(), `users/${uid}/workspaces/${workspaceId}`);
const notesRef = (uid: string, workspaceId: string) =>
  ref(firebaseDatabase(), `users/${uid}/workspaces/${workspaceId}/notes`);
const noteRef = (uid: string, workspaceId: string, noteId: string) =>
  ref(firebaseDatabase(), `users/${uid}/workspaces/${workspaceId}/notes/${noteId}`);

export async function listWorkspaces(uid: string): Promise<Workspace[]> {
  const snap = await get(workspacesRef(uid));
  const value = (snap.val() ?? {}) as Record<string, { name: string; created_at: string }>;
  return Object.entries(value)
    .map(([id, w]) => ({ id, name: w.name, created_at: w.created_at }))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function createWorkspace(uid: string, name: string): Promise<Workspace> {
  const created_at = now();
  const node = push(workspacesRef(uid));
  await set(node, { name, created_at });
  return { id: node.key!, name, created_at };
}

// Removing the workspace node removes its notes subtree with it.
export async function deleteWorkspace(uid: string, workspaceId: string) {
  await remove(workspaceRef(uid, workspaceId));
}

export async function listNotes(uid: string, workspaceId: string): Promise<Note[]> {
  const snap = await get(notesRef(uid, workspaceId));
  const value = (snap.val() ?? {}) as Record<
    string,
    { title: string; content: string; updated_at: string }
  >;
  return Object.entries(value)
    .map(([id, n]) => ({ id, ...n }))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function createNote(uid: string, workspaceId: string): Promise<Note> {
  const note = { title: "Untitled", content: "", updated_at: now() };
  const node = push(notesRef(uid, workspaceId));
  await set(node, note);
  return { id: node.key!, ...note };
}

// Creating a link writes the private index and the public mirror in one
// multi-location update so the owner never sees a half-shared note.
export async function createShare(uid: string, workspaceId: string, note: Note): Promise<string> {
  const token = shareToken();
  const createdAt = now();
  await update(ref(firebaseDatabase()), {
    [`users/${uid}/shares/${note.id}`]: { token, createdAt },
    [`publicShares/${token}`]: {
      ownerId: uid,
      workspaceId,
      noteId: note.id,
      title: note.title,
      content: note.content,
      updated_at: note.updated_at,
    },
  });
  return token;
}

// The token is only in the private index, so read it before removing both.
export async function deleteShare(uid: string, noteId: string): Promise<void> {
  const snap = await get(ref(firebaseDatabase(), `users/${uid}/shares/${noteId}`));
  const token = (snap.val() as ShareRecord | null)?.token;
  const updates: Record<string, null> = {
    [`users/${uid}/shares/${noteId}`]: null,
  };
  if (token) updates[`publicShares/${token}`] = null;
  await update(ref(firebaseDatabase()), updates);
}

export async function listShares(uid: string): Promise<Record<string, ShareRecord>> {
  const snap = await get(ref(firebaseDatabase(), `users/${uid}/shares`));
  return (snap.val() ?? {}) as Record<string, ShareRecord>;
}

export async function updateNote(
  uid: string,
  workspaceId: string,
  noteId: string,
  patch: { title: string; content: string },
  share?: ShareRecord | null,
) {
  const updated_at = now();
  if (!share) {
    await update(noteRef(uid, workspaceId, noteId), {
      ...patch,
      updated_at,
    });
    return;
  }
  await update(ref(firebaseDatabase()), {
    [`users/${uid}/workspaces/${workspaceId}/notes/${noteId}`]: {
      ...patch,
      updated_at,
    },
    // Rebuilt from the caller's arguments so autosave needs no extra read.
    [`publicShares/${share.token}`]: {
      ownerId: uid,
      workspaceId,
      noteId,
      ...patch,
      updated_at,
    },
  });
}

export async function deleteNote(uid: string, workspaceId: string, noteId: string) {
  await remove(noteRef(uid, workspaceId, noteId));
}
