// Structured logging (Production Engineering — Observability). Emits single-line
// JSON to stdout/stderr, which Netlify captures as function logs and any real
// log aggregator (Datadog, Better Stack, etc.) can ingest without a code change
// on this end — swapping in a hosted log sink is a transport change, not a
// logging-call rewrite. No external service integrated here (that would need
// credentials this project doesn't have); this is the local half of that story.
type LogLevel = "info" | "warn" | "error";

interface LogFields {
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, fields?: LogFields) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...fields,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, fields?: LogFields) => emit("info", message, fields),
  warn: (message: string, fields?: LogFields) => emit("warn", message, fields),
  error: (message: string, fields?: LogFields) => emit("error", message, fields),
};
