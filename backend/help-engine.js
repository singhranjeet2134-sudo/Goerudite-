const { articles } = require("./help-knowledge");

const stopWords = new Set([
  "a", "an", "and", "are", "can", "do", "does", "for", "how", "i", "is", "it", "my", "of", "on", "the", "to", "what", "where", "why", "with",
  "hai", "hain", "ho", "ka", "kaise", "ki", "ko", "kya", "mein", "meri", "mera", "mujhe", "nahi", "se", "the", "ye", "kare", "karo",
  "है", "हैं", "का", "की", "के", "को", "में", "कैसे", "क्या", "मेरा", "मेरी", "नहीं", "और", "से", "करें"
]);

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokens(value) {
  return normalizeText(value).split(" ").filter(token => token.length > 1 && !stopWords.has(token));
}

function articleAllowed(article, role) {
  return article.roles.includes("public") || article.roles.includes(role);
}

function findArticle(question, role = "public") {
  const normalizedQuestion = normalizeText(question);
  const queryTokens = new Set(tokens(normalizedQuestion));
  if (!normalizedQuestion || !queryTokens.size) return null;
  const candidates = articles.filter(article => articleAllowed(article, role));
  const scored = candidates.map(article => {
    const aliases = [...article.questions, ...article.keywords, article.title.en, article.title.hi]
      .map(normalizeText)
      .filter(Boolean);
    let score = 0;
    for (const alias of aliases) {
      if (normalizedQuestion === alias) score = Math.max(score, 100);
      else if (normalizedQuestion.includes(alias) && alias.length > 5) score = Math.max(score, 80 + Math.min(alias.length / 100, 1));
      const aliasTokens = new Set(tokens(alias));
      const overlap = [...queryTokens].filter(token => aliasTokens.has(token)).length;
      if (overlap >= 2 && overlap / queryTokens.size >= 0.35) {
        const currentScore = overlap * 7 + overlap / queryTokens.size * 35;
        score = Math.max(score, currentScore);
      }
    }
    if (!article.roles.includes("public") && article.roles.includes(role)) score += 4;
    return { article, score };
  }).sort((left, right) => right.score - left.score);
  return scored[0]?.score >= 13 ? scored[0].article : null;
}

function answerArticle(article, language) {
  return {
    id: article.id,
    title: article.title[language],
    preconditions: article.preconditions[language],
    steps: article.steps[language],
    expected: article.expected[language],
    limitation: article.limitation[language],
    escalation: article.escalation[language],
    route: article.route
  };
}

function suggestionsForRole(role, language, limit = 4) {
  return articles
    .filter(article => articleAllowed(article, role))
    .slice(0, limit)
    .map(article => article.title[language]);
}

module.exports = { articles, answerArticle, findArticle, normalizeText, suggestionsForRole };
