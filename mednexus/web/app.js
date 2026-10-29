/* 医枢 MedNexus · 医学学习工作台 —— 前端逻辑
   视图切换 / 提问三卡 / 科研探索 / 我的学习 / 知识库 / 状态
*/
const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

let busy = false;
let overviewData = null;
let wanderOriginConcept = null;
let selectedCourseConcept = null;
let selectedCourseMode = "test";
let activeRequests = 0;
let dataResetting = false;
let pmRequestId = 0;
let readingRequestId = 0;
let researchContext = null;
let askOriginConcept = null;
let answerOriginConcept = null;
let learningPlanLoading = false;

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

/* 每位浏览器一个学习身份，存在本地；同一台电脑换浏览器视为不同人 */
function learnerId() {
  const KEY = "mednexus-learner";
  let v = localStorage.getItem(KEY);
  if (!v || !/^[a-f0-9]{48}$/.test(v)) {
    const buf = new Uint8Array(24);
    crypto.getRandomValues(buf);
    v = Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(KEY, v);
  }
  return v;
}

async function api(path, payload) {
  if (dataResetting && path !== "/api/reset") throw new Error("正在清理数据，请稍后再试");
  const headers = { "X-Learner-ID": learnerId() };
  if (payload) headers["Content-Type"] = "application/json";
  const opt = payload
    ? { method: "POST", headers, body: JSON.stringify(payload) }
    : { method: "GET", headers };
  activeRequests++;
  try {
    const res = await fetch(path, opt);
    const data = await res.json();
    if (!res.ok) {
      const error = new Error(data.error || "请求失败");
      if (data.url) error.url = data.url;
      throw error;
    }
    return data;
  } finally {
    activeRequests--;
  }
}

/* ---------- 视图切换 ---------- */
const VIEWS = ["home", "learn", "quiz", "quicknotes", "books", "materials", "research", "me"];

function showView(name, { restoreTask = true } = {}) {
  if (!VIEWS.includes(name)) name = "home";
  VIEWS.forEach((v) => {
    const sec = $("view-" + v);
    if (sec) sec.classList.toggle("is-active", v === name);
  });
  $$(".nav-item").forEach((b) => b.classList.toggle("is-active", b.dataset.view === name));
  $("rail").classList.toggle("is-hidden", name !== "home");
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (name === "learn" && overviewData) renderLearn(overviewData);
  if (name === "quiz") {
    renderQuiz(overviewData);
    loadLearningReport();
    if (restoreTask && quizPhase === "empty") resumeActiveTask();
  }
  if (name === "quicknotes") loadQuicknotes();
  if (name === "materials" && typeof loadCourseMaterials === "function") loadCourseMaterials();
  if (name === "books" && overviewData) renderBooks(overviewData);
  if (name === "me" && overviewData) renderStatus(overviewData);
  const nextHash = name === "home" ? "" : "#" + name;
  if (location.hash !== nextHash) history.pushState(null, "", location.pathname + location.search + nextHash);
}

window.addEventListener("popstate", () => showView(location.hash.slice(1) || "home"));
window.addEventListener("hashchange", () => showView(location.hash.slice(1) || "home"));

$$(".nav-item").forEach((b) => {
  b.setAttribute("aria-label", b.textContent.trim());
  b.title = b.textContent.trim();
});
$$(".nav-item").forEach((b) => b.addEventListener("click", () => {
  if (b.dataset.view === "research") resetResearchContext();
  if (b.dataset.view === "home") setAskContext(null);
  showView(b.dataset.view);
}));
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
  const plan = data.learning_plan;
  if (plan && Array.isArray(plan.items)) {
    const tasks = plan.items.filter((item) => item && typeof item.concept === "string" && item.concept &&
      ["resume", "review", "learn"].includes(item.action)).slice(0, 3);
    tasks.forEach((item) => {
      const li = el("li");
      const box = el("span", "box"); box.appendChild(icon("i-check"));
      const prefix = item.action === "resume" ? "继续：" : item.kind === "transfer" ? "迁移验证：" : item.action === "review" ? "复习：" : "初测：";
      const action = el("button", "plan-action learning-plan-task", prefix + (item.name || item.concept));
      action.type = "button"; action.disabled = learningPlanLoading;
      action.title = item.reason || "根据本机作答记录安排";
      action.addEventListener("click", () => startLearningPlanTask(item, action));
      li.append(box, action); ul.appendChild(li);
    });
    if (!tasks.length) {
      const li = el("li");
      const body = el("div");
      const next = formatLearningPlanDate(plan.next_due_at);
      body.appendChild(el("p", "study-source", next ? "下次建议复习：" + next + "（北京时间）" : "当前没有到期任务。"));
      const open = el("button", "plan-action", "查看课程与学习路径"); open.type = "button";
      open.addEventListener("click", () => showView("learn"));
      body.appendChild(open); li.appendChild(body); ul.appendChild(li);
    }
  } else {
    const items = [];
    if (data.weak && data.weak.length) {
      data.weak.slice(0, 2).forEach((w) => {
        items.push({ text: "复习《" + shortBook(w.book) + "》P" + w.page + " 附近", done: false });
      });
    }
    items.push({ text: "完成 1 次有书页引用的提问", done: (data.questions?.day_cited || 0) > 0, view: "home" });
    items.push({ text: "检索 1 次 PubMed 文献", done: (data.literature?.day || 0) > 0, view: "research" });
    items.push({ text: "查看课程与推荐任务", done: false, view: "learn" });
    items.slice(0, 4).forEach((it) => {
      const li = el("li", it.done ? "done" : "");
      const box = el("span", "box"); box.appendChild(icon("i-check"));
      const action = el("button", "plan-action", it.text); action.type = "button";
      action.addEventListener("click", () => {
        if (it.view === "research") resetResearchContext();
        showView(it.view || "learn");
      });
      li.append(box, action); ul.appendChild(li);
    });
  }

  const day = /^\d{4}-\d{2}-\d{2}$/.test(data.day_date || "") ? new Date(data.day_date + "T12:00:00+08:00") : new Date();
  $("planDate").textContent = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", weekday: "short"
  }).format(Number.isNaN(day.getTime()) ? new Date() : day);
}

function formatLearningPlanDate(timestamp) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false
  }).format(new Date(timestamp * 1000));
}

function renderLearningPlan(plan, errorMessage = "") {
  const panel = $("learningPlan");
  if (!panel) return;
  panel.innerHTML = "";
  const heading = el("div", "learning-plan-heading");
  const headingText = el("div");
  const title = el("h2", null, "今天从这里开始"); title.id = "learningPlanTitle";
  headingText.append(el("p", "study-label", "根据你的作答安排下一步"), title);
  const refresh = el("button", "link", "刷新计划"); refresh.type = "button";
  refresh.addEventListener("click", async () => {
    if (learningPlanLoading) return;
    refresh.disabled = true;
    try { await refreshOverview(); } finally { refresh.disabled = false; }
  });
  heading.append(headingText, refresh); panel.appendChild(heading);
  const status = el("p", "study-source learning-plan-status");
  status.id = "learningPlanStatus"; status.setAttribute("role", "status");
  if (errorMessage) status.textContent = "计划刷新失败，" + (plan ? "当前保留上一次结果。" : "请重试读取。") + " " + errorMessage;
  panel.appendChild(status);
  if (!plan || !Array.isArray(plan.items)) {
    panel.appendChild(el("p", "empty-line", "暂未读取到学习计划。你仍可从“我的学习”选择知识点；这里不会显示预设成绩或虚构任务。"));
    const open = el("button", "btn", "选择知识点"); open.type = "button";
    open.addEventListener("click", () => showView("learn")); panel.appendChild(open);
    return;
  }
  panel.appendChild(el("p", "study-source learning-plan-scope", plan.scope || "根据本机学习记录推荐"));
  const counts = plan.counts || {};
  const metrics = el("div", "learning-plan-metrics");
  [["今日已练", counts.practiced_today], ["到期待练", counts.due], ["尚未测评", counts.new]].forEach(([label, count]) => {
    const metric = el("div");
    metric.append(el("strong", null, Number.isFinite(count) && count >= 0 ? String(count) : "—"), el("span", null, label));
    metrics.appendChild(metric);
  });
  panel.appendChild(metrics);
  const list = el("div", "learning-plan-list");
  const items = plan.items.filter((item) => item && typeof item.concept === "string" && item.concept &&
    ["resume", "review", "learn"].includes(item.action)).slice(0, 5);
  const more = items.length > 2 ? el("details", "learning-plan-more") : null;
  if (more) more.appendChild(el("summary", null, "还有 " + (items.length - 2) + " 项学习建议"));
  items.forEach((item, index) => {
    const row = el("article", "learning-plan-item" + (index === 0 ? " is-next" : ""));
    const content = el("div", "learning-plan-content");
    const nameRow = el("div", "learning-plan-name");
    const label = item.action === "resume" ? "继续未完成" : item.action === "review" ? "复习巩固" : "新知识";
    nameRow.append(el("span", "pill", label), el("h3", null, item.name || item.concept));
    content.append(nameRow, el("p", "learning-plan-reason", item.reason || "根据本机作答记录安排。"));
    if (Array.isArray(item.weak_points) && item.weak_points.length) {
      content.appendChild(el("p", "learning-plan-weak", "重点补齐：" + item.weak_points.slice(0, 3).join("、")));
    }
    const detail = [];
    if (Number.isFinite(item.last_score)) detail.push("最近作答 " + item.last_score + " 分");
    if (Number.isFinite(item.due_at)) detail.push("建议复习时间 " + formatLearningPlanDate(item.due_at));
    if (detail.length) content.appendChild(el("p", "study-source learning-plan-detail", detail.join(" · ")));
    const start = el("button", "btn" + (index === 0 ? " btn-primary" : "") + " learning-plan-task",
      item.action === "resume" ? "继续作答 →" : item.kind === "transfer" ? "做迁移题 →" : item.action === "review" ? "开始复习 →" : "先测一测 →");
    start.type = "button"; start.disabled = learningPlanLoading;
    start.addEventListener("click", () => startLearningPlanTask(item, start));
    row.append(content, start); (index < 2 ? list : more).appendChild(row);
  });
  if (more) list.appendChild(more);
  if (!items.length) {
    const next = formatLearningPlanDate(plan.next_due_at);
    list.appendChild(el("p", "empty-line", "当前没有到期的建议任务。" + (next ? "下次建议复习时间：" + next + "（北京时间）。" : "") + "你也可以从“我的学习”主动选择知识点。"));
    const open = el("button", "btn", "查看我的学习"); open.type = "button";
    open.addEventListener("click", () => showView("learn")); list.appendChild(open);
  }
  panel.appendChild(list);
  const method = el("details", "learning-plan-method");
  method.append(el("summary", null, "为什么这样安排？"), el("p", "study-source",
    (plan.method || "推荐依据是本机作答记录。") + " 练习次数与最近得分不等于医学知识已审定或长期掌握。"));
  panel.appendChild(method);
}

async function startLearningPlanTask(item, button) {
  if (learningPlanLoading || quizLoading || quizSubmitting || (typeof quizHintLoading !== "undefined" && quizHintLoading)) {
    toast("当前学习任务正在处理，请稍后继续"); return;
  }
  learningPlanLoading = true;
  const label = button.textContent;
  button.textContent = "正在载入…"; button.disabled = true;
  $$(".learning-plan-task").forEach((control) => { control.disabled = true; });
  const status = $("learningPlanStatus"); if (status) status.textContent = "正在打开：" + (item.name || item.concept);
  let taskLoaded = false;
  try {
    showView("quiz", { restoreTask: false });
    const kind = item.action === "resume" ? "auto" : ["diagnostic", "transfer"].includes(item.kind) ? item.kind : "auto";
    await loadTask(item.concept, kind);
    if (quizPhase !== "task" || quizTask?.concept !== item.concept) throw new Error("任务未能载入，请重试。");
    taskLoaded = true;
    if (status) status.textContent = "任务已载入，完成作答后会更新计划。";
    await refreshOverview();
  } catch (error) {
    if (taskLoaded) {
      const currentStatus = $("learningPlanStatus") || status;
      if (currentStatus) currentStatus.textContent = "题目已载入，可继续作答；学习计划刷新失败：" + error.message;
      toast("题目可继续作答，学习计划稍后可刷新");
    } else {
      if (status) status.textContent = error.message;
      const area = $("quizArea"); area.innerHTML = "";
      area.appendChild(el("p", "study-source", "学习任务读取失败：" + error.message));
      const retry = el("button", "btn btn-primary", "重试本次学习任务"); retry.type = "button";
      retry.addEventListener("click", () => startLearningPlanTask(item, button)); area.appendChild(retry);
      toast("任务读取失败，可点击重试");
    }
  } finally {
    learningPlanLoading = false;
    button.textContent = label; button.disabled = false;
    $$(".learning-plan-task").forEach((control) => { control.disabled = false; });
  }
}

function shortBook(name) {
  return (name || "").replace(/（.*?）/g, "").replace(/\(.*?\)/g, "");
}

/* ---------- 我的学习 ---------- */
function renderLearn(data) {
  renderCourse(data);
  const q = data.questions || {};
  const m = $("metrics");
  m.innerHTML = "";
  [
    ["累计提问", q.total || 0],
    ["近 7 天提问", q.week || 0],
    ["近 7 天有引用", q.week_cited || 0],
    ["常问页段", (data.weak || []).length],
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

function renderCourse(data) {
  if (typeof mountCourseCatalog === "function") mountCourseCatalog($("courseCatalog"), {
    onAsk: (text) => { setAskContext(null); showView("home"); $("q").value = text; $("q").focus(); },
    onStart: async () => { showView("quiz", { restoreTask: false }); await loadTask(data.recommendation?.id || "oculomotor", "auto"); }
  });
  const box = $("coursePanel");
  box.innerHTML = "";
  const course = data.course;
  const concepts = data.concepts || [];
  if (!course || !concepts.length) {
    box.appendChild(el("p", "empty-line", "课程暂未载入，请确认本地服务已更新并刷新页面。"));
    return;
  }
  if (!concepts.some((c) => c.id === selectedCourseConcept)) {
    selectedCourseConcept = data.active?.concept || data.recommendation?.id || concepts[0].id;
  }
  const selected = concepts.find((c) => c.id === selectedCourseConcept);
  const heading = el("div", "course-heading");
  const names = el("div");
  names.append(el("p", "study-label", "我的课程 / " + course.name),
    el("h2", null, course.chapter + " · 示例章节"),
    el("p", "study-source", "本区提供 10 个脑神经知识点的诊断、补学与迁移练习。上方目录展示已导入大纲；评分目标仍待教师逐项审核。"));
  const stats = data.stats || {};
  heading.append(names, el("span", "pill", (stats.mastered || 0) + " / " + concepts.length + " 个已掌握"));
  box.appendChild(heading);
  const layout = el("div", "course-layout");
  const directory = el("div", "course-directory");
  [...new Set(concepts.map((c) => c.unit))].forEach((unit) => {
    directory.appendChild(el("h3", "course-unit", unit));
    concepts.filter((c) => c.unit === unit).forEach((c) => {
      const button = el("button", "course-topic" + (c.id === selected.id ? " is-active" : ""));
      button.type = "button";
      button.setAttribute("aria-pressed", String(c.id === selected.id));
      button.append(el("span", null, c.name), el("small", null, c.status));
      button.addEventListener("click", () => { selectedCourseConcept = c.id; renderCourse(data); });
      directory.appendChild(button);
    });
  });
  const entry = el("div", "course-entry");
  entry.append(el("p", "study-label", selected.id === data.recommendation?.id ? "根据当前作答记录推荐" : "你选择的知识点"),
    el("h3", null, selected.name),
    el("p", "study-source", "示例目标：" + selected.level + " · " + selected.status +
      "。阅读只记录接触情况，掌握需通过不同题目的测评。"));
  const modes = el("fieldset", "course-modes");
  modes.appendChild(el("legend", null, "这次想怎样开始？"));
  [["test", "先测一测，检查掌握情况"], ["study", "先复习学习卡，再做题"],
    ["ask", "我有具体问题，查询教材依据"], ["research", "从这个主题探索文献"]].forEach(([value, label]) => {
      const row = el("label");
      const radio = el("input");
      radio.type = "radio"; radio.name = "courseMode"; radio.value = value;
      radio.checked = selectedCourseMode === value;
      radio.addEventListener("change", () => { selectedCourseMode = value; });
      row.append(radio, el("span", null, label)); modes.appendChild(row);
    });
  const start = el("button", "btn btn-primary", "开始学习 →");
  start.type = "button";
  start.addEventListener("click", () => {
    if (selectedCourseMode === "test" || selectedCourseMode === "study") {
      showView("quiz", { restoreTask: false });
      if (selectedCourseMode === "study") showStudyForResult({ concept: selected.id, score: 0, rubric: [] });
      else loadTask(selected.id, "auto");
    } else if (selectedCourseMode === "ask") {
      openConceptQuestion(selected.id, selected.name);
    } else {
      openResearch(selected.name, selected.id);
    }
  });
  entry.append(modes, start);
  if (data.active) {
    const resume = el("button", "link course-resume", "继续尚未提交的测评 ›");
    resume.type = "button";
    resume.addEventListener("click", () => {
      showView("quiz", { restoreTask: false }); loadTask(data.active.concept, "auto");
    });
    entry.appendChild(resume);
  }
  layout.append(directory, entry); box.appendChild(layout);
}

/* ---------- 知识库 ---------- */
function renderBooks(data) {
  const grid = $("bookGrid");
  grid.innerHTML = "";
  if (!(data.books || []).length) {
    grid.appendChild(el("p", "empty-line", "尚未导入可核对的教材书页。准备好教材索引后，这里会显示书名与页码范围。"));
    return;
  }
  const max = Math.max(1, ...(data.books || []).map((b) => b.chunks));
  (data.books || []).forEach((b) => {
    const card = el("div", "book-card");
    const ic = el("div", "book-icon");
    ic.appendChild(icon("i-books"));
    card.appendChild(ic);
    card.appendChild(el("h3", null, shortBook(b.book)));
    const ver = (b.book.match(/（(.*?)）/) || [])[1] || "版本未注明";
    card.appendChild(el("div", "meta", ver + " · " + b.chunks + " 条索引"));
    card.appendChild(el("div", "meta", "索引页码 P" + b.min + " – P" + b.max + "（待对照原书）"));
    const bar = el("div", "bar");
    const i = el("i");
    i.style.width = Math.round((b.chunks / max) * 100) + "%";
    bar.appendChild(i);
    card.appendChild(bar);
    grid.appendChild(card);
  });
}

$("downloadIndexTemplate").addEventListener("click", () => {
  const template = [{ book: "请填写教材名称和版本", chapter: "请填写章节", page: null,
    keywords: ["请填写检索词"], text: "可选：你有权在本机使用的教材段落" }];
  const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = el("a");
  a.href = url;
  a.download = "教材页码索引模板.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$("importIndex").addEventListener("click", async () => {
  const file = $("indexFile").files?.[0];
  const status = $("importStatus");
  if (!file) { status.textContent = "请先选择 JSON 或 JSONL 文件。"; return; }
  if (!$("importAuthorized").checked) { status.textContent = "请先确认使用权和隐私要求。"; return; }
  if (file.size > 1_800_000) { status.textContent = "文件过大；请拆成不超过 1.8 MB 的批次。"; return; }
  try {
    const raw = await file.text();
    let records;
    if (file.name.toLowerCase().endsWith(".jsonl")) {
      records = raw.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
    } else {
      const parsed = JSON.parse(raw);
      records = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.records) ? parsed.records : [parsed]);
    }
    if (!records.length || records.length > 1000) throw new Error("每次只能导入 1–1000 条记录");
    status.textContent = "正在导入 " + records.length + " 条索引…";
    const result = await api("/api/import", { records, authorized: true });
    status.textContent = result.message || "已导入 " + result.count + " 条索引；页码仍需对照原书核验。";
    await refreshOverview();
  } catch (e) {
    status.textContent = "导入失败：" + e.message;
  }
});

/* ---------- 个人中心 ---------- */
function renderStatus(data) {
  const box = $("statusPanel");
  box.innerHTML = "";
  const st = data.status || {};
  const rows = [
    ["教材数量", (data.books || []).length + " 本"],
    ["索引记录", (data.chunks || 0).toLocaleString() + " 条"],
    ["累计提问", String((data.questions || {}).total || 0)],
    ["回答方式", st.llm ? "已接入大模型（" + st.model + "）" : "离线抽取模式（未配置 API Key）"],
    ["文献来源", "PubMed E-utilities（公开接口）"],
    ["拒答阈值", "覆盖率 < " + st.coverage_threshold],
    ["数据存储", "服务所在电脑的 SQLite；联网发送范围见本页说明"],
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

function downloadLearningJson(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = el("a"); link.href = url;
  link.download = "MedNexus-学习报告-" + new Date().toLocaleDateString("sv-SE") + ".json";
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$("exportLearning").addEventListener("click", async () => {
  const button = $("exportLearning"); button.disabled = true;
  try {
    const data = await api("/api/export");
    const local = {};
    Object.entries(quicknoteProgress).forEach(([key, value]) => {
      if (/^\d+$/.test(key) && ["known", "review"].includes(value)) local[key] = value;
    });
    data.quicknote_self_review = local;
    data.excluded = (data.excluded || []).filter((label) => label !== "浏览器速记记录");
    downloadLearningJson(data);
    $("dataStatus").textContent = "学习报告摘要已生成。文件不包含教材原文与提问原文；不支持导入还原学习历史。";
  } catch (error) { $("dataStatus").textContent = "导出失败：" + error.message; }
  finally { button.disabled = false; }
});
$("clearConfirmed").addEventListener("change", () => { $("clearLearning").disabled = !$("clearConfirmed").checked; });
$("clearScope").addEventListener("change", () => { $("clearConfirmed").checked = false; $("clearLearning").disabled = true; });
$("clearLearning").addEventListener("click", async () => {
  if (!$("clearConfirmed").checked || dataResetting) return;
  if (activeRequests) { $("dataStatus").textContent = "仍有请求正在处理，请完成后再清理。"; return; }
  dataResetting = true; $("clearLearning").disabled = true;
  const scope = $("clearScope").value;
  try {
    await api("/api/reset", { scope, confirmation: scope === "all" ? "CLEAR_MY_DATA" : "CLEAR_MY_LEARNING" });
    clearTutorChatState();
    localStorage.removeItem(quicknoteKey());
    localStorage.removeItem("mednexus-materials-" + learnerId());
    quicknoteProgress = {}; quizTask = null; quizConcept = null; quizPhase = "empty";
    selectedCourseConcept = null; resetResearchContext(); setAskContext(null); answerOriginConcept = null;
    $("result").hidden = true; $("q").value = "";
    $("dataStatus").textContent = scope === "all" ? "已清理学习记录和当前身份导入的索引。" : "已清理学习记录，导入索引已保留。";
    $("clearConfirmed").checked = false;
  } catch (error) { $("dataStatus").textContent = "清理未完成：" + error.message; }
  finally {
    dataResetting = false; $("clearLearning").disabled = !$("clearConfirmed").checked;
    await refreshOverview();
  }
});

/* ---------- 提问 ---------- */
const MODE_TEXT = { "教材摘录": "教材原文要点", "拒答": "暂无教材依据", llm: "模型生成", extractive: "离线抽取", extractive_fallback: "离线兜底", refuse: "已拒答" };

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
    head.appendChild(el("b", null, "《" + c.book + "》" + (c.page ? "第 " + c.page + " 页" : "（无页码）")));
    if (c.chapter) head.appendChild(el("span", "reason", " · " + c.chapter));
    head.appendChild(document.createTextNode(" "));
    head.appendChild(el("span", "reason", c.reason || ""));
    body.appendChild(head);
    if (c.snippet) body.appendChild(el("div", "reason", "「" + c.snippet + "」"));
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
  if (p.authors?.length) card.appendChild(el("p", "paper-authors", p.authors.slice(0, 3).join("、")));
  if (p.abstract && p.abstract.length) {
    const raw = Array.isArray(p.abstract)
      ? p.abstract.map((part) => part.text || "").filter(Boolean).join(" ")
      : String(p.abstract);
    const t = raw.slice(0, 300);
    card.appendChild(el("p", null, t + (raw.length > 300 ? "…" : "")));
  }
  if (p.pmid) {
    const a = el("a", null, "PubMed · PMID " + p.pmid + " ↗");
    a.href = "https://pubmed.ncbi.nlm.nih.gov/" + p.pmid + "/";
    a.target = "_blank";
    a.rel = "noopener";
    card.appendChild(a);
    if (wanderOriginConcept) {
      const read = el("button", "link paper-read", "阅读摘要与证据 →");
      read.type = "button";
      read.addEventListener("click", () => loadPaperReading(p));
      card.appendChild(read);
    }
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

function setAskContext(concept) {
  askOriginConcept = concept;
  const banner = $("askContext");
  banner.hidden = !concept;
  banner.innerHTML = "";
  if (!concept) return;
  const name = overviewData?.concepts?.find((c) => c.id === concept)?.name || concept;
  banner.appendChild(el("span", null, "当前学习：系统解剖学 / 脑神经 / " + name));
  const back = el("button", "link", "返回知识点学习 ›");
  back.type = "button";
  back.addEventListener("click", () => { showView("quiz", { restoreTask: false }); loadTask(concept, "auto"); });
  const clear = el("button", "link", "切换为独立提问");
  clear.type = "button"; clear.addEventListener("click", () => setAskContext(null));
  banner.append(back, clear);
}

function openConceptQuestion(concept, question) {
  setAskContext(concept); showView("home"); $("q").value = question; $("q").focus();
}

async function ask(question, originConcept = null) {
  if (busy) return;
  const q = (question || "").trim();
  if (!q) { toast("先输入一个问题"); $("q").focus(); return; }

  busy = true;
  setAskContext(originConcept);
  answerOriginConcept = null;
  $("wanderBtn").disabled = true;
  $("sendBtn").disabled = true;
  const result = $("result");
  result.hidden = false;
  $("resultTitle").textContent = "正在检索「" + q + "」";
  $("answerText").textContent = "正在教材里找依据，并回查页码…";
  $("answerText").classList.remove("is-refused");
  $("cites").innerHTML = "";
  $("tips").innerHTML = "";
  $("badges").innerHTML = "";
  result.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const data = await api("/api/ask", { question: q });
    answerOriginConcept = originConcept;
    $("resultTitle").textContent = "关于「" + data.question + "」";
    renderBadges(data);
    const ans = $("answerText");
    ans.textContent = data.answer || "（无内容）";
    ans.classList.toggle("is-refused", !!data.refused);
    $("modeTag").textContent = MODE_TEXT[data.mode] || data.mode || "—";
    renderCites(data);
    if (typeof showLocalMaterialMatches === "function") showLocalMaterialMatches(q);
    const tips = $("tips");
    tips.innerHTML = "";
    (data.tips || []).forEach((t) => tips.appendChild(el("li", null, t)));
    $("statCoverage").textContent = (data.coverage ?? 0).toFixed(2);
    const ok = (data.citations || []).filter((c) => c.ok).length;
    $("statCites").textContent = ok + "/" + (data.citations || []).length;
    $("statMs").textContent = data._ms ?? "—";
    $("wanderPrompt").textContent = data.wander?.prompt || "要不要深入了解？进入文献漫游查找前沿研究。";
    $("wanderBtn").dataset.question = data.question || q;
    $("wanderBtn").disabled = false;
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
function resetResearchContext() {
  wanderOriginConcept = null; researchContext = null;
  pmRequestId++; readingRequestId++;
  $("pmResults").innerHTML = ""; $("pmStatus").textContent = "";
  $("paperReading").hidden = true; $("researchReturn").hidden = true;
  $("researchQueryEditor").hidden = true; $("pmQuery").value = "";
  $("researchContextLabel").textContent = "";
}

function openResearch(question, concept = null) {
  resetResearchContext();
  wanderOriginConcept = concept;
  researchContext = { question, concept };
  $("pmQ").value = question;
  showView("research"); $("pmQ").focus();
  if (concept) {
    const name = overviewData?.concepts?.find((c) => c.id === concept)?.name || concept;
    $("researchContextLabel").textContent = "来自：系统解剖学 / 脑神经 / " + name;
    $("researchReturn").hidden = false;
    $("pmStatus").textContent = "请写下这个知识点的具体机制、差异或证据疑问。先判断问题并确认英文检索式，再查询文献。";
  }
}

async function pmSearch(q, originConcept = null, editedQuery = null) {
  const query = (q || "").trim();
  if (!query) { toast("先输入一个疑问"); return; }
  const request = ++pmRequestId;
  readingRequestId++;
  wanderOriginConcept = originConcept;
  researchContext = { question: query, concept: originConcept };
  $("pmStatus").textContent = originConcept && editedQuery === null ? "正在判断疑问与当前知识点的关联…" : "正在检索 PubMed 真实文献…";
  $("pmResults").innerHTML = "";
  $("paperReading").hidden = true;
  $("researchReturn").hidden = !originConcept;
  $("researchQueryEditor").hidden = true;
  try {
    if (originConcept && editedQuery === null) {
      const gate = await api("/api/research", { concept: originConcept, question: query });
      if (request !== pmRequestId) return;
      $("pmStatus").textContent = gate.reason + (gate.eligible ? "\n" + gate.mapping : "\n建议先补学，再明确要比较的条件或证据。");
      if (gate.eligible) {
        $("pmQuery").value = gate.query;
        $("researchQueryEditor").hidden = false;
      }
      return;
    }
    const payload = { question: query, retmax: 6 };
    if (originConcept) { payload.concept = originConcept; payload.query = editedQuery; }
    const data = await api("/api/pubmed", payload);
    if (request !== pmRequestId) return;
    $("pmStatus").textContent = data.note
      ? (data.mapping || "") + "\n检索式：" + data.note +
        "\nPubMed 共 " + data.count + " 条匹配；下方按发表日期显示本次获取的文献。摘要为原文节选，具体结论请打开原文核对。"
      : "";
    renderPapers($("pmResults"), data.papers, data.note);
    if (originConcept) { $("pmQuery").value = data.note; $("researchQueryEditor").hidden = false; }
    $("researchReturn").hidden = !wanderOriginConcept;
    if (!data.papers || !data.papers.length) {
      $("pmStatus").textContent = "没有取到文献：" + (data.note || "检索式为空");
    }
  } catch (e) {
    if (request !== pmRequestId) return;
    $("pmStatus").textContent = "检索失败：" + e.message;
    if (originConcept && editedQuery !== null) $("researchQueryEditor").hidden = false;
    if (e.url) {
      const a = el("a", null, "在 PubMed 打开检索式 ↗");
      a.href = e.url;
      a.target = "_blank";
      a.rel = "noopener";
      $("pmStatus").appendChild(a);
    }
  }
}

async function loadPaperReading(paper) {
  const context = researchContext;
  if (!context?.concept) return;
  const request = ++readingRequestId;
  const panel = $("paperReading");
  const body = $("paperReadingBody");
  panel.hidden = false;
  body.textContent = "正在读取 PubMed 摘要…";
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  try {
    const result = await api("/api/read-paper", {
      concept: context.concept, pmid: paper.pmid, question: context.question
    });
    if (request !== readingRequestId) return;
    body.innerHTML = "";
    body.appendChild(el("h4", null, result.paper.title));
    body.appendChild(el("p", "study-label", "围绕问题：" + result.question));
    const evidence = (result.evidence || []).map((part) => part.text).filter(Boolean);
    const excerpt = evidence.join(" ").slice(0, 400);
    body.appendChild(el("p", "answer", excerpt ?
      "摘要中的结果或结论摘录：" + excerpt + (evidence.join(" ").length > 400 ? "…" : "") :
      "摘要未提供可直接提取的结果或结论段落。"));
    body.appendChild(el("p", "study-source", result.limitations));
    body.appendChild(el("p", "study-source", result.relationship));
    if (result.ai_guide) {
      body.appendChild(el("h4", null, "AI 辅助摘要解读（需对照原摘要核验）"));
      [["question", "问题"], ["evidence", "证据"], ["limitations", "局限"], ["relationship", "与课程知识的关系"]].forEach(([key, label]) => {
        body.appendChild(el("p", "study-source", label + "：" + (result.ai_guide[key] || "摘要未报告")));
      });
    }
    if (result.warning) body.appendChild(el("p", "study-source", result.warning));
  } catch (e) {
    if (request !== readingRequestId) return;
    body.textContent = "摘要读取失败：" + e.message;
  }
}

/* ---------- 数据加载 ---------- */
async function refreshOverview() {
  try {
    overviewData = await api("/api/overview");
    renderRecent(overviewData.recent || []);
    renderChecklist(overviewData);
    renderLearningPlan(overviewData.learning_plan);
    if (document.querySelector("#view-learn.is-active")) renderLearn(overviewData);
    if (document.querySelector("#view-quiz.is-active")) renderQuiz(overviewData);
    if (document.querySelector("#view-books.is-active")) renderBooks(overviewData);
    if (document.querySelector("#view-me.is-active")) renderStatus(overviewData);
  } catch (e) {
    console.warn("overview failed", e);
    renderLearningPlan(overviewData?.learning_plan, e.message);
  }
}

/* ---------- 事件绑定 ---------- */
$("askForm").addEventListener("submit", (e) => {
  e.preventDefault();
  ask($("q").value, askOriginConcept);
});

$("wanderBtn").addEventListener("click", () => {
  const topic = $("wanderBtn").dataset.question || $("q").value.trim();
  if (!topic) return;
  openResearch(topic, answerOriginConcept);
  pmSearch(topic, answerOriginConcept);
});

$("returnTransfer").addEventListener("click", () => {
  if (!wanderOriginConcept) return;
  const cid = wanderOriginConcept;
  showView("quiz", { restoreTask: false });
  loadTask(cid, "transfer");
});

$$(".chip", $("chips")).forEach((c) => {
  c.addEventListener("click", () => {
    const text = c.textContent.trim();
    if (text === "我有个问题想问…") { $("q").focus(); return; }
    $("q").value = text;
    setAskContext(null);
    ask(text);
  });
});

$("pmForm").addEventListener("submit", (e) => {
  e.preventDefault();
  pmSearch($("pmQ").value, wanderOriginConcept);
});
$("runResearchQuery").addEventListener("click", () => pmSearch($("pmQ").value, wanderOriginConcept, $("pmQuery").value));
$("pmQ").addEventListener("input", () => {
  pmRequestId++; readingRequestId++;
  $("researchQueryEditor").hidden = true; $("paperReading").hidden = true;
  $("pmResults").innerHTML = "";
  $("pmStatus").textContent = "疑问已修改，请重新提交。";
});

$$(".pm-chip").forEach((c) => {
  c.addEventListener("click", () => {
    resetResearchContext();
    $("pmQ").value = c.textContent.trim();
    pmSearch($("pmQ").value);
  });
});

$$(".quick-card").forEach((card) => {
  card.addEventListener("click", () => {
    const act = card.dataset.act;
    if (act === "research") { resetResearchContext(); showView("research"); $("pmQ").focus(); return; }
    if (act === "learn") {
      showView("learn");
      return;
    }
    if (act === "quiz") { showView("quiz"); return; }
  });
});

/* ---------- 学习评估（诊断 → 三要点评分 → 掌握度） ---------- */
let quizConcept = null;
let quizTask = null;
let quizPhase = "empty";
let quizSubmitting = false;
let quizLoading = false;
let quizHintLoading = false;

async function resumeActiveTask() {
  if (quizLoading || quizSubmitting || quizHintLoading) return;
  quizLoading = true;
  try {
    const data = await api("/api/bootstrap");
    if (quizPhase !== "empty" || !data.active) return;
    quizConcept = data.active.concept;
    quizTask = data.active;
    quizPhase = "task";
    renderTaskCard(data.active);
    renderQuiz(overviewData);
  } catch (e) {
    console.warn("active task restore failed", e);
  } finally { quizLoading = false; }
}

function renderQuiz(data) {
  const box = $("quizConcepts");
  const report = $("quizReport");
  if (!data) return;

  // 指标
  const m = $("quizMetrics");
  if (m) {
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
  }

  // 知识点选择
  if (box) {
    box.innerHTML = "";
    (data.concepts || []).forEach((c) => {
      const b = el("button", "chip", c.name);
      b.type = "button";
      b.dataset.cid = c.id;
      b.classList.toggle("is-active", c.id === quizConcept);
      b.addEventListener("click", () => {
        $$(".chip", box).forEach((x) => x.classList.toggle("is-active", x === b));
        loadTask(c.id, "auto");
      });
      box.appendChild(b);
    });
  }

  // 掌握概览
  if (report) {
    report.innerHTML = "";
    (data.concepts || []).forEach((c) => {
      const row = el("button", "weak-item");
      row.type = "button";
      row.appendChild(el("b", null, c.status || "未测评"));
      row.appendChild(el("span", null, c.name));
      row.appendChild(el("span", "count", (c.attempts || 0) + " 题"));
      row.addEventListener("click", () => {
        loadTask(c.id, "auto");
      });
      report.appendChild(row);
    });
  }

  if (quizPhase === "empty") {
    $("quizArea").textContent = "选择右侧任意知识点，开始三个要点的诊断。";
  }
}

async function loadTask(cid, kind = "auto") {
  if (quizLoading || quizSubmitting || quizHintLoading) { toast("当前任务正在处理，请稍后切换"); return null; }
  quizLoading = true;
  quizConcept = cid;
  quizPhase = "loading";
  $("quizArea").textContent = "正在出题…";
  try {
    const t = await api("/api/task", { concept: cid, kind });
    quizTask = t;
    quizPhase = "task";
    renderTaskCard(t);
    return t;
  } catch (e) {
    quizPhase = "error";
    $("quizArea").textContent = "出题失败：" + e.message;
    const retry = el('button', 'btn', '重试出题');
    retry.addEventListener('click', () => loadTask(cid, kind));
    $("quizArea").appendChild(retry);
    return null;
  } finally { quizLoading = false; renderQuiz(overviewData); }
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
    const hints = el('div', 'task-hints');
    const previousHints = p.hints || [];
    previousHints.forEach((text, step) => hints.appendChild(el('p', 'study-source', '思路' + (step + 1) + '：' + text)));
    const hintButton = el('button', 'btn task-hint-button', previousHints.length ? '再给一步提示' : '卡住了，给我一个思路');
    hintButton.type = 'button';
    hintButton.dataset.level = previousHints.length;
    if (previousHints.length >= 2) { hintButton.disabled = true; hintButton.textContent = '两步提示已显示'; }
    hintButton.addEventListener('click', () => requestTaskHint(t, i, hintButton, hints));
    wrap.append(hints, hintButton);
    form.appendChild(wrap);
  });
  area.appendChild(form);

  const submit = el("button", "btn btn-primary", "提交作答");
  submit.style.marginTop = "16px";
  submit.addEventListener("click", () => submitAnswer(t, answers));
  area.appendChild(submit);
  area.appendChild(el('p', 'study-source', '可先独立作答；思路提示按步骤展开。使用提示的作答会标为辅助练习，不作为独立掌握证据。'));
  const tutorBox = el('section'); area.appendChild(tutorBox);
  mountTutorChat(tutorBox, t.token);
}

async function requestTaskHint(t, point, button, container) {
  if (quizLoading || quizSubmitting || quizHintLoading || quizTask?.token !== t.token) return;
  const level = Number(button.dataset.level || 0) + 1;
  if (level > 2) return;
  quizHintLoading = true; button.disabled = true;
  const oldLabel = button.textContent; button.textContent = '正在准备提示…';
  try {
    const data = await api('/api/hint', {token:t.token, point, level});
    if (quizTask?.token !== t.token || quizPhase !== 'task') return;
    container.appendChild(el('p', 'study-source', '思路' + data.level + '：' + data.text));
    button.dataset.level = data.level;
    button.textContent = data.level >= 2 ? '两步提示已显示' : '再给一步提示';
    button.disabled = data.level >= 2;
  } catch (error) {
    button.textContent = oldLabel; button.disabled = false;
    toast('提示暂不可用：' + error.message + '，可继续作答或重试，结果页会说明是否使用过提示');
  } finally { quizHintLoading = false; }
}

async function submitAnswer(t, answers) {
  if (quizSubmitting || quizLoading || quizHintLoading) return;
  if (answers.filter(Boolean).length !== (t.points || []).length) {
    toast("三个要点都要选（不会可选「暂时不确定」）");
    return;
  }
  quizSubmitting = true;
  try {
    const r = await api("/api/answer", { token: t.token, answers: answers, confidence: "一般" });
    quizTask = null;
    quizPhase = "result";
    renderQuizResult(r);
    await refreshOverview();
    await loadLearningReport();
  } catch (e) {
    toast("提交失败：" + e.message);
  } finally {
    quizSubmitting = false;
  }
}

function renderQuizResult(r) {
  const area = $("quizArea");
  area.innerHTML = "";
  const head = el("p", "answer");
  head.innerHTML = "<b>得分 " + r.score + " / 100</b>　" + r.label;
  area.appendChild(head);
  area.appendChild(el("p", "page-sub", r.why));
  if (r.assisted) area.appendChild(el('p', 'pill', '辅助练习 · 使用过提示或教学对话，需再独立复测'));

  (r.rubric || []).forEach((p) => {
    const row = el("div", "cite " + (p.correct ? "ok" : "no"));
    row.appendChild(icon(p.correct ? "i-check" : "i-x"));
    const body = el("div");
    body.appendChild(el("b", null, p.label + "：" + (p.correct ? "正确" : "错在「" + p.selected + "」")));
    body.appendChild(el("div", "reason", p.reason + "　正确要点：" + p.expected));
    row.appendChild(body);
    area.appendChild(row);
  });

  const next = el("button", "btn btn-primary",
    r.action === "transfer" ? "做迁移题" :
    r.action === "next" ? "查看下一学习任务" : "查看针对性补学");
  next.style.marginTop = "16px";
  next.addEventListener("click", async () => {
    if (r.action === "transfer") return loadTask(r.concept, "transfer");
    if (r.action === "next") {
      await refreshOverview();
      const cid = overviewData?.recommendation?.id || r.concept;
      return loadTask(cid, "auto");
    }
    return showStudyForResult(r);
  });
  area.appendChild(next);

  const toReport = el("button", "link", "查看学习报告 ›");
  toReport.style.marginLeft = "12px";
  toReport.addEventListener("click", () => $("learningReport").scrollIntoView({ behavior: "smooth" }));
  area.appendChild(toReport);
  if (r.tutor_token) {
    const tutorBox = el('section'); area.appendChild(tutorBox);
    mountTutorChat(tutorBox, r.tutor_token);
  }

  mountResearchBridge(area, r.concept);
}

function mountResearchBridge(container, concept) {
  const research = el("div", "research-bridge");
  research.appendChild(el("b", null, "这个知识点还有值得深挖的问题吗？"));
  const question = el("input");
  question.type = "text";
  question.maxLength = 300;
  question.placeholder = "写下具体的机制、差异或证据疑问";
  question.setAttribute("aria-label", "待判断的研究疑问");
  research.appendChild(question);
  const judge = el("button", "btn", "判断能否进入文献漫游");
  const status = el("p", "study-source");
  judge.addEventListener("click", async () => {
    const q = question.value.trim();
    if (!q) { toast("先写一个具体疑问"); question.focus(); return; }
    status.textContent = "正在判断…";
    judge.disabled = true;
    const old = research.querySelector(".research-enter");
    if (old) old.remove();
    try {
      const gate = await api("/api/research", { concept, question: q });
      if (q !== question.value.trim()) return;
      status.textContent = gate.reason;
      if (gate.eligible) {
        const enter = el("button", "btn btn-primary research-enter", "核对英文检索式 →");
        enter.addEventListener("click", () => {
          openResearch(q, concept);
          pmSearch(q, concept);
        });
        research.appendChild(enter);
      }
    } catch (e) {
      status.textContent = "判断失败：" + e.message;
    } finally { judge.disabled = false; }
  });
  question.addEventListener("input", () => {
    const old = research.querySelector(".research-enter");
    if (old) old.remove();
    status.textContent = "";
  });
  research.append(judge, status);
  container.appendChild(research);
}

async function showStudyForResult(result) {
  if (quizLoading || quizSubmitting || quizHintLoading) { toast("当前任务正在处理，请稍后再试"); return; }
  quizLoading = true;
  const area = $("quizArea");
  quizPhase = "loading";
  area.textContent = "正在整理补学内容…";
  try {
    const data = await api("/api/study", { concept: result.concept });
    quizPhase = "study";
    quizConcept = data.concept; quizTask = null;
    $("quizKind").textContent = data.study_mode === "targeted" ? "针对性补学" : "学习准备";
    renderQuiz(overviewData);
    area.innerHTML = "";
    area.appendChild(el("h3", null, (data.study_mode === "targeted" ? "针对性补学 · " : "学习准备 · ") + data.name));
    area.appendChild(el("p", "study-source", data.study_mode === "targeted" ?
      "根据本知识点最近一次作答，只整理仍未掌握的要点。" : "尚无需要补齐的错点记录。先阅读学习卡，再通过独立作答检查掌握情况。"));
    (data.focus || []).forEach((point) => {
      const row = el("div", "cite no");
      row.appendChild(el("div", null, point.label + "：" + point.reason + " 正确要点：" + point.expected));
      (point.evidence || []).forEach((source) => row.appendChild(studyEvidence(source)));
      if (!point.evidence?.length) row.appendChild(el("p", "study-source", "该要点尚无匹配的教材书页。下面的自编学习卡仅作教学示例。"));
      area.appendChild(row);
    });
    area.appendChild(el("p", "study-label", "自编学习卡（教学示例，待教师审核）"));
    area.appendChild(el("p", "answer", data.note));
    if (data.study_mode !== "targeted") (data.local_sources || []).forEach((source) => area.appendChild(studyEvidence(source)));
    if (!(data.local_sources || []).length) {
      area.appendChild(el("p", "study-source", "本知识点尚无可核对的教材页码；请结合课程教材核对学习卡。"));
    }
    if (/^https:\/\//.test(data.source?.url || "")) {
      const reference = el("a", "study-source", "公开参考：" + data.source.title + " ↗（请核对原文，不是课程教材页码）");
      reference.href = data.source.url; reference.target = "_blank"; reference.rel = "noopener";
      area.appendChild(reference);
    }
    const actions = el("div", "quicknote-actions");
    const retestKind = data.retest_kind === "transfer" ? "transfer" : "diagnostic";
    const retest = el("button", "btn btn-primary", retestKind === "diagnostic" ? "补完再测基础题" : "补完做迁移题");
    retest.addEventListener("click", () => loadTask(data.concept, retestKind));
    const askMore = el("button", "btn", "围绕这个知识点查询教材");
    askMore.addEventListener("click", () => openConceptQuestion(data.concept, data.name));
    actions.append(retest, askMore); area.appendChild(actions);
    mountResearchBridge(area, data.concept);
  } catch (e) {
    quizPhase = "result";
    area.textContent = "补学内容读取失败：" + e.message;
    const retry = el("button", "btn", "重试补学");
    retry.addEventListener("click", () => showStudyForResult(result));
    area.appendChild(retry);
  } finally { quizLoading = false; }
}

function studyEvidence(source) {
  const box = el("div", "study-evidence");
  const locator = "《" + source.book + "》" + (source.chapter ? " · " + source.chapter : "") +
    (source.page ? " · 第 " + source.page + " 页" : " · 暂无教材页码");
  box.appendChild(el("p", "study-source", locator + "（请对照原书核验）"));
  if (source.evidence_type === "text" && source.excerpt) box.appendChild(el("p", "answer", "原文节选：" + source.excerpt));
  box.appendChild(el("p", "study-source", source.evidence_notice || "导入来源尚需核对。"));
  return box;
}

async function loadLearningReport() {
  const box = $("learningReportBody");
  try {
    const data = await api("/api/report");
    box.innerHTML = "";
    const stats = data.stats || {};
    box.appendChild(el("p", "answer", "已测评 " + (stats.assessed || 0) + " / " +
      (stats.total || 0) + " 个知识点；已掌握 " + (stats.mastered || 0) +
      " 个。掌握度为原型规则判断，尚未验证为真实学习效果。"));
    const errors = Object.entries(data.errors || {}).sort((a, b) => b[1] - a[1]);
    box.appendChild(el("p", "study-label", errors.length ?
      "常见错误类型：" + errors.map(([name, count]) => name + " " + count + " 次").join("、") :
      "尚无错误记录。"));
    (data.concepts || []).filter((c) => c.attempts).forEach((c) => {
      const row = el("div", "report-row");
      row.appendChild(el("b", null, c.name));
      row.appendChild(el("span", null, "要求：" + c.level + " · " + c.status));
      row.appendChild(el("span", null, "首次 " + c.pre + " 分 → 最近 " +
        (c.post ?? c.pre) + " 分" + (c.last_assisted ? "（辅助练习）" : "（独立作答记录）")));
      box.appendChild(row);
    });
  } catch (e) {
    box.textContent = "学习报告读取失败：" + e.message;
  }
}

/* ---------- 本机 PDF 速记自测（翻卡核对，不自动评分） ---------- */
let quicknoteData = null;
let quicknoteVisible = [];
let quicknoteIndex = 0;
let quicknoteRevealed = false;
let quicknoteProgress = {};

function quicknoteKey() {
  return "mednexus-quicknotes-" + (quicknoteData?.source_sha256 || "local");
}

function saveQuicknoteProgress() {
  localStorage.setItem(quicknoteKey(), JSON.stringify(quicknoteProgress));
}

async function loadQuicknotes() {
  if (quicknoteData) return;
  try {
    quicknoteData = await api("/api/quick-notes");
    if (!quicknoteData.available || !quicknoteData.items?.length) {
      $("quicknoteCard").textContent = quicknoteData.message || "本机尚未导入速记资料。";
      return;
    }
    try { quicknoteProgress = JSON.parse(localStorage.getItem(quicknoteKey()) || "{}"); }
    catch (_) { quicknoteProgress = {}; }
    const select = $("quicknoteSection");
    [...new Set(quicknoteData.items.map((item) => item.chapter).filter(Boolean))].forEach((chapter) => {
      const option = el("option", null, chapter);
      option.value = chapter;
      select.appendChild(option);
    });
    filterQuicknotes();
  } catch (error) {
    $("quicknoteCard").textContent = "速记资料加载失败：" + error.message;
  }
}

function renderQuicknoteMetrics() {
  const items = quicknoteData?.items || [];
  const known = items.filter((item) => quicknoteProgress[item.number] === "known").length;
  const review = items.filter((item) => quicknoteProgress[item.number] === "review").length;
  const metrics = $("quicknoteMetrics");
  metrics.innerHTML = "";
  [["考点总数", items.length], ["已记住", known], ["待复习", review], ["当前筛选", quicknoteVisible.length]].forEach(([label, value]) => {
    const node = el("div", "metric");
    node.append(el("strong", null, String(value)), el("span", null, label));
    metrics.appendChild(node);
  });
}

function filterQuicknotes() {
  if (!quicknoteData?.items) return;
  const chapter = $("quicknoteSection").value;
  const state = $("quicknoteStatus").value;
  const query = $("quicknoteSearch").value.trim().toLowerCase();
  quicknoteVisible = quicknoteData.items.filter((item) => {
    const progress = quicknoteProgress[item.number] || "unseen";
    return (!chapter || item.chapter === chapter)
      && (!state || progress === state)
      && (!query || [String(item.number), item.text, item.cue, item.chapter, item.section]
        .some((value) => String(value || "").toLowerCase().includes(query)));
  });
  quicknoteIndex = 0;
  quicknoteRevealed = false;
  renderQuicknoteMetrics();
  renderQuicknoteCard();
}

function renderQuicknoteCard() {
  const card = $("quicknoteCard");
  card.innerHTML = "";
  const item = quicknoteVisible[quicknoteIndex];
  const hasItem = !!item;
  ["quicknotePrev", "quicknoteNext", "quicknoteRandom", "quicknoteReveal", "quicknoteReview", "quicknoteKnown"]
    .forEach((id) => { $(id).disabled = !hasItem; });
  if (!item) {
    card.appendChild(el("p", "empty-line", "没有符合筛选条件的考点，请调整章节、状态或搜索词。"));
    return;
  }
  const position = el("p", "quicknote-position",
    "第 " + (quicknoteIndex + 1) + " / " + quicknoteVisible.length + " 条 · 编号 " + item.number);
  const section = el("p", "quicknote-section", [item.chapter, item.section].filter(Boolean).join(" · "));
  const cue = el("h2", "quicknote-cue", item.cue || "请回忆这条考点的完整内容");
  const status = quicknoteProgress[item.number] || "unseen";
  const badge = el("span", "quicknote-badge", status === "known" ? "已记住" : status === "review" ? "待复习" : "未练习");
  card.append(position, section, cue, badge);
  if (quicknoteRevealed) {
    card.appendChild(el("p", "quicknote-answer", item.text));
    const source = el("a", "quicknote-source", "查看 PDF 原页（第 " + item.page + " 页） ↗");
    source.href = "/api/quick-notes/source.pdf#page=" + Math.max(1, Number(item.page) || 1);
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    card.appendChild(source);
    card.appendChild(el("p", "quicknote-caution", "本卡由扫描件 OCR 提取，尚未逐条校对；以原页为准。"));
  }
  $("quicknoteReveal").textContent = quicknoteRevealed ? "收起答案" : "查看答案";
}

function moveQuicknote(offset) {
  if (!quicknoteVisible.length) return;
  quicknoteIndex = (quicknoteIndex + offset + quicknoteVisible.length) % quicknoteVisible.length;
  quicknoteRevealed = false;
  renderQuicknoteCard();
}

$("quicknoteSection").addEventListener("change", filterQuicknotes);
$("quicknoteStatus").addEventListener("change", filterQuicknotes);
$("quicknoteSearch").addEventListener("input", filterQuicknotes);
$("quicknotePrev").addEventListener("click", () => moveQuicknote(-1));
$("quicknoteNext").addEventListener("click", () => moveQuicknote(1));
$("quicknoteRandom").addEventListener("click", () => {
  if (!quicknoteVisible.length) return;
  quicknoteIndex = Math.floor(Math.random() * quicknoteVisible.length);
  quicknoteRevealed = false;
  renderQuicknoteCard();
});
$("quicknoteReveal").addEventListener("click", () => {
  quicknoteRevealed = !quicknoteRevealed;
  renderQuicknoteCard();
});
[["quicknoteReview", "review"], ["quicknoteKnown", "known"]].forEach(([id, state]) => {
  $(id).addEventListener("click", () => {
    const item = quicknoteVisible[quicknoteIndex];
    if (!item) return;
    quicknoteProgress[item.number] = state;
    saveQuicknoteProgress();
    if ($("quicknoteStatus").value) filterQuicknotes();
    else { renderQuicknoteMetrics(); renderQuicknoteCard(); }
  });
});

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
