"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signOut as firebaseSignOut } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase";
import MarkdownEditor from "@/components/markdown-editor";
import {
  createNote as createNoteRecord,
  createWorkspace as createWorkspaceRecord,
  deleteNote as deleteNoteRecord,
  deleteWorkspace as deleteWorkspaceRecord,
  listNotes,
  listWorkspaces,
  updateNote,
  type Note,
  type Workspace,
} from "@/lib/store";

type DeleteTarget = { kind: "workspace" | "note"; id: string; name: string };

function excerpt(content: string) {
  return content
    .replace(/^#{1,6}\s+/gm, "") // headings
    .replace(/^>\s?/gm, "") // blockquotes
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s*/gm, "") // task list markers
    .replace(/^\s*[-*+]\s+/gm, "") // bullets
    .replace(/^\s*\d+\.\s+/gm, "") // numbered lists
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links -> text
    .replace(/[*_`~]/g, "") // emphasis/code marks
    .replace(/\s+/g, " ")
    .trim();
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr`;
  const day = Math.floor(hr / 24);
  return day === 1 ? "1 day" : `${day} days`;
}

function WorkspaceIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <rect x="2.5" y="4.5" width="15" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M2.5 8.5h15" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-card ${className ?? ""}`} />;
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/25 px-6 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm rounded-3xl bg-surface p-7 shadow-[0_30px_70px_-25px_rgba(0,0,0,0.4)]"
      >
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export default function NotesApp({
  user,
}: {
  user: { id: string; name?: string | null; email: string };
}) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [saving, setSaving] = useState(false);
  const [, forceTick] = useState(0);

  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [loadingNotes, setLoadingNotes] = useState(false);

  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [busy, setBusy] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeNoteRef = useRef<Note | null>(null);
  activeNoteRef.current = activeNote;

  // Keep relative timestamps fresh.
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  // Drop a pending save on unmount so it can't fire after sign-out.
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const loadWorkspaces = useCallback(async () => {
    try {
      const data = await listWorkspaces(user.id);
      setWorkspaces(data);
      setActiveWorkspace((current) =>
        current && data.some((w) => w.id === current)
          ? current
          : (data[0]?.id ?? null),
      );
    } finally {
      setLoadingWorkspaces(false);
    }
  }, [user.id]);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    if (!activeWorkspace) {
      setNotes([]);
      setActiveNote(null);
      return;
    }
    setLoadingNotes(true);
    void (async () => {
      try {
        const data = await listNotes(user.id, activeWorkspace);
        setNotes(data);
        setActiveNote(data[0] ?? null);
      } finally {
        setLoadingNotes(false);
      }
    })();
  }, [activeWorkspace, user.id]);

  function openNewWorkspace() {
    setWorkspaceName("");
    setNewWorkspaceOpen(true);
  }

  async function createWorkspace(name: string) {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const workspace = await createWorkspaceRecord(user.id, trimmed);
      setWorkspaces((ws) => [...ws, workspace]);
      setActiveWorkspace(workspace.id);
      setNewWorkspaceOpen(false);
      setWorkspaceName("");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || busy) return;
    setBusy(true);
    try {
      if (deleteTarget.kind === "workspace") {
        await deleteWorkspaceRecord(user.id, deleteTarget.id);
        setWorkspaces((ws) => ws.filter((w) => w.id !== deleteTarget.id));
        setActiveWorkspace((current) =>
          current === deleteTarget.id ? null : current,
        );
      } else if (activeWorkspace) {
        await deleteNoteRecord(user.id, activeWorkspace, deleteTarget.id);
        setNotes((ns) => ns.filter((n) => n.id !== deleteTarget.id));
        setActiveNote((current) =>
          current?.id === deleteTarget.id ? null : current,
        );
      }
      setDeleteTarget(null);
    } finally {
      setBusy(false);
    }
  }

  async function createNote() {
    if (!activeWorkspace) return;
    const note = await createNoteRecord(user.id, activeWorkspace);
    setNotes((ns) => [note, ...ns]);
    setActiveNote(note);
  }

  function queueSave(patch: { title?: string; content?: string }) {
    const previous = activeNoteRef.current;
    // Capture the workspace now: the debounced save may fire after a switch.
    const workspaceId = activeWorkspace;
    if (!previous || !workspaceId) return;
    const optimistic: Note = { ...previous, ...patch };
    // Keep the ref in sync immediately so a second rapid edit builds on this
    // value instead of the stale render closure.
    activeNoteRef.current = optimistic;
    setActiveNote(optimistic);
    setNotes((ns) => ns.map((n) => (n.id === optimistic.id ? optimistic : n)));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      await updateNote(user.id, workspaceId, optimistic.id, {
        title: optimistic.title,
        content: optimistic.content,
      });
      setSaving(false);
    }, 600);
  }

  async function signOut() {
    // app/page.tsx redirects to sign-in as soon as Firebase clears the session.
    await firebaseSignOut(firebaseAuth()).catch(() => {});
  }

  const activeWorkspaceName = workspaces.find((w) => w.id === activeWorkspace)?.name;
  const listLoading = loadingWorkspaces || loadingNotes;

  return (
    <div className="flex min-h-screen flex-1 bg-background text-foreground">
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col bg-surface px-4 py-6">
        <div className="flex items-center gap-3 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-card-active">
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-white" aria-hidden>
              <path
                d="M10 3.5c2.5 0 4.5 1.8 4.5 4.2 0 1.7-.9 2.9-2.1 3.9l-2.4 1.9-2.4-1.9C6.4 10.6 5.5 9.4 5.5 7.7 5.5 5.3 7.5 3.5 10 3.5Z"
                fill="currentColor"
              />
              <path d="M10 13v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <span className="text-lg font-bold tracking-tight">Keynotes</span>
        </div>

        <p className="mt-10 px-2 text-[11px] font-bold tracking-[0.2em] text-muted">
          WORKSPACE
        </p>
        <nav className="mt-2 flex flex-col gap-0.5">
          {loadingWorkspaces &&
            [0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <Skeleton className="h-[18px] w-[18px] rounded-md" />
                <Skeleton className={`h-4 ${i === 1 ? "w-24" : "w-32"}`} />
              </div>
            ))}
          {!loadingWorkspaces &&
            workspaces.map((w) => (
              <div key={w.id} className="group relative">
                <button
                  onClick={() => setActiveWorkspace(w.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] transition-colors ${
                    w.id === activeWorkspace
                      ? "font-semibold"
                      : "text-foreground/70 hover:bg-card"
                  }`}
                >
                  <WorkspaceIcon
                    className={`h-[18px] w-[18px] shrink-0 ${
                      w.id === activeWorkspace ? "text-card-active" : "text-muted"
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate">{w.name}</span>
                </button>
                <button
                  onClick={() =>
                    setDeleteTarget({ kind: "workspace", id: w.id, name: w.name })
                  }
                  title="Delete workspace"
                  className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-md px-1.5 py-1 text-xs text-muted hover:text-red-500 focus:block group-hover:block"
                >
                  ✕
                </button>
              </div>
            ))}
          {!loadingWorkspaces && workspaces.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted">No workspaces yet.</p>
          )}
        </nav>

        <div className="mt-auto">
          <button
            onClick={openNewWorkspace}
            className="flex items-center gap-3 rounded-xl px-2 py-2 text-[15px] font-semibold hover:bg-card"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-white">
              +
            </span>
            New Workspace
          </button>
          <div className="mt-4 border-t border-[#eceadf] px-2 pt-4">
            <p className="truncate text-sm font-semibold">
              {user.name || user.email}
            </p>
            <button
              onClick={signOut}
              className="mt-0.5 text-xs text-muted hover:text-foreground"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Note list */}
      <section className="flex w-[22rem] shrink-0 flex-col overflow-hidden">
        <h1 className="px-8 pb-6 pt-10 text-3xl font-bold tracking-tight">
          {loadingWorkspaces ? <Skeleton className="h-8 w-36" /> : (activeWorkspaceName ?? "Notes")}
        </h1>
        <div className="flex-1 space-y-3 overflow-y-auto px-6 pb-10">
          {listLoading &&
            [0, 1, 2].map((i) => (
              <div key={i} className="rounded-2xl bg-card px-5 py-4">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="mt-2.5 h-3 w-full" />
                <Skeleton className="mt-1.5 h-3 w-4/5" />
                <Skeleton className="mt-3 h-3 w-12" />
              </div>
            ))}
          {!listLoading &&
            notes.map((n) => {
              const active = n.id === activeNote?.id;
              return (
                <button
                  key={n.id}
                  onClick={() => {
                    setActiveNote(n);
                  }}
                  className={`group relative block w-full rounded-2xl px-5 py-4 text-left transition-all ${
                    active
                      ? "bg-card-active text-white shadow-[0_10px_25px_-10px_rgba(240,166,60,0.7)]"
                      : "bg-card hover:bg-[#efeade]"
                  }`}
                >
                  <p className="truncate pr-6 font-semibold">{n.title || "Untitled"}</p>
                  <p
                    className={`mt-1.5 line-clamp-2 text-sm leading-snug ${
                      active ? "text-white/85" : "text-muted"
                    }`}
                  >
                    {excerpt(n.content) || "Empty note"}
                  </p>
                  <div className="mt-2.5 flex items-center justify-between">
                    <span
                      className={`text-xs ${active ? "text-white/75" : "text-muted"}`}
                    >
                      {relativeTime(n.updated_at)}
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget({
                          kind: "note",
                          id: n.id,
                          name: n.title || "Untitled",
                        });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.stopPropagation();
                          setDeleteTarget({
                            kind: "note",
                            id: n.id,
                            name: n.title || "Untitled",
                          });
                        }
                      }}
                      title="Delete note"
                      className={`hidden text-xs focus:block group-hover:block ${
                        active ? "text-white/80 hover:text-white" : "text-muted hover:text-red-500"
                      }`}
                    >
                      ✕
                    </span>
                  </div>
                </button>
              );
            })}
          {!listLoading && activeWorkspace && notes.length === 0 && (
            <p className="px-4 py-6 text-sm text-muted">No notes yet.</p>
          )}
        </div>
      </section>

      {/* Editor */}
      <main className="relative flex flex-1 flex-col overflow-hidden">
        {listLoading ? (
          <>
            <div className="flex items-center justify-between px-10 pt-8">
              <Skeleton className="h-8 w-36 rounded-full" />
              <Skeleton className="h-3 w-14" />
            </div>
            <div className="px-10">
              <Skeleton className="mt-6 h-10 w-2/3" />
              <Skeleton className="mt-8 h-4 w-full" />
              <Skeleton className="mt-3 h-4 w-11/12" />
              <Skeleton className="mt-3 h-4 w-3/4" />
              <Skeleton className="mt-8 h-4 w-1/2" />
              <Skeleton className="mt-3 h-4 w-10/12" />
              <Skeleton className="mt-3 h-4 w-2/3" />
            </div>
          </>
        ) : activeNote ? (
          <>
            <div className="flex items-center justify-end px-10 pt-8">
              <span className="text-xs text-muted">{saving ? "Saving…" : "Saved"}</span>
            </div>

            <input
              value={activeNote.title}
              onChange={(e) => queueSave({ title: e.target.value })}
              placeholder="Untitled"
              className="mt-4 bg-transparent px-10 text-4xl font-bold tracking-tight outline-none placeholder:text-muted/50"
            />

            <MarkdownEditor
              key={activeNote.id}
              initialContent={activeNote.content}
              onChange={(content) => queueSave({ content })}
            />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-card-active text-2xl text-white">
              +
            </span>
            <p className="text-sm text-muted">
              {activeWorkspace
                ? "Create a note to start writing."
                : "Create a workspace to get started."}
            </p>
          </div>
        )}

        {activeWorkspace && !listLoading && (
          <button
            onClick={createNote}
            title="New note"
            className="absolute bottom-8 right-10 flex h-14 w-14 items-center justify-center rounded-full bg-card-active text-2xl text-white shadow-[0_12px_28px_-8px_rgba(240,166,60,0.8)] transition-transform hover:scale-105"
          >
            +
          </button>
        )}
      </main>

      {/* New workspace modal */}
      {newWorkspaceOpen && (
        <Modal title="New workspace" onClose={() => setNewWorkspaceOpen(false)}>
          <p className="mt-1 text-sm text-muted">
            A workspace is a folder for related notes.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void createWorkspace(workspaceName);
            }}
          >
            <input
              autoFocus
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="Workspace name"
              className="mt-5 h-12 w-full rounded-xl bg-card px-4 text-[15px] outline-none placeholder:text-muted focus:ring-2 focus:ring-card-active/50"
            />
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewWorkspaceOpen(false)}
                className="h-11 rounded-xl px-4 text-sm font-semibold text-muted hover:bg-card"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!workspaceName.trim() || busy}
                className="h-11 rounded-xl bg-card-active px-5 text-sm font-bold text-white shadow-[0_10px_20px_-10px_rgba(240,166,60,0.8)] disabled:opacity-40"
              >
                Create
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <Modal
          title={deleteTarget.kind === "workspace" ? "Delete workspace?" : "Delete note?"}
          onClose={() => setDeleteTarget(null)}
        >
          <p className="mt-2 text-sm leading-6 text-muted">
            {deleteTarget.kind === "workspace" ? (
              <>
                <span className="font-semibold text-foreground">
                  {deleteTarget.name}
                </span>{" "}
                and all of its notes will be permanently deleted.
              </>
            ) : (
              <>
                <span className="font-semibold text-foreground">
                  {deleteTarget.name}
                </span>{" "}
                will be permanently deleted.
              </>
            )}
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button
              onClick={() => setDeleteTarget(null)}
              className="h-11 rounded-xl px-4 text-sm font-semibold text-muted hover:bg-card"
            >
              Cancel
            </button>
            <button
              onClick={() => void confirmDelete()}
              disabled={busy}
              className="h-11 rounded-xl bg-[#e05a4d] px-5 text-sm font-bold text-white shadow-[0_10px_20px_-10px_rgba(224,90,77,0.8)] disabled:opacity-40"
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
