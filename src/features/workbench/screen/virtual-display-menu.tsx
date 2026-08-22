import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { PlusIcon, SmartphoneIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxPopup,
  ComboboxPrimitive,
  ComboboxStatus,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import {
  Menu,
  MenuPopup,
  MenuTrigger,
} from "@/components/ui/menu";
import { ScrollArea } from "@/components/ui/scroll-area";

import { CreateVirtualDisplayInputSchema } from "@/shared/screen-contracts";

import { useInstalledApps } from "@/hooks/query/use-installed-apps";
import { useWorkbench } from "../use-workbench";
import { m } from "@/paraglide/messages.js";

type VirtualDisplayFormValues = {
  width: string;
  height: string;
  dpi: string;
  packageName: string;
};

const DEFAULT_VIRTUAL_DISPLAY_VALUES: VirtualDisplayFormValues = {
  width: "1280",
  height: "720",
  dpi: "320",
  packageName: "",
};

export function VirtualDisplayMenu({ connected }: { connected: boolean }) {
  const { devices, screens } = useWorkbench();
  const [open, setOpen] = useState(false);
  const [showSystemApps, setShowSystemApps] = useState(false);
  const appsQuery = useInstalledApps(open && connected, devices.session?.sessionId ?? null);
  const allApps = appsQuery.data ?? [];
  const apps = showSystemApps ? allApps : allApps.filter((app) => !app.system);
  const form = useForm({
    defaultValues: DEFAULT_VIRTUAL_DISPLAY_VALUES,
    onSubmit: async ({ value }) => {
      const result = CreateVirtualDisplayInputSchema.safeParse({
        width: Number.parseInt(value.width, 10),
        height: Number.parseInt(value.height, 10),
        dpi: Number.parseInt(value.dpi, 10),
        packageName: value.packageName.trim() || undefined,
      });
      if (!result.success) {
        return;
      }
      await screens.createVirtualDisplay(result.data);
      setOpen(false);
    },
  });

  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger render={<Button size="icon" variant="secondary" />}>
        <PlusIcon />
      </MenuTrigger>

      <MenuPopup align="start" className="w-64 p-2">
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <div className="flex items-center gap-2 text-xs font-medium">
            <PlusIcon className="size-3.5" />
            {m.virtual_display_title()}
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <form.Field name="width">
              {(field) => (
                <label className="grid gap-1 text-[10px] text-muted-foreground">
                  {m.virtual_display_width()}
                  <Input
                    nativeInput
                    max={7680}
                    min={320}
                    onChange={(event) => field.handleChange(event.target.value)}
                    size="sm"
                    type="number"
                    value={field.state.value}
                  />
                </label>
              )}
            </form.Field>
            <form.Field name="height">
              {(field) => (
                <label className="grid gap-1 text-[10px] text-muted-foreground">
                  {m.virtual_display_height()}
                  <Input
                    nativeInput
                    max={7680}
                    min={320}
                    onChange={(event) => field.handleChange(event.target.value)}
                    size="sm"
                    type="number"
                    value={field.state.value}
                  />
                </label>
              )}
            </form.Field>
            <form.Field name="dpi">
              {(field) => (
                <label className="grid gap-1 text-[10px] text-muted-foreground">
                  {m.virtual_display_dpi()}
                  <Input
                    nativeInput
                    max={960}
                    min={72}
                    onChange={(event) => field.handleChange(event.target.value)}
                    size="sm"
                    type="number"
                    value={field.state.value}
                  />
                </label>
              )}
            </form.Field>
          </div>

          <form.Field name="packageName">
            {(field) => {
              const selectedApp = allApps.find((app) => app.packageName === field.state.value) ?? null;
              const query = field.state.value.trim().toLowerCase();
              const visibleApps = apps.filter(
                (app) =>
                  query.length === 0 ||
                  app.name.toLowerCase().includes(query) ||
                  app.packageName.toLowerCase().includes(query),
              );
              return (
                <div className="grid gap-1">
                  <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                    <span>{m.virtual_display_app_package()}</span>
                    <label className="flex items-center gap-1.5">
                      <Checkbox
                        checked={showSystemApps}
                        onCheckedChange={(checked) => setShowSystemApps(checked === true)}
                      />
                      {m.virtual_display_show_system_apps()}
                    </label>
                  </div>
                  <Combobox
                    autoComplete="none"
                    inputValue={field.state.value}
                    itemToStringLabel={(app) => app.name}
                    itemToStringValue={(app) => app.packageName}
                    items={visibleApps}
                    onInputValueChange={(value) => field.handleChange(value)}
                    onValueChange={(app) => field.handleChange(app?.packageName ?? "")}
                    value={selectedApp}
                  >
                    <ComboboxInput
                      placeholder={
                        appsQuery.isPending
                          ? m.virtual_display_placeholder_loading()
                          : m.virtual_display_placeholder_default()
                      }
                      showClear
                      size="sm"
                    />
                    <ComboboxPopup className="w-72">
                      <ComboboxStatus>
                        {appsQuery.isPending
                          ? m.virtual_display_loading_apps()
                          : apps.length === 0 && !showSystemApps && allApps.length > 0
                            ? m.virtual_display_no_user_apps()
                            : m.virtual_display_apps_count({ count: apps.length })}
                      </ComboboxStatus>
                      <ScrollArea className="max-h-64" overscrollContain scrollFade scrollbarGutter>
                        <ComboboxPrimitive.List className="not-empty:px-1 not-empty:py-1">
                          {visibleApps.length === 0 && (
                            <ComboboxEmpty>{m.virtual_display_no_apps()}</ComboboxEmpty>
                          )}
                          {visibleApps.map((item) => (
                            <ComboboxItem key={item.packageName} value={item}>
                              <div className="flex min-w-0 items-center gap-2">
                                {item.iconUrl !== null ? (
                                  <img
                                    alt=""
                                    className="size-5 rounded-md object-cover"
                                    src={item.iconUrl}
                                  />
                                ) : (
                                  <SmartphoneIcon className="size-4 text-muted-foreground" />
                                )}
                                <span className="min-w-0">
                                  <span className="block truncate text-xs font-medium">
                                    {item.name}
                                  </span>
                                  <span className="block truncate text-[10px] text-muted-foreground">
                                    {item.packageName}
                                  </span>
                                </span>
                                {item.system && (
                                  <Badge size="sm" variant="outline">
                                    {m.virtual_display_system()}
                                  </Badge>
                                )}
                              </div>
                            </ComboboxItem>
                          ))}
                        </ComboboxPrimitive.List>
                      </ScrollArea>
                    </ComboboxPopup>
                  </Combobox>
                </div>
              );
            }}
          </form.Field>

          <div>
            <Button
              className="flex-1"
              disabled={!connected || screens.screen?.ownedVirtualDisplayId !== null}
              loading={screens.busy}
              size="xs"
              type="submit"
            >
              {m.virtual_display_create_and_open()}
            </Button>
          </div>
        </form>
      </MenuPopup>
    </Menu>
  );
}
