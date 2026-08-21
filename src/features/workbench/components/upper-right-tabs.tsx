import { useNavigate } from "@tanstack/react-router";
import { UnplugIcon } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsPanel, TabsTrigger } from "@/components/ui/tabs";

import { DebugSettingsTab } from "../debug/debug-tab";
import { BlockInspectorTab } from "../inspector/block-inspector";
import { useWorkbench } from "../use-workbench";

export function UpperRightTabs() {
  const { devices, flow } = useWorkbench();
  const { session, sessionLoaded, disconnecting, disconnect } = devices;
  const navigate = useNavigate();

  const state = session?.state ?? "disconnected";

  useEffect(() => {
    if (!sessionLoaded) {
      return;
    }
    if (state === "disconnected" || state === "error") {
      void navigate({ to: "/pair" });
    }
  }, [sessionLoaded, state, navigate]);

  const handleDisconnect = () => {
    if (flow.dirty) {
      const discard = window.confirm(
        "Disconnect the device? Unsaved changes will be discarded.",
      );
      if (!discard) {
        return;
      }
    }
    void disconnect();
  };

  return (
    <Tabs defaultValue="debug" className="h-full min-h-0 gap-0">
      <TabsList className="h-8 w-full shrink-0 justify-start">
        <TabsTrigger value="debug">Debug</TabsTrigger>
        <TabsTrigger value="block">Block</TabsTrigger>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          className="ml-0.5 shrink-0"
          disabled={disconnecting || state !== "connected"}
          loading={disconnecting}
          onClick={handleDisconnect}
          aria-label="Disconnect device"
        >
          <UnplugIcon />
          Disconnect
        </Button>
      </TabsList>

      <TabsPanel value="debug" className="min-h-0 flex-1">
        <DebugSettingsTab />
      </TabsPanel>
      <TabsPanel value="block" className="min-h-0 flex-1">
        <BlockInspectorTab />
      </TabsPanel>
    </Tabs>
  );
}
