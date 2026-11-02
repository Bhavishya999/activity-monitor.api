import { BaseException } from "./base-exception.js";

export class BadRequestException extends BaseException {
  constructor(message: string) {
    super(400, message);
  }
}
