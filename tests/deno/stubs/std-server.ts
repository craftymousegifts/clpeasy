// Captures the handler passed to std/http serve() instead of listening.
export function serve(handler: (req: Request) => Promise<Response>) {
  (globalThis as any).__handler = handler;
}
