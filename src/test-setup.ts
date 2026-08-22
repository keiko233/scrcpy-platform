import { vi } from "vitest";

vi.mock("@/paraglide/messages.js", () => ({
  m: new Proxy(
    {},
    {
      get(_target, prop) {
        return (args?: Record<string, unknown>) => {
          if (typeof prop !== "string") return "";
          // Handle summarize waitFor with param
          if (prop === "block_summarize_wait_for" && args?.text !== undefined) {
            return `wait for: ${String(args.text)}`;
          }
          // For other summarize fallbacks, return a placeholder
          if (prop.startsWith("block_summarize_")) {
            if (prop === "block_summarize_unset") return "(unset)";
            if (prop === "block_summarize_name_fallback") return "(name)";
            if (prop === "block_summarize_condition_unset") return "(condition unset)";
            if (prop === "block_summarize_index_fallback") return "index";
            if (prop === "block_summarize_unknown") return "Unknown block";
            return "(unset)";
          }
          // For block labels, return a readable fallback based on prop
          // e.g. block_start_label -> Start
          if (prop.startsWith("block_")) {
            const part = prop.replace("block_", "").replace(/_/g, " ");
            // Capitalize first letter for readability, but tests don't check label values
            return part;
          }
          if (prop.startsWith("data_type_")) {
            const map: Record<string, string> = {
              data_type_any: "Any",
              data_type_string: "String",
              data_type_number: "Number",
              data_type_boolean: "Boolean",
              data_type_screen_region: "ScreenRegion",
              data_type_flow: "Flow",
            };
            return map[prop] ?? String(prop);
          }
          if (prop.startsWith("port_")) {
            // Return last part capitalized
            const last = prop.split("_").pop() ?? prop;
            return last.charAt(0).toUpperCase() + last.slice(1);
          }
          if (prop.startsWith("workspace_")) return prop.split("_").pop() ?? "";
          if (prop.startsWith("run_state_")) return prop.split("_").pop() ?? "";
          if (prop === "script_browser_checkpoint_fallback") return "Checkpoint";
          // Default: return prop as string for other keys
          return String(prop);
        };
      },
    },
  ),
}));

vi.mock("@/paraglide/runtime.js", () => ({
  setLocale: () => {},
  getLocale: () => "en",
  baseLocale: "en",
  locales: ["en", "zh-cn"],
}));
