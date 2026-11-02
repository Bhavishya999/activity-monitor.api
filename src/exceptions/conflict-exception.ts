import { BaseException } from "./base-exception.js";

export class ConflictException extends BaseException {
  constructor(message: string) {
    super(409, message);
  }
}
