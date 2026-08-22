import { m } from "@/paraglide/messages.js";

/**
 * Block title. Shows the custom `name` when set, otherwise falls back to the
 * localized block type label. Double-click opens the config popover.
 */
export function BlockTitle({
  name,
  fallback,
  onDoubleClick,
}: {
  name: string;
  fallback: string;
  onDoubleClick?: () => void;
}) {
  return (
    <div
      className="nodrag cursor-pointer truncate text-xs font-medium leading-4"
      title={m.block_node_configure_hint()}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onDoubleClick?.();
      }}
    >
      {name.length > 0 ? name : fallback}
    </div>
  );
}

export function customNodeName(name: unknown): string {
  return typeof name === "string" ? name.trim() : "";
}