# Note Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-note, unlisted, revocable share links that show a live read-only Markdown view to anyone with the URL.

**Architecture:** Keep private notes owner-only in Firebase Realtime Database. Add a private `users/{uid}/shares/{noteId}` index and a public `publicShares/{token}` mirror. Autosave and share writes update both paths atomically; `/share/[token]` reads only the public mirror and renders it with Tiptap read-only Markdown.

**Tech Stack:** Next.js 16.4.6, React 19.3, TypeScript, Tailwind CSS 4, Firebase Realtime Database, Tiptap 3, tiptap-markdown.

**Spec:** `docs/superpowers/specs/2026-11-14-note-sharing-design.md`

## Global Constraints

- Public links are unlisted and require no recipient account.
- Anyone with a link can view; only the owner can create, update, or revoke it.
- Private note/workspace data remains owner-only.
- Do not add expiration, passwords, recipient identity, comments, or edit access.
- Do not make git commits unless the user explicitly requests them.
- Do not open or screenshot the app; the user verifies runtime behavior.
- Read the installed Next.js dynamic-route and `use client` guides before writing the public route.

## Review Focus

- Revoked or unknown tokens must never expose private data or crash the public page.
- Parent `publicShares` must not be listable anonymously.
- Live mirror updates must not corrupt the private note or lose autosave.
- Deleting a note or workspace must remove its share records.
- Viewer Markdown must not render raw HTML from note content.
- Share dialog controls must have real handlers and useful loading/error states.

---

### Task 1: Share data layer and rules

**Files:**
- Modify: `lib/store.ts`
- Modify: `database.rules.json`

**Interfaces:**
- Consumes: existing `Note`, `update(ref, updates)`, RTDB refs.
- Produces:
  - `type ShareRecord = { token: string; createdAt: string }`
  - `type SharedNote = { ownerId: string; workspaceId: string; noteId: string; title: string; content: string; updated_at: string }`
  - `listShares(uid: string): Promise<Record<string, ShareRecord>>`
  - `createShare(uid: string, workspaceId: string, note: Note): Promise<string>`
  - `deleteShare(uid: string, noteId: string): Promise<void>`
  - `updateNote(uid, workspaceId, noteId, patch: { title: string; content: string }, share?: ShareRecord | null): Promise<void>`

- [ ] **Step 1: Add share types and atomic create/delete helpers**

Add a browser-safe 24-byte base64url token helper. `createShare` writes `users/{uid}/shares/{noteId}` and `publicShares/{token}` in one `update(ref(db), updates)` call. `deleteShare` removes both paths in one update. `listShares` reads only the owner's share index.

- [ ] **Step 2: Extend note autosave to mirror shared content atomically**

Change `updateNote` to accept optional `ShareRecord`. When present, add the matching `publicShares/{token}` object (`ownerId`, `workspaceId`, `noteId`, `title`, `content`, `updated_at`) to the same multi-location update as the private note. Without a share, behavior stays exactly the same.

- [ ] **Step 3: Add exact-token public rules**

Keep `users` owner-only. Add `publicShares` with `$token` child rules: anonymous `.read: true`, owner-only `.write` using `auth.uid === newData.child('ownerId').val()` and allowing delete with `!newData.exists() || ...`, plus a `.validate` requiring `ownerId`, `workspaceId`, `noteId`, `title`, `content`, and `updated_at`. Do not add a parent `.read`.

- [ ] **Step 4: Verify the data layer compiles**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all commands exit 0. Inspect the diff to confirm private note writes are unchanged when `share` is omitted.

### Task 2: Share controls and cleanup

**Files:**
- Modify: `components/notes-app.tsx`

**Interfaces:**
- Consumes: Task 1's `ShareRecord`, `listShares`, `createShare`, `deleteShare`, and updated `updateNote`.
- Produces: the existing `NotesApp` with share state and a Share top-bar control; no exported API change.

- [ ] **Step 1: Load the owner share index and keep it current**

Add `shares` state and a `sharesRef` synchronized in an effect so autosave does not restart workspace loading when shares change. Load shares once per signed-in user with `listShares(user.id)`.

- [ ] **Step 2: Mirror autosave and remove shares on destructive actions**

Pass `sharesRef.current[pending.note.id] ?? null` as the optional share argument in `flushSave`'s `updateNote` call. On successful note deletion, call `deleteShare` for that note and remove it from state. On workspace deletion, delete the share for every note in the workspace being removed.

- [ ] **Step 3: Add the Share top-bar control and dialog**

Add a real Share button beside save status for the active note. Add dialog state plus create/copy/open/stop-sharing/error handling. Show the warning that anyone with the link can view the note, the generated URL, and a clear stop action. Use the existing `Modal` and do not add dependencies.

- [ ] **Step 4: Verify app integration**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all commands exit 0. Inspect the diff to confirm `queueSave` timing, `flushSave`, `dropPending`, deletion, and sign-out still call the same underlying operations.

### Task 3: Public share page

**Files:**
- Create: `app/share/[token]/page.tsx`
- Create: `components/share-view.tsx`

**Interfaces:**
- Consumes: `publicShares/{token}` public read; Tiptap Markdown extensions already installed.
- Produces: `ShareView({ token }: { token: string })` and a Suspense-wrapped dynamic page.

- [ ] **Step 1: Add the dynamic route with runtime-param fallback**

Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md` and the `use client` guide. Create `app/share/[token]/page.tsx` using `PageProps<'/share/[token]'>`, wrapping the client view in `Suspense` because Cache Components make params runtime data.

- [ ] **Step 2: Read the public mirror without auth**

In `components/share-view.tsx`, use `onValue(ref(firebaseDatabase(), \`publicShares/${token}\`), ...)` to subscribe to the exact token. Handle null data as not found and permission errors as revoked/unavailable. Do not read any `users` path.

- [ ] **Step 3: Render read-only formatted Markdown**

Use a non-editable Tiptap editor with `StarterKit`, `TaskList`, `TaskItem`, `Image`, and `Markdown` configured with `html: false` and `breaks: true`. Apply the existing `.markdown .tiptap` classes. Sync new mirror content with `editor.commands.setContent(content, { emitUpdate: false })` when the public data changes. Never render note content with `dangerouslySetInnerHTML`.

- [ ] **Step 4: Add public page states and branding**

Show the note title, formatted content, updated time, and a compact Keynotes header. Provide loading, not-found, and revoked states with no private navigation or editor controls.

- [ ] **Step 5: Verify the public route**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all commands exit 0 and `/share/[token]` is listed as a dynamic route. Inspect the diff to confirm no `users` data is read on the public page.

### Task 4: Release and user verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: the completed share data model and public route.
- Produces: deployment notes for the new rules and public route.

- [ ] **Step 1: Document sharing and rule deployment**

Add a short README section: share from the note top bar, anyone with the link can view, stop sharing revokes immediately, and `database.rules.json` must be republished before public links work. Note that existing private data rules are unchanged.

- [ ] **Step 2: Run the full static gate**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all commands exit 0.

- [ ] **Step 3: Ask the user to verify the runtime behavior**

Ask the user to publish the rules, then verify: create/copy/open, unauthenticated viewing, live edits appearing in an open shared tab, stop sharing, note deletion cleanup, workspace deletion cleanup, and unknown/revoked token states. Do not claim runtime success without their browser verification.
