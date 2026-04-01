import { AppError } from "@domain/errors";

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export function text(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return json(
      {
        code: error.code,
        message: error.expose ? error.message : "Внутренняя ошибка",
        metadata: error.expose ? error.metadata : undefined,
      },
      error.status,
    );
  }

  return json(
    {
      code: "INTERNAL_ERROR",
      message: "Внутренняя ошибка",
    },
    500,
  );
}
