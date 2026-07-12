const test = require("node:test");
const assert = require("node:assert/strict");
const { validateAgentOutput } = require("../scripts/validate-agent-output");

test("validateAgentOutput accepts a valid acquisition output", () => {
  const result = validateAgentOutput("acquisition", {
    x_ads: [{ test_variable: "headline", hypothesis: "課題訴求の方が伸びる" }],
    lp: { test_variable: "hero", hypothesis: "課題提起型heroの方が伸びる" },
    next_test_recommendation: { target: "lp", variable: "hero", reason: "未検証のため" },
  });
  assert.deepEqual(result, { valid: true, errors: [] });
});

test("validateAgentOutput rejects acquisition output missing required fields", () => {
  const result = validateAgentOutput("acquisition", {
    x_ads: [{ test_variable: "headline" }],
    lp: {},
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("x_ads[0].hypothesis is required"));
  assert.ok(result.errors.includes("lp.test_variable is required"));
  assert.ok(result.errors.includes("lp.hypothesis is required"));
});

test("validateAgentOutput rejects acquisition output when x_ads is not an array", () => {
  const result = validateAgentOutput("acquisition", { x_ads: {}, lp: {} });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("x_ads must be an array"));
});

test("validateAgentOutput accepts a valid seminar-content output", () => {
  const result = validateAgentOutput("seminar-content", {
    talk: { outline: "intro -> problem -> solution" },
    slides: { outline: "cover -> agenda -> closing" },
  });
  assert.deepEqual(result, { valid: true, errors: [] });
});

test("validateAgentOutput rejects seminar-content output with empty outline", () => {
  const result = validateAgentOutput("seminar-content", {
    talk: { outline: "" },
    slides: { outline: "cover -> closing" },
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("talk.outline must be a non-empty string"));
});

test("validateAgentOutput accepts a valid diagnostics output", () => {
  const result = validateAgentOutput("diagnostics", {
    improvement_priorities: [{ priority: 1, template: "lp", reason: "申込率が低い" }],
  });
  assert.deepEqual(result, { valid: true, errors: [] });
});

test("validateAgentOutput rejects diagnostics output with an invalid template value", () => {
  const result = validateAgentOutput("diagnostics", {
    improvement_priorities: [{ priority: 1, template: "email_signature", reason: "?" }],
  });
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /template must be one of/);
});

test("validateAgentOutput accepts a valid follow-up output", () => {
  const result = validateAgentOutput("follow-up", {
    follow_up_scenarios: [{ segment: "attendee", trigger: "webinar_attended", test_variable: "subject" }],
  });
  assert.deepEqual(result, { valid: true, errors: [] });
});

test("validateAgentOutput rejects follow-up output missing scenario fields", () => {
  const result = validateAgentOutput("follow-up", {
    follow_up_scenarios: [{ segment: "attendee" }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("follow_up_scenarios[0].trigger is required"));
  assert.ok(result.errors.includes("follow_up_scenarios[0].test_variable is required"));
});

test("validateAgentOutput rejects a non-object output", () => {
  const result = validateAgentOutput("acquisition", null);
  assert.deepEqual(result, { valid: false, errors: ["output must be a JSON object"] });
});

test("validateAgentOutput throws for an unknown agentKey", () => {
  assert.throws(() => validateAgentOutput("unknown-agent", {}), /Unknown agentKey/);
});
