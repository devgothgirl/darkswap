export class RelayError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
