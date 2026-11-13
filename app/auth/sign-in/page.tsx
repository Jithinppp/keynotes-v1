"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import { firebaseAuth, googleProvider } from "@/lib/firebase";

const FIREBASE_ERRORS: Record<string, string> = {
  "auth/invalid-credential": "Invalid email or password.",
  "auth/wrong-password": "Invalid email or password.",
  "auth/user-not-found": "No account with that email. Try signing up.",
  "auth/invalid-email": "That email address doesn't look valid.",
  "auth/email-already-in-use": "That email already has an account. Sign in instead.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/popup-closed-by-user": "Google sign-in was closed before finishing.",
  "auth/popup-blocked": "Your browser blocked the Google popup. Allow popups and try again.",
  "auth/operation-not-allowed": "That sign-in method isn't enabled in Firebase Console yet.",
  "auth/configuration-not-found": "That sign-in method isn't enabled in Firebase Console yet.",
  "auth/unauthorized-domain": "This domain isn't authorized in Firebase Console.",
  "auth/invalid-api-key": "Firebase isn't configured correctly. Check the keys in .env.local.",
  "auth/api-key-not-valid": "Firebase isn't configured correctly. Check the keys in .env.local.",
};

function errorMessage(error: unknown) {
  const code = (error as { code?: string })?.code ?? "";
  return FIREBASE_ERRORS[code] ?? "Something went wrong. Please try again.";
}

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Already signed in? Skip the form.
  useEffect(
    () =>
      onAuthStateChanged(firebaseAuth(), (user) => {
        if (user) router.replace("/");
      }),
    [router],
  );

  async function withGoogle() {
    setError(null);
    setPending(true);
    try {
      await signInWithPopup(firebaseAuth(), googleProvider);
      router.replace("/");
    } catch (error) {
      setError(errorMessage(error));
      setPending(false);
    }
  }

  async function withPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (mode === "signup") {
        const { user } = await createUserWithEmailAndPassword(
          firebaseAuth(),
          email,
          password,
        );
        if (name.trim()) await updateProfile(user, { displayName: name.trim() });
      } else {
        await signInWithEmailAndPassword(firebaseAuth(), email, password);
      }
      router.replace("/");
    } catch (error) {
      setError(errorMessage(error));
      setPending(false);
    }
  }

  const inputClass =
    "h-12 rounded-xl bg-card px-4 text-[15px] outline-none placeholder:text-muted focus:ring-2 focus:ring-card-active/50";

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm rounded-3xl border border-[var(--hairline)] bg-surface p-9 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.25)]">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-card-active">
            <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5 text-white" aria-hidden>
              <path
                d="M13.8 2.7 5 11.5v3h3l8.9-8.8c.5-.5.5-1.3 0-1.8l-1.3-1.2a1.27 1.27 0 0 0-1.8 0Z"
                fill="currentColor"
              />
              <path d="M4 17.5h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>
          <span className="text-xl font-bold tracking-tight">Keynotes</span>
        </div>

        <h1 className="mt-6 text-2xl font-bold tracking-tight">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {mode === "signin" ? "Sign in to your notes" : "Start writing in seconds"}
        </p>

        <button
          onClick={withGoogle}
          disabled={pending}
          className="mt-7 flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-card-active text-[15px] font-bold text-white shadow-[0_10px_25px_-10px_rgba(240,166,60,0.7)] transition-transform hover:scale-[1.02] disabled:opacity-50"
        >
          <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden>
            <path fill="#fff" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.5 30.1 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.3 17.7 9.5 24 9.5z" opacity=".9" />
            <path fill="#fff" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" opacity=".9" />
            <path fill="#fff" d="M10.4 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.8-6.1z" opacity=".9" />
            <path fill="#fff" d="M24 48c6.1 0 11.3-2 15.1-5.5l-7.6-5.9c-2.1 1.4-4.7 2.3-7.5 2.3-6.3 0-11.7-3.8-13.6-9.2l-7.8 6.1C6.5 42.6 14.6 48 24 48z" opacity=".9" />
          </svg>
          Continue with Google
        </button>

        <div className="my-6 flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-[var(--hairline)]" />
          or with email
          <span className="h-px flex-1 bg-[var(--hairline)]" />
        </div>

        <form onSubmit={withPassword} className="flex flex-col gap-3">
          {mode === "signup" && (
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          )}
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password (min 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="mt-1 h-12 rounded-xl bg-foreground text-[15px] font-bold text-white transition-colors hover:bg-foreground/80 disabled:opacity-50"
          >
            {mode === "signin" ? "Sign in" : "Sign up"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-muted">
          {mode === "signin" ? "No account yet?" : "Already have an account?"}{" "}
          <button
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
            }}
            className="font-bold text-card-active"
          >
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
