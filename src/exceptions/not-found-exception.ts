import { BaseException } from "./base-exception.js";

export class NotFoundException extends BaseException {
  constructor(message: string) {
    super(404, message);
  }
}
