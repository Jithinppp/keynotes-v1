# Keynotes reference visual redesign

## Intent
Make the existing Keynotes workspace closely resemble the supplied screenshot while preserving its current workspaces, notes, Markdown editor, autosave, deletion, sign-out, and note-details behavior. This is a visual redesign, not a collaboration or media-storage feature project.

## Approach
Chosen: match the look using current features. Rejected: recreating the screenshot's Snaps, Share, Updates, Invite Members, Templates, Import, and Trash as real features because those require new data and behavior outside this scope.

## Design
- Keep Quicksand, the white/gray surfaces, hairline dividers, and amber accent; tune spacing, typography, radii, and editor colors toward the reference.
- Left sidebar: Keynotes brand, workspace navigation with notes nested beneath the active workspace, plain workspace/note names without emoji icons, a Quick Actions section containing only working actions, and the existing Add Page control.
- Center: workspace breadcrumb and compact save/panel controls above a spacious document; large bold title, amber hashtags, soft-gray readable body copy, and amber task checkboxes.
- Editor bottom controls: a working new-page `+` button and an `Aa` button that opens the existing block-formatting actions. Selection formatting remains available.
- Right panel: keep note details rather than adding Snaps. Restyle it as an airy overview panel with a soft note-summary card, tags, updated time, word count, and character count. Keep the existing show/hide behavior.
- Do not add nonfunctional Share, Invite, Updates, Snaps, Templates, Import, or Trash controls.
- Preserve all Firebase reads/writes and autosave semantics.

## Files
- `components/notes-app.tsx`: layout, navigation, top bar, overview panel, and wiring for real editor actions.
- `components/markdown-editor.tsx`: bottom `+`/`Aa` controls using existing editor commands.
- `app/globals.css`: typography, editor spacing, task-list, and scrollbar styling.

## Verification
Run `npx tsc --noEmit`, `npm run lint`, and `npm run build`. Ask the user to compare the running app with the screenshot and verify note creation, workspace/note switching, formatting, autosave, deletion, details-panel toggling, and sign-out. No app window will be opened by the agent.
