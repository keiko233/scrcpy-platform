import { Group, Panel, Separator } from "react-resizable-panels";

import { DeviceMonitor } from "./monitor/device-monitor";
import { FlowEditorPanel } from "./editor/flow-editor";
import { ScriptBrowser } from "./library/script-browser";

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
            <FlowEditorPanel />
          </Panel>
        </Group>
      </div>
    </div>
  );
}
