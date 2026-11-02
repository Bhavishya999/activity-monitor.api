import { BaseException } from "./base-exception.js";

export class ForbiddenException extends BaseException {
  constructor(message: string) {
    super(403, message);
  }
}
