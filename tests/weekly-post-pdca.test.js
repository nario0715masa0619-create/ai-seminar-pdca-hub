const test = require("node:test");
const assert = require("node:assert/strict");
const {
  LP_URL_PLACEHOLDER,
  buildPostText,
  classifyWeek,
  generateLpSuggestions,
  generateWeeklyReport,
} = require("../scripts/weekly-post-pdca");

test("buildPostText includes the axis hook, bullets, benefit line, and LP URL placeholder", () => {
  const text = buildPostText("A");
  assert.match(text, /AIの必要性はわかっているのに/);
  assert.match(text, /・自社の業務のどこにAIを使うべきかが整理できる/);
  assert.match(text, /60分で、自社にとっての「初手の判断軸」を整理できる無料セミナーです。/);
  assert.match(text, /詳細・お申込みはこちら▼ \{\{LP_URL\}\}$/);
});

test("buildPostText fits within the ~280-300 character X ad limit", () => {
  assert.ok([...buildPostText("A")].length <= 300);
  assert.ok([...buildPostText("B")].length <= 300);
});

test("buildPostText uses a custom lpUrl when provided", () => {
  const text = buildPostText("B", { lpUrl: "https://example.com/lp" });
  assert.match(text, /詳細・お申込みはこちら▼ https:\/\/example\.com\/lp$/);
  assert.doesNotMatch(text, new RegExp(LP_URL_PLACEHOLDER.replace(/[{}]/g, "\\$&")));
});

test("buildPostText appends a tweak suffix to the hook when provided (keep-status minor wording change)", () => {
  const text = buildPostText("A", { tweak: "（今なら個別相談も無料）" });
  assert.match(text, /止まっていませんか？（今なら個別相談も無料）/);
});

test("buildPostText throws for an unknown axis", () => {
  assert.throws(() => buildPostText("C"), /Unknown axis/);
});

test("classifyWeek returns baseline when prev_ctr/prev_signups are missing", () => {
  const result = classifyWeek({ week: "w1", ctr: 0.015, signups: 12 });
  assert.equal(result.status, "baseline");
});

test("classifyWeek returns baseline when prev_ctr/prev_signups are explicitly null", () => {
  const result = classifyWeek({ ctr: 0.015, signups: 12, prev_ctr: null, prev_signups: null });
  assert.equal(result.status, "baseline");
});

test("classifyWeek returns keep when both signups and ctr are maintained or improved", () => {
  const result = classifyWeek({ ctr: 0.02, signups: 15, prev_ctr: 0.015, prev_signups: 12 });
  assert.equal(result.status, "keep");
});

test("classifyWeek returns replace_post when signups hold but ctr worsens", () => {
  const result = classifyWeek({ ctr: 0.01, signups: 15, prev_ctr: 0.015, prev_signups: 12 });
  assert.equal(result.status, "replace_post");
});

test("classifyWeek returns improve_lp when ctr holds but signups drop", () => {
  const result = classifyWeek({ ctr: 0.02, signups: 8, prev_ctr: 0.015, prev_signups: 12 });
  assert.equal(result.status, "improve_lp");
});

test("classifyWeek returns replace_post_and_improve_lp when both worsen", () => {
  const result = classifyWeek({ ctr: 0.01, signups: 8, prev_ctr: 0.015, prev_signups: 12 });
  assert.equal(result.status, "replace_post_and_improve_lp");
});

test("classifyWeek treats equal values (no change) as maintained, not worsened", () => {
  const result = classifyWeek({ ctr: 0.015, signups: 12, prev_ctr: 0.015, prev_signups: 12 });
  assert.equal(result.status, "keep");
});

test("generateLpSuggestions returns exactly 3 items covering heading/intro/benefit order", () => {
  const suggestions = generateLpSuggestions();
  assert.equal(suggestions.length, 3);
  assert.match(suggestions[0], /見出し/);
  assert.match(suggestions[1], /導入文/);
  assert.match(suggestions[2], /ベネフィット/);
});

test("generateWeeklyReport returns baseline with both post variants and no lp_suggestions", () => {
  const report = generateWeeklyReport({ week: "2026-07-13週", ctr: 0.015, signups: 12 });
  assert.equal(report.week, "2026-07-13週");
  assert.equal(report.status, "baseline");
  assert.ok(report.next_post_A);
  assert.ok(report.next_post_B);
  assert.deepEqual(report.lp_suggestions, []);
});

test("generateWeeklyReport for keep status returns tweaked posts and no lp_suggestions", () => {
  const report = generateWeeklyReport({
    week: "2026-07-20週",
    ctr: 0.02,
    signups: 15,
    prev_ctr: 0.015,
    prev_signups: 12,
  });
  assert.equal(report.status, "keep");
  assert.ok(report.next_post_A);
  assert.ok(report.next_post_B);
  assert.deepEqual(report.lp_suggestions, []);
});

test("generateWeeklyReport for replace_post status returns fresh A/B posts and no lp_suggestions", () => {
  const report = generateWeeklyReport({
    week: "2026-07-20週",
    ctr: 0.01,
    signups: 15,
    prev_ctr: 0.015,
    prev_signups: 12,
  });
  assert.equal(report.status, "replace_post");
  assert.ok(report.next_post_A);
  assert.ok(report.next_post_B);
  assert.deepEqual(report.lp_suggestions, []);
});

test("generateWeeklyReport for improve_lp status returns null posts and populated lp_suggestions", () => {
  const report = generateWeeklyReport({
    week: "2026-07-20週",
    ctr: 0.02,
    signups: 8,
    prev_ctr: 0.015,
    prev_signups: 12,
  });
  assert.equal(report.status, "improve_lp");
  assert.equal(report.next_post_A, null);
  assert.equal(report.next_post_B, null);
  assert.equal(report.lp_suggestions.length, 3);
});

test("generateWeeklyReport for replace_post_and_improve_lp returns both posts and lp_suggestions", () => {
  const report = generateWeeklyReport({
    week: "2026-07-20週",
    ctr: 0.01,
    signups: 8,
    prev_ctr: 0.015,
    prev_signups: 12,
  });
  assert.equal(report.status, "replace_post_and_improve_lp");
  assert.ok(report.next_post_A);
  assert.ok(report.next_post_B);
  assert.equal(report.lp_suggestions.length, 3);
});

test("generateWeeklyReport always includes all schema keys", () => {
  const report = generateWeeklyReport({ week: "w1", ctr: 0.01, signups: 1 });
  assert.deepEqual(Object.keys(report).sort(), [
    "lp_suggestions",
    "next_post_A",
    "next_post_B",
    "reason",
    "status",
    "week",
  ]);
});
