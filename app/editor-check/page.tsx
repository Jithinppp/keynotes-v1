"use client";

import NotesApp from "@/components/notes-app";

// Temporary local harness for visual verification without Firebase auth.
// Delete before shipping.
export default function EditorCheck() {
  return (
    <NotesApp user={{ id: "fake-uid-screenshot-test", name: "You", email: "test@example.com" }} />
  );
}
