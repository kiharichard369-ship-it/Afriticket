export interface Logger {
  info(event: string, data?: Record<string, unknown>): void;
  warn(event: string, data?: Record<string, unknown>): void;
  error(event: string, data?: Record<string, unknown>): void;
}

/**
 * Every line is a single JSON object so it's greppable/parseable in
 * `supabase functions logs` or wherever those logs end up shipped to.
 * requestId ties every line for one invocation together — generate one
 * per request in the Deno.serve wrapper and pass it through.
 */
export function createLogger(functionName: string, requestId: string): Logger {
  function write(level: "info" | "warn" | "error", event: string, data?: Record<string, unknown>) {
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      function: functionName,
      requestId,
      event,
      ...data,
    });
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }

  return {
    info: (event, data) => write("info", event, data),
    warn: (event, data) => write("warn", event, data),
    error: (event, data) => write("error", event, data),
  };
}

/** Used by default in tests so assertions don't have to deal with log noise. */
export const noopLogger: Logger = { info() {}, warn() {}, error() {} };
