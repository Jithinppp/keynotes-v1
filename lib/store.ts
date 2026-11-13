import { get, push, ref, remove, set, update } from "firebase/database";
import { firebaseDatabase } from "./firebase";

export type Workspace = { id: string; name: string; created_at: string };
export type Note = { id: string; title: string; content: string; updated_at: string };

const now = () => new Date().toISOString();

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

export async function updateNote(
  uid: string,
  workspaceId: string,
  noteId: string,
  patch: { title: string; content: string },
) {
  await update(noteRef(uid, workspaceId, noteId), {
    ...patch,
    updated_at: now(),
  });
}

export async function deleteNote(uid: string, workspaceId: string, noteId: string) {
  await remove(noteRef(uid, workspaceId, noteId));
}
