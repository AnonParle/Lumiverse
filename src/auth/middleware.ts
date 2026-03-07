import type { Context, Next } from "hono";
import { auth } from "./index";

// Augment Hono's context variables
declare module "hono" {
  interface ContextVariableMap {
    session: {
      user: {
        id: string;
        name: string;
        email: string;
        role?: string | null;
        username?: string | null;
        [key: string]: any;
      };
      session: {
        id: string;
        userId: string;
        token: string;
        expiresAt: Date;
        [key: string]: any;
      };
    };
    userId: string;
  }
}

export async function requireAuth(c: Context, next: Next) {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("session", session);
  c.set("userId", session.user.id);

  return next();
}

export async function requireOwner(c: Context, next: Next) {
  const session = c.get("session");
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const role = session.user.role;
  if (role !== "owner" && role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

  return next();
}
