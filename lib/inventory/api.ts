import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ParentAuthError } from "@/lib/firebase-admin";

export function apiError(error: unknown) {
  const status = error instanceof ParentAuthError ? 401 : error instanceof ZodError ? 400 : error instanceof Error && /does not exist|not found/i.test(error.message) ? 404 : error instanceof Error && /insufficient|negative|only |invalid/i.test(error.message) ? 409 : 500;
  return NextResponse.json({ error: error instanceof ZodError ? error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") : error instanceof Error ? error.message : "Inventory operation failed." }, { status });
}

export async function jsonBody(request: Request) { try { return await request.json() as unknown; } catch { throw new Error("Request body must be valid JSON."); } }
