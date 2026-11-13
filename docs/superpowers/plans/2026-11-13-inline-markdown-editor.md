# Inline Markdown Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Write/Preview toggle with a TipTap editor that formats markdown inline as the user types, while notes stay stored as markdown strings.

**Architecture:** A single client component (`MarkdownEditor`) owns the TipTap instance. It receives the note's markdown as `initialContent`, emits serialized markdown on every change, and is keyed by note id so switching notes remounts it instead of resetting the cursor. `notes-app.tsx` drops the `mode` state and the toggle, and feeds editor changes into the existing debounced `queueSave`.

**Tech Stack:** Next.js 16, React 19, TipTap 3.34 (`@tiptap/react`, `starter-kit`, `extension-task-list`, `extension-task-item`, `extension-placeholder`), `tiptap-markdown` 0.9.

**Spec:** Approved inline-editor design, conversation 2026-11-13.

## Global Constraints

- Notes remain markdown strings in Realtime Database; no schema change.
- No Write/Preview toggle remains.
- Keep existing colors, fonts, modals, skeletons, and save indicator unchanged.
- Do not touch auth or the data layer (`lib/store.ts`, `lib/firebase.ts`).
- Pin TipTap packages at `3.34.0` and `tiptap-markdown` at `0.9.0`.

## Review Focus

- Typing `- ` at the start of a line produces a visible bullet immediately.
- An existing markdown note loads rendered, and saving still writes markdown.
- Switching notes never carries content between notes (remount by id).
- An empty note shows a placeholder instead of a blank editor.
- Editor keeps focus and scrolls inside the existing layout.

---

### Task 1: Editor component

**Files:**
- Create: `components/markdown-editor.tsx`
- Modify: `package.json`

**Interfaces:**
- Produces: `export default function MarkdownEditor({ initialContent: string, onChange: (markdown: string) => void })`
- Consumes: `queueSave({ content })` from Task 2.

- [ ] **Step 1: Install dependencies**

Run: `npm install @tiptap/react@3.34.0 @tiptap/starter-kit@3.34.0 @tiptap/extension-task-list@3.34.0 @tiptap/extension-task-item@3.34.0 @tiptap/extension-placeholder@3.34.0 tiptap-markdown@0.9.0`
Expected: install succeeds, `package.json` lists all six.

- [ ] **Step 2: Implement the component**

`useEditor` with `immediatelyRender: false`, extensions StarterKit + TaskList + TaskItem + Placeholder + Markdown. `content: initialContent`, `editorProps.attributes` with `class="markdown tiptap …"`, `role="textbox"`, `aria-multiline="true"`, `aria-label="Note content"`. `onUpdate` calls `onChange(editor.storage.markdown.getMarkdown())` through a typed cast. Render `<EditorContent>` in a `flex-1 overflow-y-auto` wrapper. Return an empty placeholder div while `editor` is null.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in the new file.

### Task 2: Wire into the note page

**Files:**
- Modify: `components/notes-app.tsx`

**Interfaces:**
- Consumes: `MarkdownEditor` from Task 1.

- [ ] **Step 1: Remove toggle state and the rendered-preview branch**

Delete `mode`/`setMode` and the Write/Preview button block; drop `ReactMarkdown`/`remark-gfm` imports; replace the `<textarea>`/`.markdown` branches with `<MarkdownEditor key={activeNote.id} initialContent={activeNote.content} onChange={(content) => queueSave({ content })} />`.

- [ ] **Step 2: Remove leftover mode calls**

Remove `setMode(...)` from the notes-load effect, `createNote`, and note-card click.

- [ ] **Step 3: Drop unused dependencies**

Run: `npm uninstall react-markdown remark-gfm`

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: compiled successfully, TypeScript passes.

### Task 3: Styling

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Add editor styles**

Add: `.tiptap { min-height: 100%; outline: none; }`, placeholder rule for `.tiptap p.is-editor-empty:first-child::before` using `attr(data-placeholder)` and `var(--muted)`, and task-list layout (`ul[data-type="taskList"]` flex row per `li`, no list marker, checkbox aligned).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: compiled successfully.

### Task 4: Browser verification

**Files:** none (test harness in temp dir)

- [ ] **Step 1: Start the app and sign in**

Run: `npm run start` then drive Chrome over CDP; sign in with the enabled provider.

- [ ] **Step 2: Verify typing shortcuts and persistence**

Assert after typing `- ` a `ul > li` exists; after `## ` an `h1/h2` exists; after `**bold**` a `strong` exists; reload and confirm the rendered content and stored markdown match.

- [ ] **Step 3: Verify note switching and empty state**

Create a second note, switch back and forth, assert no content bleed and the placeholder is visible on an empty note.

- [ ] **Step 4: Report results**

Record pass/fail for each assertion and any console errors.
