import { AppError } from "@domain/errors";

export interface D1Runner {
  first<T>(sql: string, bindings?: unknown[]): Promise<T | null>;
  all<T>(sql: string, bindings?: unknown[]): Promise<T[]>;
  run(sql: string, bindings?: unknown[]): Promise<D1Result>;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

export class CloudflareD1Runner implements D1Runner {
  constructor(private readonly db: D1Database) {}

  async first<T>(sql: string, bindings: unknown[] = []): Promise<T | null> {
    const result = await this.db.prepare(sql).bind(...bindings).first<T>();
    return result ?? null;
  }

  async all<T>(sql: string, bindings: unknown[] = []): Promise<T[]> {
    const result = await this.db.prepare(sql).bind(...bindings).all<T>();
    if (!result.success) {
      throw new AppError("DB_QUERY_FAILED", "Ошибка запроса к базе данных");
    }
    return result.results;
  }

  async run(sql: string, bindings: unknown[] = []): Promise<D1Result> {
    return this.db.prepare(sql).bind(...bindings).run();
  }

  async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    return this.db.batch(statements);
  }
}
