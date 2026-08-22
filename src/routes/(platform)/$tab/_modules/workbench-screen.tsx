import { Group, Panel, Separator } from "react-resizable-panels";

import { DeviceMonitor } from "@/features/workbench/monitor/device-monitor";
import { FlowEditorPanel } from "@/features/workbench/editor/flow-editor";
import { RunPanel } from "@/features/workbench/debug/run-panel";
import { ScriptBrowser } from "@/features/workbench/library/script-browser";

export function WorkbenchScreen() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <div className="min-h-0 flex-1">
        <Group orientation="vertical" className="h-full w-full">
          <Panel id="top" defaultSize="42" minSize={200}>
            <Group orientation="horizontal" className="h-full">
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
            <Group orientation="horizontal" className="h-full">
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
