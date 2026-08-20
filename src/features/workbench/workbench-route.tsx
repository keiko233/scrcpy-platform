import { Group, Panel, Separator } from "react-resizable-panels";

import { UpperRightTabs } from "./components/upper-right-tabs";
import { WorkbenchToolbar } from "./components/workbench-toolbar";
import { DeviceMonitor } from "./monitor/device-monitor";
import { FlowEditorPanel } from "./editor/flow-editor";
import { ScriptBrowser } from "./library/script-browser";
import { WorkbenchProvider } from "./workbench-context";

export function WorkbenchRoute() {
  return (
    <WorkbenchProvider>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
        {/* <WorkbenchToolbar /> */}
        <div className="min-h-0 flex-1">
          <Group orientation="vertical" className="h-full w-full">
            <Panel id="top" defaultSize="42" minSize={200}>
              <Group orientation="horizontal" className="h-full">
                <Panel id="monitor" defaultSize="64" minSize={320}>
                  <DeviceMonitor />
                </Panel>

                <Separator />

                <Panel id="upper-right" defaultSize="36" minSize={300}>
                  <UpperRightTabs />
                </Panel>
              </Group>
            </Panel>

            <Separator />

            <Panel id="bottom" defaultSize="58" minSize={240}>
              <Group orientation="horizontal" className="h-full">
                <Panel id="browser" defaultSize="24" minSize={240}>
                  <ScriptBrowser />
                </Panel>
                <Separator />
                <Panel id="editor" defaultSize="76" minSize={420}>
                  <FlowEditorPanel />
                </Panel>
              </Group>
            </Panel>
          </Group>
        </div>
      </div>
    </WorkbenchProvider>
  );
}
