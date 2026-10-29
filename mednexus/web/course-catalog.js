/* 课程大纲始终通过本机资料接口读取；目录不生成教材页码或学习成绩。 */
const courseCatalogStates = new WeakMap();

async function mountCourseCatalog(container, options = {}) {
  if (!container) return;
  const previous = courseCatalogStates.get(container);
  const state = {chapter: previous?.chapter || '', generation: (previous?.generation || 0) + 1, options};
  courseCatalogStates.set(container, state);
  container.classList.add('course-catalog');
  container.textContent = '';
  const loading = el('p', 'course-catalog-message', '正在读取本机课程大纲…');
  loading.setAttribute('role', 'status');
  container.appendChild(loading);
  try {
    const materials = await loadCourseMaterials();
    if (courseCatalogStates.get(container) !== state) return;
    const syllabus = materials?.syllabus;
    const items = Array.isArray(syllabus?.items) ? syllabus.items : [];
    const chapters = Array.isArray(syllabus?.chapters)
      ? [...new Set(syllabus.chapters.filter(chapter => typeof chapter === 'string' && chapter.trim()))] : [];
    if (!chapters.length || !items.length) {
      courseCatalogUnavailable(container, state, '暂未读取到可用的课程大纲。请先在本机配置课程大纲资料，再重试。');
      return;
    }
    state.syllabus = syllabus;
    state.items = items;
    state.chapters = chapters;
    if (!chapters.includes(state.chapter)) {
      state.chapter = chapters.find(chapter => courseCatalogHasSample(chapter, items)) || chapters[0];
    }
    courseCatalogRender(container, state);
  } catch (error) {
    if (courseCatalogStates.get(container) !== state) return;
    courseCatalogUnavailable(container, state, '课程大纲读取失败，请检查本机服务后重试。');
  }
}

function courseCatalogUnavailable(container, state, message) {
  container.textContent = '';
  const heading = el('h3', '', '系统解剖学 · 课程目录');
  const status = el('p', 'course-catalog-message', message);
  status.setAttribute('role', 'status');
  const retry = el('button', 'btn', '重新读取课程大纲');
  retry.type = 'button';
  retry.addEventListener('click', () => mountCourseCatalog(container, state.options));
  container.append(heading, status, retry);
}

function courseCatalogHasSample(chapter, items) {
  return /周围神经/.test(chapter) && items.some(item => item.chapter === chapter && /脑神经/.test(item.text || ''));
}

function courseCatalogRender(container, state) {
  container.textContent = '';
  const header = el('div', 'course-catalog-header');
  const title = el('div');
  title.append(el('p', 'course-catalog-eyebrow', '按课程大纲组织学习'), el('h3', '', '系统解剖学 · 课程目录'));
  const count = el('span', 'course-catalog-count', `${state.chapters.length} 个章节`);
  header.append(title, count);
  const source = el('p', 'course-catalog-source', `来源：${state.syllabus.source || '本机课程大纲'}`);
  const notice = el('p', 'course-catalog-notice', '本机导入的大纲将知识要求分为“掌握 / 了解”两级；其他目标未单列等级。文档段落用于核对原文，不是教材页码。');
  const label = el('label', 'course-catalog-picker');
  const select = el('select');
  select.setAttribute('aria-label', '选择课程大纲章节');
  state.chapters.forEach(chapter => {
    const option = el('option', '', chapter);
    option.value = chapter;
    select.appendChild(option);
  });
  select.value = state.chapter;
  label.append(el('span', '', '选择章节'), select);
  const detail = el('div', 'course-catalog-detail');
  detail.setAttribute('aria-live', 'polite');
  select.addEventListener('change', () => {
    state.chapter = select.value;
    courseCatalogRenderChapter(detail, state);
  });
  container.append(header, source, notice, label, detail);
  courseCatalogRenderChapter(detail, state);
}

function courseCatalogRenderChapter(detail, state) {
  detail.textContent = '';
  const items = state.items.filter(item => item.chapter === state.chapter);
  const hasSample = courseCatalogHasSample(state.chapter, items);
  const heading = el('h4', 'course-catalog-chapter-title', state.chapter);
  const coverage = el('div', 'course-catalog-coverage' + (hasSample ? ' has-sample' : ''));
  coverage.appendChild(el('strong', '', hasSample ? '脑神经示例学习可用' : '尚无自动测评，不代表已掌握'));
  coverage.appendChild(el('p', '', hasSample
    ? '当前自动评分仅覆盖脑神经示例的 10 个知识点，不代表整章测评。示例评分目标尚未与大纲逐项审定映射。'
    : '可先核对本章大纲要求与资料；当前不会为本章生成掌握率或完成结论。'));
  const actions = el('div', 'course-catalog-actions');
  if (hasSample) {
    const start = el('button', 'btn btn-primary', '进入脑神经示例学习');
    start.type = 'button';
    start.addEventListener('click', async () => {
      if (start.disabled) return;
      start.disabled = true;
      const error = detail.querySelector('.course-catalog-action-error');
      if (error) error.remove();
      try {
        if (typeof state.options.onStart === 'function') await state.options.onStart(state.chapter);
        else {
          showView('quiz', {restoreTask: false});
          await loadTask((typeof overviewData !== 'undefined' && overviewData?.recommendation?.id) || 'oculomotor', 'auto');
        }
      } catch (error) {
        const message = el('p', 'course-catalog-action-error', '示例学习未能打开，请重试。');
        message.setAttribute('role', 'alert');
        detail.appendChild(message);
      } finally {
        start.disabled = false;
      }
    });
    actions.appendChild(start);
  }
  const original = el('button', 'btn', '查看本章原资料');
  original.type = 'button';
  original.addEventListener('click', () => {
    showView('materials');
    $('materialType').value = 'syllabus';
    $('materialSearch').value = '';
    updateMaterialFilters();
    $('materialFilter').value = state.chapter;
    filterMaterials();
  });
  actions.appendChild(original);
  detail.append(heading, coverage, actions);
  if (!items.length) {
    detail.appendChild(el('p', 'course-catalog-message', '本章尚未导入要求原文，请查看原资料并补充索引。'));
    return;
  }
  const requirements = el('details', 'course-catalog-requirements-panel');
  requirements.open = false;
  requirements.appendChild(el('summary', '', `查看本章 ${items.length} 条大纲要求`));
  detail.appendChild(requirements);
  const categories = [...new Set(items.map(item => item.category || '未分类目标'))];
  const order = ['知识目标', '能力目标', '思政目标'];
  categories.sort((a, b) => {
    const ai = order.indexOf(a), bi = order.indexOf(b);
    return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi);
  });
  categories.forEach(category => {
    const group = el('section', 'course-catalog-group');
    group.appendChild(el('h5', '', category));
    const list = el('ul', 'course-catalog-requirements');
    items.filter(item => (item.category || '未分类目标') === category).forEach(item => {
      const row = el('li', 'course-catalog-requirement');
      const text = el('p', 'course-catalog-requirement-text', item.text || '本条要求原文缺失，请查看原资料。');
      const meta = el('div', 'course-catalog-requirement-meta');
      const level = el('span', 'course-catalog-level' + (item.level === '掌握' ? ' is-core' : ''), item.level || '未单列');
      const locator = el('span', '', item.locator ? `${item.locator} · 非教材页码` : '原文位置未标注');
      meta.append(level, locator);
      if (item.source && item.source !== state.syllabus.source) meta.appendChild(el('span', '', `来源：${item.source}`));
      row.append(text, meta);
      if (typeof state.options.onAsk === 'function' && item.text) {
        const ask = el('button', 'course-catalog-ask', '查询教材依据');
        ask.type = 'button';
        ask.addEventListener('click', () => state.options.onAsk(item.text, item));
        row.appendChild(ask);
      }
      list.appendChild(row);
    });
    group.appendChild(list);
    requirements.appendChild(group);
  });
}
