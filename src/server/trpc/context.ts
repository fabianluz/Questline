import "server-only";
import { headers } from "next/headers";
import { auth } from "@/server/auth";
import { db } from "@/server/db";

export async function createContext() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return { db, session };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
