/**
 * App-level constants: schemes, file paths, UI defaults.
 */

export const AppConstants = {
  /** Custom file protocol for renderer -> disk files */
  FILE_SCHEME: "scrcpy-platform-file",
  /** Window event for transferring scrcpy video MessagePort */
  SCREEN_VIDEO_WINDOW_EVENT: "scrcpy-platform:screen-video-port",
} as const;

export const FilePath = {
  /** Scrcpy server jar path on device */
  SCRCPY_SERVER: "/data/local/tmp/scrcpy-platform-scrcpy-server.jar",
  /** APK entries */
  ANDROID_RESOURCES_ARSC: "resources.arsc",
  ANDROID_MANIFEST: "AndroidManifest.xml",
  /** Persistence files under app.getPath("userData") */
  DB_FILE: "scrcpy-platform.sqlite3",
  LOG_FILE: "scrcpy-platform.log",
  /** App metadata cache file under userData */
  APP_CACHE_FILE: "installed-apps-cache.json",
  OCR_LANGUAGES_DIR: "ocr-languages",
} as const;

export const MediaConstants = {
  /** Scrcpy captures 48kHz stereo PCM before encoding */
  AUDIO_SAMPLE_RATE: 48_000,
  AUDIO_CHANNELS: 2,
  /** Fallback icon density (mdpi) */
  DEFAULT_ICON_DENSITY: 160,
  /** PNG file signature bytes */
  PNG_SIGNATURE: [137, 80, 78, 71, 13, 10, 26, 10] as const,
} as const;

export const AdbConstants = {
  DEFAULT_HOST: "localhost",
  DEFAULT_PORT: 5037,
  /** Error codes indicating ADB server is unreachable */
  UNAVAILABLE_CODES: [
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
    "EHOSTUNREACH",
    "EADDRNOTAVAIL",
  ] as const,
} as const;

export const UiConstants = {
  /** Group container padding */
  GROUP_PADDING: 28,
  GROUP_DEFAULT_WIDTH: 320,
  GROUP_DEFAULT_HEIGHT: 220,
  /** Default paste offset when no origin is given */
  PASTE_OFFSET_X: 40,
  PASTE_OFFSET_Y: 40,
  /** Package picker virtual list */
  PACKAGE_LIST_HEIGHT: 224,
  PACKAGE_ROW_ESTIMATE: 52,
  PACKAGE_ROW_OVERSCAN: 10,
  /** Separator for composite data/edge keys */
  KEY_SEPARATOR: "\u0000",
} as const;

/** Initial draft version for new scripts */
export const INITIAL_DRAFT_VERSION = 1 as const;
