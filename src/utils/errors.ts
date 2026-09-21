export class CollectorBlockedError extends Error {
  constructor(public readonly reason: string) {
    super(`Collector blocked: ${reason}`);
    this.name = 'CollectorBlockedError';
  }
}

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
