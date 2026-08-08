import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { hasValidOpsCredentials, isAuthorizedAdminRequest } from "@/lib/admin/basic-auth";
import { createOpsSession } from "@/lib/admin/session";

const originalUser = process.env.OPS_DASHBOARD_USERNAME;
const originalPassword = process.env.OPS_DASHBOARD_PASSWORD;

afterEach(() => {
  if (originalUser === undefined) delete process.env.OPS_DASHBOARD_USERNAME;
  else process.env.OPS_DASHBOARD_USERNAME = originalUser;
  if (originalPassword === undefined) delete process.env.OPS_DASHBOARD_PASSWORD;
  else process.env.OPS_DASHBOARD_PASSWORD = originalPassword;
});

test("operationscredentials worden server-side en exact gecontroleerd", () => {
  process.env.OPS_DASHBOARD_USERNAME = "operations";
  process.env.OPS_DASHBOARD_PASSWORD = "sterk-wachtwoord";
  assert.equal(hasValidOpsCredentials("operations", "sterk-wachtwoord"), true);
  assert.equal(hasValidOpsCredentials("Operations", "sterk-wachtwoord"), false);
  assert.equal(hasValidOpsCredentials("operations", "fout"), false);
});

test("admin-API accepteert alleen een geldige sessie, geen gecachte Basic Auth", async () => {
  process.env.OPS_DASHBOARD_USERNAME = "operations";
  process.env.OPS_DASHBOARD_PASSWORD = "sterk-wachtwoord";
  const basic = Buffer.from("operations:sterk-wachtwoord").toString("base64");
  const basicRequest = new Request("https://t4xi.nl/api/admin/invoices", {
    headers: { authorization: `Basic ${basic}` },
  });
  assert.equal(await isAuthorizedAdminRequest(basicRequest), false);

  const token = await createOpsSession();
  assert.ok(token);
  const sessionRequest = new Request("https://t4xi.nl/api/admin/invoices", {
    headers: { cookie: `t4xi_ops_session=${token}` },
  });
  assert.equal(await isAuthorizedAdminRequest(sessionRequest), true);
});
