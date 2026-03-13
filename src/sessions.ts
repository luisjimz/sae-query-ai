import fs from "fs";
import path from "path";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages.mjs";

const SESSIONS_DIR = path.join(process.cwd(), "data", "sessions");

// Ensure directory exists on module load
fs.mkdirSync(SESSIONS_DIR, { recursive: true });

export interface Exchange {
  question: string;
  answer: string;
  sql: string;
  rowCount: number;
  results: Record<string, unknown>[];
  timestamp: number;
}

export interface SessionData {
  id: string;
  title: string;
  createdAt: number;
  lastActive: number;
  history: MessageParam[];
  exchanges: Exchange[];
}

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: number;
  lastActive: number;
  exchangeCount: number;
}

function sessionPath(id: string): string {
  const safeId = id.replace(/[^a-zA-Z0-9\-]/g, "");
  return path.join(SESSIONS_DIR, `${safeId}.json`);
}

export function listSessions(): SessionSummary[] {
  const files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".json"));
  const sessions: SessionSummary[] = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(SESSIONS_DIR, file), "utf-8");
      const data = JSON.parse(raw) as SessionData;
      sessions.push({
        id: data.id,
        title: data.title,
        createdAt: data.createdAt,
        lastActive: data.lastActive,
        exchangeCount: data.exchanges.length,
      });
    } catch {
      // skip corrupted files
    }
  }

  return sessions.sort((a, b) => b.lastActive - a.lastActive);
}

export function loadSession(id: string): SessionData | null {
  const filePath = sessionPath(id);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as SessionData;
  } catch {
    return null;
  }
}

export function saveSession(session: SessionData): void {
  fs.writeFileSync(
    sessionPath(session.id),
    JSON.stringify(session, null, 2),
    "utf-8"
  );
}

export function deleteSession(id: string): boolean {
  const filePath = sessionPath(id);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}

export function createSession(id: string): SessionData {
  const session: SessionData = {
    id,
    title: "Nueva conversación",
    createdAt: Date.now(),
    lastActive: Date.now(),
    history: [],
    exchanges: [],
  };
  saveSession(session);
  return session;
}
