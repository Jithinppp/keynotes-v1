"use client";

import { useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";

// tiptap-markdown marks a whole list as a task list when any item is a task,
// which corrupts mixed lists ("- one" next to "- [ ] todo"). Split those into
// consecutive bullet/task groups before the DOM is parsed.
const SplitMixedTaskLists = Extension.create({
  name: "splitMixedTaskLists",
  // Below the task-list extensions (priority 100) so their DOM marking is done
  // before we split; the order then doesn't depend on registration order.
  priority: 40,
  addStorage() {
    return {
      markdown: {
        parse: {
          updateDOM(element: HTMLElement) {
            element.querySelectorAll(':is(ul, ol)[data-type="taskList"]').forEach((list) => {
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

// Hoisted: recreating these per render makes every keystroke reconfigure the
// ProseMirror view.
const extensions = [
  StarterKit,
  TaskList,
  TaskItem.configure({ nested: true }),
  Image,
  Placeholder.configure({
    placeholder: "Write in markdown… type - for a list",
  }),
  Markdown.configure({ html: false, tightLists: true, linkify: true, breaks: true }),
  SplitMixedTaskLists,
];

type Action = {
  label: string;
  text: string;
  isOn: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
};

const inlineActions: Action[] = [
  {
    label: "Bold",
    text: "B",
    isOn: (e) => e.isActive("bold"),
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    label: "Italic",
    text: "I",
    isOn: (e) => e.isActive("italic"),
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    label: "Strikethrough",
    text: "S",
    isOn: (e) => e.isActive("strike"),
    run: (e) => e.chain().focus().toggleStrike().run(),
  },
  {
    label: "Inline code",
    text: "<>",
    isOn: (e) => e.isActive("code"),
    run: (e) => e.chain().focus().toggleCode().run(),
  },
];

const blockActions: Action[] = [
  {
    label: "Heading 1",
    text: "H1",
    isOn: (e) => e.isActive("heading", { level: 1 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    label: "Heading 2",
    text: "H2",
    isOn: (e) => e.isActive("heading", { level: 2 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    label: "Bullet list",
    text: "•",
    isOn: (e) => e.isActive("bulletList"),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    label: "Numbered list",
    text: "1.",
    isOn: (e) => e.isActive("orderedList"),
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    label: "Task list",
    text: "☑",
    isOn: (e) => e.isActive("taskList"),
    run: (e) => e.chain().focus().toggleTaskList().run(),
  },
  {
    label: "Quote",
    text: "❝",
    isOn: (e) => e.isActive("blockquote"),
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
];

const allActions = [...inlineActions, ...blockActions];

function SelectionToolbar({ editor }: { editor: Editor }) {
  const active = useEditorState({
    editor,
    selector: ({ editor }) =>
      Object.fromEntries(allActions.map((a) => [a.label, a.isOn(editor)])),
  });

  return (
    <BubbleMenu
      editor={editor}
      // Only for a real selection: showing it for a bare cursor nags on every click.
      shouldShow={({ from, to }) => from !== to}
      options={{ placement: "top", offset: 8 }}
      className="flex items-center gap-0.5 rounded-full border border-black/5 bg-surface p-1 shadow-lg shadow-black/10"
    >
      {[...inlineActions, null, ...blockActions].map((action, i) =>
        action ? (
          <button
            key={action.label}
            type="button"
            aria-label={action.label}
            aria-pressed={active?.[action.label] ?? false}
            title={action.label}
            // Keep the editor selection: clicking the menu must not blur it.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => action.run(editor)}
            className={`flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs transition-colors ${
              active?.[action.label]
                ? "bg-accent/25 font-semibold text-foreground"
                : "text-foreground/70 hover:bg-card hover:text-foreground"
            }`}
          >
            {action.text}
          </button>
        ) : (
          <span key={`divider-${i}`} className="mx-1 h-4 w-px bg-black/10" />
        ),
      )}
    </BubbleMenu>
  );
}

export default function MarkdownEditor({
  initialContent,
  onChange,
  onNewNote,
}: {
  initialContent: string;
  onChange: (markdown: string) => void;
  onNewNote?: () => void;
}) {
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
  const editor = useEditor({
    // Required in Next.js: render on the client so SSR and hydration match.
    immediatelyRender: false,
    extensions,
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

  if (!editor) return <div className="mt-6 h-40" />;

  return (
    <>
      <SelectionToolbar editor={editor} />
      <EditorContent editor={editor} className="mt-6" />

      <div className="absolute bottom-6 left-12 z-30 flex items-center gap-3">
        {onNewNote ? (
          <button
            type="button"
            onClick={onNewNote}
            aria-label="Create a new note"
            title="New note"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-card/70 text-2xl font-light text-foreground/75 transition-colors hover:bg-card hover:text-foreground"
          >
            +
          </button>
        ) : null}

        <div className="relative">
          {formatMenuOpen ? (
            <>
              <button
                type="button"
                aria-label="Close formatting menu"
                onClick={() => setFormatMenuOpen(false)}
                className="fixed inset-0 z-40 cursor-default"
              />
              <div className="absolute bottom-[calc(100%+12px)] left-0 z-50 w-52 rounded-2xl border border-black/5 bg-white p-2 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.25)]">
                <p className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
                  Text style
                </p>
                {blockActions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      action.run(editor);
                      setFormatMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-[13px] font-semibold text-foreground/75 transition-colors hover:bg-card hover:text-foreground"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-card text-[11px] font-bold text-muted">
                      {action.text}
                    </span>
                    {action.label}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => setFormatMenuOpen((open) => !open)}
            aria-label="Text formatting"
            aria-expanded={formatMenuOpen}
            title="Text formatting"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-card/70 text-[15px] font-bold text-foreground/75 transition-colors hover:bg-card hover:text-foreground"
          >
            Aa
          </button>
        </div>
      </div>
    </>
  );
}
