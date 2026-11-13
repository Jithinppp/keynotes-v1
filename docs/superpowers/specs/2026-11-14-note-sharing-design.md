# Note sharing design

## Intent
Let a signed-in Keynotes owner share one note through an unlisted, read-only link. Anyone with the link can view the note as formatted Markdown without signing in; only the owner can create, update, or revoke the link.

## Goals
- Per-note share link with a high-entropy unguessable token.
- Public `/share/[token]` route that renders the note read-only with the existing Markdown styles.
- Live mirror: owner edits update the shared page automatically while it is open.
- One active link per note; owner can copy, open, and stop sharing.
- Deleting a note or workspace revokes its shares.
- Private note data remains owner-only; public shares are readable only by exact token, never listable.

## Non-goals
- No recipient accounts, email sending, or sharing to specific people.
- No expiration, password, comments, or edit access for viewers.
- No workspace-wide sharing or public listing of shared notes.

## Data model
Private owner index:
`users/{uid}/shares/{noteId}` → `{ token, createdAt }`

Public read-only mirror:
`publicShares/{token}` → `{ ownerId, workspaceId, noteId, title, content, updated_at }`

The token is the secret. The public mirror stores content so the public route never reads private user data.

## Rules
- Existing `users/{uid}` owner-only rules remain unchanged.
- `publicShares/{token}` allows anonymous read of that exact token only.
- `publicShares/{token}` allows write only when `auth.uid` equals `ownerId` in the new data.
- Parent `publicShares` remains unreadable so shares cannot be enumerated.

## UI
- Add a Share button to the active note top bar.
- Share dialog states: no link (create), active link (copy/open/stop sharing), and busy/error feedback.
- Dialog copy states that anyone with the link can view the note and that stopping sharing removes access immediately.
- Public page shows the note title, formatted Markdown, updated time, and Keynotes branding; no editor or navigation into private data.
- Revoking while a viewer has the page open leaves them on a clear “no longer available” state.

## Synchronization
- Creating a link writes the private index and public mirror in one atomic multi-location update.
- Autosave updates the note and its public mirror in the same multi-location update when a share exists.
- Deleting a note/workspace or stopping sharing removes both share records.

## Verification
- Typecheck, lint, and production build.
- User verifies create/copy/open, live edits, stop sharing, note/workspace deletion cleanup, and unauthenticated access.
- Republish `database.rules.json` in the Firebase console or CLI before testing public links.
