(() => {
  if (window.__spoilerShieldLoaded) return;
  window.__spoilerShieldLoaded = true;

  const DEFAULTS = { enabled: true, gtaEnabled: true, keywords: [], mode: "cover", disabledSites: [] };
  const GTA_TERMS = [
    "gta 6", "gta6", "gta-6", "gta vi", "gtavi", "gta-vi",
    "grand theft auto 6", "grand theft auto vi", "grand theft auto six"
  ];
  const ATTR = "data-spoiler-shield"; // "cover" | "hide" | "revealed"
  const STYLE_ID = "spoiler-shield-styles";
  const SKIP = "script,style,noscript,textarea,input,select,option,[contenteditable='true'],[contenteditable='']";

  // Known "one post" containers. The nearest small match wins.
  const ITEM = [
    "article[data-testid='tweet']", "[data-testid='cellInnerDiv']",
    "shreddit-post", "shreddit-comment",
    "ytd-rich-item-renderer", "ytd-video-renderer", "ytd-compact-video-renderer",
    "ytd-grid-video-renderer", "ytd-comment-thread-renderer", "yt-lockup-view-model",
    "tr.athing", "div.g", "[role='article']", "article",
    ".search-result", ".feed-item", ".post", ".comment", "li"
  ].join(",");
  const BLOCK = "p,li,blockquote,h1,h2,h3,h4,h5,h6,figcaption,td,dd,dt,pre";
  const MAX_ITEM_CHARS = 1500;

  let settings = { ...DEFAULTS };
  let matcher = null;
  let active = false;
  let observer = null;
  let timer = null;
  const pending = new Set();

  const normalize = (v) => String(v || "").normalize("NFKC").toLocaleLowerCase();
  const escapeRegex = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // One combined, Unicode-aware regex. A term only matches as a whole word, so
  // "gta6" matches but "vegta6x" doesn't, and non-Latin keywords work too.
  function buildMatcher() {
    const terms = [...(settings.gtaEnabled ? GTA_TERMS : []), ...settings.keywords]
      .map((t) => normalize(t).trim().replace(/\s+/g, " "))
      .filter(Boolean)
      .map((t) => escapeRegex(t).replace(/ /g, "\\s+"));
    matcher = terms.length
      ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${terms.join("|")})(?![\\p{L}\\p{N}])`, "u")
      : null;
  }

  const matches = (text) => !!matcher && !!text && matcher.test(normalize(text));

  function siteDisabled() {
    const host = location.hostname.replace(/^www\./, "");
    return settings.disabledSites.some((s) => host === s || host.endsWith("." + s));
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      [${ATTR}="hide"] { display: none !important; }
      [${ATTR}="cover"] {
        filter: blur(12px) grayscale(1) !important;
        opacity: .55 !important;
        cursor: pointer !important;
        user-select: none !important;
      }
      [${ATTR}="cover"] * { pointer-events: none !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function isBlockedEl(el) {
    return !el || el === document.body || el === document.documentElement;
  }

  function findTarget(start) {
    if (!start || isBlockedEl(start)) return null;

    // 1. Nearest known post/result container, as long as it's a single item
    //    and not a whole article or list.
    for (let el = start; el && !isBlockedEl(el); el = el.parentElement) {
      if (el.matches(ITEM) && el.textContent.length <= MAX_ITEM_CHARS) return el;
    }

    // 2. Otherwise just the paragraph, heading or list entry that matched.
    const block = start.closest(BLOCK);
    if (block && !isBlockedEl(block)) return block;

    // 3. Unstructured pages: grow a little, but stop before swallowing the page.
    let el = start;
    while (el.parentElement && !isBlockedEl(el.parentElement) &&
           el.parentElement.childElementCount <= 3 &&
           el.parentElement.textContent.length <= 400) {
      el = el.parentElement;
    }
    return isBlockedEl(el) ? null : el;
  }

  function mark(el) {
    if (isBlockedEl(el) || el.closest(`[${ATTR}]`)) return;
    el.setAttribute(ATTR, settings.mode === "hide" ? "hide" : "cover");
  }

  function checkText(node) {
    const parent = node.parentElement;
    if (!parent || parent.closest(`${SKIP},[${ATTR}]`)) return;
    const text = node.nodeValue;
    if (!text || text.length < 3 || !matches(text)) return;
    mark(findTarget(parent));
  }

  function scan(root) {
    if (!matcher) return;
    if (root.nodeType === Node.TEXT_NODE) return checkText(root);
    if (root.nodeType !== Node.ELEMENT_NODE || root.closest(`${SKIP},[${ATTR}]`)) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) checkText(node);

    // Thumbnails and screenshots often carry the spoiler only in their alt text.
    const imgs = root.matches("img[alt]") ? [root] : [];
    root.querySelectorAll("img[alt]").forEach((img) => imgs.push(img));
    imgs.forEach((img) => {
      if (!img.closest(`[${ATTR}]`) && matches(img.alt)) mark(findTarget(img.parentElement));
    });
  }

  function flush() {
    timer = null;
    if (!active) return;
    const roots = [...pending];
    pending.clear();
    roots.forEach((r) => { if (r.isConnected) scan(r); });
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      if (!active) return;
      for (const m of mutations) {
        if (m.type === "characterData") pending.add(m.target);
        else m.addedNodes.forEach((n) => {
          if (n.nodeType === Node.ELEMENT_NODE || n.nodeType === Node.TEXT_NODE) pending.add(n);
        });
      }
      if (pending.size && !timer) timer = setTimeout(flush, 120);
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  }

  function stopObserver() {
    if (observer) observer.disconnect();
    observer = null;
    pending.clear();
    clearTimeout(timer);
    timer = null;
  }

  function clearMarks() {
    document.querySelectorAll(`[${ATTR}]`).forEach((el) => el.removeAttribute(ATTR));
  }

  function applySettings(raw = {}) {
    const strings = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === "string" && s.trim()) : []);
    settings = {
      enabled: raw.enabled !== false,
      gtaEnabled: raw.gtaEnabled !== false,
      keywords: strings(raw.keywords),
      mode: raw.mode === "hide" ? "hide" : "cover",
      disabledSites: strings(raw.disabledSites)
    };
    active = settings.enabled && !siteDisabled();
    clearMarks();
    buildMatcher();
    if (active) {
      ensureStyles();
      scan(document.body || document.documentElement);
      startObserver();
    } else {
      stopObserver();
    }
  }

  // Click a blurred item to reveal it. Capture phase so links inside don't fire.
  document.addEventListener("click", (e) => {
    const el = e.target instanceof Element ? e.target.closest(`[${ATTR}="cover"]`) : null;
    if (!el) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    el.setAttribute(ATTR, "revealed");
  }, true);

  chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
    if (msg?.type === "count") {
      respond({
        active,
        hidden: document.querySelectorAll(`[${ATTR}="cover"],[${ATTR}="hide"]`).length
      });
    } else if (msg?.type === "reveal-all") {
      document.querySelectorAll(`[${ATTR}="cover"],[${ATTR}="hide"]`)
        .forEach((el) => el.setAttribute(ATTR, "revealed"));
      respond({ ok: true });
    }
  });

  const KEYS = Object.keys(DEFAULTS);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && KEYS.some((k) => k in changes)) {
      chrome.storage.sync.get(DEFAULTS).then(applySettings).catch(() => {});
    }
  });
  chrome.storage.sync.get(DEFAULTS).then(applySettings).catch(() => applySettings(DEFAULTS));
})();
