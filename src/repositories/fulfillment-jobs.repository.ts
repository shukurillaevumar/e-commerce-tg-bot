import type { FulfillmentResultType, FulfillmentStatus, FulfillmentStrategy } from "@domain/enums";
import type { FulfillmentJob } from "@domain/models";
import type { D1Runner } from "@infra/db";
import { createId } from "@infra/ids";
import { decodeJson, encodeJson } from "@repositories/helpers";

interface FulfillmentJobRow extends Omit<FulfillmentJob, "resultPayload"> {
  resultPayload: string | null;
}

const FULFILLMENT_JOB_SELECT = `SELECT
  id,
  order_id AS orderId,
  product_variant_id AS productVariantId,
  strategy,
  status,
  attempt,
  max_attempts AS maxAttempts,
  priority,
  scheduled_at AS scheduledAt,
  last_error_code AS lastErrorCode,
  last_error_message AS lastErrorMessage,
  result_type AS resultType,
  result_payload AS resultPayload,
  result_masked_text AS resultMaskedText,
  assigned_admin_id AS assignedAdminId,
  created_at AS createdAt,
  updated_at AS updatedAt,
  completed_at AS completedAt
FROM fulfillment_jobs`;

function mapJob(row: FulfillmentJobRow | null): FulfillmentJob | null {
  if (!row) {
    return null;
  }
  return {
    ...row,
    resultPayload: decodeJson<Record<string, unknown> | null>(row.resultPayload, null),
  };
}

export class FulfillmentJobsRepository {
  constructor(private readonly db: D1Runner) {}

  async create(input: {
    orderId: string;
    productVariantId: string;
    strategy: FulfillmentStrategy;
    priority: "normal" | "high";
    scheduledAt: string;
    now: string;
  }): Promise<FulfillmentJob> {
    const id = createId("fjob");
    await this.db.run(
      `INSERT INTO fulfillment_jobs (
        id, order_id, product_variant_id, strategy, status, attempt, max_attempts, priority, scheduled_at,
        last_error_code, last_error_message, result_type, result_payload, result_masked_text,
        assigned_admin_id, created_at, updated_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.orderId, input.productVariantId, input.strategy, "pending", 0, 3, input.priority, input.scheduledAt, null, null, null, null, null, null, input.now, input.now, null],
    );
    return (await this.findById(id)) as FulfillmentJob;
  }

  async findById(jobId: string): Promise<FulfillmentJob | null> {
    const row = await this.db.first<FulfillmentJobRow>(`${FULFILLMENT_JOB_SELECT} WHERE id = ?`, [jobId]);
    return mapJob(row);
  }

  async findByOrderId(orderId: string): Promise<FulfillmentJob | null> {
    const row = await this.db.first<FulfillmentJobRow>(
      `${FULFILLMENT_JOB_SELECT} WHERE order_id = ? ORDER BY created_at DESC LIMIT 1`,
      [orderId],
    );
    return mapJob(row);
  }

  async listRunnable(now: string, limit = 25): Promise<FulfillmentJob[]> {
    const rows = await this.db.all<FulfillmentJobRow>(
      `${FULFILLMENT_JOB_SELECT}
       WHERE status IN ('pending', 'retryable') AND scheduled_at <= ?
       ORDER BY priority DESC, scheduled_at ASC
       LIMIT ?`,
      [now, limit],
    );
    return rows.map((row) => mapJob(row) as FulfillmentJob);
  }

  async markProcessing(jobId: string, attempt: number, now: string): Promise<void> {
    await this.db.run(
      "UPDATE fulfillment_jobs SET status = 'processing', attempt = ?, updated_at = ? WHERE id = ?",
      [attempt, now, jobId],
    );
  }

  async markSucceeded(
    jobId: string,
    resultType: FulfillmentResultType,
    resultPayload: Record<string, unknown>,
    resultMaskedText: string | null,
    now: string,
  ): Promise<void> {
    await this.db.run(
      `UPDATE fulfillment_jobs
       SET status = 'succeeded', result_type = ?, result_payload = ?, result_masked_text = ?, completed_at = ?, updated_at = ?
       WHERE id = ?`,
      [resultType, encodeJson(resultPayload), resultMaskedText, now, now, jobId],
    );
  }

  async markRetryable(jobId: string, code: string, message: string, scheduledAt: string, now: string): Promise<void> {
    await this.db.run(
      `UPDATE fulfillment_jobs
       SET status = 'retryable', last_error_code = ?, last_error_message = ?, scheduled_at = ?, updated_at = ?
       WHERE id = ?`,
      [code, message, scheduledAt, now, jobId],
    );
  }

  async markManualReview(jobId: string, code: string, message: string, now: string): Promise<void> {
    await this.db.run(
      `UPDATE fulfillment_jobs
       SET status = 'manual_review', last_error_code = ?, last_error_message = ?, updated_at = ?
       WHERE id = ?`,
      [code, message, now, jobId],
    );
  }

  async updateStatus(jobId: string, status: FulfillmentStatus, now: string): Promise<void> {
    await this.db.run("UPDATE fulfillment_jobs SET status = ?, updated_at = ? WHERE id = ?", [status, now, jobId]);
  }
}
