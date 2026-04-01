export interface Logger {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export function createLogger(baseFields: Record<string, unknown> = {}): Logger {
  const write = (level: "info" | "warn" | "error", message: string, fields?: Record<string, unknown>) => {
    console[level](
      JSON.stringify({
        level,
        message,
        ...baseFields,
        ...(fields ?? {}),
        timestamp: new Date().toISOString(),
      }),
    );
  };

  return {
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    error: (message, fields) => write("error", message, fields),
  };
}
