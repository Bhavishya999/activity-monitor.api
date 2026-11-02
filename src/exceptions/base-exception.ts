import type { ContentfulStatusCode } from "hono/utils/http-status";

export class BaseException extends Error {
  readonly status: ContentfulStatusCode;

  constructor(status: ContentfulStatusCode, message: string) {
    super(message);
    this.name = new.target.name;
    this.status = status;
  }
}
