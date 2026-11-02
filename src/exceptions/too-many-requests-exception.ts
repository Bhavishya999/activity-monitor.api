import { BaseException } from "./base-exception.js";

export class TooManyRequestsException extends BaseException {
  constructor(message: string) {
    super(429, message);
  }
}
