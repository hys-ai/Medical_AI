/* Source-grounded teaching conversations. Drafts live only in this window. */
const tutorChatEntries = new Map();
const tutorChatMounts = new WeakMap();
let tutorChatGeneration = 0;

function clearTutorChatState() {
  tutorChatEntries.clear();
}

function tutorRequestId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function tutorViewCurrent(entry, view) {
  return tutorChatEntries.get(entry.token) === entry && entry.view === view &&
    tutorChatMounts.get(view.container) === view.generation;
}

function tutorSnapshot(entry, snapshot) {
  if (!snapshot || snapshot.token !== entry.token || !Array.isArray(snapshot.messages)) {
    throw new Error("对话记录与当前题目不一致，请重新载入");
  }
  entry.snapshot = snapshot;
}

function tutorSafeSource(source) {
  const details = el("details", "tutor-source");
  details.appendChild(el("summary", null, source.title || "本次解释的资料依据"));
  if (source.quote) details.appendChild(el("blockquote", null, source.quote));
  if (source.provenance) details.appendChild(el("p", "study-source", source.provenance));
  if (typeof source.url === "string" && /^https:\/\//i.test(source.url)) {
    const link = el("a", "tutor-reference", "打开参考资料 ↗");
    link.href = source.url; link.target = "_blank"; link.rel = "noopener noreferrer";
    details.appendChild(link);
  }
  return details;
}

function renderTutorChat(entry) {
  const view = entry.view;
  if (!view || !tutorViewCurrent(entry, view)) return;
  const root = view.container;
  root.textContent = "";
  root.className = "tutor-chat";
  root.setAttribute("aria-label", "围绕本题继续讨论");
  root.setAttribute("aria-busy", String(entry.pending || entry.loading));
  const snapshot = entry.snapshot;
  const heading = el("div", "tutor-chat-heading");
  const labels = el("div");
  labels.append(el("h4", null, "围绕本题继续讨论"),
    el("p", "study-source", snapshot?.name ? "当前知识点：" + snapshot.name : "保留上下文，说明你的疑问或推理过程"));
  heading.appendChild(labels);
  heading.appendChild(el("span", "tutor-mode", snapshot?.provider?.label || "正在确认辅导模式"));
  root.appendChild(heading);
  if (snapshot?.provider?.note) root.appendChild(el("p", "tutor-provider-note", snapshot.provider.note));

  const messages = el("div", "tutor-messages");
  messages.setAttribute("role", "log"); messages.setAttribute("aria-label", "本题教学对话记录");
  messages.setAttribute("aria-live", "polite");
  const records = snapshot?.messages || [];
  if (!records.length) messages.appendChild(el("p", "tutor-empty",
    "可以直接说“我认为……，因为……”，也可以问某个具体环节。助手会结合本题和前面的对话继续解释。"));
  records.forEach(record => {
    if (record.role !== "user" && record.role !== "assistant") return;
    const bubble = el("article", "tutor-message " + (record.role === "user" ? "tutor-user" : "tutor-assistant"));
    bubble.append(el("strong", "tutor-speaker", record.role === "user" ? "我的思路" : "学习助手"),
      el("p", "tutor-content", record.content || ""));
    if (record.follow_up) bubble.appendChild(el("p", "tutor-follow-up", "接着想一想：" + record.follow_up));
    if (record.mode) bubble.appendChild(el("small", "tutor-turn-mode", record.mode));
    if (record.warning) bubble.appendChild(el("p", "tutor-warning", record.warning));
    (Array.isArray(record.sources) ? record.sources : []).forEach(source => bubble.appendChild(tutorSafeSource(source)));
    messages.appendChild(bubble);
  });
  root.appendChild(messages);

  const status = el("p", "tutor-chat-status" + (entry.error ? " tutor-warning" : ""),
    entry.pending ? "正在结合前面的对话整理解释…" : entry.loading ? "正在恢复本题对话…" : entry.error || "");
  status.setAttribute("role", "status"); root.appendChild(status);
  if (entry.loadError) {
    const retry = el("button", "btn", "重新载入对话"); retry.type = "button";
    retry.disabled = entry.loading || entry.pending;
    retry.addEventListener("click", () => loadTutorChat(entry));
    root.appendChild(retry);
  }

  const form = el("form", "tutor-chat-form");
  const label = el("label", "tutor-input-label", "说说你的疑问或理解");
  const input = el("textarea", "tutor-input");
  input.rows = 3; input.maxLength = 1000;
  input.placeholder = "例如：为什么闭眼无力和上睑下垂不能归为同一条神经？";
  input.setAttribute("aria-label", "本题讨论内容"); input.value = entry.draft;
  const exhausted = snapshot && snapshot.remaining <= 0;
  input.disabled = entry.pending || !!exhausted;
  input.addEventListener("input", () => {
    if (tutorViewCurrent(entry, view)) {
      entry.draft = input.value;
      if (entry.request && entry.request.message !== input.value.trim()) entry.request = null;
    }
  });
  label.appendChild(input); form.appendChild(label);
  const suggestions = el("div", "tutor-suggestions");
  ["我还是不明白，请换个方式解释", "请举一个只用于学习的例子", "请根据我刚才的解释继续追问"].forEach(text => {
    const suggestion = el("button", "chip", text); suggestion.type = "button";
    suggestion.disabled = entry.loading || entry.pending || !!exhausted || entry.loadError;
    suggestion.addEventListener("click", () => {
      if (!tutorViewCurrent(entry, view) || entry.pending || entry.loading) return;
      entry.draft = text; entry.request = null; input.value = text; input.focus();
    });
    suggestions.appendChild(suggestion);
  });
  form.appendChild(suggestions);
  const actions = el("div", "tutor-chat-actions");
  const send = el("button", "btn btn-primary", entry.pending ? "正在回复…" : entry.request ? "重试发送" : "发送并继续讨论");
  send.type = "submit"; send.disabled = entry.pending || entry.loading || entry.loadError || !snapshot || !!exhausted;
  actions.append(send, el("span", "study-source", exhausted ? "本题已达到12轮上限，可回到作答或开启新题。" :
    snapshot ? "本题还可讨论 " + snapshot.remaining + " 轮" : ""));
  form.appendChild(actions);
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (!tutorViewCurrent(entry, view)) return;
    entry.draft = input.value;
    sendTutorMessage(entry);
  });
  root.appendChild(form);
  root.appendChild(el("p", "tutor-privacy", "请勿输入患者资料或个人信息。对话不直接评分；作答前接受辅导会标为辅助练习，请再独立复测。"));
  messages.scrollTop = messages.scrollHeight;
}

async function loadTutorChat(entry) {
  if (entry.loading || entry.pending || tutorChatEntries.get(entry.token) !== entry) return;
  entry.loading = true; entry.error = ""; entry.loadError = false;
  renderTutorChat(entry);
  try {
    const snapshot = await api("/api/tutor?token=" + encodeURIComponent(entry.token));
    if (tutorChatEntries.get(entry.token) !== entry) return;
    tutorSnapshot(entry, snapshot);
  } catch (error) {
    entry.error = "对话暂未载入：" + error.message;
    entry.loadError = true;
  } finally {
    entry.loading = false; renderTutorChat(entry);
  }
}

async function sendTutorMessage(entry) {
  if (entry.pending || entry.loading || entry.loadError || !entry.snapshot || entry.snapshot.remaining <= 0 ||
      tutorChatEntries.get(entry.token) !== entry) return;
  const message = entry.draft.trim();
  if (message.length < 2 || message.length > 1000) {
    entry.error = "请输入2–1000字的疑问或推理。"; renderTutorChat(entry); return;
  }
  if (!entry.request || entry.request.message !== message) entry.request = {message, id:tutorRequestId()};
  const request = entry.request;
  entry.pending = true; entry.error = "";
  renderTutorChat(entry);
  try {
    const snapshot = await api("/api/tutor", {token:entry.token, message, request_id:request.id});
    if (tutorChatEntries.get(entry.token) !== entry) return;
    tutorSnapshot(entry, snapshot);
    if (entry.draft.trim() === message) entry.draft = "";
    entry.request = null;
  } catch (error) {
    entry.error = "发送暂未完成：" + error.message + "。草稿已保留，可重试。";
  } finally {
    entry.pending = false; renderTutorChat(entry);
  }
}

function mountTutorChat(container, token) {
  if (!container || typeof token !== "string" || !/^[a-f0-9]{32}$/.test(token)) return;
  let entry = tutorChatEntries.get(token);
  if (!entry) {
    entry = {token, draft:"", request:null, snapshot:null, pending:false, loading:false, loadError:false, error:"", view:null};
    tutorChatEntries.set(token, entry);
  }
  const view = {container, generation:++tutorChatGeneration};
  tutorChatMounts.set(container, view.generation); entry.view = view;
  renderTutorChat(entry);
  if (!entry.pending) loadTutorChat(entry);
}
