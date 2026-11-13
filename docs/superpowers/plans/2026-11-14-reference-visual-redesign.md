# Reference Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle Keynotes to closely match the supplied three-column screenshot while preserving every existing data and editing behavior.

**Architecture:** Keep the current client component and Firebase store intact. Change only the NotesApp presentation, add real editor formatting controls to MarkdownEditor, and tune the existing global design tokens/editor CSS.

**Tech Stack:** Next.js 16.4.6, React 19.3, TypeScript, Tailwind CSS 4, Tiptap 3.

**Spec:** `docs/superpowers/specs/2026-11-14-reference-visual-redesign-design.md`

## Global Constraints

- Do not add Snaps, Share, Invite, Updates, Templates, Import, or Trash features or placeholder buttons.
- Do not change `lib/store.ts`, `lib/firebase.ts`, Firebase reads/writes, autosave timing, or deletion behavior.
- Use the existing Quicksand font, white/gray palette, and amber accent; add no dependencies.
- Keep interactive components as client components and follow the installed Next.js guides in `node_modules/next/dist/docs/`.
- Do not open or screenshot the app; the user performs visual verification.
- Do not make git commits unless the user explicitly requests them.

## Review Focus

- Empty workspace and empty-note states: actions must remain disabled when there is no valid target, with a useful empty state. Task 3 includes a conditional-render check.
- Note switching while the formatting menu is open: the existing `key={activeNote.id}` must remount the editor and reset menu state. Task 2 checks this boundary; Task 3 preserves the key.
- Formatting clicks must not blur the editor before commands run. Task 2 requires `onMouseDown` prevention and a typecheck.
- Details-panel toggling and narrow screens: the toggle must remain available and the right panel must keep its existing `xl` visibility behavior. Task 3 checks both.
- Delete and sign-out flows must still flush/drop pending saves exactly as before. Task 3 verifies that their handlers and modal wiring are unchanged.

---

### Task 1: Reference editor styling

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: existing `.markdown`, `.tiptap`, and CSS variables.
- Produces: the shared typography, checkbox, placeholder, and scrollbar styles used by Tasks 2 and 3.

- [ ] **Step 1: Tune the existing tokens and document typography**

Keep the current variable names. Use white `#ffffff`, surface `#fafafa`, foreground near `#1c1c1b`, muted gray, and the existing amber accent. Set `.markdown` to approximately `1.0625rem` with relaxed `1.8` line-height and soft-gray body copy; use compact dark headings, amber links/tags, circular amber checked tasks, and generous block spacing.

- [ ] **Step 2: Add unobtrusive editor and scrollbar styling**

Keep the Tiptap placeholder behavior. Ensure `.tiptap` has no outline and enough bottom space for the fixed editor controls. Add thin neutral scrollbars without changing layout or hiding content.

- [ ] **Step 3: Verify styling compiles**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all commands exit 0 with no new warnings caused by this change.

### Task 2: Working bottom editor controls

**Files:**
- Modify: `components/markdown-editor.tsx`

**Interfaces:**
- Consumes: existing `blockActions`, `Editor`, `EditorContent`, and `useEditor`.
- Produces: `MarkdownEditor({ initialContent, onChange, onNewNote }: { initialContent: string; onChange: (markdown: string) => void; onNewNote?: () => void })`; an optional new-page button and an `Aa` block-format menu.

- [ ] **Step 1: Add local formatting-menu state and the optional callback prop**

Add `onNewNote?: () => void` and `const [formatMenuOpen, setFormatMenuOpen] = useState(false)`. Preserve the existing editor extensions, `key`-driven remount behavior in the parent, Markdown serialization, and selection BubbleMenu.

- [ ] **Step 2: Render the bottom controls inside the positioned main column**

After `EditorContent`, render an absolutely positioned bottom-left control group; do not add another positioned/scroll container around it. The `+` button appears only when `onNewNote` is provided and calls it. The `Aa` button toggles a small menu containing the existing `blockActions`.

- [ ] **Step 3: Preserve selection and dismiss the menu safely**

Formatting buttons use `onMouseDown={(event) => event.preventDefault()}`, run their existing action on click, and close the menu. Provide an accessible close affordance/outside-click dismissal, `aria-expanded` on `Aa`, and labels for both controls. Remove the nested `overflow-y-auto` from `EditorContent`; the existing document column remains the single scroll container.

- [ ] **Step 4: Verify editor integration**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all commands exit 0. Inspect the diff to confirm `onUpdate` still emits Markdown and the selection toolbar remains unchanged.

### Task 3: Three-column reference shell

**Files:**
- Modify: `components/notes-app.tsx:377-666`

**Interfaces:**
- Consumes: Task 2's optional `onNewNote` prop and all existing NotesApp state/handlers.
- Produces: the redesigned workspace shell; no exported API changes.

- [ ] **Step 1: Replace only the presentation section**

Keep all state, effects, `flushSave`, `queueSave`, `confirmDelete`, `createNote`, `createWorkspace`, and `signOut` logic intact. Restyle the root as a full-height three-column workspace with a soft-gray left sidebar, flexible white editor, and the existing hideable right panel.

- [ ] **Step 2: Build the reference sidebar**

Use a Keynotes brand row, `WORKSPACE` overline with the existing new-workspace action, and plain workspace names without emoji icons. Nest the current workspace's notes beneath the active workspace instead of showing a separate PAGES section. Keep delete buttons on every workspace/note. Add `QUICK ACTIONS` containing only real controls: New note, New workspace, Show/hide details, and Sign out. Keep Add Page in the footer and disable note actions when no workspace exists.

- [ ] **Step 3: Build the reference document column**

Use a compact top bar with the active workspace/name breadcrumb, save status, and panel toggle. Render loading skeletons in the same document shape. For an active note, use a spacious content column, large bold title input, amber tags, and the existing keyed `MarkdownEditor`, now passing `onNewNote={() => void createNote()}`. Preserve empty states and the single document scroll container.

- [ ] **Step 4: Restyle the existing details panel as Note overview**

Keep the `panelOpen` state, close button, and `hidden ... xl:flex` behavior. Replace only its contents: a large `Note overview` heading, soft amber-tinted summary card with the active note title and excerpt, tag chips, and rows for Updated, Words, and Characters using the existing helpers. Show a useful empty state when no note is selected.

- [ ] **Step 5: Preserve modal and destructive behavior**

Leave the existing new-workspace and delete-confirmation handlers wired to the same functions. Restyle their surfaces only if needed for visual consistency; do not alter confirmation copy or save/deletion semantics.

- [ ] **Step 6: Run static and production verification**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all commands exit 0.

- [ ] **Step 7: Review behavior coverage without opening the app**

Inspect the final diff and confirm: no store/Firebase edits; active note key remains; pending-save handlers are unchanged; empty states remain; every visible button has a working handler; details toggle remains; no forbidden placeholder features were introduced.

- [ ] **Step 8: Ask the user for visual and interaction verification**

Ask the user to compare against the supplied screenshot and verify workspace/note switching, note creation, title/body editing, all block-format actions, autosave, deletion, details toggling, and sign-out. Report any issues rather than claiming pixel-perfect verification without browser evidence.
