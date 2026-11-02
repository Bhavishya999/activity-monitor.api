import { BaseException } from "./base-exception.js";

export class UnauthorizedException extends BaseException {
  constructor(message: string) {
    super(401, message);
  }
}
