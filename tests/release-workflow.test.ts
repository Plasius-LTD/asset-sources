import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/cd.yml"),
  "utf8",
);

describe("first-publication release boundary", () => {
  it("keeps the bootstrap explicit, one-time, and separate from normal OIDC", () => {
    expect(workflow).toContain("bootstrap_first_publish:");
    expect(workflow).toContain('PACKAGE_VERSION}" != "0.1.0"');
    expect(workflow).toContain('npm view "${PACKAGE_NAME}" name');
    expect(workflow).toContain("secrets.NPM_BOOTSTRAP_TOKEN");
    expect(workflow).toContain("trap cleanup EXIT");
    expect(workflow).toContain("--ignore-scripts --userconfig");
    expect(workflow).toContain(
      "inputs.bootstrap_first_publish != true",
    );
    expect(workflow).toContain("Publish package through npm OIDC");
    expect(workflow).not.toMatch(/NODE_AUTH_TOKEN|\bNPM_TOKEN\b/u);
  });
});
