export type ErrorBody = { error: string; requestId?: string };

export function errorBody(message: string, requestId?: string): ErrorBody {
  return requestId === undefined ? { error: message } : { error: message, requestId };
}
