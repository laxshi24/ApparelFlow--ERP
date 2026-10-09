/** Minimal structured logger: one JSON line per event, safe for Vercel log drains. Never log secrets or passwords. */
type Level = "debug" | "info" | "warn" | "error";

function write(level: Level, message: string, context?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test" && level !== "error") return;
  const line = JSON.stringify({ level, message, time: new Date().toISOString(), ...context });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) return { errorName: err.name, errorMessage: err.message, stack: err.stack };
  return { error: String(err) };
}

export const logger = {
  debug: (m: string, c?: Record<string, unknown>) => write("debug", m, c),
  info: (m: string, c?: Record<string, unknown>) => write("info", m, c),
  warn: (m: string, c?: Record<string, unknown>) => write("warn", m, c),
  error: (m: string, c?: Record<string, unknown>) => write("error", m, c),
};
