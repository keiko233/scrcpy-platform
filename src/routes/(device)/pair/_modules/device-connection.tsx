import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import {
  AlertTriangleIcon,
  PlugIcon,
  RefreshCwIcon,
  WifiIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";

import { useSafeLocalStorage } from "@/hooks/use-safe-local-storage";
import type { DeviceManager } from "@/features/workbench/device/use-devices";
import { m } from "@/paraglide/messages.js";
import { z } from "zod";

const WIRELESS_DRAFT_STORAGE_KEY = "android-platform:wireless-draft";
const WirelessDraftSchema = z.object({
  pairAddress: z.string().default(""),
  connectAddress: z.string().default(""),
}).default({ pairAddress: "", connectAddress: "" });

function deviceLabel(serial: string, state: string, model?: string): string {
  const extras = [model, state].filter(Boolean).join(" · ");
  return extras.length > 0 ? `${serial} (${extras})` : serial;
}

function WirelessConnectionPanel({ manager }: { manager: DeviceManager }) {
  const {
    wirelessBusy,
    pairWireless,
    connectWireless,
    disconnectWireless,
  } = manager;
  const [wirelessDraft, setWirelessDraft] = useSafeLocalStorage(
    WIRELESS_DRAFT_STORAGE_KEY,
    WirelessDraftSchema,
  );
  const [pairAddress, setPairAddress] = useState(wirelessDraft.pairAddress);
  const [pairCode, setPairCode] = useState("");
  const [connectAddress, setConnectAddress] = useState(wirelessDraft.connectAddress);

  return (
    <div className="flex flex-col gap-2 py-1">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <Input
          size="sm"
          nativeInput
          value={pairAddress}
          placeholder={m.pair_wireless_pair_address_placeholder()}
          aria-label={m.pair_wireless_pair_address()}
          onChange={(event) => {
            const value = event.target.value;
            setPairAddress(value);
            setWirelessDraft((current) => ({ ...current, pairAddress: value }));
          }}
        />
        <Input
          size="sm"
          nativeInput
          value={pairCode}
          inputMode="numeric"
          maxLength={6}
          placeholder={m.pair_wireless_pair_code_placeholder()}
          aria-label={m.pair_wireless_pair_code()}
          onChange={(event) => setPairCode(event.target.value.replace(/\D/g, ""))}
        />
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          disabled={wirelessBusy || pairAddress.trim().length === 0 || pairCode.length !== 6}
          loading={wirelessBusy}
          onClick={() => void pairWireless(pairAddress, pairCode)}
        >
          <WifiIcon />
          {m.pair_wireless_pair()}
        </Button>
      </div>

      <div className="text-[10px] text-muted-foreground">
        {m.pair_wireless_pair_description()}
      </div>

      <Input
        size="sm"
        nativeInput
        value={connectAddress}
        placeholder={m.pair_wireless_connect_address_placeholder()}
        aria-label={m.pair_wireless_connect_address()}
        onChange={(event) => {
          const value = event.target.value;
          setConnectAddress(value);
          setWirelessDraft((current) => ({ ...current, connectAddress: value }));
        }}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1"
          disabled={wirelessBusy || connectAddress.trim().length === 0}
          loading={wirelessBusy}
          onClick={() => void connectWireless(connectAddress)}
        >
          <PlugIcon />
          {m.pair_wireless_connect()}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={wirelessBusy || connectAddress.trim().length === 0}
          loading={wirelessBusy}
          onClick={() => void disconnectWireless(connectAddress)}
        >
          {m.pair_wireless_disconnect()}
        </Button>
      </div>
      <div className="text-[10px] text-muted-foreground">
        {m.pair_wireless_connect_description()}
      </div>
    </div>
  );
}

export function DeviceConnectionPanel({ manager }: { manager: DeviceManager }) {
  const {
    devices,
    selectedTransportId,
    loadingDevices,
    connecting,
    listError,
    sessionError,
    setSelectedTransportId,
    refresh,
    connect,
    clearError,
    clearSessionError,
  } = manager;

  const busy = connecting;
  const canConnect =
    selectedTransportId !== null && devices.some((device) => device.transportId === selectedTransportId);

  const currentDevice = devices.find((device) => device.transportId === selectedTransportId);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="text-xs font-medium">{m.pair_device_connection()}</span>
          <span className="truncate text-[10px] text-muted-foreground">
            {m.pair_device_connection_subtitle()}
          </span>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => void refresh()}
          loading={loadingDevices}
          aria-label={m.pair_refresh_aria()}
        >
          <RefreshCwIcon />
          <span>{m.pair_refresh()}</span>
        </Button>
      </div>

      {listError !== null && (
        <Alert variant="warning" className="gap-1.5 px-2.5 py-2 text-xs">
          <AlertTriangleIcon />
          <AlertTitle className="text-xs">{m.pair_device_list_unavailable()}</AlertTitle>
          <AlertDescription className="text-[11px]">{listError}</AlertDescription>
        </Alert>
      )}

      {sessionError !== null && (
        <Alert variant="warning" className="gap-1.5 px-2.5 py-2 text-xs">
          <AlertTriangleIcon />
          <AlertDescription className="text-[11px]">{sessionError}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="devices" className="min-h-0">
        <TabsList size="sm" className="w-full *:flex-1">
          <TabsTab value="devices">{m.pair_usb_devices()}</TabsTab>
          <TabsTab value="wireless">{m.pair_wireless_debugging()}</TabsTab>
        </TabsList>

        <TabsPanel value="devices" className="flex flex-col gap-2">
          <Select
            value={canConnect ? selectedTransportId : ""}
            onValueChange={(value) => {
              if (value !== null) {
                setSelectedTransportId(String(value));
              }
            }}
            disabled={devices.length === 0}
          >
            <SelectTrigger size="sm" className="min-w-0 flex-1">
              <SelectValue
                placeholder={devices.length === 0 ? m.pair_no_devices() : m.pair_select_device()}
              >
                {currentDevice && deviceLabel(currentDevice.serial, currentDevice.state, currentDevice.model)}
              </SelectValue>
            </SelectTrigger>

            <SelectContent className="max-h-56">
              {devices.map((device) => (
                <SelectItem key={device.transportId} value={device.transportId}>
                  {deviceLabel(device.serial, device.state, device.model)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="default"
              className="flex-1"
              disabled={!canConnect || busy}
              loading={connecting}
              onClick={() => void connect()}
            >
              <PlugIcon />
              {m.pair_connect()}
            </Button>
            {(listError !== null || sessionError !== null) && (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={m.pair_clear_status()}
                onClick={() => {
                  clearError();
                  clearSessionError();
                }}
              >
                <XIcon />
              </Button>
            )}
          </div>
        </TabsPanel>

        <TabsPanel value="wireless">
          <WirelessConnectionPanel manager={manager} />
        </TabsPanel>
      </Tabs>
    </div>
  );
}
