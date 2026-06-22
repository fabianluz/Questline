"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // Same-origin: works on any dev port AND inside the desktop app, where the
  // bundled server runs on a random localhost port. A hardcoded URL here made
  // "Create account" hang in the packaged .app (the request went to the wrong
  // port). On the server (no `window`) we fall back to the env/default.
  baseURL:
    typeof window !== "undefined"
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
});

export const { signIn, signOut, signUp, useSession } = authClient;
