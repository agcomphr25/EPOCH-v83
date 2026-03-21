import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import fs from "fs";
import path from "path";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// Only scan these top-level directories
const ALLOWED_DIRS = ["client/src", "server/src", "server/replit_integrations", "shared"];

// Only include files with these extensions
const ALLOWED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".css",
  ".html",
  ".md",
]);

// Skip directories that appear inside allowed dirs
const SKIP_SUBDIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".cache",
  "coverage",
  "__pycache__",
]);

// Skip sensitive file patterns even within allowed dirs
const SENSITIVE_PATTERNS = [
  /\.env/i,
  /secret/i,
  /credentials/i,
  /private[-_.]?key/i,
  /\.pem$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /auth\.ts$/i,
  /middleware\/auth/i,
];

const MAX_FILE_SIZE_BYTES = 80 * 1024;
const MAX_TOTAL_CHARS = 120_000;

function isSensitiveFile(relPath: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => p.test(relPath));
}

function collectCodebaseFiles(rootDir: string): { filePath: string; content: string }[] {
  const results: { filePath: string; content: string }[] = [];

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (SKIP_SUBDIRS.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(rootDir, fullPath);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) continue;
        if (isSensitiveFile(relPath)) continue;

        let stat: fs.Stats;
        try {
          stat = fs.statSync(fullPath);
        } catch {
          continue;
        }
        if (stat.size > MAX_FILE_SIZE_BYTES) continue;

        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          results.push({ filePath: relPath, content });
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  for (const allowedDir of ALLOWED_DIRS) {
    const dirPath = path.join(rootDir, allowedDir);
    if (fs.existsSync(dirPath)) {
      walk(dirPath);
    }
  }

  return results;
}

function buildCodebaseContext(prompt: string): string {
  const rootDir = process.cwd();
  const files = collectCodebaseFiles(rootDir);

  const promptLower = prompt.toLowerCase();
  const keywords = promptLower
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 20);

  function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function relevanceScore(file: { filePath: string; content: string }): number {
    const pathLower = file.filePath.toLowerCase();
    const contentLower = file.content.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (pathLower.includes(kw)) score += 3;
      try {
        const count = (contentLower.match(new RegExp(escapeRegex(kw), "g")) || []).length;
        score += Math.min(count, 5);
      } catch {
        // ignore malformed patterns
      }
    }
    return score;
  }

  const scored = files
    .map((f) => ({ ...f, score: relevanceScore(f) }))
    .sort((a, b) => b.score - a.score);

  let context = "";
  let totalChars = 0;

  for (const file of scored) {
    const header = `\n\n--- FILE: ${file.filePath} ---\n`;
    const block = header + file.content;
    if (totalChars + block.length > MAX_TOTAL_CHARS) break;
    context += block;
    totalChars += block.length;
  }

  return context;
}

export function registerCodebaseChatRoutes(app: Express): void {
  app.post("/api/codebase-chat", async (req: Request, res: Response) => {
    return res.status(404).json({ error: "Not found" });
    // eslint-disable-next-line no-unreachable
    try {
      const { message, history, codebaseContext } = req.body as {
        message: string;
        history: { role: "user" | "assistant"; content: string }[];
        codebaseContext?: string;
      };

      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "message is required" });
      }

      // On the first message, build codebase context fresh.
      // On follow-up messages, accept the previously built context from the client
      // so we don't re-read the filesystem every turn and context stays consistent.
      const isFirstMessage = !history || history.length === 0;
      const resolvedContext = isFirstMessage
        ? buildCodebaseContext(message)
        : (codebaseContext ?? "");

      const systemContent = `You are an expert software engineer assistant with full access to this codebase. Answer questions accurately using the codebase context provided.\n\nCODEBASE CONTEXT (source: client/src, server/src, server/replit_integrations, shared):${resolvedContext}`;

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: systemContent },
        ...(history as OpenAI.Chat.ChatCompletionMessageParam[]),
        { role: "user", content: message },
      ];

      const completion = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages,
        max_completion_tokens: 4096,
      });

      const reply = completion.choices[0]?.message?.content || "";

      // Return the codebase context so the client can pass it back on subsequent turns
      res.json({ reply, codebaseContext: resolvedContext });
    } catch (error: any) {
      console.error("Error in codebase-chat:", error);
      res.status(500).json({ error: "Failed to get response from AI" });
    }
  });
}
