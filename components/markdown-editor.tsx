"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";

// tiptap-markdown marks a whole list as a task list when any item is a task,
// which corrupts mixed lists ("- one" next to "- [ ] todo"). Split those into
// consecutive bullet/task groups before the DOM is parsed.
const SplitMixedTaskLists = Extension.create({
  name: "splitMixedTaskLists",
  addStorage() {
    return {
      markdown: {
        parse: {
          updateDOM(element: HTMLElement) {
            element.querySelectorAll('ul[data-type="taskList"]').forEach((list) => {
              const items = [...list.children];
              if (items.every((li) => li.getAttribute("data-type") === "taskItem")) return;

              const groups: { task: boolean; items: Element[] }[] = [];
              for (const li of items) {
                const task = li.getAttribute("data-type") === "taskItem";
                const last = groups[groups.length - 1];
                if (last && last.task === task) last.items.push(li);
                else groups.push({ task, items: [li] });
              }

              const fragment = document.createDocumentFragment();
              for (const group of groups) {
                const ul = document.createElement("ul");
                if (group.task) ul.setAttribute("data-type", "taskList");
                group.items.forEach((li) => ul.appendChild(li));
                fragment.appendChild(ul);
              }
              list.replaceWith(fragment);
            });
          },
        },
      },
    };
  },
});

export default function MarkdownEditor({
  initialContent,
  onChange,
}: {
  initialContent: string;
  onChange: (markdown: string) => void;
}) {
  const editor = useEditor({
    // Required in Next.js: render on the client so SSR and hydration match.
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: "Write in markdown… type - for a list",
      }),
      Markdown.configure({ html: false, tightLists: true, linkify: true }),
      SplitMixedTaskLists,
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: "markdown tiptap",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Note content",
      },
    },
    onUpdate: ({ editor }) =>
      onChange(
        (
          editor.storage as unknown as {
            markdown: { getMarkdown(): string };
          }
        ).markdown.getMarkdown(),
      ),
  });

  if (!editor) return <div className="mt-6 flex-1 px-10 pb-24" />;

  return (
    <EditorContent
      editor={editor}
      className="mt-6 flex-1 overflow-y-auto px-10 pb-24"
    />
  );
}
