import type { Response } from "supertest";

export type TypedResponse<T> = Omit<Response, "body"> & { body: T };

export function typedResponse<T>(response: Response): TypedResponse<T> {
  return response;
}
