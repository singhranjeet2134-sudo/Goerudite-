(() => {
  const root = document.querySelector("#help-chat-root");
  if (!root) return;

  const copy = {
    en: {
      launcher: "Open GoErudite help chat",
      title: "GoErudite Help",
      language: "Chat language",
      close: "Close help chat",
      reset: "Clear conversation",
      welcome: "Hello! I am the GoErudite Help Assistant. Tell me what problem you are facing on the website or dashboard, and I will guide you step by step.",
      privacy: "Uses verified help articles. Messages are not saved. Do not share passwords, codes, or private records.",
      placeholder: "Ask about a page, dashboard, or error…",
      send: "Send",
      suggestions: "Suggested questions",
      preconditions: "Before you start",
      steps: "Steps",
      expected: "Expected result",
      limitation: "Limitations",
      escalation: "If it still does not work",
      related: "Open related page",
      loading: "Checking verified help articles…",
      empty: "Type a question before sending.",
      long: "Please keep your question under 500 characters.",
      network: "The help service could not be reached. Check your connection and try again.",
      retry: "Retry",
      contact: "Contact Support",
      error: "The help service returned an error. Please try again.",
      rateLimited: "Too many questions were sent. Please wait a minute and try again.",
      languageChanged: "Language changed. New answers will use this language."
    },
    hi: {
      launcher: "GoErudite help chat kholein",
      title: "GoErudite Help",
      language: "Chat ki bhasha",
      close: "Help chat band karein",
      reset: "Conversation saaf karein",
      welcome: "Namaste! Main GoErudite Help Assistant hoon. Website ya dashboard mein kya problem aa rahi hai batayein; main step-by-step guide karunga.",
      privacy: "Verified help articles use hote hain. Messages save nahi hote. Password, code ya private records share na karein.",
      placeholder: "Page, dashboard ya error ke baare mein poochhein…",
      send: "Bhejein",
      suggestions: "Suggested sawal",
      preconditions: "Shuru karne se pehle",
      steps: "Kadam",
      expected: "Expected result",
      limitation: "Limitations",
      escalation: "Phir bhi kaam na kare to",
      related: "Related page kholein",
      loading: "Verified help articles dekh raha hoon…",
      empty: "Bhejne se pehle sawal likhein.",
      long: "Sawal 500 characters se chhota rakhein.",
      network: "Help service connect nahi ho saki. Connection check karke dobara try karein.",
      retry: "Dobara try karein",
      contact: "Contact Support",
      error: "Help service se error aaya. Dobara try karein.",
      rateLimited: "Bahut sawal bheje gaye. Ek minute ruk kar dobara try karein.",
      languageChanged: "Bhasha badal di. Agle jawab isi bhasha mein honge."
    }
  };

  let savedLanguage = "";
  try {
    savedLanguage = localStorage.getItem("goerudite-help-language") || "";
  } catch {}
  let language = ["en", "hi"].includes(savedLanguage)
    ? savedLanguage
    : (navigator.language || "").toLowerCase().startsWith("hi") ? "hi" : "en";
  let isOpen = false;
  let loading = false;
  let loadingSuggestions = false;
  let suggestionsLoaded = false;
  let suggestionsError = false;
  let suggestionErrorText = "";
  let suggestions = { en: [], hi: [] };
  let messages = [];
  let lastQuestion = "";
  let panel;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function addWelcome() {
    messages = [{ type: "assistant", text: copy[language].welcome, language }];
  }

  function render() {
    const restoreInputFocus = root.contains(document.activeElement) &&
      document.activeElement.classList.contains("help-chat-input");
    const text = copy[language];
    root.replaceChildren();
    const launcher = element("button", "help-chat-launcher", "✦");
    launcher.type = "button";
    launcher.setAttribute("aria-label", text.launcher);
    launcher.setAttribute("aria-expanded", String(isOpen));
    launcher.setAttribute("aria-controls", "goerudite-help-panel");
    launcher.addEventListener("click", () => setOpen(!isOpen));
    root.append(launcher);
    if (!isOpen) return;

    panel = element("section", "help-chat-panel");
    panel.id = "goerudite-help-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-labelledby", "help-chat-title");
    const header = element("header", "help-chat-header");
    const title = element("h2", "", text.title);
    title.id = "help-chat-title";
    const controls = element("div", "help-chat-controls");
    const languageLabel = element("label", "visually-hidden", text.language);
    languageLabel.htmlFor = "help-chat-language";
    const select = element("select", "help-chat-language");
    select.id = "help-chat-language";
    select.setAttribute("aria-label", text.language);
    for (const [value, label] of [["en", "English"], ["hi", "हिन्दी"]]) {
      const option = element("option", "", label);
      option.value = value;
      option.selected = language === value;
      select.append(option);
    }
    select.addEventListener("change", () => {
      language = select.value;
      try {
        localStorage.setItem("goerudite-help-language", language);
      } catch {}
      render();
      addMessage("assistant", copy[language].languageChanged);
      panel.querySelector(".help-chat-input").focus();
    });
    const reset = element("button", "help-chat-icon-button", "↺");
    reset.type = "button";
    reset.setAttribute("aria-label", text.reset);
    reset.title = text.reset;
    reset.addEventListener("click", () => {
      addWelcome();
      render();
      panel.querySelector(".help-chat-input").focus();
    });
    const close = element("button", "help-chat-icon-button", "×");
    close.type = "button";
    close.setAttribute("aria-label", text.close);
    close.title = text.close;
    close.addEventListener("click", () => setOpen(false));
    controls.append(languageLabel, select, reset, close);
    header.append(title, controls);
    panel.append(header);

    const privacy = element("p", "help-chat-privacy", text.privacy);
    panel.append(privacy);
    const log = element("div", "help-chat-messages");
    log.setAttribute("role", "log");
    log.setAttribute("aria-live", "polite");
    log.setAttribute("aria-relevant", "additions text");
    for (const message of messages) log.append(renderMessage(message));
    if (loading) log.append(element("p", "help-chat-loading", text.loading));
    panel.append(log);

    const suggestionTitle = element("p", "help-chat-suggestion-title", text.suggestions);
    panel.append(suggestionTitle);
    const suggestionList = element("div", "help-chat-suggestions");
    for (const suggestion of suggestions[language]) {
      const button = element("button", "help-chat-suggestion", suggestion);
      button.type = "button";
      button.disabled = loading;
      button.addEventListener("click", () => submitQuestion(suggestion));
      suggestionList.append(button);
    }
    panel.append(suggestionList);
    if (suggestionsError) {
      panel.append(element("p", "help-chat-error", suggestionErrorText || text.network));
      const retry = element("button", "help-chat-retry", text.retry);
      retry.type = "button";
      retry.addEventListener("click", loadSuggestions);
      panel.append(retry);
    }

    const form = element("form", "help-chat-form");
    const input = element("input", "help-chat-input");
    input.type = "text";
    input.maxLength = 500;
    input.autocomplete = "off";
    input.placeholder = text.placeholder;
    input.setAttribute("aria-label", text.placeholder);
    input.disabled = loading;
    const send = element("button", "help-chat-send", text.send);
    send.type = "submit";
    send.disabled = loading;
    form.append(input, send);
    form.addEventListener("submit", event => {
      event.preventDefault();
      submitQuestion(input.value);
    });
    panel.append(form);
    root.append(panel);
    if (restoreInputFocus && !input.disabled) input.focus();
    log.scrollTop = log.scrollHeight;
  }

  function renderMessage(message) {
    const article = element("article", `help-chat-message help-chat-${message.type}`);
    if (message.type === "assistant" && message.answer) {
      article.append(element("strong", "help-chat-answer-title", message.answer.title));
      const fields = [
        ["preconditions", "preconditions"],
        ["steps", "steps"],
        ["expected", "expected"],
        ["limitation", "limitation"],
        ["escalation", "escalation"]
      ];
      for (const [key, label] of fields) {
        const value = message.answer[key];
        if (!value) continue;
        const section = element("section", "help-chat-answer-section");
        section.append(element("h3", "", copy[message.language][label]));
        if (Array.isArray(value)) {
          const list = element("ol", "");
          for (const item of value) list.append(element("li", "", item));
          section.append(list);
        } else section.append(element("p", "", value));
        article.append(section);
      }
      if (message.answer.route) {
        const allowedRoute = ["/dashboard", "/contact", "/catalog", "/forgot-password"].includes(message.answer.route);
        if (allowedRoute) {
          const link = element("a", "help-chat-related-link", copy[message.language].related);
          link.href = message.answer.route;
          article.append(link);
        }
      }
    } else {
      article.append(element("p", "", message.text));
      if (message.route === "/contact") {
        const link = element("a", "help-chat-related-link", copy[message.language].contact);
        link.href = "/contact";
        article.append(link);
      }
      if (message.retry) {
        const retry = element("button", "help-chat-retry", copy[message.language].retry);
        retry.type = "button";
        retry.addEventListener("click", () => submitQuestion(lastQuestion));
        article.append(retry);
      }
    }
    return article;
  }

  function addMessage(type, text, extra = {}) {
    messages.push({ type, text, language, ...extra });
    if (messages.length > 40) messages.splice(1, messages.length - 40);
    render();
  }

  async function loadSuggestions() {
    if (loadingSuggestions || suggestionsLoaded) return;
    loadingSuggestions = true;
    suggestionsError = false;
    suggestionErrorText = "";
    try {
      const response = await fetch("/api/help/chat", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      suggestions = result.suggestions;
      suggestionsLoaded = true;
    } catch {
      suggestionsError = true;
      suggestionErrorText = copy[language].network;
    } finally {
      loadingSuggestions = false;
      if (isOpen) render();
    }
  }

  async function submitQuestion(rawQuestion) {
    const question = String(rawQuestion || "").trim();
    const text = copy[language];
    if (!question) {
      addMessage("assistant", text.empty);
      return;
    }
    if (question.length > 500) {
      addMessage("assistant", text.long);
      return;
    }
    lastQuestion = question;
    messages.push({ type: "user", text: question, language });
    loading = true;
    render();
    try {
      const response = await fetch("/api/help/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, language })
      });
      if (!response.ok) throw new Error(response.status === 429 ? text.rateLimited : text.error);
      const result = await response.json();
      suggestions = result.suggestions;
      if (result.matched && result.answer) messages.push({ type: "assistant", answer: result.answer, language });
      else messages.push({ type: "assistant", text: result.message || text.error, route: result.route || "/contact", language });
    } catch (error) {
      messages.push({
        type: "assistant",
        text: error.message === text.rateLimited ? text.rateLimited : error.message === text.error ? text.error : text.network,
        retry: true,
        language
      });
    } finally {
      loading = false;
      render();
      panel.querySelector(".help-chat-input").focus();
    }
  }

  function setOpen(open) {
    isOpen = open;
    render();
    if (open) {
      const input = panel.querySelector(".help-chat-input");
      input.focus();
      if (!suggestionsLoaded) loadSuggestions();
    } else root.querySelector(".help-chat-launcher").focus();
  }

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && isOpen) setOpen(false);
  });
  addWelcome();
  render();
})();
