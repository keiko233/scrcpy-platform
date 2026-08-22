/**
 * Shared numeric limits and thresholds.
 * Values are grouped by domain and documented with units / bounds.
 */

// Expression parser guards
export const ExpressionLimits = {
  /** Max characters for a single expression */
  MAX_LENGTH: 4096,
  /** Max tokens after tokenization */
  MAX_TOKENS: 512,
  /** Max nesting depth for parentheses / calls */
  MAX_DEPTH: 64,
} as const;

// Logging
export const LogLimits = {
  /** Max size of a single log file before rotation (10 MiB) */
  MAX_FILE_BYTES: 10 * 1024 * 1024,
  /** Default number of entries returned by Logger.list() */
  DEFAULT_LIST_LIMIT: 500,
  /** Hard clamp for list limit */
  MIN_LIST_LIMIT: 1,
  MAX_LIST_LIMIT: 2000,
  /** Frontend ring buffer size */
  MAX_FRONTEND_LOGS: 500,
} as const;

// Scrcpy / media constraints
export const ScrcpyLimits = {
  MaxSizeMin: 256,
  MaxSizeMax: 7680,
  MaxFpsMin: 1,
  MaxFpsMax: 240,
  VideoBitRateMin: 1_000_000,
  VideoBitRateMax: 100_000_000,
  VideoBitRateDefault: 20_000_000,
  AudioBitRateMin: 16_000,
  AudioBitRateMax: 1_000_000,
  AudioBitRateDefault: 128_000,
  DefaultMaxFps: 60,
} as const;

export const VirtualDisplayLimits = {
  WidthMin: 320,
  WidthMax: 7680,
  HeightMin: 320,
  HeightMax: 7680,
  DpiMin: 72,
  DpiMax: 960,
} as const;

export const VirtualDisplayDefaults = {
  Width: 1280,
  Height: 720,
  Dpi: 320,
} as const;

// Project / script validation
export const ProjectLimits = {
  ProjectNameMin: 1,
  ProjectNameMax: 200,
  ScriptNameMin: 1,
  ScriptNameMax: 500,
  ScriptPathMin: 1,
  ScriptPathMax: 2000,
  RevisionMessageMax: 500,
} as const;

// Flow execution guards
export const FlowExecutionLimits = {
  /** Hard cap to prevent infinite loops */
  MAX_ITERATIONS_HARD: 100_000,
  /** Default maxIterations for for/while blocks */
  MAX_ITERATIONS_DEFAULT: 1000,
} as const;

// Dynamic ports (a-z)
export const DynamicPortLimits = {
  CalculateMin: 1,
  CalculateMax: 26,
  MergeMin: 2,
  MergeMax: 26,
} as const;

// OCR
export const OcrLimits = {
  /** Single screencap PNG size cap (64 MiB) */
  MAX_PNG_BYTES: 64 * 1024 * 1024,
} as const;
