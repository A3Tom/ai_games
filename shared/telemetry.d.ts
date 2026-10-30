export type TelemetryContext = Record<string, string | number | boolean | null>

export const telemetry: {
  debug(event: string, message: string, context?: TelemetryContext): void
  info(event: string, message: string, context?: TelemetryContext): void
  warn(event: string, message: string, context?: TelemetryContext): void
  error(event: string, message: string, context?: TelemetryContext): void
  captureError(event: string, error: unknown, context?: TelemetryContext): void
}

export function initializeTelemetry(appId: string | null): void
