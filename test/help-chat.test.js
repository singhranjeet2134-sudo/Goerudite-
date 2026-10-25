const test = require("node:test");
const assert = require("node:assert/strict");
const { articles, answerArticle, findArticle, normalizeText, suggestionsForRole } = require("../backend/help-engine");

test("help articles have unique IDs and complete bilingual verified response fields", () => {
  assert.equal(new Set(articles.map(article => article.id)).size, articles.length);
  assert.ok(articles.length >= 20);
  for (const article of articles) {
    assert.ok(article.roles.length, `${article.id} roles`);
    assert.match(article.route, /^\/(dashboard|contact|catalog|forgot-password)$/);
    for (const field of ["title", "preconditions", "steps", "expected", "limitation", "escalation"]) {
      assert.equal(typeof article[field].en, field === "steps" ? "object" : "string", `${article.id}.${field}.en`);
      assert.equal(typeof article[field].hi, field === "steps" ? "object" : "string", `${article.id}.${field}.hi`);
    }
    assert.ok(article.questions.length, `${article.id} questions`);
    assert.ok(article.keywords.length, `${article.id} keywords`);
  }
});

test("deterministic matching supports English, Hindi, Hinglish, case, and normalized whitespace", () => {
  assert.equal(findArticle("How do I publish an RFQ?", "school").id, "school-rfq-publish");
  assert.equal(findArticle("rfq   publish nahi ho rahi", "school").id, "school-rfq-publish");
  assert.equal(findArticle("CSV upload error", "school").id, "school-requirements-import");
  assert.equal(findArticle("FORGOT PASSWORD", "public").id, "password-recovery");
  assert.equal(normalizeText("  RFQ\tPUBLISH   नहीं हो रही "), "rfq publish नहीं हो रही");
});

test("every knowledge article can be retrieved by its canonical question", () => {
  for (const article of articles) {
    const role = article.roles.find(value => value !== "public") || "public";
    assert.equal(findArticle(article.questions[0], role)?.id, article.id, article.id);
  }
});

test("answers and suggestions are localized and role-filtered using verified article data", () => {
  const schoolArticle = findArticle("school academic session board state medium student strength", "school");
  assert.equal(schoolArticle.id, "school-academics-students");
  assert.ok(Array.isArray(answerArticle(schoolArticle, "hi").steps));
  assert.match(answerArticle(schoolArticle, "hi").title, /Academic/);
  assert.ok(suggestionsForRole("school", "hi").length > 0);
  assert.equal(findArticle("school academic session board state medium student strength", "distributor"), null);
  assert.equal(findArticle("help me with this unusual question", "school"), null);
});

test("unavailable and privacy-related guidance is explicit", () => {
  const article = findArticle("repeat lists and global website language selector", "retailer");
  assert.equal(article.id, "unavailable-features");
  assert.match(article.limitation.en, /not implemented/i);
  assert.match(article.escalation.en, /Contact Support/);
});
