// ---------------------------------------------------------------------------
// Tests: src/server/routes.ts
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../config/env.js", () => ({
  env: {
    VAPI_API_KEY: "vapi-test",
    ANTHROPIC_API_KEY: "sk-ant-test",
    OPENAI_API_KEY: "sk-openai-test",
    GOOGLE_CALENDAR_ID: "cal-id",
    GOOGLE_SERVICE_ACCOUNT_KEY: "base64==",
    PINECONE_API_KEY: "pc-test",
    PINECONE_INDEX_NAME: "ai-voice-agent",
    HUBSPOT_API_KEY: "hs-test",
    RESEND_API_KEY: "re_test",
    RESEND_FROM_EMAIL: "from@test.com",
    TWILIO_ACCOUNT_SID: "ACtest",
    TWILIO_AUTH_TOKEN: "auth-test",
    TWILIO_PHONE_NUMBER: "+15550000000",
    PORT: "3001",
  },
}));

vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("./webhooks.js", () => ({
  handleVapiWebhook: vi.fn(async (_req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }) => {
    res.status(200).json({ received: true });
  }),
}));

// Minimal mock of express Router
function makeRouterMock() {
  const routes: Array<{ method: string; path: string; handler: (...args: unknown[]) => unknown }> = [];

  const router = {
    get: (path: string, handler: (...args: unknown[]) => unknown) => {
      routes.push({ method: "GET", path, handler });
    },
    post: (path: string, handler: (...args: unknown[]) => unknown) => {
      routes.push({ method: "POST", path, handler });
    },
    use: (handler: (...args: unknown[]) => unknown) => {
      routes.push({ method: "USE", path: "*", handler });
    },
    _routes: routes,
  };
  return router;
}

vi.mock("express", () => {
  const routerInstance = makeRouterMock();
  return {
    Router: () => routerInstance,
    default: { Router: () => routerInstance },
  };
});

// Import after mocks - we use a manual test approach via the router
const mod = await import("./routes.js");

describe("routes", () => {
  it("exports a router", () => {
    expect(mod.router).toBeDefined();
  });

  it("registers a GET /health route", () => {
    const routerAny = mod.router as unknown as { _routes: Array<{ method: string; path: string }> };
    const healthRoute = routerAny._routes?.find(
      (r) => r.method === "GET" && r.path === "/health",
    );
    expect(healthRoute).toBeDefined();
  });

  it("health check returns ok status", async () => {
    const routerAny = mod.router as unknown as {
      _routes: Array<{ method: string; path: string; handler: (...args: unknown[]) => unknown }>;
    };
    const healthRoute = routerAny._routes?.find(
      (r) => r.method === "GET" && r.path === "/health",
    );

    if (!healthRoute) {
      // If the router mock doesn't capture routes this way, skip gracefully
      return;
    }

    const json = vi.fn();
    const statusFn = vi.fn().mockReturnValue({ json });
    const res = { status: statusFn };

    await healthRoute.handler({}, res);

    expect(statusFn).toHaveBeenCalledWith(200);
    const body = json.mock.calls[0][0] as { status: string; service: string };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("ai-voice-agent");
  });

  it("registers a POST /vapi/webhook route", () => {
    const routerAny = mod.router as unknown as {
      _routes: Array<{ method: string; path: string }>;
    };
    const webhookRoute = routerAny._routes?.find(
      (r) => r.method === "POST" && r.path === "/vapi/webhook",
    );
    expect(webhookRoute).toBeDefined();
  });

  it("registers a catch-all 404 handler", () => {
    const routerAny = mod.router as unknown as {
      _routes: Array<{ method: string; path: string }>;
    };
    const catchAll = routerAny._routes?.find((r) => r.method === "USE");
    expect(catchAll).toBeDefined();
  });

  it("catch-all handler returns 404 with error message", async () => {
    const routerAny = mod.router as unknown as {
      _routes: Array<{ method: string; path: string; handler: (...args: unknown[]) => unknown }>;
    };
    const catchAll = routerAny._routes?.find((r) => r.method === "USE");

    if (!catchAll) return;

    const json = vi.fn();
    const statusFn = vi.fn().mockReturnValue({ json });
    const req = { method: "GET", path: "/unknown-path" };
    const res = { status: statusFn };

    await catchAll.handler(req, res);

    expect(statusFn).toHaveBeenCalledWith(404);
    const body = json.mock.calls[0][0] as { error: string };
    expect(body.error).toContain("Not found");
  });
});
