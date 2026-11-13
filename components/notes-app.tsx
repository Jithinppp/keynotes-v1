"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signOut as firebaseSignOut } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase";
import MarkdownEditor from "@/components/markdown-editor";
import {
  createNote as createNoteRecord,
  createShare,
  createWorkspace as createWorkspaceRecord,
  deleteNote as deleteNoteRecord,
  deleteShare,
  deleteWorkspace as deleteWorkspaceRecord,
  listNotes,
  listShares,
  listWorkspaces,
  updateNote,
  type Note,
  type ShareRecord,
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

// Hashtag tokens in the markdown body, e.g. "#morning" or "#recipes/soups".
function tagsIn(content: string) {
  const tags = new Set<string>();
  for (const match of content.matchAll(/(?:^|\s)#([a-zA-Z0-9][a-zA-Z0-9_\-/]*)/g)) {
    tags.add(`#${match[1]}`);
  }
  return [...tags];
}

function wordCount(content: string) {
  const trimmed = content.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

// Public base URL for share links: env var wins (deployment), falls back to
// the browser's origin (localhost in dev, your domain in prod).
function shareBaseUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  }
  return typeof window !== "undefined" ? window.location.origin : "";
}

function PanelIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12.8 3.5v13" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-card ${className ?? ""}`} />;
}

function Overline({
  label,
  action,
}: {
  label: string;
  action?: { label: string; onClick: () => void; disabled?: boolean };
}) {
  return (
    <div className="mt-7 flex items-center justify-between px-3">
      <p className="text-[10px] font-bold tracking-[0.18em] text-muted">{label}</p>
      {action && (
        <button
          onClick={action.onClick}
          disabled={action.disabled}
          aria-label={action.label}
          title={action.label}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-card hover:text-foreground disabled:opacity-30"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden>
            <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 px-6 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm rounded-2xl bg-white p-7 shadow-[0_30px_70px_-25px_rgba(0,0,0,0.35)]"
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
  const [shares, setShares] = useState<Record<string, ShareRecord>>({});
  // Read by flushSave, which is stable across share-index changes.
  const sharesRef = useRef<Record<string, ShareRecord>>({});

  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [busy, setBusy] = useState(false);

  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The edit the timer hasn't sent yet. Anything that could drop it (switching
  // note or workspace, deleting, signing out) sends it instead of clearing it.
  const pendingSave = useRef<{ workspaceId: string; note: Note } | null>(null);
  const activeNoteRef = useRef<Note | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    activeNoteRef.current = activeNote;
  }, [activeNote]);

  // Load the owner's share index once (owner-only read under existing rules).
  useEffect(() => {
    let ignore = false;
    void listShares(user.id)
      .then((data) => {
        if (!ignore) setShares(data);
      })
      .catch(() => {
        if (!ignore) setError("Couldn't load shared links.");
      });
    return () => {
      ignore = true;
    };
  }, [user.id]);

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

  // Send the pending save now. Resolves once it's written or has failed.
  const flushSave = useCallback(async () => {
    const pending = pendingSave.current;
    if (!pending) return;
    pendingSave.current = null;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    setSaving(true);
    try {
      await updateNote(
        user.id,
        pending.workspaceId,
        pending.note.id,
        {
          title: pending.note.title,
          content: pending.note.content,
        },
        sharesRef.current[pending.note.id] ?? null,
      );
      setError(null);
    } catch {
      setError("Couldn't save your changes.");
    } finally {
      // A newer edit may have queued another save while this one was in flight.
      if (!pendingSave.current) setSaving(false);
    }
  }, [user.id]);

  // A save landing after the delete would recreate the deleted node.
  function dropPending(match: (pending: { workspaceId: string; note: Note }) => boolean) {
    if (!pendingSave.current || !match(pendingSave.current)) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    pendingSave.current = null;
    setSaving(false);
  }

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
    if (!activeWorkspace) return;
    let ignore = false;
    void (async () => {
      try {
        // Write the last edits of the workspace we're leaving before reading.
        await flushSave();
        if (ignore) return;
        setLoadingNotes(true);
        setNotes([]);
        setActiveNote(null);
        const data = await listNotes(user.id, activeWorkspace);
        if (ignore) return;
        setNotes(data);
        setActiveNote(data[0] ?? null);
      } catch {
        if (!ignore) setError("Couldn't load notes.");
      } finally {
        if (!ignore) setLoadingNotes(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [activeWorkspace, user.id, flushSave]);

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
        dropPending((pending) => pending.workspaceId === deleteTarget.id);
        // Delete shares for every note in this workspace before removing it
        const workspaceNotes = await listNotes(user.id, deleteTarget.id);
        for (const note of workspaceNotes) {
          await deleteShare(user.id, note.id);
        }
        await deleteWorkspaceRecord(user.id, deleteTarget.id);
        setWorkspaces((ws) => ws.filter((w) => w.id !== deleteTarget.id));
        if (activeWorkspace === deleteTarget.id) {
          setNotes([]);
          setActiveNote(null);
        }
        setActiveWorkspace((current) =>
          current === deleteTarget.id ? null : current,
        );
      } else if (activeWorkspace) {
        dropPending((pending) => pending.note.id === deleteTarget.id);
        await deleteNoteRecord(user.id, activeWorkspace, deleteTarget.id);
        // Delete share if exists for this note
        if (sharesRef.current[deleteTarget.id]) {
          await deleteShare(user.id, deleteTarget.id);
          setShares((ws) => {
            const updated = { ...ws };
            delete updated[deleteTarget.id];
            return updated;
          });
        }
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
    // One timer serves every note, so a keystroke here would cancel a pending
    // save of another note. Write that one out instead of losing it.
    if (pendingSave.current && pendingSave.current.note.id !== optimistic.id) {
      void flushSave();
    }
    pendingSave.current = { workspaceId, note: optimistic };
    setSaving(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void flushSave();
    }, 600);
  }

  async function signOut() {
    // app/page.tsx redirects to sign-in as soon as Firebase clears the session,
    // so the last edit has to be written while we still have permission.
    await flushSave();
    await firebaseSignOut(firebaseAuth()).catch(() => {});
  }

  async function openShare() {
    if (!activeNote || !activeWorkspace || shareBusy) return;
    setShareBusy(true);
    setShareError(null);
    try {
      const token = await createShare(user.id, activeWorkspace, activeNote);
      setShares((prev) => ({ ...prev, [activeNote.id]: { token, createdAt: new Date().toISOString() } }));
      setCopied(false);
      setShareOpen(true);
    } catch {
      setShareError("Couldn't create a share link. Try again.");
    } finally {
      setShareBusy(false);
    }
  }

async function stopShare() {
    if (!activeNote || shareBusy) return;
    setShareBusy(true);
    setShareError(null);
    try {
      await deleteShare(user.id, activeNote.id);
      setShares((prev) => {
        const updated = { ...prev };
        delete updated[activeNote.id];
        return updated;
      });
    } catch {
      setShareError("Couldn't stop sharing. Try again.");
    } finally {
      setShareBusy(false);
    }
  }

  async function copyShareLink(token: string) {
    const url = `${shareBaseUrl()}/share/${token}`;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } else {
      setShareError("Couldn't copy link. Copy it manually.");
    }
  }

  const activeWorkspaceObject = workspaces.find((w) => w.id === activeWorkspace);
  const activeWorkspaceName = activeWorkspaceObject?.name;
  const listLoading = loadingWorkspaces || loadingNotes;
  const activeNoteTags = activeNote ? tagsIn(activeNote.content) : [];

  return (
    <div className="flex h-dvh min-h-screen flex-1 overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--hairline)] bg-surface px-4 py-5 xl:w-[280px] xl:px-5">
        <div className="flex items-center gap-3 px-2 pt-1">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-foreground text-[17px] font-black tracking-[-0.12em]">
            K
          </span>
          <span className="text-[19px] font-extrabold tracking-tight">Keynotes</span>
        </div>

        <Overline
          label="WORKSPACE"
          action={{ label: "New workspace", onClick: openNewWorkspace, disabled: false }}
        />
        <nav aria-label="Workspaces and notes" className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
          {loadingWorkspaces &&
            [0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <Skeleton className="h-5 w-5 rounded-md" />
                <Skeleton className={`h-4 ${i === 1 ? "w-24" : "w-32"}`} />
              </div>
            ))}

          {!loadingWorkspaces &&
            workspaces.map((w) => {
              const workspaceActive = w.id === activeWorkspace;
              return (
                <div key={w.id} className="mb-1">
                  <div className="group relative">
                    <button
                      onClick={() => {
                          setShareOpen(false);
                          setShareError(null);
                          setCopied(false);
                          setActiveWorkspace(w.id);
                        }}
                      aria-current={workspaceActive ? "page" : undefined}
                      className={`flex w-full items-center gap-2.5 rounded-xl py-2.5 pl-1 pr-8 text-left text-[14px] transition-colors ${
                        workspaceActive
                          ? "font-bold text-foreground"
                          : "font-semibold text-foreground/65 hover:bg-card hover:text-foreground"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`w-4 text-center text-xl leading-none text-muted transition-transform ${
                          workspaceActive ? "rotate-90" : ""
                        }`}
                      >
                        ›
                      </span>
                      <span className="min-w-0 flex-1 truncate">{w.name}</span>
                    </button>
                    <button
                      onClick={() =>
                        setDeleteTarget({ kind: "workspace", id: w.id, name: w.name })
                      }
                      aria-label={`Delete workspace ${w.name}`}
                      title="Delete workspace"
                      className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-md px-1.5 py-1 text-xs text-muted hover:text-red-500 focus:block group-hover:block"
                    >
                      ✕
                    </button>
                  </div>

                  {workspaceActive ? (
                    <div className="ml-5 mt-0.5 flex flex-col gap-0.5">
                      {listLoading &&
                        [0, 1, 2].map((i) => (
                          <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                            <Skeleton className="h-4 w-4 rounded" />
                            <Skeleton className={`h-4 ${i === 1 ? "w-28" : "w-32"}`} />
                          </div>
                        ))}
                      {!listLoading &&
                        notes.map((n) => {
                          const active = n.id === activeNote?.id;
                          return (
                            <div key={n.id} className="group relative">
                              <button
                                onClick={() => {
                                setShareOpen(false);
                                setShareError(null);
                                setCopied(false);
                                setActiveNote(n);
                              }}
                                title={excerpt(n.content) || undefined}
                                aria-current={active ? "page" : undefined}
                                className={`flex w-full items-center gap-3 rounded-xl py-2.5 pl-2 pr-7 text-left text-[14px] transition-colors ${
                                  active
                                    ? "bg-white font-semibold text-foreground shadow-[0_2px_8px_-5px_rgba(0,0,0,0.2)]"
                                    : "font-medium text-foreground/65 hover:bg-card hover:text-foreground"
                                }`}
                              >
                                <span className="min-w-0 flex-1 truncate">{n.title || "Untitled"}</span>
                              </button>
                              <button
                                onClick={() =>
                                  setDeleteTarget({
                                    kind: "note",
                                    id: n.id,
                                    name: n.title || "Untitled",
                                  })
                                }
                                aria-label={`Delete note ${n.title || "Untitled"}`}
                                title="Delete note"
                                className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 rounded-md px-1.5 py-1 text-xs text-muted hover:text-red-500 focus:block group-hover:block"
                              >
                                ✕
                              </button>
                            </div>
                          );
                        })}
                      {!listLoading && notes.length === 0 ? (
                        <p className="px-3 py-2.5 text-[13px] text-muted">No notes yet.</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          {!loadingWorkspaces && workspaces.length === 0 ? (
            <p className="px-3 py-2 text-[13px] text-muted">No workspaces yet.</p>
          ) : null}
        </nav>

        <div className="shrink-0">
          <Overline label="QUICK ACTIONS" />
          <div className="mt-1.5 flex flex-col gap-0.5">
            <button
              onClick={() => void createNote()}
              disabled={!activeWorkspace}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] font-medium text-foreground/65 transition-colors hover:bg-card hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
            >
              <span aria-hidden className="w-5 text-center text-xl text-muted">＋</span>
              New note
            </button>
            <button
              onClick={openNewWorkspace}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] font-medium text-foreground/65 transition-colors hover:bg-card hover:text-foreground"
            >
              <span aria-hidden className="w-5 text-center text-lg text-muted">▣</span>
              New workspace
            </button>
            <button
              onClick={() => setPanelOpen((open) => !open)}
              aria-pressed={panelOpen}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] font-medium text-foreground/65 transition-colors hover:bg-card hover:text-foreground"
            >
              <PanelIcon className="ml-0.5 h-[18px] w-[18px] text-muted" />
              {panelOpen ? "Hide details" : "Show details"}
            </button>
            <button
              onClick={() => void signOut()}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] font-medium text-foreground/65 transition-colors hover:bg-card hover:text-foreground"
            >
              <span aria-hidden className="w-5 text-center text-lg text-muted">↪</span>
              Sign out
            </button>
          </div>
        </div>

        <div className="mt-4 shrink-0 border-t border-[var(--hairline)] px-2 pt-4">
          <p className="truncate px-1 text-[12px] font-medium text-muted">
            {user.name || user.email}
          </p>
          <button
            onClick={() => void createNote()}
            disabled={!activeWorkspace}
            className="mt-2 flex w-full items-center gap-3 rounded-xl px-1 py-2 text-[15px] font-bold transition-colors hover:bg-card disabled:cursor-not-allowed disabled:opacity-35"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-white">
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden>
                <path d="M10 4.5v11M4.5 10h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            Add Page
          </button>
        </div>
      </aside>

      {/* Editor column */}
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-white">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--hairline)] px-6 xl:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <span className="truncate text-[20px] font-semibold tracking-tight text-foreground/90">
              {activeWorkspaceName ?? "Keynotes"}
            </span>
            <span aria-hidden className="text-lg tracking-[0.35em] text-muted/70">‹›</span>
          </div>
          <div className="flex shrink-0 items-center gap-3 sm:gap-5">
            <span
              role="status"
              className={`text-[12px] font-medium ${error ? "text-red-600" : "text-muted"}`}
            >
              {error ?? (saving ? "Saving…" : "Saved")}
            </span>
            <button
              onClick={() => {
                if (!activeNote) return;
                setShareError(null);
                setShareBusy(false);
                setShareOpen(true);
              }}
              disabled={!activeNote}
              aria-label="Share this note"
              title="Share this note"
              className="flex h-9 items-center gap-2 rounded-xl bg-[#fff3dc] px-3 text-[13px] font-bold text-accent transition-colors hover:bg-[#ffe8b8] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden>
                <path d="M13.8 2.7 5 11.5v3h3l8.9-8.8c.5-.5.5-1.3 0-1.8l-1.3-1.2a1.27 1.27 0 0 0-1.8 0Z" fill="currentColor" />
                <path d="M4 17.5h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              Share
            </button>
            <span
              title={user.name || user.email}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#fff0d2] text-[12px] font-extrabold text-accent ring-4 ring-white"
            >
              {(user.name || user.email || "K").charAt(0).toUpperCase()}
            </span>
            <button
              onClick={() => setPanelOpen((v) => !v)}
              aria-pressed={panelOpen}
              aria-label={panelOpen ? "Hide details panel" : "Show details panel"}
              title={panelOpen ? "Hide details panel" : "Show details panel"}
              className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
                panelOpen ? "bg-card text-foreground" : "text-muted hover:bg-card hover:text-foreground"
              }`}
            >
              <PanelIcon className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>

        {listLoading ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-10 pt-12 xl:px-14" aria-busy="true">
            <Skeleton className="mt-2 h-12 w-80 max-w-full" />
            <Skeleton className="mt-5 h-4 w-56 rounded-md" />
            <Skeleton className="mt-12 h-4 w-full" />
            <Skeleton className="mt-4 h-4 w-11/12" />
            <Skeleton className="mt-4 h-4 w-3/4" />
            <Skeleton className="mt-10 h-6 w-32" />
            <Skeleton className="mt-5 h-4 w-10/12" />
          </div>
        ) : activeNote ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="w-full max-w-[840px] px-10 pb-32 pt-12 xl:px-14">
              <input
                value={activeNote.title}
                onChange={(e) => queueSave({ title: e.target.value })}
                placeholder="Untitled"
                aria-label="Note title"
                className="w-full bg-transparent text-[2.75rem] font-extrabold leading-[1.12] tracking-[-0.045em] outline-none placeholder:text-muted/40 sm:text-[3rem]"
              />
              {activeNoteTags.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                  {activeNoteTags.map((tag) => (
                    <span key={tag} className="text-[13px] font-semibold text-accent">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
              <MarkdownEditor
                key={activeNote.id}
                initialContent={activeNote.content}
                onChange={(content) => queueSave({ content })}
                onNewNote={() => void createNote()}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-10 text-center">
            <div>
              <p className="text-[17px] font-bold">
                {activeWorkspace ? "A blank page awaits" : "Create your first workspace"}
              </p>
              <p className="mt-1.5 text-sm text-muted">
                {activeWorkspace
                  ? "Start a new note and give that idea somewhere to live."
                  : "Workspaces keep related notes together."}
              </p>
            </div>
            <button
              onClick={activeWorkspace ? () => void createNote() : openNewWorkspace}
              className="mt-1 rounded-full bg-accent px-5 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-foreground"
            >
              {activeWorkspace ? "New note" : "New workspace"}
            </button>
          </div>
        )}
      </main>

      {/* Details panel */}
      {panelOpen && (
        <aside className="hidden w-[300px] shrink-0 flex-col border-l border-[var(--hairline)] bg-surface xl:flex">
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--hairline)] px-6">
            <p className="text-[10px] font-bold tracking-[0.18em] text-muted">NOTE DETAILS</p>
            <button
              onClick={() => setPanelOpen(false)}
              aria-label="Hide details panel"
              title="Hide details panel"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-card hover:text-foreground"
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden>
                <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-7">
            {activeNote ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-[22px] font-extrabold tracking-tight">Note overview</h2>
                  <span aria-hidden className="text-lg tracking-[0.25em] text-muted/70">‹›</span>
                </div>

                <div className="mt-6 rounded-[28px] bg-[#fff5df] p-5">
                  <p className="text-[18px] font-extrabold leading-snug tracking-tight">
                    {activeNote.title || "Untitled"}
                  </p>
                  <p className="mt-2 line-clamp-4 text-[13px] leading-6 text-foreground/65">
                    {excerpt(activeNote.content) || "Empty note — just waiting for a thought."}
                  </p>
                </div>

                <p className="mt-7 text-[10px] font-bold tracking-[0.18em] text-muted">TAGS</p>
                {activeNoteTags.length > 0 ? (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {activeNoteTags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-[#fff1d5] px-3 py-1.5 text-[12px] font-semibold text-accent"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-[13px] leading-5 text-muted">
                    No tags yet — add #tags in your note.
                  </p>
                )}

                <dl className="mt-7 divide-y divide-[var(--hairline)] border-t border-[var(--hairline)]">
                  <div className="flex items-baseline justify-between gap-4 py-3.5">
                    <dt className="text-[13px] text-muted">Updated</dt>
                    <dd className="text-[13px] font-semibold">{relativeTime(activeNote.updated_at)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4 py-3.5">
                    <dt className="text-[13px] text-muted">Words</dt>
                    <dd className="text-[13px] font-semibold">{wordCount(activeNote.content)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4 py-3.5">
                    <dt className="text-[13px] text-muted">Characters</dt>
                    <dd className="text-[13px] font-semibold">{activeNote.content.length}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                <p className="text-[14px] font-bold">No note selected</p>
                <p className="mt-1.5 text-[13px] leading-5 text-muted">
                  Choose a note to see its summary and details.
                </p>
              </div>
            )}
          </div>
        </aside>
      )}

      {/* Share dialog */}
      {shareOpen && activeNote && (
        <Modal title="Share note" onClose={() => setShareOpen(false)}>
          <p className="mt-2 text-sm leading-6 text-muted">
            Anyone with the link can view this note as read-only Markdown. Edits
            you make show up there automatically, and stopping the share removes
            access immediately.
          </p>

          {shares[activeNote.id]?.token ? (
            <>
              <label
                htmlFor="share-url"
                className="mt-5 block text-[10px] font-bold tracking-[0.18em] text-muted"
              >
                SHARE LINK
              </label>
              <input
                id="share-url"
                readOnly
                value={`${shareBaseUrl()}/share/${shares[activeNote.id].token}`}
                onFocus={(e) => e.currentTarget.select()}
                className="mt-1.5 h-11 w-full rounded-xl bg-card px-3 text-[13px] outline-none focus:ring-2 focus:ring-card-active/50"
              />
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void stopShare()}
                  disabled={shareBusy}
                  className="h-10 rounded-xl px-4 text-sm font-semibold text-[#b83b2f] hover:bg-[#fbeae7] disabled:opacity-40"
                >
                  Stop sharing
                </button>
                <a
                  href={`/share/${shares[activeNote.id].token}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-10 items-center rounded-xl px-4 text-sm font-semibold text-muted hover:bg-card"
                >
                  Open
                </a>
                <button
                  type="button"
                  onClick={() => void copyShareLink(shares[activeNote.id].token)}
                  className="h-10 rounded-xl bg-accent px-4 text-sm font-bold text-white hover:bg-foreground"
                >
                  Copy link
                </button>
              </div>
            </>
          ) : (
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                className="h-11 rounded-xl px-4 text-sm font-semibold text-muted hover:bg-card"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void openShare()}
                disabled={shareBusy}
                className="h-11 rounded-xl bg-accent px-5 text-sm font-bold text-white shadow-[0_10px_20px_-10px_rgba(148,94,12,0.8)] disabled:opacity-40"
              >
                {shareBusy ? "Creating…" : "Create link"}
              </button>
            </div>
          )}

          {shareError ? (
            <p role="alert" className="mt-3 text-[12px] text-red-600">{shareError}</p>
          ) : null}
          {copied ? (
            <p role="status" className="mt-3 text-[12px] text-accent">Link copied.</p>
          ) : null}
        </Modal>
      )}

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
                className="h-11 rounded-xl bg-accent px-5 text-sm font-bold text-white shadow-[0_10px_20px_-10px_rgba(148,94,12,0.8)] disabled:opacity-40"
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
