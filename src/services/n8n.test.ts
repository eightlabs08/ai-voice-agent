// ---------------------------------------------------------------------------
// Tests: src/services/n8n.ts
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { EndOfCallReport } from "../utils/types.js";

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// We need different env setups per test, so we use a factory pattern.
// The env module is mocked at the module level and we swap values per test.
const mockEnv: { N8N_WEBHOOK_URL?: string } = {
  N8N_WEBHOOK_URL: "https://n8n.example.com/webhook/test-hook",
};

vi.mock("../config/env.js", () => ({
  get env() {
    return mockEnv;
  },
}));

// Mock the global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Import after mocks
const { triggerPostCallWorkflow } = await import("./n8n.js");

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const baseReport: EndOfCallReport = {
  summary: "Caller booked a cleaning appointment.",
  transcript: "Hello - I need to schedule a cleaning...",
  durationSeconds: 90,
  callerPhone: "+15551234567",
  costUsd: 0.0045,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("triggerPostCallWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.N8N_WEBHOOK_URL = "https://n8n.example.com/webhook/test-hook";
  });

  // -------------------------------------------------------------------------
  // No-op when URL not configured
  // -------------------------------------------------------------------------

  it("does nothing when N8N_WEBHOOK_URL is not configured", async () => {
    mockEnv.N8N_WEBHOOK_URL = undefined;

    await triggerPostCallWorkflow(baseReport);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it("sends a POST request to the n8n webhook URL", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    await triggerPostCallWorkflow(baseReport);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://n8n.example.com/webhook/test-hook");
    expect(options.method).toBe("POST");
  });

  it("sends Content-Type: application/json header", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await triggerPostCallWorkflow(baseReport);

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers["Content-Type"]).toBe("application/json");
  });

  it("includes the event type as call_ended", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await triggerPostCallWorkflow(baseReport);

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.event).toBe("call_ended");
  });

  it("includes a timestamp in the request body", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await triggerPostCallWorkflow(baseReport);

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.timestamp).toBeDefined();
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it("forwards summary from the report", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await triggerPostCallWorkflow(baseReport);

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.summary).toBe("Caller booked a cleaning appointment.");
  });

  it("forwards transcript from the report", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await triggerPostCallWorkflow(baseReport);

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.transcript).toBe("Hello - I need to schedule a cleaning...");
  });

  it("forwards durationSeconds from the report", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await triggerPostCallWorkflow(baseReport);

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.durationSeconds).toBe(90);
  });

  it("forwards callerPhone from the report", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await triggerPostCallWorkflow(baseReport);

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.callerPhone).toBe("+15551234567");
  });

  it("uses 'unknown' when callerPhone is absent", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    const reportNoPhone: EndOfCallReport = { ...baseReport, callerPhone: undefined };
    await triggerPostCallWorkflow(reportNoPhone);

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.callerPhone).toBe("unknown");
  });

  it("forwards costUsd from the report", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await triggerPostCallWorkflow(baseReport);

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.costUsd).toBe(0.0045);
  });

  it("uses 0 for costUsd when it is absent", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    const reportNoCost: EndOfCallReport = { ...baseReport, costUsd: undefined };
    await triggerPostCallWorkflow(reportNoCost);

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.costUsd).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Non-OK response from n8n
  // -------------------------------------------------------------------------

  it("does not throw when n8n returns a non-OK status", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue("Internal Server Error"),
    });

    await expect(triggerPostCallWorkflow(baseReport)).resolves.toBeUndefined();
  });

  it("logs an error when n8n returns a non-OK status", async () => {
    const { logger } = await import("../utils/logger.js");
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      text: vi.fn().mockResolvedValue("Service Unavailable"),
    });

    await triggerPostCallWorkflow(baseReport);

    expect(logger.error).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Network errors
  // -------------------------------------------------------------------------

  it("does not throw when fetch itself throws (network error)", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(triggerPostCallWorkflow(baseReport)).resolves.toBeUndefined();
  });

  it("logs an error when fetch throws", async () => {
    const { logger } = await import("../utils/logger.js");
    mockFetch.mockRejectedValue(new Error("DNS resolution failed"));

    await triggerPostCallWorkflow(baseReport);

    expect(logger.error).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  it("handles a report with empty transcript and summary", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    const minReport: EndOfCallReport = {
      summary: "",
      transcript: "",
      durationSeconds: 0,
    };

    await expect(triggerPostCallWorkflow(minReport)).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("returns undefined on success", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    const result = await triggerPostCallWorkflow(baseReport);

    expect(result).toBeUndefined();
  });
});
