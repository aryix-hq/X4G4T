import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getRotatedElasticsearchIndex,
  getExternalLogStatus,
  exportLogToExternalServices
} from "../src/log-exporter.js";

describe("Elasticsearch Daily Log Rotation", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("generates a daily rotated index using YYYY.MM.DD format", () => {
    const testDate = new Date(Date.UTC(2026, 8, 19)); // 2026-09-19
    const rotated = getRotatedElasticsearchIndex("x4g4t-logs", "daily", testDate);
    expect(rotated).toBe("x4g4t-logs-2026.09.19");
  });

  it("handles month rollover and leap years accurately in UTC", () => {
    // Leap year Feb 29
    const leapDate = new Date(Date.UTC(2028, 1, 29)); // 2028-02-29
    expect(getRotatedElasticsearchIndex("security-audit", "daily", leapDate)).toBe(
      "security-audit-2028.02.29"
    );

    // New year Jan 1
    const newYearDate = new Date(Date.UTC(2027, 0, 1)); // 2027-01-01
    expect(getRotatedElasticsearchIndex("audit", "daily", newYearDate)).toBe(
      "audit-2027.01.01"
    );
  });

  it("returns base index when rotation is set to 'none'", () => {
    const testDate = new Date(Date.UTC(2026, 8, 19));
    const unrotated = getRotatedElasticsearchIndex("x4g4t-logs", "none", testDate);
    expect(unrotated).toBe("x4g4t-logs");
  });

  it("reads ELASTICSEARCH_INDEX_ROTATION environment variable in getExternalLogStatus", () => {
    process.env.ELASTICSEARCH_URL = "http://localhost:9200";
    process.env.ELASTICSEARCH_INDEX = "custom-logs";
    process.env.ELASTICSEARCH_INDEX_ROTATION = "daily";

    const status = getExternalLogStatus();
    expect(status.elasticsearch.configured).toBe(true);
    expect(status.elasticsearch.baseIndex).toBe("custom-logs");
    expect(status.elasticsearch.rotation).toBe("daily");
    expect(status.elasticsearch.currentIndex).toMatch(/^custom-logs-\d{4}\.\d{2}\.\d{2}$/);

    process.env.ELASTICSEARCH_INDEX_ROTATION = "none";
    const statusNone = getExternalLogStatus();
    expect(statusNone.elasticsearch.currentIndex).toBe("custom-logs");
  });
});

