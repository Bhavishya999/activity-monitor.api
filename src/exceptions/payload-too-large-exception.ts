import { BaseException } from "./base-exception.js";

export class PayloadTooLargeException extends BaseException {
  constructor(message: string) {
    super(413, message);
  }
}
