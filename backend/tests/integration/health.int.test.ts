import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET } from "@backend/controllers/health.controller";

describe("GET /api/health", () => {
  it("reports the database as up", async () => {
    const res = await GET(new NextRequest("http://localhost/api/health"), {});
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", database: "up" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
