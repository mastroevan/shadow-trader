import { SpanStatusCode, trace } from '@opentelemetry/api';

export const tracer = trace.getTracer('shadow-trader');

export async function traceAgentCall<T extends { traceId?: string }>(
  operationName: string,
  input: Record<string, unknown>,
  fn: () => Promise<T>
): Promise<{ result: T; traceId: string }> {
  return tracer.startActiveSpan(operationName, async (span) => {
    try {
      const result = await fn();
      const traceId = result.traceId ?? span.spanContext().traceId;

      span.setAttributes({
        'shadow_trader.operation': operationName,
        'shadow_trader.symbol': (input.symbol as string) ?? 'unknown',
        'shadow_trader.agent_service': 'python-adk',
        'arize.trace_id': traceId,
      });

      span.setStatus({ code: SpanStatusCode.OK });
      span.end();

      return { result, traceId };
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : 'Unknown error',
      });

      span.end();
      throw err;
    }
  });
}