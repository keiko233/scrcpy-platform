# scrcpy-platform

A cross-platform desktop control plane for Android devices, built on
[scrcpy](https://github.com/Genymobile/scrcpy) and [ya-webadb](https://github.com/yume-chan/ya-webadb).

Manage multiple devices over USB or wireless ADB, mirror any device display
into its own window, drive automation flows against the screen, and run
everything in the background from the system tray.

## Features

- **Device manager** — connect USB / wireless devices, pair over the network,
  and keep per-device sessions alive in the background
- **Screen streaming** — scrcpy-powered mirroring with audio, per-window
  workspaces, virtual displays, and touch / key / button injection
- **Automation flows** — visual flow editor with click / swipe / OCR / delay /
  condition / loop / sub-flow blocks, run state and structured logs, OCR in
  English and Chinese
- **Script library** — reusable scripts with version history and restore
- **Scoped scrcpy settings** — global defaults with per-device and per-screen
  overrides
- **System tray** — close-to-background with a guaranteed quit path when
  scripts are still running
- **i18n** — English and Simplified Chinese

## Tech stack

Electron · React 19 · TypeScript · electron-vite · TanStack Router / Query /
Form · Tailwind CSS 4 · ya-webadb (@yume-chan/adb + scrcpy) · Tesseract.js ·
paraglide-js (inlang) · Vitest · Oxlint

## Development

Prerequisites: Node.js >= 22, pnpm 11.

```bash
pnpm install        # postinstall fetches the scrcpy server binary
pnpm dev            # launch the Electron app in dev mode
```

| Script | What it does |
| --- | --- |
| `pnpm dev` | Run the app with hot reload |
| `pnpm build` | Build main / preload / renderer into `out/` |
| `pnpm test` | Run the Vitest suite |
| `pnpm typecheck` | Type-check app, node and electron projects |
| `pnpm lint` | Oxlint |
| `pnpm icons` | Regenerate favicon, app icon and tray icons from the Iconify glyph |
| `pnpm dist` | Build and package installers for the host platform |

## CI / releases

GitHub Actions drives both checks and releases:

- **`ci.yml`** — on every push to `main` and on pull requests: install with a
  frozen lockfile, then test, typecheck, lint and build on Ubuntu.
- **`release.yml`** — manual `workflow_dispatch` release with a
  `major / minor / patch` option. The version is derived from the latest
  `vX.Y.Z` tag (starting from `0.0.0`), written back to `package.json`, tagged
  and pushed to `main`. macOS (arm64, dmg) and Windows (nsis) installers are
  built on their native runners and attached to a GitHub Release together with
  a changelog generated from conventional commits.

Artifacts are unsigned; macOS users need to right-click open on first launch.

## License

Not yet specified.
