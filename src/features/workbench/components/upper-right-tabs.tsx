import { Tabs, TabsList, TabsPanel, TabsTrigger } from "@/components/ui/tabs";

import { DebugSettingsTab } from "../debug/debug-tab";
import { DeviceConnectionPanel } from "../device/device-connection";
import { BlockInspectorTab } from "../inspector/block-inspector";
import { useWorkbench } from "../use-workbench";

export function UpperRightTabs() {
  const { devices } = useWorkbench();

  return (
    <Tabs defaultValue="device" className="h-full min-h-0 gap-0">
      <TabsList className="h-8 w-full shrink-0 justify-start rounded-none border-b bg-muted/40 px-1.5">
        <TabsTrigger value="device">Device</TabsTrigger>
        <TabsTrigger value="debug">Debug</TabsTrigger>
        <TabsTrigger value="block">Block</TabsTrigger>
      </TabsList>
      <TabsPanel value="device" className="min-h-0 flex-1">
        <DeviceConnectionPanel manager={devices} />
      </TabsPanel>
      <TabsPanel value="debug" className="min-h-0 flex-1">
        <DebugSettingsTab />
      </TabsPanel>
      <TabsPanel value="block" className="min-h-0 flex-1">
        <BlockInspectorTab />
      </TabsPanel>
    </Tabs>
  );
}
