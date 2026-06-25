import type { ClientConfig } from '../types/config';

export interface ConfigUsagePayload {
  [key: string]: unknown;
}

export function trackAppOpen() {
  // Telemetry intentionally disabled in the sanitized refactor baseline.
}

export function trackPageView(_page: string) {
  // Telemetry intentionally disabled in the sanitized refactor baseline.
}

export function trackConfigUsage(_payload: ConfigUsagePayload = {}, _config?: ClientConfig | null) {
  // Telemetry intentionally disabled in the sanitized refactor baseline.
}

export function trackResourceClick(_resourceKey: string) {
  // Telemetry intentionally disabled in the sanitized refactor baseline.
}
