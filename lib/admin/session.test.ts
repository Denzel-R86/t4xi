import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createOpsSession, hasValidOpsSession } from "@/lib/admin/session";

const originalPassword = process.env.OPS_DASHBOARD_PASSWORD;
afterEach(() => {
  if (originalPassword === undefined) delete process.env.OPS_DASHBOARD_PASSWORD;
  else process.env.OPS_DASHBOARD_PASSWORD = originalPassword;
});

test("operationssessie is ondertekend, tijdelijk geldig en niet te vervalsen", async () => {
  process.env.OPS_DASHBOARD_PASSWORD = "test-secret";
  const now = Date.UTC(2026, 7, 8, 14, 0, 0);
  const token = await createOpsSession(now);
  assert.ok(token);
  const request = new Request("https://t4xi.nl/api/admin/invoices", {
    headers: { cookie: `t4xi_ops_session=${token}` },
  });
  assert.equal(await hasValidOpsSession(request, now + 1000), true);
  assert.equal(await hasValidOpsSession(request, now + 13 * 60 * 60 * 1000), false);
  const forged = new Request(request.url, { headers: { cookie: `t4xi_ops_session=${token}x` } });
  assert.equal(await hasValidOpsSession(forged, now + 1000), false);
});
