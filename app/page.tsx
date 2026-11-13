"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase";
import NotesApp from "@/components/notes-app";

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => onAuthStateChanged(firebaseAuth(), setUser), []);

  useEffect(() => {
    if (user === null) router.replace("/auth/sign-in");
  }, [user, router]);

  if (!user) {
    return (
      <div className="flex min-h-screen flex-1 items-center justify-center bg-background">
        <span className="animate-pulse text-sm text-muted">Loading…</span>
      </div>
    );
  }

  return (
    <NotesApp
      user={{ id: user.uid, name: user.displayName, email: user.email ?? "" }}
    />
  );
}
