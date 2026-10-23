/* 书页 · 医学生 AI 学习助手 —— 前端逻辑
   视图切换 / 提问三卡 / 科研探索 / 我的学习 / 知识库 / 状态
*/
const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

let busy = false;
let overviewData = null;

/* ---------- 基础工具 ---------- */
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function icon(id, cls) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  if (cls) svg.setAttribute("class", cls);
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", "#" + id);
  svg.appendChild(use);
  return svg;
}

function toast(msg, ms = 2600) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove("show"), ms);
}

async function api(path, payload) {
  const opt = payload
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
    : { method: "GET" };
  const res = await fetch(path, opt);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
}

/* ---------- 视图切换 ---------- */
const VIEWS = ["home", "learn", "quiz", "books", "research", "me"];

function showView(name) {
  if (!VIEWS.includes(name)) name = "home";
  VIEWS.forEach((v) => {
    const sec = $("view-" + v);
    if (sec) sec.classList.toggle("is-active", v === name);
  });
  $$(".nav-item").forEach((b) => b.classList.toggle("is-active", b.dataset.view === name));
  $("rail").classList.toggle("is-hidden", name !== "home");
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (name === "learn" && overviewData) renderLearn(overviewData);
  if (name === "quiz") renderQuiz(overviewData);
  if (name === "books" && overviewData) renderBooks(overviewData);
  if (name === "me" && overviewData) renderStatus(overviewData);
  location.hash = name === "home" ? "" : name;
}

$$(".nav-item").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));
$$("[data-view]").forEach((b) => {
  if (b.classList.contains("nav-item")) return;
  b.addEventListener("click", () => showView(b.dataset.view));
});

/* ---------- 首页渲染 ---------- */
function renderRecent(list) {
  const box = $("recent");
  box.innerHTML = "";
  if (!list.length) {
    box.appendChild(el("p", "empty-line", "还没有提问记录。从上面的输入框开始，或者点一个示例问题。"));
    return;
  }
  list.forEach((it) => {
    const btn = el("button", "recent-item");
    btn.type = "button";
    const ic = el("span", "recent-icon");
    ic.appendChild(icon("i-learn"));
    const body = el("span", "recent-body");
    body.appendChild(el("strong", null, it.query));
    body.appendChild(el("span", null,
      (it.book ? it.book + " · P" + it.page : "未命中教材")));
    const time = el("span", "recent-time", it.time);
    const pill = el("span", "pill" + (it.cited_ok ? "" : " warn"), it.cited_ok ? "已引用" : "未引用");
    btn.append(ic, body, time, pill);
    btn.addEventListener("click", () => {
      $("q").value = it.query;
      ask(it.query);
    });
    box.appendChild(btn);
  });
}

function renderChecklist(data) {
  const ul = $("checklist");
  ul.innerHTML = "";
  const items = [];
  if (data.weak && data.weak.length) {
    data.weak.slice(0, 2).forEach((w) => {
      items.push({ text: "复习《" + shortBook(w.book) + "》P" + w.page + " 附近", done: false });
    });
  }
  items.push({ text: "完成 1 次教材溯源提问", done: (data.questions.week || 0) > 0 });
  items.push({ text: "查看 1 篇 PubMed 文献", done: false });
  items.push({ text: "整理今天的问题清单", done: false });
  items.slice(0, 4).forEach((it) => {
    const li = el("li", it.done ? "done" : "");
    const box = el("span", "box");
    box.appendChild(icon("i-check"));
    li.append(box, el("span", null, it.text));
    ul.appendChild(li);
  });

  const d = new Date();
  const week = "日一二三四五六"[d.getDay()];
  $("planDate").textContent =
    (d.getMonth() + 1) + "月" + d.getDate() + "日 周" + week;
}

function shortBook(name) {
  return (name || "").replace(/（.*?）/g, "").replace(/\(.*?\)/g, "");
}

/* ---------- 我的学习 ---------- */
function renderLearn(data) {
  const q = data.questions || {};
  const m = $("metrics");
  m.innerHTML = "";
  [
    ["累计提问", q.total || 0],
    ["本周提问", q.week || 0],
    ["本周有引用", q.week_cited || 0],
    ["薄弱页段", (data.weak || []).length],
  ].forEach(([label, val]) => {
    const d = el("div", "metric");
    d.appendChild(el("strong", null, String(val)));
    d.appendChild(el("span", null, label));
    m.appendChild(d);
  });

  const weak = $("weakList");
  weak.innerHTML = "";
  if (!(data.weak || []).length) {
    weak.appendChild(el("p", "empty-line", "还没有反复提问的页段。多问几次同一主题，这里会自动浮现。"));
  } else {
    data.weak.forEach((w) => {
      const b = el("button", "weak-item");
      b.type = "button";
      b.appendChild(el("b", null, "P" + w.page));
      b.appendChild(el("span", null, "《" + shortBook(w.book) + "》"));
      b.appendChild(el("span", "count", w.count + " 次"));
      b.addEventListener("click", () => {
        showView("home");
        $("q").value = "《" + shortBook(w.book) + "》P" + w.page + " 这一节的重点是什么";
        $("q").focus();
      });
      weak.appendChild(b);
    });
  }

  const hist = $("historyList");
  hist.innerHTML = "";
  const list = (data.recent || []).concat([]);
  if (!list.length) {
    hist.appendChild(el("p", "empty-line", "暂无提问记录。"));
  } else {
    list.forEach((it) => {
      const b = el("button", "history-item");
      b.type = "button";
      b.appendChild(el("time", null, it.time));
      b.appendChild(el("span", null, it.query));
      b.addEventListener("click", () => {
        showView("home");
        $("q").value = it.query;
        ask(it.query);
      });
      hist.appendChild(b);
    });
  }
}

/* ---------- 知识库 ---------- */
function renderBooks(data) {
  const grid = $("bookGrid");
  grid.innerHTML = "";
  const max = Math.max(1, ...(data.books || []).map((b) => b.chunks));
  (data.books || []).forEach((b) => {
    const card = el("div", "book-card");
    const ic = el("div", "book-icon");
    ic.appendChild(icon("i-books"));
    card.appendChild(ic);
    card.appendChild(el("h3", null, shortBook(b.book)));
    const ver = (b.book.match(/（(.*?)）/) || [])[1] || "第10版";
    card.appendChild(el("div", "meta", ver + " · " + b.chunks + " 个段落"));
    card.appendChild(el("div", "meta", "印刷页码 P" + b.min + " – P" + b.max));
    const bar = el("div", "bar");
    const i = el("i");
    i.style.width = Math.round((b.chunks / max) * 100) + "%";
    bar.appendChild(i);
    card.appendChild(bar);
    grid.appendChild(card);
  });
}

/* ---------- 个人中心 ---------- */
function renderStatus(data) {
  const box = $("statusPanel");
  box.innerHTML = "";
  const st = data.status || {};
  const rows = [
    ["教材数量", (data.books || []).length + " 本"],
    ["索引段落", (data.chunks || 0).toLocaleString() + " 块"],
    ["累计提问", String((data.questions || {}).total || 0)],
    ["回答方式", st.llm ? "已接入大模型（" + st.model + "）" : "离线抽取模式（未配置 API Key）"],
    ["文献来源", "PubMed E-utilities（公开接口）"],
    ["拒答阈值", "覆盖率 < " + st.coverage_threshold],
    ["数据存储", "本机 SQLite，不上传"],
  ];
  rows.forEach(([k, v]) => {
    const r = el("div", "status-row");
    const left = el("span", null, k);
    const right = el("b", null, v);
    if (k === "回答方式") {
      const dot = el("i", "dot" + (st.llm ? "" : " off"));
      right.prepend(dot);
    }
    r.append(left, right);
    box.appendChild(r);
  });
}

/* ---------- 提问 ---------- */
const MODE_TEXT = { llm: "模型生成", extractive: "离线抽取", extractive_fallback: "离线兜底", refuse: "已拒答" };

function renderBadges(data) {
  const box = $("badges");
  box.innerHTML = "";
  const ok = (data.citations || []).filter((c) => c.ok).length;
  const total = (data.citations || []).length;
  box.appendChild(el("span", "tag " + (data.refused ? "bad" : "good"),
    data.refused ? "查不到依据 · 已拒答" : `引用 ${ok}/${total} 通过`));
  if ((data.expanded || []).length) {
    box.appendChild(el("span", "tag ghost", "扩展：" + data.expanded.join("、")));
  }
}

function renderCites(data) {
  const box = $("cites");
  box.innerHTML = "";
  const list = data.citations || [];
  if (!list.length) {
    box.appendChild(el("div", "cite no", "本次回答未使用教材引用"));
    return;
  }
  list.forEach((c) => {
    const row = el("div", "cite " + (c.ok ? "ok" : "no"));
    row.appendChild(icon(c.ok ? "i-check" : "i-x"));
    const body = el("div");
    const head = el("div");
    head.appendChild(el("b", null, "《" + c.book + "》P" + c.page));
    head.appendChild(document.createTextNode(" "));
    head.appendChild(el("span", "reason", c.reason || ""));
    body.appendChild(head);
    if (c.snippet) body.appendChild(el("div", "reason", "「" + c.snippet + "…」"));
    row.appendChild(body);
    box.appendChild(row);
  });
}

function paperCard(p) {
  const card = el("div", "paper");
  const top = el("div", "paper-top");
  top.appendChild(el("span", "ev", p.evidence || "文献"));
  const meta = [p.journal, p.year].filter(Boolean).join(" · ");
  if (meta) top.appendChild(el("span", "src", meta));
  card.appendChild(top);
  card.appendChild(el("h4", null, p.title || "(无标题)"));
  if (p.abstract) {
    const t = p.abstract.slice(0, 220);
    card.appendChild(el("p", null, t + (p.abstract.length > 220 ? "…" : "")));
  }
  if (p.pmid) {
    const a = el("a", null, "PubMed · PMID " + p.pmid + " ↗");
    a.href = "https://pubmed.ncbi.nlm.nih.gov/" + p.pmid + "/";
    a.target = "_blank";
    a.rel = "noopener";
    card.appendChild(a);
  }
  return card;
}

function renderPapers(container, papers, note, tagEl) {
  container.innerHTML = "";
  if (tagEl) {
    tagEl.textContent = note ? String(note).replace(/^cache:/, "") : "";
    tagEl.title = tagEl.textContent;
  }
  if (!papers || !papers.length) {
    const empty = el("div", "paper");
    empty.appendChild(el("p", null, note || "未获取文献"));
    container.appendChild(empty);
    return;
  }
  papers.forEach((p) => container.appendChild(paperCard(p)));
}

async function ask(question) {
  if (busy) return;
  const q = (question || "").trim();
  if (!q) { toast("先输入一个问题"); $("q").focus(); return; }

  busy = true;
  $("sendBtn").disabled = true;
  const result = $("result");
  result.hidden = false;
  $("resultTitle").textContent = "正在检索「" + q + "」";
  $("answerText").textContent = "正在教材里找依据，并回查页码…";
  $("answerText").classList.remove("is-refused");
  $("cites").innerHTML = "";
  $("tips").innerHTML = "";
  $("papers").innerHTML = "";
  $("badges").innerHTML = "";
  result.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const data = await api("/api/ask", { question: q, pubmed: true });
    $("resultTitle").textContent = "关于「" + data.question + "」";
    renderBadges(data);
    const ans = $("answerText");
    ans.textContent = data.answer || "（无内容）";
    ans.classList.toggle("is-refused", !!data.refused);
    $("modeTag").textContent = MODE_TEXT[data.mode] || data.mode || "—";
    renderCites(data);
    const tips = $("tips");
    tips.innerHTML = "";
    (data.tips || []).forEach((t) => tips.appendChild(el("li", null, t)));
    $("statCoverage").textContent = (data.coverage ?? 0).toFixed(2);
    const ok = (data.citations || []).filter((c) => c.ok).length;
    $("statCites").textContent = ok + "/" + (data.citations || []).length;
    $("statMs").textContent = data._ms ?? "—";
    renderPapers($("papers"), data.papers, data.pubmed_note, $("pmQuery"));
    if (data.refused) toast("教材中没有找到可核对的依据，已拒答");
    refreshOverview();
  } catch (e) {
    $("answerText").textContent = "请求失败：" + e.message;
    toast("请求失败：" + e.message);
  } finally {
    busy = false;
    $("sendBtn").disabled = false;
  }
}

/* ---------- 科研探索 ---------- */
async function pmSearch(q) {
  const query = (q || "").trim();
  if (!query) { toast("先输入一个疑问"); return; }
  $("pmStatus").textContent = "正在生成检索式并检索 PubMed…";
  $("pmResults").innerHTML = "";
  try {
    const data = await api("/api/pubmed", { question: query, retmax: 6 });
    $("pmStatus").textContent = data.note
      ? "检索式：" + String(data.note).replace(/^cache:/, "") + "　（" + data._ms + " ms）"
      : "";
    renderPapers($("pmResults"), data.papers, data.note);
    if (!data.papers || !data.papers.length) {
      $("pmStatus").textContent = "没有取到文献：" + (data.note || "检索式为空");
    }
  } catch (e) {
    $("pmStatus").textContent = "检索失败：" + e.message;
  }
}

/* ---------- 数据加载 ---------- */
async function refreshOverview() {
  try {
    overviewData = await api("/api/overview");
    renderRecent(overviewData.recent || []);
    renderChecklist(overviewData);
    if (document.querySelector("#view-learn.is-active")) renderLearn(overviewData);
    if (document.querySelector("#view-books.is-active")) renderBooks(overviewData);
    if (document.querySelector("#view-me.is-active")) renderStatus(overviewData);
  } catch (e) {
    console.warn("overview failed", e);
  }
}

/* ---------- 事件绑定 ---------- */
$("askForm").addEventListener("submit", (e) => {
  e.preventDefault();
  ask($("q").value);
});

$$(".chip", $("chips")).forEach((c) => {
  c.addEventListener("click", () => {
    const text = c.textContent.trim();
    if (text === "我有个问题想问…") { $("q").focus(); return; }
    if (text === "心血管系统") { $("q").value = "心血管系统由哪些部分组成"; ask($("q").value); return; }
    $("q").value = text;
    ask(text);
  });
});

$("pmForm").addEventListener("submit", (e) => {
  e.preventDefault();
  pmSearch($("pmQ").value);
});

$$(".pm-chip").forEach((c) => {
  c.addEventListener("click", () => {
    $("pmQ").value = c.textContent.trim();
    pmSearch($("pmQ").value);
  });
});

$$(".quick-card").forEach((card) => {
  card.addEventListener("click", () => {
    const act = card.dataset.act;
    if (act === "research") { showView("research"); $("pmQ").focus(); return; }
    if (act === "learn") { showView("home"); $("q").focus(); return; }
    if (act === "quiz") { showView("quiz"); return; }
    if (act === "mentor") { toast("导师推荐为后续版本功能。", 2600); return; }
  });
});

/* ---------- 学习评估（诊断 → 三要点评分 → 掌握度） ---------- */
let quizConcept = null;
let quizTask = null;

function renderQuiz(data) {
  const box = $("quizConcepts");
  const report = $("quizReport");
  if (!data) return;

  // 指标
  const m = $("quizMetrics");
  if (m && !m.dataset.done) {
    const st = data.stats || {};
    m.innerHTML = "";
    [["已测评知识点", (st.assessed || 0) + " / " + (st.total || 0)],
     ["已掌握", st.mastered || 0],
     ["需巩固", st.weak || 0],
     ["累计作答", st.attempts || 0]].forEach(([label, val]) => {
      const d = el("div", "metric");
      d.appendChild(el("strong", null, String(val)));
      d.appendChild(el("span", null, label));
      m.appendChild(d);
    });
    m.dataset.done = "1";
  }

  // 知识点选择
  if (box && !box.dataset.done) {
    box.innerHTML = "";
    (data.concepts || []).forEach((c) => {
      const b = el("button", "chip", c.name);
      b.type = "button";
      b.dataset.cid = c.id;
      b.addEventListener("click", () => {
        quizConcept = c.id;
        $$(".chip", box).forEach((x) => x.classList.toggle("is-active", x === b));
        loadTask(c.id);
      });
      box.appendChild(b);
    });
    box.dataset.done = "1";
  }

  // 掌握概览
  if (report && !report.dataset.done) {
    report.innerHTML = "";
    (data.concepts || []).forEach((c) => {
      const row = el("button", "weak-item");
      row.type = "button";
      row.appendChild(el("b", null, c.status || "未测评"));
      row.appendChild(el("span", null, c.name));
      row.appendChild(el("span", "count", (c.attempts || 0) + " 题"));
      row.addEventListener("click", () => {
        quizConcept = c.id;
        loadTask(c.id);
      });
      report.appendChild(row);
    });
    report.dataset.done = "1";
  }

  if (!quizTask) {
    $("quizArea").innerHTML = '<p class="empty-line">选择右侧任意知识点开始诊断，系统会出一道含三个要点的题。</p>';
  }
}

async function loadTask(cid) {
  $("quizArea").innerHTML = '<p class="empty-line">正在出题…</p>';
  try {
    const t = await api("/api/task", { concept: cid, kind: "diagnostic" });
    quizTask = t;
    renderTaskCard(t);
  } catch (e) {
    $("quizArea").innerHTML = '<p class="empty-line">出题失败：' + e.message + "</p>";
  }
}

function renderTaskCard(t) {
  $("quizKind").textContent = t.kind === "transfer" ? "迁移题 · 不同情境" : "诊断题";
  const area = $("quizArea");
  area.innerHTML = "";
  area.appendChild(el("p", "answer", t.prompt));

  const form = el("div");
  const answers = [];
  (t.points || []).forEach((p, i) => {
    const wrap = el("div", "cite");
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "stretch";
    wrap.appendChild(el("b", null, (i + 1) + ". " + p.label));
    const row = el("div", "chips");
    row.style.marginTop = "8px";
    p.options.forEach((opt) => {
      const b = el("button", "chip", opt);
      b.type = "button";
      b.addEventListener("click", () => {
        answers[i] = opt;
        $$(".chip", row).forEach((x) => x.classList.toggle("is-active", x === b));
      });
      row.appendChild(b);
    });
    wrap.appendChild(row);
    form.appendChild(wrap);
  });
  area.appendChild(form);

  const submit = el("button", "btn btn-primary", "提交作答");
  submit.style.marginTop = "16px";
  submit.addEventListener("click", () => submitAnswer(t, answers));
  area.appendChild(submit);
}

async function submitAnswer(t, answers) {
  if (answers.filter(Boolean).length !== (t.points || []).length) {
    toast("三个要点都要选（不会可选「暂时不确定」）");
    return;
  }
  try {
    const r = await api("/api/answer", { token: t.token, answers: answers, confidence: "一般" });
    renderQuizResult(r);
  } catch (e) {
    toast("提交失败：" + e.message);
  }
}

function renderQuizResult(r) {
  const area = $("quizArea");
  area.innerHTML = "";
  const head = el("p", "answer");
  head.innerHTML = "<b>得分 " + r.score + " / 100</b>　" + r.label;
  area.appendChild(head);
  area.appendChild(el("p", "page-sub", r.why));

  (r.rubric || []).forEach((p) => {
    const row = el("div", "cite " + (p.correct ? "ok" : "no"));
    row.appendChild(icon(p.correct ? "i-check" : "i-x"));
    const body = el("div");
    body.appendChild(el("b", null, p.label + "：" + (p.correct ? "正确" : "错在「" + p.selected + "」")));
    body.appendChild(el("div", "reason", p.reason + "　正确要点：" + p.expected));
    row.appendChild(body);
    area.appendChild(row);
  });

  const next = el("button", "btn btn-primary", "下一题");
  next.style.marginTop = "16px";
  next.addEventListener("click", () => loadTask(r.concept));
  area.appendChild(next);

  const toReport = el("button", "link", "查看掌握概览 ›");
  toReport.style.marginLeft = "12px";
  toReport.addEventListener("click", async () => {
    $("quizReport").dataset.done = "";
    $("quizMetrics").dataset.done = "";
    await refreshOverview();
    renderQuiz(overviewData);
  });
  area.appendChild(toReport);
}

/* ---------- 启动 ---------- */
(async function init() {
  await refreshOverview();
  const preset = new URLSearchParams(location.search).get("q");
  const hash = location.hash.replace("#", "");
  if (hash && VIEWS.includes(hash)) showView(hash);
  if (preset) {
    $("q").value = preset;
    ask(preset);
  }
})();
