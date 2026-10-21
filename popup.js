const DEFAULTS = { enabled: true, gtaEnabled: true, keywords: [], mode: "cover", disabledSites: [] };
const MAX_KEYWORDS = 100;
const MAX_LENGTH = 60;

const $ = (id) => document.getElementById(id);
const els = {
  master: $("master"), masterLabel: $("masterLabel"),
  pageStatus: $("pageStatus"), revealAll: $("revealAll"),
  siteRow: $("siteRow"), siteName: $("siteName"), siteToggle: $("siteToggle"),
  gta: $("gtaToggle"), form: $("keywordForm"), input: $("keywordInput"), list: $("keywordList"),
  modes: document.querySelectorAll("input[name=mode]"), modeHint: $("modeHint"), status: $("status")
};

const MODE_HINTS = {
  cover: "Matches are blurred. Click one to read it.",
  hide: "Matches disappear from the page. Use Reveal everything to bring them back."
};

let state = { ...DEFAULTS };
let tab = { id: null, host: null };
let statusTimer;

function say(message) {
  els.status.textContent = message;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { els.status.textContent = ""; }, 2500);
}

async function save(patch) {
  try {
    await chrome.storage.sync.set(patch);
    Object.assign(state, patch);
    setTimeout(refreshPage, 350); // let the page apply the change first
    return true;
  } catch {
    say("Couldn't save. Chrome sync storage may be full.");
    return false;
  }
}

function render() {
  els.master.checked = state.enabled;
  els.masterLabel.textContent = state.enabled ? "On" : "Paused";
  els.gta.checked = state.gtaEnabled;
  els.modes.forEach((r) => { r.checked = r.value === state.mode; });
  els.modeHint.textContent = MODE_HINTS[state.mode];

  if (tab.host) {
    els.siteRow.hidden = false;
    els.siteName.textContent = tab.host;
    els.siteToggle.checked = !state.disabledSites.includes(tab.host);
  }

  els.list.replaceChildren();
  if (!state.keywords.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No keywords yet.";
    els.list.append(li);
  }
  state.keywords.forEach((word) => {
    const li = document.createElement("li");
    const text = document.createElement("span");
    text.className = "word";
    text.textContent = word;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${word}`);
    remove.addEventListener("click", async () => {
      const keywords = state.keywords.filter((k) => k !== word);
      if (await save({ keywords })) { render(); say(`Removed “${word}”.`); }
    });
    li.append(text, remove);
    els.list.append(li);
  });
}

async function ask(message) {
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    // Tab was open before install or update: inject the content script, then retry.
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    await new Promise((r) => setTimeout(r, 250));
    return chrome.tabs.sendMessage(tab.id, message);
  }
}

async function refreshPage() {
  els.revealAll.hidden = true;
  if (!tab.id || !tab.host) {
    els.pageStatus.textContent = "Spoiler Shield doesn't run on this page.";
    return;
  }
  try {
    const res = await ask({ type: "count" });
    if (!res.active) {
      els.pageStatus.textContent = state.enabled ? "Off for this site." : "Paused.";
    } else if (res.hidden === 0) {
      els.pageStatus.textContent = "Nothing matched on this page.";
    } else {
      els.pageStatus.textContent = `${res.hidden} ${res.hidden === 1 ? "item" : "items"} covered on this page.`;
      els.revealAll.hidden = false;
    }
  } catch {
    els.pageStatus.textContent = "Reload this tab to start filtering.";
  }
}

els.master.addEventListener("change", async () => {
  if (await save({ enabled: els.master.checked })) { render(); say(state.enabled ? "Turned on." : "Paused."); }
});

els.gta.addEventListener("change", async () => {
  if (await save({ gtaEnabled: els.gta.checked })) say(state.gtaEnabled ? "GTA VI filter on." : "GTA VI filter off.");
});

els.siteToggle.addEventListener("change", async () => {
  const rest = state.disabledSites.filter((s) => s !== tab.host);
  const disabledSites = els.siteToggle.checked ? rest : [...rest, tab.host];
  if (await save({ disabledSites })) say(els.siteToggle.checked ? `Filtering ${tab.host}.` : `Skipping ${tab.host}.`);
});

els.modes.forEach((r) => r.addEventListener("change", async () => {
  if (r.checked && await save({ mode: r.value })) render();
}));

els.revealAll.addEventListener("click", async () => {
  try { await chrome.tabs.sendMessage(tab.id, { type: "reveal-all" }); } catch {}
  refreshPage();
});

els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const seen = new Set(state.keywords.map((k) => k.toLocaleLowerCase()));
  const added = [];
  for (const raw of els.input.value.split(/[,\n]/)) {
    const word = raw.trim().replace(/\s+/g, " ").slice(0, MAX_LENGTH);
    const key = word.toLocaleLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);
    added.push(word);
  }
  if (!added.length) { say(els.input.value.trim() ? "Already in your list." : "Type a keyword first."); return; }
  if (state.keywords.length + added.length > MAX_KEYWORDS) { say(`Limit is ${MAX_KEYWORDS} keywords.`); return; }
  if (await save({ keywords: [...state.keywords, ...added] })) {
    els.input.value = "";
    render();
    say(added.length === 1 ? `Added “${added[0]}”.` : `Added ${added.length} keywords.`);
  }
});

(async function init() {
  try { state = { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) }; } catch {}
  try {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = new URL(active.url);
    if (/^https?:$/.test(url.protocol)) tab = { id: active.id, host: url.hostname.replace(/^www\./, "") };
  } catch {}
  render();
  refreshPage();
})();