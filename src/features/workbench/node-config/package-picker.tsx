import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { SmartphoneIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxPopup,
  ComboboxPrimitive,
  ComboboxStatus,
} from "@/components/ui/combobox";
import type { JsonValue } from "@/shared/project-contracts";

import { useInstalledApps } from "../device/use-installed-apps";
import { useWorkbench } from "../use-workbench";
import { filterInstalledApps, findInstalledApp } from "./app-list";
import { m } from "@/paraglide/messages.js";

const LIST_HEIGHT = 224;
const ROW_ESTIMATE = 52;
const ROW_OVERSCAN = 10;

export function PackageField({
  value,
  onChange,
  placeholder,
  disabled,
  active,
}: {
  value: JsonValue | undefined;
  onChange: (value: JsonValue) => void;
  placeholder?: string;
  disabled?: boolean;
  active?: boolean;
}) {
  const { devices } = useWorkbench();
  const connected = devices.session?.state === "connected";
  const sessionId = devices.session?.sessionId ?? null;
  const appsQuery = useInstalledApps(active === true && connected, sessionId);
  const allApps = useMemo(() => appsQuery.data ?? [], [appsQuery.data]);
  const [query, setQuery] = useState(() => String(value ?? ""));
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const filteredApps = useMemo(
    () => filterInstalledApps(allApps, query),
    [allApps, query],
  );

  // TanStack Virtual intentionally returns mutable callbacks; this component
  // does not rely on React Compiler memoization.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    enabled: active === true && open,
    count: filteredApps.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: ROW_OVERSCAN,
  });

  const setListElement = useCallback(
    (element: HTMLDivElement | null) => {
      listRef.current = element;
      if (element !== null) {
        virtualizer.measure();
      }
    },
    [virtualizer],
  );

  const selectedApp = useMemo(
    () => findInstalledApp(allApps, String(value ?? "")),
    [allApps, value],
  );

  return (
    <Combobox
      virtualized
      items={allApps}
      filteredItems={filteredApps}
      open={open}
      onOpenChange={setOpen}
      inputValue={query}
      onInputValueChange={(input) => {
        setQuery(input);
        onChange(input);
      }}
      value={selectedApp}
      onValueChange={(app) => {
        const next = app?.packageName ?? "";
        setQuery(next);
        onChange(next);
      }}
      itemToStringLabel={(app) => app.name}
      itemToStringValue={(app) => app.packageName}
      isItemEqualToValue={(a, b) => a?.packageName === b?.packageName}
      onItemHighlighted={(app, { index, reason }) => {
        if (app === undefined || index < 0) {
          return;
        }
        const atBoundary = index === 0 || index === filteredApps.length - 1;
        if (reason === "none" || (reason === "keyboard" && atBoundary)) {
          queueMicrotask(() => {
            virtualizer.scrollToIndex(index, {
              align: index === filteredApps.length - 1 ? "start" : "end",
            });
          });
        }
      }}
      disabled={disabled}
    >
      <ComboboxInput
        autoComplete="none"
        placeholder={
          appsQuery.isPending ? m.package_picker_loading_apps() : placeholder ?? "com.example.app"
        }
        showClear
        size="sm"
        disabled={disabled}
      />
      <ComboboxPopup className="w-72">
        <ComboboxStatus>
          {appsQuery.isPending
            ? m.package_picker_loading_installed_apps()
            : appsQuery.isError
              ? m.package_picker_load_error()
              : m.package_picker_apps_count({ count: filteredApps.length })}
        </ComboboxStatus>
        {filteredApps.length === 0 && !appsQuery.isPending && (
          <ComboboxEmpty>{m.package_picker_no_apps()}</ComboboxEmpty>
        )}
        <ComboboxPrimitive.List className="max-w-full overflow-hidden p-0">
          <div
            ref={setListElement}
            role="presentation"
            className="overflow-x-hidden overflow-y-auto overscroll-contain scroll-py-1"
            style={{
              height: `min(${LIST_HEIGHT}px, ${virtualizer.getTotalSize()}px)`,
            }}
          >
              <div
              role="presentation"
              className="relative w-full max-w-full overflow-hidden"
              style={{ height: virtualizer.getTotalSize() }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const app = filteredApps[virtualRow.index];
                if (app === undefined) {
                  return null;
                }
                return (
                  <ComboboxItem
                    key={virtualRow.key}
                    index={virtualRow.index}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    value={app}
                    aria-setsize={filteredApps.length}
                    aria-posinset={virtualRow.index + 1}
                    style={
                      {
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: virtualRow.size,
                        transform: `translateY(${virtualRow.start}px)`,
                      } satisfies CSSProperties
                    }
                    className="min-w-0 max-w-full overflow-hidden"
                  >
                    <div className="flex min-w-0 max-w-full items-center gap-2 overflow-hidden">
                      {app.iconUrl !== null ? (
                        <img
                          alt=""
                          className="size-5 shrink-0 rounded-md object-cover"
                          src={app.iconUrl}
                        />
                      ) : (
                        <SmartphoneIcon className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1 overflow-hidden">
                        <span className="block truncate text-xs font-medium">
                          {app.name}
                        </span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {app.packageName}
                        </span>
                      </span>
                      {app.system && (
                        <Badge size="sm" variant="outline" className="shrink-0">
                          {m.package_picker_system()}
                        </Badge>
                      )}
                    </div>
                  </ComboboxItem>
                );
              })}
            </div>
          </div>
        </ComboboxPrimitive.List>
      </ComboboxPopup>
    </Combobox>
  );
}
