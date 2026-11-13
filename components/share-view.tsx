"use client";

import { useEffect, useState } from "react";
import { onValue, ref } from "firebase/database";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import { Markdown } from "tiptap-markdown";
import { firebaseDatabase } from "@/lib/firebase";

type ShareViewProps = { token: string };

// Read-only mirror of the editor extensions — no editing actions, just safe
// Markdown rendering. `html: false` keeps raw HTML out of the shared view.
const extensions = [
  StarterKit,
  TaskList,
  TaskItem.configure({ nested: true }),
  Image,
  Markdown.configure({ html: false, tightLists: true, linkify: true, breaks: true }),
];

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

export default function ShareView({ token }: ShareViewProps) {
  const [share, setShare] = useState<{
    title: string;
    content: string;
    updated_at: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: "",
    editable: false,
  });

  // Subscribe to the exact public share token only — never reads `users`.
  useEffect(() => {
    const unsubscribe = onValue(
      ref(firebaseDatabase(), `publicShares/${token}`),
      (snap) => {
        const data = snap.val();
        if (!data) {
          setShare(null);
          setLoading(false);
          return;
        }
        setShare({
          title: data.title,
          content: data.content,
          updated_at: data.updated_at,
        });
        // Live mirror: push owner updates into the open viewer.
        editor?.commands.setContent(data.content, { emitUpdate: false });
        setLoading(false);
      },
      (err) => {
        setError("Couldn't load the shared note.");
        setLoading(false);
        console.error(err);
      },
    );
    return () => unsubscribe();
  }, [token, editor]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <h1 className="text-[20px] font-bold tracking-tight">Note unavailable</h1>
        <p className="mt-2 text-[14px] text-muted">{error}</p>
      </div>
    );
  }

  if (loading || !share) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <h1 className="text-[20px] font-bold tracking-tight">
          {loading ? "Loading shared note…" : "Shared note not found"}
        </h1>
        <p className="mt-2 text-[14px] text-muted">
          {loading
            ? ""
            : "The link may have been revoked or the note deleted."}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-[var(--hairline)] px-6 py-4">
        <h1 className="text-[20px] font-bold tracking-tight">
          {share.title}
        </h1>
        <p className="mt-1 text-[12px] text-muted">
          Updated {relativeTime(share.updated_at)}
        </p>
      </header>
      <main className="max-w-[840px] mx-auto px-10 py-12">
        <EditorContent editor={editor} className="markdown tiptap" />
      </main>
    </div>
  );
}
