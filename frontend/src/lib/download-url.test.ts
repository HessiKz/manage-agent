import { describe, expect, it } from "vitest";

import {
  encodeWorkspaceApiPath,
  extractDownloadUrls,
  resolveDownloadUrl,
} from "@/lib/download-url";

describe("extractDownloadUrls", () => {
  it("captures workspace paths with spaces through .xlsx", () => {
    const agentId = "9dc9a7a6-145b-4eab-b923-79df0b366ce9";
    const path = `/api/v1/agents/${agentId}/workspace/karkard-bb39d8a7356048148ad7ade3321d821c_کارکرد توسعه کارآفرینی-2.1405-19166328-processed.xlsx`;
    const text = `لینک دانلود خروجی\n\n${path}\n`;
    const urls = extractDownloadUrls(text);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("19166328-processed.xlsx");
    expect(urls[0]).toContain("کارکرد توسعه کارآفرینی-2.1405");
  });

  it("encodes spaced workspace paths for fetch", () => {
    const agentId = "9dc9a7a6-145b-4eab-b923-79df0b366ce9";
    const url = encodeWorkspaceApiPath(agentId, "output/کارکرد تست.xlsx");
    expect(url).toContain("%");
    expect(url).not.toContain(" ");
  });
});
