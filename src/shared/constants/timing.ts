/**
 * Shared timing constants (milliseconds unless noted).
 */

export const Timing = {
  /** Screen session polling interval */
  SCREEN_POLL_MS: 1000,
  /** Device session polling interval */
  DEVICE_SESSION_POLL_MS: 2000,
  /** Installed apps staleTime */
  INSTALLED_APPS_STALE_MS: 60_000,
  /** Installed apps gcTime */
  INSTALLED_APPS_GC_MS: 5 * 60_000,
  /** Device session dispose timeout */
  DEVICE_SESSION_DISPOSE_TIMEOUT_MS: 4000,
  /** Timeout waiting for scrcpy to report virtual display id */
  SCRCPY_DISPLAY_REPORT_TIMEOUT_MS: 1500,
  /** Grace period when closing scrcpy streams */
  STREAM_CLOSE_GRACE_MS: 500,
  /** Poll step while waiting for video size */
  VIDEO_SIZE_POLL_STEP_MS: 10,
  /** Max attempts for video size (300 * 10ms = 3s) */
  VIDEO_SIZE_WAIT_ATTEMPTS: 300,
  /** Poll interval for newly added virtual display */
  VIRTUAL_DISPLAY_POLL_MS: 100,
  /** Max attempts for virtual display stabilization (50 * 100ms = 5s) */
  VIRTUAL_DISPLAY_WAIT_ATTEMPTS: 50,
  /** Required consecutive stable observations */
  VIRTUAL_DISPLAY_STABLE_COUNT: 3,
  /** SQLite busy timeout */
  SQLITE_BUSY_TIMEOUT_MS: 5000,
  /** Audio frame timestamp step (microseconds) at 48kHz */
  FRAME_TIMESTAMP_STEP_US: 20_000,
  /** OCR defaults */
  OCR_DEFAULT_TIMEOUT_MS: 5_000,
  OCR_DEFAULT_INTERVAL_MS: 500,
  /** OCR bounds */
  OCR_MAX_TIMEOUT_MS: 300_000,
  OCR_MIN_INTERVAL_MS: 100,
  OCR_MAX_INTERVAL_MS: 10_000,
} as const;
