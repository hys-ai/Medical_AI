/* Learning reports use saved assessment records, never dialogue as a score. */
const learningReportStates = new WeakMap();

function mountLearningReport(container, data, options = {}) {
  if (!container) return;
  const previous = learningReportStates.get(container);
  const evidence = data?.evidence_report || {};
  const recent = Array.isArray(evidence.recent_attempts) ? evidence.recent_attempts : [];
  const reviews = Array.isArray(evidence.review_items) ? evidence.review_items : [];
  const concepts = [...new Map(reviews.map(row => [row.concept, row.name || row.concept])).entries()];
  const state = {options, busy: false, actionButtons: {review: [], recent: []},
    filter: concepts.some(([id]) => id === previous?.filter) ? previous.filter : '',
    reviewVisible: previous?.reviewVisible || 5, recentVisible: previous?.recentVisible || 5};
  learningReportStates.set(container, state);
  container.classList.add('learning-evidence-report');
  container.textContent = '';
  const stats = data?.stats;
  if (stats && Number.isFinite(stats.assessed) && Number.isFinite(stats.total)) {
    container.appendChild(el('p', 'report-summary', `已测评 ${stats.assessed} / ${stats.total} 个知识点；已掌握 ${stats.mastered || 0} 个（原型规则判断）。`));
  } else container.appendChild(el('p', 'report-summary', '暂未读取到完整学习统计。'));
  container.appendChild(el('p', 'report-boundary', '首次与最近作答可能来自不同题目、不同情境。这里记录学习过程，不能作为真实学习效果或医学能力的验证；阅读和自由讨论不计作掌握证据。'));
  const errorCounts = Object.entries(data?.errors || {}).filter(([, count]) => Number.isFinite(count) && count > 0)
    .sort((a, b) => b[1] - a[1]);
  container.appendChild(el('p', 'study-source', errorCounts.length
    ? '历史错答要点分类：' + errorCounts.map(([name, count]) => `${name} ${count} 次`).join('、')
    : '尚无错答要点分类记录。'));

  const attemptedConcepts = (data?.concepts || []).filter(row => row.attempts);
  if (attemptedConcepts.length) {
    const progress = el('details', 'report-concept-progress');
    progress.appendChild(el('summary', '', `查看 ${attemptedConcepts.length} 个已测评知识点的过程记录`));
    attemptedConcepts.forEach(row => {
      const line = el('div', 'report-concept-row');
      line.append(el('strong', '', row.name), el('span', '', `要求：${row.level || '未标注'} · ${row.status || '未判定'}`),
        el('span', '', `首次 ${row.pre} 分 → 最近 ${row.post ?? row.pre} 分（${row.last_assisted ? '辅助练习' : '独立作答记录'}）`));
      progress.appendChild(line);
    });
    container.appendChild(progress);
  }

  const reviewSection = el('section', 'report-evidence-section');
  reviewSection.append(el('h4', '', '待复核错点'),
    el('p', 'study-source', '同一道题的独立作答才能复核该题错点。其他题答对不会抹去旧错点；辅助答对仍待独立复核。'));
  if (evidence.counts) {
    const counts = evidence.counts;
    reviewSection.appendChild(el('p', 'report-record-counts',
      `历史记录：${counts.review_questions || 0} 道题待复核，${counts.missing_points || 0} 个仍有错误的要点，${counts.independent_recheck_points || 0} 个辅助答对待独立复核的要点。`));
  }
  if (evidence.limits?.review_truncated) reviewSection.appendChild(el('p', 'report-limit',
    `本次只载入最近 ${reviews.length} / ${evidence.limits.review_total} 道待复核题；更早的记录未在本页显示。`));
  const filter = el('label', 'report-filter');
  const select = el('select');
  select.setAttribute('aria-label', '筛选待复核知识点');
  const all = el('option', '', '全部已载入知识点'); all.value = ''; select.appendChild(all);
  concepts.forEach(([id, name]) => {const option = el('option', '', name); option.value = id; select.appendChild(option);});
  select.value = state.filter;
  filter.append(el('span', '', '筛选知识点'), select);
  if (reviews.length) reviewSection.appendChild(filter);
  const reviewList = el('div', 'report-record-list'), reviewStatus = el('p', 'study-source');
  reviewStatus.setAttribute('role', 'status');
  const reviewMore = el('button', 'btn report-more', '再显示 5 道待复核题'); reviewMore.type = 'button';
  const renderReviews = () => {
    reviewList.textContent = '';
    state.actionButtons.review = [];
    const rows = reviews.filter(row => !state.filter || row.concept === state.filter);
    rows.slice(0, state.reviewVisible).forEach(row => reviewList.appendChild(learningReportRecord(row, true, container, state)));
    reviewStatus.textContent = rows.length ? `当前显示 ${Math.min(rows.length, state.reviewVisible)} / ${rows.length} 道已载入待复核题。` :
      (state.filter ? '这个筛选下没有已载入的待复核题。' : '尚无待复核错点记录；这不代表所有知识点已经掌握。');
    reviewMore.hidden = state.reviewVisible >= rows.length;
  };
  select.addEventListener('change', () => {state.filter = select.value; state.reviewVisible = 5; renderReviews();});
  reviewMore.addEventListener('click', () => {state.reviewVisible += 5; renderReviews();});
  reviewSection.append(reviewList, reviewStatus, reviewMore); renderReviews(); container.appendChild(reviewSection);

  const recentSection = el('section', 'report-evidence-section');
  recentSection.append(el('h4', '', '最近作答'), el('p', 'study-source', '时间统一显示北京时间。展开记录可核对原题与逐点反馈。'));
  if (evidence.counts) recentSection.appendChild(el('p', 'report-record-counts',
    `累计 ${evidence.counts.attempts || 0} 次作答，其中独立 ${evidence.counts.independent_attempts || 0} 次、辅助 ${evidence.counts.assisted_attempts || 0} 次。`));
  if (evidence.limits?.recent_truncated) recentSection.appendChild(el('p', 'report-limit',
    `本次只载入最近 ${recent.length} / ${evidence.limits.recent_total} 次作答。`));
  const recentList = el('div', 'report-record-list'), recentStatus = el('p', 'study-source');
  recentStatus.setAttribute('role', 'status');
  const recentMore = el('button', 'btn report-more', '再显示 5 次作答'); recentMore.type = 'button';
  const renderRecent = () => {
    recentList.textContent = '';
    state.actionButtons.recent = [];
    recent.slice(0, state.recentVisible).forEach(row => recentList.appendChild(learningReportRecord(row, false, container, state)));
    recentStatus.textContent = recent.length ? `当前显示 ${Math.min(recent.length, state.recentVisible)} / ${recent.length} 次已载入作答。` :
      '尚无作答记录。完成一次章节测评后，这里会显示实际结果。';
    recentMore.hidden = state.recentVisible >= recent.length;
  };
  recentMore.addEventListener('click', () => {state.recentVisible += 5; renderRecent();});
  recentSection.append(recentList, recentStatus, recentMore); renderRecent(); container.appendChild(recentSection);
  if (evidence.notice) container.appendChild(el('p', 'report-boundary', evidence.notice));
}

function learningReportRecord(row, reviewing, container, state) {
  const card = el('article', 'report-record');
  const heading = el('div', 'report-record-heading');
  heading.append(el('strong', '', row.name || '未标注知识点'),
    el('span', 'report-kind', row.kind === 'transfer' ? '迁移题' : row.kind === 'diagnostic' ? '基础诊断题' : '题型未标注'));
  card.append(heading, el('p', 'report-record-meta', `${learningReportTime(row.created)} · ${row.score} 分 · ${row.assisted ? '辅助练习' : '独立作答'}`));
  if (reviewing) {
    const points = el('ul', 'report-pending-points');
    (row.points || []).forEach(point => points.appendChild(el('li', '', `${point.label}：${point.status === 'independent_recheck' ? '辅助答对，待独立复核' : '尚待复核'}`)));
    card.appendChild(points);
  }
  const details = el('details', 'report-attempt-details');
  details.append(el('summary', '', reviewing ? '查看原题与待复核要点' : '查看原题与逐点反馈'), el('p', 'report-prompt', row.prompt || '原题信息暂缺。'));
  (row.points || []).forEach(point => {
    const block = el('div', 'report-point');
    const status = point.status === 'independent_recheck' ? '辅助答对，待独立复核' : point.correct ? '本次正确' : '本次错误';
    block.append(el('strong', '', `${point.label} · ${status}`), el('p', '', `当次选择：${point.selected || '未记录'}`));
    if (point.expected) block.appendChild(el('p', '', `核对要点：${point.expected}`));
    if (point.reason) block.appendChild(el('p', 'study-source', point.reason));
    if (point.category && !point.correct) block.appendChild(el('p', 'study-source', `错误分类：${point.category}`));
    details.appendChild(block);
  });
  card.appendChild(details);
  if (row.concept && ['diagnostic', 'transfer'].includes(row.kind)) {
    const actions = el('div', 'report-record-actions');
    if (typeof state.options.onRetest === 'function') learningReportAction(actions, '复测这类题', row, state.options.onRetest, container, state, reviewing);
    if (row.can_study_current === true && typeof state.options.onReview === 'function') learningReportAction(actions, '复习当前错点', row, state.options.onReview, container, state, reviewing);
    card.appendChild(actions);
  }
  return card;
}

function learningReportAction(actions, label, row, action, container, state, reviewing) {
  const button = el('button', 'btn', label); button.type = 'button';
  button.disabled = state.busy; state.actionButtons[reviewing ? 'review' : 'recent'].push(button);
  const status = el('p', 'report-action-error'); status.setAttribute('role', 'alert');
  button.addEventListener('click', async () => {
    if (state.busy || learningReportStates.get(container) !== state) return;
    state.busy = true; status.textContent = '';
    Object.values(state.actionButtons).flat().forEach(node => {node.disabled = true;});
    try {await action(row);}
    catch (error) {status.textContent = '未能打开学习任务，请稍后重试。';}
    finally {state.busy = false; Object.values(state.actionButtons).flat().forEach(node => {node.disabled = false;});}
  });
  actions.append(button, status);
}

function learningReportTime(value) {
  if (!Number.isFinite(value) || value <= 0) return '时间未记录';
  const date = new Date(value * 1000);
  if (!Number.isFinite(date.getTime())) return '时间未记录';
  return date.toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false});
}
