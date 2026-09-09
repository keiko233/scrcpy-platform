import { Group, Panel, Separator } from "react-resizable-panels";
import { z } from "zod";

import { DeviceMonitor } from "@/features/workbench/monitor/device-monitor";
import { FlowEditorPanel } from "@/features/workbench/editor/flow-editor";
import { RunPanel } from "@/features/workbench/debug/run-panel";
import { ScriptBrowser } from "@/features/workbench/library/script-browser";
import { useSafeLocalStorage } from "@/hooks/use-safe-local-storage";

const LAYOUT_STORAGE_KEY = "scrcpy-platform:workbench-layout";

const layoutsSchema = z
  .object({
    "top-bottom": z.record(z.string(), z.number()),
    "monitor-files": z.record(z.string(), z.number()),
    "editor-run": z.record(z.string(), z.number()),
  })
  .default({
    "top-bottom": { top: 42, bottom: 58 },
    "monitor-files": { monitor: 64, files: 36 },
    "editor-run": { editor: 68, run: 32 },
  });

export function WorkbenchScreen() {
  const [layouts, setLayouts] = useSafeLocalStorage(
    LAYOUT_STORAGE_KEY,
    layoutsSchema,
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <div className="min-h-0 flex-1">
        <Group
          orientation="vertical"
          className="h-full w-full"
          defaultLayout={layouts["top-bottom"]}
          onLayoutChanged={(layout) =>
            setLayouts((current) => ({ ...current, "top-bottom": layout }))
          }
        >
          <Panel id="top" defaultSize="42" minSize={200}>
            <Group
              orientation="horizontal"
              className="h-full"
              defaultLayout={layouts["monitor-files"]}
              onLayoutChanged={(layout) =>
                setLayouts((current) => ({
                  ...current,
                  "monitor-files": layout,
                }))
              }
            >
              <Panel id="monitor" defaultSize="64" minSize={320}>
                <DeviceMonitor />
              </Panel>

              <Separator />

              <Panel id="files" defaultSize="36" minSize={300}>
                <ScriptBrowser />
              </Panel>
            </Group>
          </Panel>

          <Separator />

          <Panel id="bottom" defaultSize="58" minSize={240}>
            <Group
              orientation="horizontal"
              className="h-full"
              defaultLayout={layouts["editor-run"]}
              onLayoutChanged={(layout) =>
                setLayouts((current) => ({
                  ...current,
                  "editor-run": layout,
                }))
              }
            >
              <Panel id="editor" defaultSize="68" minSize={320}>
                <FlowEditorPanel />
              </Panel>

              <Separator />

              <Panel id="run" defaultSize="32" minSize={280}>
                <RunPanel />
              </Panel>
            </Group>
          </Panel>
        </Group>
      </div>
    </div>
  );
}
