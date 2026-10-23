import {demoApi} from './demo-engine.js';
import {renderVerification} from './verification.js';
'use strict';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const e = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iconPaths = {
  home: '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
  book: '<path d="M12 5C8 2 3 4 3 4v16s5-2 9 1c4-3 9-1 9-1V4s-5-2-9 1z"/><path d="M12 5v16M6 8l3 1m6 0 3-1"/>',
  chart: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 16v-4m5 4V7m5 9v-6"/>',
  layers: '<path d="m3 7 9-4 9 4-9 4zM3 12l9 4 9-4M3 17l9 4 9-4"/>',
  settings: '<path d="m10 3-1 3-3 1-3 3 2 2-2 2 3 3 3 1 1 3h4l1-3 3-1 3-3-2-2 2-2-3-3-3-1-1-3z"/><circle cx="12" cy="12" r="3"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  brain: '<path d="M12 5C8 1 4 5 5 8c-4 0-4 6-1 7-2 4 4 7 6 4l2-2 2 2c2 3 8 0 6-4 3-1 3-7-1-7 1-3-3-7-7-3zM12 5v12M5 8c3-1 5 1 4 4m10-4c-3-1-5 1-4 4M4 15c3-2 5-1 5 2m11-2c-3-2-5-1-5 2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  spark: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/>',
  flask: '<path d="M8 3h8M10 3v7L4 19c-1 1 0 2 1 2h14c1 0 2-1 1-2l-6-9V3M7 15h10"/>',
  shield: '<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6z"/><path d="m8 12 3 3 5-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18M7 15h2m6 0h2m-10 3h2"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  link: '<path d="m9 15 6-6M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(1 0)"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  message: '<path d="M21 16a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3zM7 8h10M7 12h7"/>',
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name] || iconPaths.spark}</svg>`;
$$('[data-icon]').forEach(el => { el.outerHTML = icon(el.dataset.icon); });

let learner = localStorage.getItem('mednexus-learner');
if (!/^[a-f0-9]{48}$/.test(learner || '')) {
  learner = [...crypto.getRandomValues(new Uint8Array(24))].map(n => n.toString(16).padStart(2, '0')).join('');
  localStorage.setItem('mednexus-learner', learner);
}
let data, currentPage = 'overview', currentConcept = 'oculomotor', currentMode = 'diagnostic';
let task = null, result = null, gate = null, papers = [], lastLiterature = null, researchQuestion = '', researchQuery = '', requestRevision = 0;
let toastTimer;
const main = $('#main');

async function api(path, body) {
  return demoApi(path,body);
}
function toast(message) {
  const el = $('#toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 4500);
}
function btn(label, action, opts = {}) {
  return `<button type="button" class="btn ${opts.primary ? 'btn-primary' : opts.light ? 'btn-light' : ''} ${opts.class || ''}" data-action="${action}"${opts.cid ? ` data-cid="${e(opts.cid)}"` : ''}${opts.extra || ''}>${opts.icon ? icon(opts.icon) : ''}${label}</button>`;
}
const pill = (status) => `<span class="pill ${status === '已掌握' ? 'green' : status === '需巩固' ? 'orange' : status === '未测评' ? 'gray' : ''}">${e(status)}</span>`;
const concept = () => data.concepts.find(c => c.id === currentConcept) || data.concepts[0];
const humanDate = ts => new Date(ts * 1000).toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false});
const dateNow = () => new Date().toLocaleDateString('zh-CN', {month:'long', day:'numeric', weekday:'long'});
const meter = (n, cls = '') => `<div class="progress-track ${cls}"><i style="width:${Math.max(0, Math.min(100, n || 0))}%"></i></div>`;
async function refresh() {
  data = await api('bootstrap');
  $('#engine-badge').innerHTML = `<i></i>在线演示 · 浏览器规则引擎`;
}
function setPage(page) {
  currentPage = page;
  const names = {overview:'学习总览', courses:'我的课程', report:'学习报告', sources:'知识资料', chapter:'章节学习',verification:'测试情况'};
  $('#page-name').textContent = names[page] || '学习空间';
  $$('#navigation a').forEach(a => { a.classList.toggle('active', a.dataset.nav === page || (page === 'chapter' && a.dataset.nav === 'courses')); if (a.classList.contains('active')) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
}
function heading(title, subtitle, eyebrow = 'YOUR LEARNING SPACE', extra = '') {
  return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="subheading">${subtitle}</p></div>${extra}</div>`;
}
function statsRow() {
  return `<div class="stats-row"><div class="stat-card"><div class="stat-icon">${icon('target')}</div><div><b>${data.stats.assessed}<span class="count-small">/ ${data.stats.total}</span></b><span>已测评知识点</span></div></div><div class="stat-card"><div class="stat-icon green">${icon('check')}</div><div><b>${data.stats.mastered}</b><span>已有掌握证据</span></div></div><div class="stat-card"><div class="stat-icon orange">${icon('brain')}</div><div><b>${data.stats.weak}</b><span>需要重点巩固</span></div></div></div>`;
}
function courseCard() {
  const r = data.recommendation;
  return `<article class="course-card"><div class="course-card-top"><div class="course-cover"><img src="/brain.svg" alt="脑神经课程示意"></div><div class="course-info"><div class="course-meta">基础医学 · 自主学习</div><h3>系统解剖学</h3><p>脑神经 · 结构、功能与典型表现</p><span class="pill">1 个章节 · 10 个知识点 · 20 道题</span></div><div class="course-action">${btn(data.stats.attempts ? '继续学习' : '进入章节', 'enter', {cid:r.id, primary:true, icon:'arrow'})}</div></div>${meter(data.stats.mastered / data.stats.total * 100)}<div class="progress-meta"><span>已测评 ${data.stats.assessed} / ${data.stats.total} · 已掌握 ${data.stats.mastered} / ${data.stats.total}</span><span>${data.stats.attempts ? '下一站：' + e(r.name) : '从第一次诊断开始'}</span></div></article>`;
}
function agentPanel(c = data.recommendation) {
  let reason = c.status === '需巩固' ? '你的作答中还有缺失要点，建议先回到相关结构与功能，补齐后再测。' : c.status === '初步达标' ? '你已经在单题中表现出理解。接下来换一个情境，看看能否独立运用。' : c.status === '已掌握' ? '当前已有不同任务的掌握证据。你可以继续下一知识点，或从具体疑问探索研究。' : '先用一道包含三个要点的诊断题，看看你对结构、功能和表现的联系理解到哪一步。';
  return `<section class="panel agent-panel"><div class="agent-heading"><span class="agent-icon">${icon('spark')}</span><div><strong>医枢的学习建议</strong><small>每一步，都有作答依据</small></div></div><p><b>${e(c.name)}</b><br>${reason}</p>${btn(c.status === '需巩固' ? '去补齐这个知识点' : '开始下一步', c.status === '需巩固' ? 'enter-study' : 'enter', {cid:c.id, light:true, icon:'arrow'})}</section>`;
}
function trustPanel() {
  return `<section class="panel trust-panel"><div class="panel-title">${icon('shield')}学习依据，随时可核对</div><p>示例目标待教师审核。公开学习卡不标注教材页码；导入本地索引后，页码按索引显示并注明核验状态。</p></section>`;
}
async function overview() {
  setPage('overview');
  const r = data.recommendation;
  const report = await api('report');
  if (currentPage !== 'overview') return;
  const plan = [{text:'完成脑神经的主动诊断',done:data.stats.attempts > 0,action:'enter'}, {text:'回顾一次针对性学习卡',done:data.stats.viewed > 0,action:'enter-study'}, {text:'完成一道不同情境的迁移题',done:report.history.some(a=>a.kind === 'transfer'),action:'enter-transfer'}, {text:'带着一个具体疑问阅读文献',done:report.events.some(a=>a.kind === 'read-paper'),action:'enter-research'}];
  const done = plan.filter(p=>p.done).length;
  main.innerHTML = heading('你好，同学。', '今天，从一个知识点开始，把理解再推进一点。', 'LEARN WITH PURPOSE', `<div class="date">${icon('calendar')} &nbsp;${dateNow()}</div>`) + `<div class="dashboard-grid"><div class="main-column"><section class="hero"><img class="hero-art" src="/brain.svg" alt=""><div class="hero-copy"><div class="hero-kicker">${icon('spark')}你的主动式医学学习伙伴</div><h2>从理解医学，<br>走向发现。</h2><p>不必先想好问题。医枢会根据你的回答，<br>帮你发现缺口、补齐理解，再走向真实证据。</p>${btn(data.stats.attempts ? '继续我的学习' : '开始第一次学习', 'enter', {cid:r.id, primary:true, icon:'arrow'})}</div></section>${statsRow()}<div class="section-title"><h2>我的课程</h2><a href="#courses" class="btn-text">查看课程 ${icon('chevron')}</a></div>${courseCard()}<div class="section-title"><h2>从这里继续</h2><small>按你当下的需要，切换学习方式</small></div><div class="quick-grid"><button class="quick-tile" data-action="enter-study" data-cid="${e(r.id)}"><span class="tile-icon">${icon('book')}</span><strong>先学，再测</strong><p>回顾结构与功能<br>带着理解进入练习</p>${icon('arrow')}</button><button class="quick-tile" data-action="enter-ask" data-cid="${e(r.id)}"><span class="tile-icon green">${icon('message')}</span><strong>带着问题学</strong><p>从资料中寻找依据<br>每个来源都可追溯</p>${icon('arrow')}</button><button class="quick-tile" data-action="enter-research" data-cid="${e(r.id)}"><span class="tile-icon orange">${icon('flask')}</span><strong>把疑问再推进</strong><p>判断是否值得深挖<br>连接真实研究证据</p>${icon('arrow')}</button></div><div class="section-title"><h2>最近学习</h2><a href="#report" class="btn-text">查看报告 ${icon('chevron')}</a></div>${report.history.length ? `<div class="activity-list">${report.history.slice(-3).reverse().map(a => `<div class="activity-row"><span class="tile-icon ${a.score >= 80?'green':''}">${icon('book')}</span><div><strong>${e(data.concepts.find(c=>c.id===a.concept)?.name)} · ${a.kind === 'transfer'?'迁移测试':'主动诊断'}</strong><small>${humanDate(a.created)}</small></div><span class="pill ${a.score>=80?'green':'orange'}">${a.score} 分</span></div>`).join('')}</div>` : `<div class="empty-card">${icon('book')}还没有学习记录。完成第一道诊断题，医枢就能给出有依据的建议。</div>`}</div><aside class="right-column"><section class="panel"><div class="panel-title">${icon('calendar')}本次学习路径<small>建议，随时可切换</small></div><div class="plan-date">${dateNow()}</div>${plan.map(p=>`<div class="plan-item ${p.done?'done':''}"><span class="circle">${p.done?'✓':''}</span><button data-action="${p.action}" data-cid="${e(r.id)}">${p.text}</button></div>`).join('')}<div class="plan-progress"><span>当前空间已完成</span><span>${done} / 4 步</span></div>${meter(done/4*100)}</section>${agentPanel()}${trustPanel()}</aside></div>`;
}

function courses() {
  setPage('courses');
  main.innerHTML = heading('我的课程', '先把一章学透，再把知识连起来。', 'MY COURSES') + `<div class="intro-strip">${icon('info')}当前版本聚焦系统解剖学「脑神经」。所有层级为示例教学目标，尚未对照校内或国家正式大纲。</div><div class="course-layout"><section class="panel"><div class="chapter-header"><div class="course-cover"><img src="/brain.svg" alt=""></div><div><div class="course-meta">系统解剖学 · 学习章节</div><h2>脑神经</h2><p>10 个知识点 · 3 组内容 · 20 道结构化题目</p></div>${btn('进入章节', 'enter', {cid:data.recommendation.id, primary:true, icon:'arrow'})}</div><div class="legend">看过 ≠ 掌握。知识点状态根据实际作答更新。</div>${data.course.units.map((unit, i)=>`<div class="unit-section"><div class="unit-name"><span class="unit-number">0${i+1}</span>${e(unit)}</div>${data.concepts.filter(c=>c.unit===unit).map(c=>`<button class="concept-row" data-action="enter" data-cid="${e(c.id)}"><strong>${e(c.name)}</strong><span class="level">${e(c.level)}</span><div class="tiny-meter"><i style="width:${c.score||0}%"></i></div>${pill(c.status)}${icon('chevron')}</button>`).join('')}</div>`).join('')}<p class="goal-note">${e(data.course.goal_source)}。正式使用前，请由医学教师审核教学内容、题目与评分标准。</p></section><aside><section class="panel"><div class="panel-title">${icon('target')}本章学习概况</div><div class="goal-stats"><span>已阅读学习卡</span><strong>${data.stats.viewed} / 10</strong></div><div class="goal-stats"><span>已有作答证据</span><strong>${data.stats.assessed} / 10</strong></div><div class="goal-stats"><span>符合掌握规则</span><strong>${data.stats.mastered} / 10</strong></div>${meter(data.stats.mastered*10)}<p class="status-disclaimer">「初步达标」表示单题表现达标，仍需不同题目的迁移证据。</p></section>${agentPanel()}${trustPanel()}</aside></div>`;
}

function workspaceShell() {
  setPage('chapter');
  const c = concept();
  main.innerHTML = `<div class="workspace-header"><button class="back-btn" data-action="courses" aria-label="返回课程">${icon('back')}</button><div><div class="chapter-trail">系统解剖学 / 脑神经 / ${e(c.unit)}</div><h1>${e(c.name)}</h1><p class="subheading">示例目标：${e(c.level)} · 在作答与反馈中，把知识连起来</p></div>${pill(c.status)}</div><div class="workspace-grid"><div class="workspace-main"><div class="workspace-modes" role="tablist" aria-label="学习方式">${[['diagnostic','target','先测一测'],['study','book','先学一学'],['ask','message','自由提问'],['research','flask','学研衔接']].map(([mode,ic,label])=>`<button class="mode-btn ${currentMode===mode?'active':''}" role="tab" id="tab-${mode}" aria-controls="mode-area" aria-selected="${currentMode===mode}" data-action="mode" data-mode="${mode}">${icon(ic)}${label}</button>`).join('')}</div><section class="panel mode-area" id="mode-area" role="tabpanel" aria-labelledby="tab-${currentMode}"><div class="loading-page"><div class="spinner"></div><p>正在准备本次学习任务…</p></div></section></div><aside class="workspace-side"><section class="panel"><div class="panel-title">${icon('layers')}围绕同一个知识点</div><div class="decision-list">${[['diagnostic','主动诊断','按要点寻找知识缺口'],['study','针对性补学','回到结构、功能和依据'],['research','有条件的科研探索','具体开放性疑问再检索'],['transfer','迁移再测','换个情境验证理解']].map(([mode,t,s],i)=>`<div class="decision-step ${currentMode===mode || currentMode==='ask'&&mode==='study'?'current':''}"><span class="step-dot">${i+1}</span><div><strong>${t}</strong><small>${s}</small></div></div>`).join('')}</div><div class="status-summary"><span>当前掌握度估计</span><strong>${c.score===null?'—':c.score+'<small>%</small>'}</strong></div>${meter(c.score)}<p class="status-disclaimer">${c.attempts} 次作答 · ${c.distinct} 道不同题目<br>阅读学习卡只记录覆盖，不改变掌握度。</p></section>${agentPanel(c)}${trustPanel()}</aside></div>`;
}
async function enter(cid, mode = 'diagnostic', kind = 'auto') {
  currentConcept = cid || data.recommendation.id; currentMode = mode;
  if (!data.concepts.some(c=>c.id===currentConcept)) currentConcept = 'oculomotor';
  result = null; gate = null; papers = []; lastLiterature = null; researchQuestion=''; researchQuery='';
  history.replaceState(null,'','#chapter/' + currentConcept);
  await loadMode(mode, kind);
  window.scrollTo({top:0,behavior:'smooth'});
}
async function loadMode(mode, kind='auto') {
  const revision = ++requestRevision;
  currentMode = mode; workspaceShell();
  try {
    if (mode === 'diagnostic') {
      task = await api('task', {concept:currentConcept,kind});
      if (revision !== requestRevision) return;
      renderTask();
    } else if (mode === 'study') {
      const study = await api('study', {concept:currentConcept});
      if (revision !== requestRevision) return;
      renderStudy(study); await refresh();
    } else if (mode === 'ask') { renderAsk(); }
    else if (mode === 'research') { renderResearch(); }
  } catch(err) {
    if (revision === requestRevision && $('#mode-area')) $('#mode-area').innerHTML = `<div class="retry-box">${icon('info')}<p>${e(err.message)}</p>${btn('重试当前任务','retry-mode',{light:true})}</div>`;
  }
}

function renderTask() {
  const area = $('#mode-area'); if (!area) return;
  area.innerHTML = `<div class="task-label">${icon('target')}${task.kind==='transfer'?'迁移再测 · 同一知识点，不同情境':'主动诊断 · 无需先输入问题'}</div><h2 class="task-title">${e(task.prompt)}</h2><p class="task-description">每个要点单独计分。暂时不会也没关系，真实的回答能帮助医枢安排下一步。</p><div class="question-mode-note">离线模式采用结构化选择作答；末尾的补充推理将保留在报告中供人工复核。</div><form id="answer-form">${task.points.map((p,i)=>`<fieldset class="question-block" style="border:0;padding:0"><legend class="question-heading"><span>${i+1}</span>${e(p.label)}</legend><div class="options">${p.options.map((o,j)=>`<label class="option"><input type="radio" name="point-${i}" value="${e(o)}" required><span>${e(o)}</span></label>`).join('')}</div></fieldset>`).join('')}<label class="input-label" for="reasoning">你是怎样推理的？<span class="muted">（选填，仅记录）</span></label><textarea class="text-input small" id="reasoning" maxlength="3000" placeholder="试着把结构、功能和表现连成一条线…"></textarea><div class="answer-bottom"><label class="confidence">对这次回答的把握<select id="confidence"><option>一般</option><option>不确定</option><option>很有把握</option></select></label><button type="submit" class="btn btn-primary">提交，看看下一步 ${icon('arrow')}</button></div><div id="answer-error" class="error-text" role="alert"></div></form>`;
}
function renderResult(r) {
  result = r;
  const area = $('#mode-area'); if (!area) return;
  const all = r.score===100;
  area.innerHTML = `<div class="task-label">${icon('check')}作答反馈 · 按要点，不按整题一刀切</div><div class="evaluation-head"><div class="score-ring" style="--amount:${r.score}%"><strong>${r.score}<small> 分</small></strong></div><div><h2>${all?'这次回答的三个要点都已达标':r.score===0?'先把基础通路拆开看一看':'已有理解，再补上缺失的一环'}</h2><p>${e(r.why)}</p></div></div>${r.rubric.map(p=>`<div class="rubric-row ${p.correct?'pass':'fail'}"><div class="rubric-title"><span>${e(p.label)}</span><span class="pill ${p.correct?'green':'orange'}">${p.correct?'已答对':'待补齐'}</span></div>${!p.correct?`<p>你的选择：${e(p.selected)}</p>`:''}<p><b>${e(p.expected)}</b></p><p>${e(p.reason)}</p></div>`).join('')}${r.calibration?`<p class="hint">${e(r.calibration)}</p>`:''}<div class="next-decision"><strong>${icon('spark')}医枢决定：${e(r.label)}</strong><p>${e(r.why)}</p><div class="button-row">${r.action==='next'?btn('查看学习报告','report',{primary:true,icon:'chart'}):r.action==='transfer'?btn('开始迁移题','transfer',{primary:true,icon:'arrow'}):btn('查看针对性补学','study',{primary:true,icon:'book'})}${r.action==='next'?btn('继续下一知识点','next-concept',{light:true}):''}${btn('我还有一个机制疑问','research',{light:true,icon:'flask'})}</div></div><p class="hint">${e(r.grading)}。${all?'单次正确不等于已掌握，报告会展示累计证据。':'本次作答已保存到学习报告。'}</p>`;
}
function sourceCitation(s) {
  const reference = s.reference || s.title || s.book;
  const url = /^https:\/\//.test(s.url||'') ? s.url : '';
  return `<div class="citation"><strong>${e(s.book||s.title)}${s.page?' · P'+e(s.page):''}</strong><p>${e(s.chapter||s.section||s.locator||'')}</p><p>${e(s.provenance || '公开参考来源；非本地教材页码')}</p>${url?`<a href="${e(url)}" target="_blank" rel="noopener noreferrer">${e(reference)} ${icon('link')}</a>`:''}</div>`;
}
function renderStudy(study) {
  const missing = study.last_result?.rubric.filter(p=>!p.correct) || [];
  $('#mode-area').innerHTML = `<div class="task-label">${icon('book')}${missing.length?'针对性补学 · 来自本次作答缺口':'先学一学 · 先把知识连起来'}</div><h2 class="task-title">${e(study.name)}</h2>${missing.length?`<ul class="study-points">${missing.map(p=>`<li>${icon('target')}重点回顾：${e(p.label)} — ${e(p.reason)}</li>`).join('')}</ul>`:`<p class="task-description">阅读后会记录学习覆盖，只有完成测试才能增加掌握证据。</p>`}<p class="note-prose">${e(study.note)}</p><div class="source-line">${icon('shield')}自编教学摘要 · 待医学教师审核 · 未提供原教材页码</div><div class="source-block"><span>公开参考资料</span><a href="${e(study.source.url)}" target="_blank" rel="noopener noreferrer">${e(study.source.title)} ${icon('link')}</a><span>${e(study.source.section)}</span></div>${study.local_sources.length?`<div class="spaced"><div class="task-label">${icon('layers')}你导入的相关教材定位</div>${study.local_sources.map(sourceCitation).join('')}</div>`:''}<div class="button-row spaced">${btn(study.last_result?'补学完毕，做迁移题':'学完了，测一测',''+(study.last_result?'transfer':'diagnostic'),{primary:true,icon:'arrow'})}${btn('我想问一个问题','ask',{light:true,icon:'message'})}${btn('从疑问走向文献','research',{light:true})}</div><p class="source-disclaimer">当前材料没有提供正版教材与正式大纲。本学习卡参考公开资料编写，不宣称对应人卫教材的具体页码或官方考核要求。</p>`;
}
function renderAsk() {
  $('#mode-area').innerHTML = `<div class="task-label">${icon('message')}证据内提问 · 保留当前知识点上下文</div><h2 class="task-title">把你卡住的地方说出来。</h2><p class="task-description">没有足够依据时会明确说明；已有页码只从你导入的索引读取。</p><form id="ask-form"><label class="sr-only" for="ask-input">你的问题</label><textarea class="text-input" id="ask-input" maxlength="1000" minlength="2" required placeholder="例如：动眼神经损伤为什么会出现上睑下垂？"></textarea><div class="form-row"><span class="busy-note">${data.model.configured?'AI 辅导已连接，引用仍会核对':'本地模式：检索相关学习卡并抽取依据'}</span><button class="btn btn-primary" type="submit">查找学习依据 ${icon('search')}</button></div></form><div class="suggestion-chips"><button class="chip" data-action="ask-chip" data-query="${e(concept().name)}的功能和表现是什么？">本知识点的功能与表现</button><button class="chip" data-action="ask-chip" data-query="${e(concept().name)}应该如何理解？">梳理这个知识点</button><button class="chip" data-action="ask-chip" data-query="量子纠缠是什么？">试试证据不足的提问</button></div><div id="ask-results" aria-live="polite"></div>`;
}
function showAskAnswer(answer) {
  const target = $('#ask-results'); if (!target) return;
  target.innerHTML = `<div class="answer-card"><h3>${answer.refused?'现有证据不足，暂不作答':'找到可以核对的学习依据'}</h3><p class="hint">${e(answer.message)}</p>${answer.warning?`<p class="hint">${e(answer.warning)}</p>`:''}${(answer.segments||[]).map(seg=>`<div class="answer-segment"><blockquote>${e(seg.quote)}</blockquote>${seg.explanation?`<p>${e(seg.explanation)}</p><small>AI 解释，需对照依据核验</small>`:''}<small>摘录与本地索引文本一致 · ${e(seg.source_id)}</small></div>`).join('')}${(answer.citations||[]).map(sourceCitation).join('')}<p class="hint">${e(answer.mode)}</p>${!answer.refused?`<div class="button-row">${btn('回到测试，验证理解','diagnostic',{light:true})}${btn('判断是否值得查文献','research',{light:true,icon:'flask'})}</div>`:''}</div>`;
}
function renderResearch() {
  $('#mode-area').innerHTML = `<div class="task-label">${icon('flask')}学研衔接 · 从具体疑问出发</div><h2 class="task-title">这个疑问，值得再往前走一步吗？</h2><p class="task-description">名词记错、通路不熟，先回到学习卡。涉及机制差异、研究证据或未解问题，再查文献。</p><form id="research-form"><label class="input-label" for="research-question">你想深入的具体疑问</label><textarea class="text-input" id="research-question" maxlength="1000" placeholder="请写出与当前知识点有关的机制、差异或证据疑问…">${e(researchQuestion)}</textarea><div class="form-row">${btn('使用本知识点的示例疑问','example-research',{light:true})}<button class="btn btn-primary" type="submit">判断下一步 ${icon('arrow')}</button></div></form><div id="research-gate" aria-live="polite"></div><div id="literature-results" aria-live="polite"></div>`;
  if (gate) renderGate();
  if (lastLiterature) renderPapers(lastLiterature);
}
function renderGate() {
  const target = $('#research-gate'); if (!target) return;
  target.innerHTML = `<div class="gate"><h3>${gate.eligible?'可以进入文献探索':'建议先补齐基础知识'}</h3><p>${e(gate.reason)}</p>${!gate.eligible?`<p>可以进一步问：${e(gate.suggestion)}</p>${btn('先回到学习卡','study',{light:true,icon:'book'})}`:`<label class="input-label" for="pubmed-query">英文检索式 · 你可以编辑</label><textarea class="text-input query-input" id="pubmed-query" maxlength="1500">${e(researchQuery || gate.query)}</textarea><p class="hint">${e(gate.mapping)}。更基础或更前沿仅调整检索限定，不保证检索结果的难度。</p><div class="button-row">${btn('检索真实文献','search-pubmed',{primary:true,icon:'search'})}${btn('更基础的综述','query-basic',{light:true})}${btn('更前沿的研究','query-frontier',{light:true})}</div><div class="trace-row">流程依据：当前知识点 → 具体开放性疑问 → 英文检索式 → PubMed → 迁移再测</div>`}</div>`;
}
function renderPapers(out) {
  lastLiterature = out;
  papers = out.papers;
  const target = $('#literature-results'); if (!target) return;
  target.innerHTML = `<div class="result-header"><strong>PubMed 找到 ${out.count.toLocaleString()} 条结果</strong><small>展示前 ${papers.length} 篇${out.cached?' · 24小时内缓存':''}</small></div><p class="hint">文献类型来自 PubMed 元数据，不能单独代表证据质量或相关性。请核对研究问题和摘要。</p>${papers.length?papers.map(p=>`<article class="paper-card"><span class="pill">${e(p.evidence)}</span><span class="count-small mono">PMID ${e(p.pmid)}</span><h3><a href="${e(p.url)}" target="_blank" rel="noopener noreferrer">${e(p.title)}</a></h3><div class="paper-meta">${e(p.authors.join(', '))}<br>${e(p.journal)} · ${e(p.year||'年份未提供')}</div><details><summary>展开真实摘要</summary><div class="abstract">${p.abstract.length?p.abstract.map(a=>`${a.label?'<b>'+e(a.label)+'</b>\n':''}${e(a.text)}`).join('\n\n'):'PubMed 未提供摘要；系统不会补写。'}</div></details><div class="button-row">${btn('带着问题阅读','read-paper',{primary:true,icon:'book',extra:` data-pmid="${e(p.pmid)}"`})}<a class="btn" href="${e(p.url)}" target="_blank" rel="noopener noreferrer">PubMed ${icon('link')}</a>${p.doi?`<a class="btn" href="${e(p.doi)}" target="_blank" rel="noopener noreferrer">DOI ${icon('link')}</a>`:''}</div></article>`).join(''):`<div class="empty-card">没有匹配结果。请简化检索式、去掉限定词后重试。</div>`}<div class="button-row spaced">${btn('回到知识点，做迁移题','transfer',{light:true,icon:'arrow'})}</div>`;
}
function renderReader(read) {
  const p = read.paper;
  const area = $('#mode-area'); if (!area) return;
  area.innerHTML = `<div class="task-label">${icon('book')}文献阅读 · PMID ${e(p.pmid)}</div><h2 class="task-title">${e(p.title)}</h2><p class="paper-meta">${e(p.authors.join(', '))}<br>${e(p.journal)} · ${e(p.year)} · ${e(p.evidence)}</p><p class="hint">${e(read.mode)}${read.warning?' · '+e(read.warning):''}</p><div class="reader-section"><h3>带着什么问题读？</h3><p>${e(researchQuestion||read.question)}</p></div>${read.ai_guide?Object.entries({question:'研究了什么问题',evidence:'摘要报告了什么证据',limitations:'局限与未报告信息',relationship:'与本知识点的联系'}).map(([key,title])=>`<div class="reader-section"><h3>${title} <span class="pill">AI 辅助</span></h3><p>${e(read.ai_guide[key])}</p></div>`).join(''):`<div class="reader-section"><h3>先看主要证据，再看解释边界</h3><p>${e(read.limitations)}</p><p>${e(read.relationship)}</p></div>`}<div class="reader-section"><h3>原始摘要 · 内容来自 PubMed</h3><div class="reader-quote">${p.abstract.length?p.abstract.map(a=>`<p>${a.label?'<b>'+e(a.label)+'</b><br>':''}${e(a.text)}</p>`).join(''):'<p>此条记录没有提供摘要。请打开 PubMed 核对可用全文，系统不会推断未提供的内容。</p>'}</div></div><div class="reader-section"><h3>用自己的话完成三个核对</h3><ol class="method-list"><li>研究比较了什么条件、人群或机制？</li><li>结论由什么结果支持？摘要没有告诉你什么？</li><li>它支持、补充还是质疑了你对原知识点的理解？</li></ol></div><div class="reader-actions"><div class="button-row">${btn('读完了，用迁移题验证','transfer',{primary:true,icon:'arrow'})}${btn('返回检索，换一组文献','back-research',{light:true})}<a class="btn" href="${e(p.url)}" target="_blank" rel="noopener noreferrer">查看 PubMed 原记录 ${icon('link')}</a></div><p class="hint">做迁移题会继续更新同一个知识点的学习证据。当前题库检验基础功能迁移，不验证你对论文结论的掌握。</p></div>`;
}

async function reportPage() {
  setPage('report');
  const r = await api('report'); if(currentPage!=='report') return;
  data = {...data, ...r};
  const compared = r.concepts.filter(c=>c.post !== null);
  const average = r.history.length?Math.round(r.history.reduce((n,a)=>n+a.score,0)/r.history.length):null;
  main.innerHTML = heading('让每一步进步，都有依据。', '记录你怎样回答、哪里需要补齐，以及下一步为什么这样安排。', 'MY LEARNING REPORT', btn('导出学习记录','export',{icon:'download'})) + `<div class="report-top"><div class="stat-card"><span class="stat-icon">${icon('target')}</span><div><b>${r.stats.attempts}</b><span>已完成作答</span></div></div><div class="stat-card"><span class="stat-icon green">${icon('check')}</span><div><b>${r.stats.mastered}<span class="count-small">/ ${r.stats.total}</span></b><span>符合掌握规则</span></div></div><div class="stat-card"><span class="stat-icon orange">${icon('chart')}</span><div><b>${average===null?'—':average+'%'}</b><span>累计要点平均得分</span></div></div></div><div class="report-layout"><div><section class="panel"><div class="section-title"><h2>知识点学习证据</h2><select class="filter-select" id="report-filter" aria-label="筛选知识点"><option value="all">全部知识点</option><option value="weak">需要巩固</option><option value="tested">已有作答</option></select></div><div class="table-scroll"><table class="report-table"><thead><tr><th>知识点</th><th>示例目标</th><th>当前评价</th><th>首次 / 最近</th><th>下一步</th></tr></thead><tbody id="report-rows">${reportRows(r.concepts)}</tbody></table></div><p class="report-note">${e(r.method)}</p></section><section class="panel"><div class="section-title"><h2>首次与最近作答</h2><small>仅展示完成两次及以上作答的知识点</small></div>${compared.length?`<div class="chart-key"><span><i></i>首次</span><span><i class="after"></i>最近</span></div>${compared.map(c=>`<div class="compare-row"><span>${e(c.name)}</span><div class="compare-bars"><div><div class="compare-bar" style="width:${c.pre}%" title="首次 ${c.pre}%"></div><span class="number-label">${c.pre}%</span></div><div><div class="compare-bar after" style="width:${c.post}%" title="最近 ${c.post}%"></div><span class="number-label">${c.post}%</span></div></div></div>`).join('')}<p class="report-note">首次与最近题目的难度和情境可能不同，该变化仅是过程记录，不等于已验证的教学效果或因果收益。</p>`:`<div class="empty-card">还没有可对比的数据。完成一次补学与再测，就能看到真实作答变化。</div>`}</section></div><aside><section class="panel"><div class="panel-title">${icon('brain')}需要补齐的环节</div>${Object.keys(r.errors).length?`<div class="bar-chart">${Object.entries(r.errors).map(([k,v])=>`<div class="error-bar"><span>${e(k)}</span>${meter(v/Math.max(...Object.values(r.errors))*100)}<span>${v} 次</span></div>`).join('')}</div><p class="report-note">统计的是错误要点出现次数，重做会重复计入；不等同于知识点数量。</p>`:`<p class="hint">目前没有错误要点记录。完成作答后会按概念、机制和迁移分类。</p>`}</section>${agentPanel(r.recommendation)}<section class="panel"><div class="panel-title">${icon('clock')}最近作答轨迹</div>${r.history.length?r.history.slice(-7).reverse().map(a=>`<div class="timeline-item"><span class="tile-icon">${icon(a.kind==='transfer'?'flask':'target')}</span><div><b>${e(r.concepts.find(c=>c.id===a.concept)?.name)}</b>${a.kind==='transfer'?'迁移再测':'主动诊断'} · ${a.score} 分<br><small>${humanDate(a.created)}</small></div></div>`).join(''):`<p class="hint">第一条真实作答记录，将从这里开始。</p>`}</section></aside></div>`;
}
function reportRows(items) {
  return items.map(c=>`<tr data-status="${e(c.status)}"><td>${e(c.name)}<div class="report-evidence-note">${c.attempts} 次作答 · ${c.distinct} 道不同题目${c.viewed?' · 已阅读':''}</div></td><td>${e(c.level)}</td><td>${pill(c.status)}</td><td><div class="report-compare"><span>${c.pre===null?'—':c.pre+'%'}</span>${icon('arrow')}<span class="after">${c.post===null?'—':c.post+'%'}</span></div></td><td>${btn(c.status==='需巩固'?'去补学':c.status==='初步达标'?'做迁移':'去学习', c.status==='需巩固'?'enter-study':c.status==='初步达标'?'enter-transfer':'enter',{cid:c.id})}</td></tr>`).join('');
}
function sourcesPage() {
  setPage('sources');
  const local = data.sources.filter(s=>s.kind !== 'note');
  const refs = [...new Map(data.sources.filter(s=>s.kind==='note').map(s=>[s.url,s])).values()];
  main.innerHTML = heading('知识有出处，理解有支点。','管理本地教材定位，查看示例学习卡的公开参考来源。','KNOWLEDGE & SOURCES', `<div class="source-tools">${btn('下载索引模板','template',{icon:'download'})}${btn('导入本地索引','import-help',{primary:true,icon:'upload'})}</div>`) + `<div class="intro-strip">${icon('shield')}当前包含 10 张自编学习卡，参考来源已列出；没有教材 PDF，也没有未经核验的教材页码。你的导入资料仅保存在当前浏览器。</div><div class="section-title"><h2>我的教材索引 <span class="count-small">${local.length} 条</span></h2><small>印刷页码只来自导入记录</small></div><div class="source-grid">${local.length?local.map(s=>`<article class="source-tile"><span class="pill ${s.kind==='metadata'?'orange':''}">${s.kind==='metadata'?'仅页码定位':'含本地授权文本'}</span><h3>${e(s.book)} · P${e(s.page)}</h3><p>${e(s.chapter)}<br>${e(s.locator)}</p><p>${e(s.provenance)}</p></article>`).join(''):`<div class="empty-card source-empty">${icon('layers')}还没有导入教材索引。你可以先用公开学习卡体验闭环，再接入自己有权使用的教材资料。</div>`}</div><div class="section-title spaced"><h2>公开参考来源 <span class="count-small">${refs.length} 项</span></h2><small>学习卡为自编摘要，未声称逐字引用原文</small></div><div class="source-grid">${refs.map(s=>`<article class="source-tile">${icon('book')}<span class="reference-label"> &nbsp; PUBLIC REFERENCE</span><h3>${e(s.reference)}</h3><p>${e(s.locator)}<br>用于基础教学示例；页面无印刷页码时不补造。</p><a href="${e(s.url)}" target="_blank" rel="noopener noreferrer">查看公开原始来源 ${icon('link')}</a></article>`).join('')}</div><p class="source-disclaimer">教材索引匹配仅说明页码、书名和摘录与导入数据一致，不证明导入资料本身真实，也不等同于对生成解释的语义核验。正式使用前请核对正版教材、版权授权与教师审核。</p>`;
}

function modal(content) { $('#modal-content').innerHTML = content; if (!$('#modal').open) $('#modal').showModal(); }
const modalHead = title => `<div class="modal-head"><h2>${title}</h2><button class="close-modal" data-action="close-modal" aria-label="关闭">${icon('close')}</button></div>`;
function settings() {
  modal(modalHead('在线演示说明')+`<div class="settings-grid"><div class="setting-block"><h3>拿到链接即可试用</h3><p>这是浏览器独立运行的公开教学演示。诊断、按要点评分、补学和报告无需API密钥；未连接付费大模型。PubMed直接访问NCBI，受访问者网络与接口限流影响。</p></div><div class="setting-block"><h3>当前浏览器独立保存记录</h3><p>作答、推理、导入资料与报告保存在本浏览器的localStorage，不发送到站点数据库。更换浏览器、清除网站数据或使用隐私模式会影响保留。英文文献查询式会发送给NCBI。</p><div class="button-row">${btn('导出当前记录','export',{icon:'download'})}<button class="btn btn-danger" data-action="reset-help">清空当前学习数据</button></div></div><div class="setting-block"><h3>演示边界</h3><p>10个知识点、20道题；正式大纲、教材页码和医学内容审核待补齐。题目答案随前端分发，适合自主学习演示，不作为保密考试。Python本地版仍保留SQLite与可选模型辅导能力。</p><a href="#verification" data-action="close-modal">查看实际测试情况 →</a></div></div>`);
}
function importHelp() {
  modal(modalHead('导入自己的教材索引') + `<div class="setting-block"><p>支持 JSON 数组或 JSONL，每行一个记录；单次最多 1000 条、2 MB。推荐先下载模板，填写核验过的书名、章节、版本与印刷页码。</p><code>{\n  "book": "填写你的教材名称",\n  "edition": "填写版本",\n  "chapter": "脑神经 · 动眼神经",\n  "page": 需要核对的正整数页码,\n  "keywords": ["动眼神经"],\n  "text": "可选：你有权在本机使用的文本"\n}</code><p>只导入页码时，系统只能定位，不能生成可核对的教材解释。授权文本只保存在当前浏览器，不上传至站点；在线演示不连接付费大模型。</p><label class="checkbox-line"><input type="checkbox" id="import-confirm">我确认有权在本机使用将导入的资料，并知道页码需对照正版教材核验。</label><div class="button-row">${btn('下载空白模板','template',{icon:'download'})}${btn('选择文件','choose-import',{primary:true,icon:'upload'})}</div></div>`);
}
function download(name, value, mime='application/json') {
  const url = URL.createObjectURL(new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type:mime}));
  const a = document.createElement('a'); a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function renderRoute() {
  ++requestRevision;
  const hash = location.hash.slice(1) || 'overview';
  try {
    await refresh();
    if (hash.startsWith('chapter/')) {
      currentConcept = hash.split('/')[1];
      if(!data.concepts.some(c=>c.id===currentConcept)) currentConcept=data.recommendation.id;
      if(data.active?.concept===currentConcept) { currentMode='diagnostic';task=data.active;workspaceShell();renderTask(); }
      else if(data.last_result?.concept===currentConcept) { currentMode='diagnostic';workspaceShell();renderResult(data.last_result); }
      else await enter(currentConcept);
    } else if(hash==='verification') {setPage('verification');await renderVerification(main,e,icon);}
    else if(hash==='courses') courses();
    else if(hash==='report') await reportPage();
    else if(hash==='sources') sourcesPage();
    else await overview();
  } catch(err) {
    main.innerHTML = `<div class="main-error"><h2>暂时未能连接学习服务</h2><p>${e(err.message)}<br>请确认本地服务正在运行，再试一次。</p>${btn('重新连接','reload',{primary:true})}</div>`;
  }
}

document.addEventListener('submit', async ev => {
  if(!['answer-form','ask-form','research-form'].includes(ev.target.id)) return;
  ev.preventDefault(); const form=ev.target; const button=$('[type="submit"]',form); button.disabled=true;
  const revision = requestRevision; const cid = currentConcept;
  try {
    if(form.id==='answer-form') {
      const answers = task.points.map((p,i)=>$(`input[name="point-${i}"]:checked`,form)?.value);
      if(answers.some(a=>!a)) throw new Error('请完成全部三个要点；不会时可以选择暂时不确定。');
      const out = await api('answer',{token:task.token,answers,confidence:$('#confidence').value,reasoning:$('#reasoning').value});
      await refresh(); if(revision!==requestRevision) return;
      workspaceShell();renderResult(out);main.scrollIntoView({behavior:'smooth'});
    } else if(form.id==='ask-form') {
      const target = $('#ask-results'); target.innerHTML=`<div class="inline-loader"><span class="spinner"></span>正在检索并核对学习依据…</div>`;
      const answer = await api('ask',{concept:cid,query:$('#ask-input').value});
      if(revision===requestRevision) showAskAnswer(answer);
    } else {
      researchQuestion=$('#research-question').value.trim();
      if(!researchQuestion) throw new Error('请先写下一个疑问，或使用本知识点的示例。');
      gate=await api('research',{concept:cid,question:researchQuestion});
      researchQuery=gate.query;
      if(revision===requestRevision) { lastLiterature=null; renderGate(); $('#literature-results').innerHTML=''; }
    }
  } catch(err) {
    if(revision===requestRevision) {
      if(form.id==='answer-form' && $('#answer-error')) $('#answer-error').textContent=err.message;
      else if(form.id==='ask-form' && $('#ask-results')) $('#ask-results').innerHTML=`<p class="error-text">${e(err.message)}</p>`;
      else toast(err.message);
    }
  } finally { if(button.isConnected) button.disabled=false; }
});

document.addEventListener('click', async ev => {
  const button=ev.target.closest('[data-action]'); if(!button || button.disabled) return;
  const action=button.dataset.action, cid=button.dataset.cid||currentConcept;
  const revision=requestRevision;
  try {
    if(action==='close-modal') {$('#modal').close();return;}
    if(action==='settings') {settings();return;}
    if(action==='import-help') {importHelp();return;}
    if(action==='choose-import') {if(!$('#import-confirm').checked) {toast('请先确认资料使用权与页码核验要求。');return;} $('#import-file').click();return;}
    if(action==='template') {download('mednexus-index-template.json',[{book:'请填写正版教材名称',edition:'请填写版本',chapter:'脑神经 · 动眼神经',page:null,keywords:['动眼神经'],text:''}]);toast('模板已下载。page 为空，请填写核验过的印刷页码。');return;}
    if(action==='export') {download('医枢学习记录-'+new Date().toISOString().slice(0,10)+'.json',await api('export'));return;}
    if(action==='reset-help') {modal(modalHead('清空当前学习数据')+`<p class="welcome-note">这会删除当前浏览器身份的作答、决策、学习记录和导入教材索引，无法在应用内撤销。可以先导出学习记录。</p><div class="button-row">${btn('先导出记录','export',{icon:'download'})}<button class="btn btn-danger" data-action="reset-confirm">确认清空我的数据</button>${btn('取消','close-modal')}</div>`);return;}
    if(action==='reset-confirm') {await api('reset',{confirmation:'CLEAR_MY_LEARNING'});$('#modal').close();location.hash='overview';await renderRoute();toast('当前学习数据已清空。');return;}
    if(action==='reload') {await renderRoute();return;}
    if(action==='courses') {location.hash='courses';return;}
    if(action==='report') {location.hash='report';return;}
    if(action.startsWith('enter')) {
      const modes={'enter':'diagnostic','enter-study':'study','enter-ask':'ask','enter-research':'research','enter-transfer':'diagnostic'};
      await enter(cid,modes[action]||'diagnostic',action==='enter-transfer'?'transfer':'auto');return;
    }
    if(action==='mode') {await loadMode(button.dataset.mode);return;}
    if(action==='retry-mode') {await loadMode(currentMode);return;}
    if(['study','ask','research','diagnostic','transfer'].includes(action)) {await loadMode(action==='transfer'?'diagnostic':action,action==='transfer'?'transfer':'auto');return;}
    if(action==='next-concept') {const next=data.concepts.find(c=>c.id!==currentConcept&&c.status!=='已掌握')||data.concepts[0];await enter(next.id);return;}
    if(action==='ask-chip') {$('#ask-input').value=button.dataset.query;$('#ask-input').focus();return;}
    if(action==='example-research') {
      const out=await api('research',{concept:currentConcept,question:''});
      if(revision!==requestRevision) return;
      $('#research-question').value=out.question;researchQuestion=out.question;gate=out;researchQuery=out.query;lastLiterature=null;renderGate();$('#literature-results').innerHTML='';return;
    }
    if(action==='query-basic'||action==='query-frontier') {
      const base=gate.query;
      const year=new Date().getFullYear();
      $('#pubmed-query').value = action==='query-basic'?`(${base}) AND (Review[Publication Type] OR Systematic Review[Publication Type])`:`(${base}) AND ("${year-3}/01/01"[Date - Publication] : "${year}/12/31"[Date - Publication])`;
      researchQuery=$('#pubmed-query').value;toast(action==='query-basic'?'已增加综述限定，请核对检索式。':'已限定最近四个自然年，结果不保证更前沿。');return;
    }
    if(action==='search-pubmed') {
      const q=$('#pubmed-query').value.trim();researchQuery=q;button.disabled=true;
      $('#literature-results').innerHTML=`<div class="inline-loader"><span class="spinner"></span>正在从 PubMed 获取真实文献，通常需要数秒…</div>`;
      try {const out=await api('literature',{concept:currentConcept,query:q,question:researchQuestion});if(revision===requestRevision) renderPapers(out);}
      catch(err) {if(revision===requestRevision&&$('#literature-results')) $('#literature-results').innerHTML=`<div class="retry-box"><p>${e(err.message)}</p>${btn('重试检索','search-pubmed',{light:true})}<a class="btn" href="${e(err.url||'https://pubmed.ncbi.nlm.nih.gov/?term='+encodeURIComponent(q))}" target="_blank" rel="noopener noreferrer">在 PubMed 打开 ${icon('link')}</a></div>`;}
      finally {if(button.isConnected) button.disabled=false;} return;
    }
    if(action==='read-paper') {
      button.disabled=true;
      try {const out=await api('read-paper',{concept:currentConcept,pmid:button.dataset.pmid,question:researchQuestion});if(revision===requestRevision) {renderReader(out);$('#mode-area').scrollIntoView({behavior:'smooth'});}}
      finally {if(button.isConnected) button.disabled=false;}return;
    }
    if(action==='back-research') {renderResearch();return;}
  } catch(err) {toast(err.message);}
});
document.addEventListener('change',ev=>{
  if(ev.target.id==='report-filter') {
    const value=ev.target.value;
    const items=data.concepts.filter(c=>value==='all'||value==='weak'&&c.status==='需巩固'||value==='tested'&&c.attempts>0);
    $('#report-rows').innerHTML=items.length?reportRows(items):'<tr><td colspan="5">暂无符合筛选条件的知识点。</td></tr>';
  }
});
document.addEventListener('keydown',ev=>{
  if(ev.target.matches('.mode-btn') && ['ArrowLeft','ArrowRight'].includes(ev.key)) {
    ev.preventDefault();const tabs=$$('.mode-btn');const index=tabs.indexOf(ev.target);const next=tabs[(index+(ev.key==='ArrowRight'?1:tabs.length-1))%tabs.length];next.focus();next.click();
  }
});
$('#import-file').addEventListener('change',async ev=>{
  const file=ev.target.files[0]; if(!file) return;
  try {
    if(file.size>1_900_000) throw new Error('请选择小于 1.9 MB 的索引文件，给请求封装预留空间。');
    const raw=(await file.text()).replace(/^\uFEFF/,'').trim();
    let records;
    if(raw.startsWith('[')) records=JSON.parse(raw);
    else if(raw.startsWith('{')&&!raw.includes('\n')) records=[JSON.parse(raw)];
    else {try {const one=JSON.parse(raw);records=[one];}catch {records=raw.split(/\r?\n/).filter(l=>l.trim()).map((line,i)=>{try{return JSON.parse(line);}catch{throw new Error(`第 ${i+1} 行不是有效 JSON。`);}});}}
    const out=await api('import',{records});await refresh();$('#modal').close();location.hash='sources';sourcesPage();toast(out.message);
  } catch(err) {toast(err.message);} finally {ev.target.value='';}
});
$('#modal').addEventListener('click',ev=>{if(ev.target===$('#modal')){const b=$('#modal').getBoundingClientRect();if(ev.clientX<b.left||ev.clientX>b.right||ev.clientY<b.top||ev.clientY>b.bottom)$('#modal').close();}});
window.addEventListener('hashchange',async()=>{await renderRoute();window.scrollTo({top:0,behavior:'instant'});});
renderRoute();
