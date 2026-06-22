"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const { error } = await authClient.signUp.email({ name, email, password });
    setPending(false);
    if (error) {
      setError(error.message ?? "Could not create account.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div>
      <header className="border-b border-trails-trim/30 pb-3">
        <h1 className="!m-0 !border-0 !p-0 flex items-center gap-2 font-display text-lg uppercase tracking-widest text-trails-accent">
          <UserPlus className="h-4 w-4" />
          Create account
        </h1>
        <p className="mt-1 text-sm text-trails-fg-dim">
          Three quick fields and you're off to the Skill Tree.
        </p>
      </header>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block">
          <span className="block font-display text-[10px] uppercase tracking-widest text-trails-accent">
            Name
          </span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            className="mt-1 block w-full rounded-md px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="block font-display text-[10px] uppercase tracking-widest text-trails-accent">
            Email
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="mt-1 block w-full rounded-md px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="block font-display text-[10px] uppercase tracking-widest text-trails-accent">
            Password
          </span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className="mt-1 block w-full rounded-md px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-[10px] text-trails-fg-dim">
            At least 8 characters. Stored locally with bcrypt.
          </span>
        </label>
        {error && (
          <p className="rounded-md border border-trails-bad/60 bg-trails-bad/10 p-2 text-sm text-trails-bad">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Creating..." : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-trails-fg-dim">
        Already have an account?{" "}
        <Link
          href="/sign-in"
          className="font-medium text-trails-accent underline hover:text-trails-accent-bright"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
