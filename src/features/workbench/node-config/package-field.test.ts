import { describe, expect, it } from "vitest";

import { FLOW_NODE_DATA_PORTS } from "../../../shared/project-contracts";

import { BLOCK_DEFINITIONS } from "../blocks";

describe("launch-app package field", () => {
  const launchApp = BLOCK_DEFINITIONS["launch-app"];
  const fields = Object.fromEntries(
    launchApp.fields.map((field) => [field.name, field]),
  );

  it("declares packageName as a package picker field", () => {
    const packageField = fields.packageName;
    expect(packageField?.kind).toBe("package");
    if (packageField?.kind === "package") {
      expect(packageField.label).toBe("Package");
      expect(packageField.placeholder).toBe("com.example.app");
    }
  });

  it("keeps activity as a plain text field", () => {
    expect(fields.activity?.kind).toBe("text");
    expect(fields.activity?.label).toBe("Activity");
  });

  it("maps the packageName and activity data inputs to editable fields", () => {
    const fieldNames = new Set(launchApp.fields.map((field) => field.name));
    for (const input of FLOW_NODE_DATA_PORTS["launch-app"].inputs) {
      expect(fieldNames.has(input.field ?? input.id)).toBe(true);
    }
  });
});
