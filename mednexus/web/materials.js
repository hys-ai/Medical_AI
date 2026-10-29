/* Private imported material browser. OCR is evidence to review, never a grading key. */
let courseMaterials = null;
let materialItems = [];
let materialIndex = 0;
let materialRevealed = false;
let materialLoading = null;
let localMatchRequest = 0;
const materialDrafts = new Map();

function materialDraftKey(item, line) {
  return item.image_number + ':' + line.index;
}

function updateMaterialDraftSummary() {
  if (typeof $ !== 'function') return;
  const summary = $('materialSummary');
  if (!summary) return;
  const base = summary.textContent.replace(/ 本窗口有 \d+ 行未保存草稿，筛选和翻页后仍可继续编辑。$/, '');
  summary.textContent = base + (materialDrafts.size ? ' 本窗口有 ' + materialDrafts.size + ' 行未保存草稿，筛选和翻页后仍可继续编辑。' : '');
}

function rememberMaterialDraft(item, line, text, checked) {
  const key = materialDraftKey(item, line);
  const previous = materialDrafts.get(key);
  if (text === line.text && checked === Boolean(line.visually_checked)) {
    materialDrafts.delete(key);
    updateMaterialDraftSummary();
    return;
  }
  materialDrafts.set(key, {text, checked, token:previous?.token || line.review_token,
    revision:previous?.revision ?? line.review_revision});
  updateMaterialDraftSummary();
}

function rebaseMaterialDraft(item, line) {
  const key = materialDraftKey(item, line);
  const previous = materialDrafts.get(key);
  if (previous) materialDrafts.set(key, {...previous, checked:false, token:line.review_token, revision:line.review_revision});
}

async function showLocalMaterialMatches(question) {
  const request = ++localMatchRequest;
  $('localMaterialMatches').hidden = true;
  await loadCourseMaterials();
  if (request !== localMatchRequest || !courseMaterials) return;
  const terms = question.match(/[\u4e00-\u9fff]{2,}|[a-zA-Z]{3,}/g) || [];
  const keys = terms.flatMap((term) => term.match(/.{2,}?(?:细胞|组织|神经|反射|上皮)|microglia/ig) || [term.replace(/^(请问|什么是)/, '').replace(/的(?:功能|作用|结构|特点).*$/, '')]);
  const matches = (courseMaterials.histology?.pages || []).filter((page) => keys.some((key) => key.length >= 2 && page.text.toLowerCase().includes(key.toLowerCase()))).slice(0, 3);
  const body = $('localMaterialMatchesBody'); body.innerHTML = '';
  matches.forEach((page) => {
    const lines = page.text.split('\n');
    const index = lines.findIndex((line) => keys.some((key) => line.toLowerCase().includes(key.toLowerCase())));
    const row = el('div', 'report-row');
    row.append(el('b', null, page.source + ' · 原图序号 ' + page.image_number),
      el('p', 'study-source', 'OCR节选（待核对）：' + lines.slice(Math.max(0, index), index + 4).join(' ').slice(0, 240)));
    const open = el('button', 'btn', '查看这张原图');
    open.addEventListener('click', () => {
      showView('materials'); $('materialType').value = 'histology'; updateMaterialFilters();
      $('materialSearch').value = ''; filterMaterials();
      materialIndex = materialItems.findIndex((item) => item.id === page.id); renderMaterial();
    });
    row.appendChild(open); body.appendChild(row);
  });
  $('localMaterialMatches').hidden = !matches.length;
}

async function loadCourseMaterials() {
  if (courseMaterials) return courseMaterials;
  if (materialLoading) return materialLoading;
  materialLoading = (async () => {
    try {
      courseMaterials = await api('/api/course-materials');
      updateMaterialFilters();
      return courseMaterials;
    } catch (error) {
      $('materialBody').textContent = '资料读取失败：' + error.message;
      const retry = el('button', 'btn', '重试');
      retry.addEventListener('click', loadCourseMaterials);
      $('materialBody').appendChild(retry);
    } finally { materialLoading = null; }
  })();
  return materialLoading;
}

async function refreshCourseMaterials(preferredId) {
  courseMaterials = await api('/api/course-materials');
  filterMaterials(preferredId);
}

function updateMaterialFilters() {
  if (!courseMaterials) return;
  const filter = $('materialFilter'); filter.innerHTML = '';
  const type = $('materialType').value;
  const values = type === 'syllabus' ? (courseMaterials.syllabus?.chapters || []) :
    type === 'cards' ? ['未练习', '待复习', '已核对'] : ['含优先核对片段', '含本机修订'];
  [['', '全部'], ...values.map((value) => [value, value])].forEach(([value, label]) => {
    const option = el('option', null, label); option.value = value; filter.appendChild(option);
  });
  filterMaterials();
}

function materialProgress() {
  try { return JSON.parse(localStorage.getItem('mednexus-materials-' + learnerId()) || '{}'); }
  catch (_) { return {}; }
}

function filterMaterials(preferredId) {
  if (!courseMaterials) return;
  const type = $('materialType').value;
  const query = $('materialSearch').value.trim().toLowerCase();
  const filter = $('materialFilter').value;
  const progress = materialProgress();
  const items = type === 'syllabus' ? courseMaterials.syllabus?.items :
    type === 'histology' ? courseMaterials.histology?.pages : courseMaterials.cards;
  materialItems = (items || []).filter((item) => (!query ||
    [item.text, item.cue, item.chapter].some((s) => String(s || '').toLowerCase().includes(query))) &&
    (!filter || (type === 'syllabus' ? item.chapter === filter : type === 'cards' ? (progress[item.id] || '未练习') === filter :
      filter === '含优先核对片段' ? item.review_count > 0 : item.lines.some((line) => line.user_edited))));
  const found = typeof preferredId === 'string' ? materialItems.findIndex((item) => item.id === preferredId) : -1;
  materialIndex = found >= 0 ? found : 0;
  if (typeof preferredId !== 'string') materialRevealed = false;
  renderMaterial();
}

function renderMaterial() {
  if (!courseMaterials) return;
  const body = $('materialBody'); body.innerHTML = '';
  const type = $('materialType').value;
  const item = materialItems[materialIndex];
  const total = courseMaterials.histology?.total_images || 0;
  $('materialSummary').textContent = '已载入大纲 ' + (courseMaterials.syllabus?.chapters?.length || 0) +
    ' 个章节、' + (courseMaterials.syllabus?.items?.length || 0) + ' 条要求；组胚 ' +
    (courseMaterials.histology?.pages?.length || 0) + ' / ' + total + ' 张原图，' +
    (courseMaterials.cards?.length || 0) + ' 条编号复习条目。当前匹配 ' + materialItems.length + ' 条。' +
    (courseMaterials.histology?.complete === false ? '文字识别仍在进行，完成后请刷新页面。' : '') +
    (materialDrafts.size ? ' 本窗口有 ' + materialDrafts.size + ' 行未保存草稿，筛选和翻页后仍可继续编辑。' : '');
  $('materialPrev').disabled = !item || materialIndex === 0;
  $('materialNext').disabled = !item || materialIndex >= materialItems.length - 1;
  $('materialReveal').hidden = type !== 'cards' || !item;
  $('materialReveal').textContent = materialRevealed ? '收起资料' : '查看资料并核对';
  $('materialJump').value = item ? materialIndex + 1 : '';
  $('materialJump').max = Math.max(1, materialItems.length);
  $('materialJump').disabled = $('materialGo').disabled = $('materialExport').disabled = !item;
  $('materialLineFilterLabel').hidden = type === 'syllabus';
  if (!item) { body.textContent = '没有匹配资料，请调整关键词或筛选。'; return; }
  body.appendChild(el('p', 'study-source', '第 ' + (materialIndex + 1) + ' / ' + materialItems.length +
    ' 条 · 来源：' + item.source + ' · ' + (item.locator || '原图序号 ' + item.image_number)));
  if (type === 'syllabus') {
    body.append(el('h3', null, item.chapter), el('p', 'pill', item.category + ' · ' + item.level),
      el('p', 'answer', item.text));
    const askButton = el('button', 'btn', '围绕这条要求查询教材依据');
    askButton.addEventListener('click', () => { showView('home'); $('q').value = item.text.slice(0, 300); $('q').focus(); });
    body.appendChild(askButton);
    return;
  }
  if (type === 'cards') {
    body.append(el('h3', null, item.cue), el('p', 'study-source', '先尝试口述知识要点或作答，再展开原资料核对。题干可能包含提示或答案，尚未人工拆分审定。'));
    if (!materialRevealed) return;
    ['待复习', '已核对'].forEach((state) => {
      const button = el('button', 'btn', state);
      button.addEventListener('click', () => {
        const progress = materialProgress(); progress[item.id] = state;
        localStorage.setItem('mednexus-materials-' + learnerId(), JSON.stringify(progress));
        toast('已记录：' + state + '，不计入正式掌握度');
        filterMaterials();
      });
      body.appendChild(button);
    });
  }
  const image = el('img', 'material-image');
  image.src = '/api/course-materials/images/' + encodeURIComponent(item.image);
  image.alt = '组胚复习资料原图 ' + item.image_number; image.loading = 'lazy';
  const link = el('a', 'study-source', '在新标签页放大原图 ↗');
  link.href = image.src; link.target = '_blank'; link.rel = 'noopener';
  body.appendChild(link);
  const workspace = el('div', 'ocr-workspace');
  const textPanel = el('div', 'ocr-text-panel');
  textPanel.appendChild(el('h3', null, 'OCR 整理阅读与逐行核对'));
  if (item.transcription) {
    textPanel.appendChild(el('p', 'study-source', item.transcription.basis));
    textPanel.appendChild(el('p', 'study-source', '以下保留首次整理稿；逐行修订见下方，不会自动重写此稿。'));
    item.transcription.sections.forEach((section) => {
      textPanel.append(el('h4', null, section.heading), el('p', 'material-text', section.text));
      if (section.warning) textPanel.appendChild(el('p', 'ocr-source-warning', '原资料疑点：' + section.warning));
    });
    textPanel.appendChild(el('h4', null, '自动识别片段（含批注，仍待核对）'));
  }
  textPanel.appendChild(el('p', 'study-source', '橙色表示识别不确定或两次识别有差异；置信度不等于医学准确率。表格同一行的各栏分别显示，不自动拼成一句话。'));
  const imageSide = el('div', 'ocr-image-side');
  const zoomControls = el('div', 'material-tools ocr-zoom-controls');
  const zoomLabel = el('label', null, '原图缩放 ');
  const zoom = el('select'); zoom.setAttribute('aria-label', '原图缩放');
  [['100','适应宽度'],['150','150%'],['200','200%'],['300','300%']].forEach(([value,text]) => {
    const option = el('option',null,text); option.value = value; zoom.appendChild(option);
  });
  zoomLabel.appendChild(zoom); zoomControls.appendChild(zoomLabel); imageSide.appendChild(zoomControls);
  const imagePane = el('div', 'ocr-image-pane');
  const imageWrap = el('div', 'ocr-image-wrap');
  const highlight = el('div', 'ocr-highlight'); highlight.hidden = true;
  imageWrap.append(image, highlight); imagePane.appendChild(imageWrap);
  imageSide.appendChild(imagePane);
  zoom.addEventListener('change', () => { imageWrap.style.width = zoom.value + '%'; });
  const rows = item.reading_rows || (item.lines || []).map((line, index) => ({segments:[{...line,index}]}));
  const lines = rows.flatMap((row) => row.segments);
  textPanel.appendChild(el('p', 'study-source', '本条目 ' + lines.length + ' 个识别片段；' +
    lines.filter((line) => line.needs_review).length + ' 个优先核对；' +
    lines.filter((line) => line.visually_checked).length + ' 个片段已标记对图核对（不代表医学审核）。'));
  textPanel.appendChild(el('p', 'study-source', '校对修订保存在本机课程资料中，同一电脑的浏览器可读取；不计入测评成绩。只看部分文字时，请切回全部查看表格上下文。'));
  if (!rows.length) textPanel.appendChild(el('pre', 'material-text', item.text));
  let shown = 0;
  const mode = $('materialLineFilter').value;
  const includeLine = (line) => mode === 'pending' ? !line.visually_checked : mode === 'priority' ? line.needs_review : mode === 'edited' ? line.user_edited : true;
  rows.forEach((row) => {
    const group = el('div', 'ocr-row');
    row.segments.filter(includeLine).forEach((line) => {
      shown++;
      const segment = el('div', 'ocr-segment' + (line.needs_review ? ' is-uncertain' : ''));
      segment.appendChild(el('span', 'ocr-line-text', line.text));
      const label = line.user_reviewed ? '本机已核对' : line.user_edited ? '本机修订待核对' : line.visually_checked ? '已对图修字' : line.needs_review ? '优先核对' : '待核对';
      const button = el('button', 'ocr-locate', label + ' · 定位原图');
      button.type = 'button';
      button.disabled = !line.box || !item.width || !item.height;
      button.title = '模型置信度 ' + Math.round((line.confidence || 0) * 100) + '%，仅供排查识别问题';
      const locate = (scrollPage = true) => {
        if (button.disabled) return;
        const xs = line.box.map((p) => p[0]), ys = line.box.map((p) => p[1]);
        highlight.hidden = false;
        highlight.style.left = Math.min(...xs) / item.width * 100 + '%';
        highlight.style.top = Math.min(...ys) / item.height * 100 + '%';
        highlight.style.width = (Math.max(...xs)-Math.min(...xs)) / item.width * 100 + '%';
        highlight.style.height = (Math.max(...ys)-Math.min(...ys)) / item.height * 100 + '%';
        imagePane.scrollTo({top: Math.max(0, imageWrap.offsetHeight * Math.min(...ys) / item.height - 90),
          left: Math.max(0, imageWrap.offsetWidth * Math.min(...xs) / item.width - 40), behavior:'smooth'});
        if (scrollPage && window.innerWidth < 900) imagePane.scrollIntoView({behavior:'smooth',block:'center'});
      };
      button.addEventListener('click', () => locate(true));
      segment.appendChild(button);
      if (line.source_text || line.previous_text) segment.appendChild(el('small', 'ocr-alternative', '原识别：' + (line.source_text || line.previous_text)));
      if (line.alternative && line.alternative.text !== line.text) segment.appendChild(el('small', 'ocr-alternative', '局部重识别候选（未采用）：' + line.alternative.text));
      if (line.user_edited && line.base_text !== line.text) segment.appendChild(el('small', 'ocr-alternative', '识别底稿：' + line.base_text));
      if (line.review_token) segment.appendChild(materialEditor(item, line, locate));
      group.appendChild(segment);
    });
    if (group.childNodes.length) textPanel.appendChild(group);
  });
  if (!shown && rows.length) textPanel.appendChild(el('p','study-source','本条目没有符合当前文字筛选的片段。'));
  workspace.append(textPanel, imageSide); body.appendChild(workspace);
  if (item.original_text) {
    const raw = el('details'); raw.appendChild(el('summary', null, '查看优化前的原始 OCR'));
    raw.appendChild(el('pre', 'material-text', item.original_text)); body.appendChild(raw);
  }
}

function materialEditor(item, line, locate) {
  const key = materialDraftKey(item, line);
  const draft = materialDrafts.get(key);
  const staleDraft = draft && (draft.token !== line.review_token || draft.revision !== line.review_revision);
  const editor = el('details', 'ocr-editor');
  editor.appendChild(el('summary', null, '编辑 / 核对'));
  const form = el('form');
  const label = el('label', null, '修订文字');
  const input = el('textarea'); input.value = draft ? draft.text : line.text; input.maxLength = 2000; input.required = true;
  input.setAttribute('aria-label', '原图' + item.image_number + ' 第' + (line.index + 1) + '行修订文字');
  label.appendChild(input); form.appendChild(label);
  const checkedLabel = el('label', 'ocr-check');
  const checked = el('input'); checked.type = 'checkbox'; checked.checked = draft ? draft.checked : Boolean(line.visually_checked);
  checkedLabel.append(checked, document.createTextNode('已对照原图核对本行文字'));
  form.appendChild(checkedLabel);
  const actions = el('div','material-tools');
  const save = el('button','btn','保存修订'); save.type = 'submit';
  const restore = el('button','btn','恢复识别底稿'); restore.type = 'button'; restore.disabled = !line.user_edited;
  const discard = el('button','btn','放弃本行草稿'); discard.type = 'button'; discard.hidden = !draft;
  actions.append(save, restore, discard); form.appendChild(actions);
  const status = el('p','study-source'); status.setAttribute('role','status');
  const rebase = el('button','btn','以当前版本继续草稿'); rebase.type = 'button'; rebase.hidden = !staleDraft;
  if (staleDraft) form.appendChild(el('p','study-source','当前已保存文字：' + line.text));
  const noteDraft = () => {
    rememberMaterialDraft(item, line, input.value, checked.checked);
    discard.hidden = !materialDrafts.has(key);
    status.textContent = materialDrafts.has(key) ? '本行草稿尚未保存；筛选、翻页和保存其他行不会丢失。' : '本行与已保存版本一致。';
  };
  input.addEventListener('input', () => { checked.checked = false; noteDraft(); });
  checked.addEventListener('change', noteDraft);
  if (draft) status.textContent = staleDraft ?
    '草稿对应的版本已变化。请比较当前已保存文字，再选择继续草稿或放弃本行草稿；尚未覆盖任何修订。' : '已恢复本窗口未保存的草稿。';
  rebase.addEventListener('click', () => {
    rebaseMaterialDraft(item, line); checked.checked = false; rebase.hidden = true;
    status.textContent = '草稿已改为基于当前版本，请重新对图核对后保存。';
  });
  discard.addEventListener('click', () => {
    materialDrafts.delete(key); input.value = line.text; checked.checked = Boolean(line.visually_checked);
    updateMaterialDraftSummary();
    discard.hidden = rebase.hidden = true; status.textContent = '已放弃本行未保存的草稿，显示最近保存的文字。';
  });
  const reload = el('button','btn','重新载入资料'); reload.type = 'button'; reload.hidden = true;
  reload.addEventListener('click', async () => {
    reload.disabled = true;
    try { await refreshCourseMaterials(item.id); } catch (error) { status.textContent = error.message; reload.disabled = false; }
  });
  form.append(status, rebase, reload); editor.appendChild(form);
  const history = line.review_history || [];
  if (history.length) {
    const details = el('details','ocr-history'); details.appendChild(el('summary',null,'修订历史（' + history.length + '）'));
    history.slice().reverse().forEach((entry, reverseIndex) => {
      details.appendChild(el('p','study-source','版本' + (history.length - reverseIndex) + ' · ' + new Date(entry.created * 1000).toLocaleString() + ' · ' +
        (entry.action === 'restore' ? '恢复识别底稿，重新待核对' : (entry.checked ? '本机标记已核对：' : '修订待核对：') + entry.text)));
    });
    editor.appendChild(details);
  }
  editor.addEventListener('toggle', () => { if (editor.open) locate(false); });
  let saving = false;
  const persist = async (action) => {
    if (saving) return;
    saving = true; save.disabled = restore.disabled = discard.disabled = rebase.disabled = true; input.disabled = checked.disabled = true;
    status.textContent = '正在保存到本机…'; reload.hidden = true;
    let saved = false;
    try {
      const pending = materialDrafts.get(key);
      await api('/api/course-materials/review', {page:item.image_number, line:line.index, token:pending?.token || line.review_token,
        revision:pending?.revision ?? line.review_revision, action, text:input.value, checked:checked.checked});
      saved = true;
      materialDrafts.delete(key);
      updateMaterialDraftSummary();
      await refreshCourseMaterials(item.id);
      toast(action === 'restore' ? '已恢复识别底稿，修订历史保留' : '修订已保存到本机，不代表教师审核');
    } catch (error) {
      status.textContent = saved ? '修订已保存，但资料刷新失败。请重新载入；不要重复保存。' : error.message;
      reload.hidden = false;
      // After a successful write, only reloading may obtain the new revision.
      if (!saved) { save.disabled = discard.disabled = rebase.disabled = false; restore.disabled = !line.user_edited; input.disabled = checked.disabled = false; }
    } finally { saving = false; }
  };
  form.addEventListener('submit', (event) => { event.preventDefault(); persist('save'); });
  restore.addEventListener('click', () => persist('restore'));
  return editor;
}

function exportMaterialText() {
  if (!materialItems.length) return;
  const output = ['医枢 · 本机课程资料导出（待教师校对）',
    '原图序号与文档段落号不是教材页码；本机核对标记不代表医学内容已审定。',
    '包含当前筛选的全部条目；文字筛选只控制页面显示，不删减本导出的上下文。', ''];
  materialItems.forEach((item) => {
    output.push('来源：' + item.source + ' · ' + (item.locator || '原图序号 ' + item.image_number));
    if (item.chapter) output.push(item.chapter + ' · ' + item.category + ' · ' + item.level);
    output.push(item.text, '');
    if (item.lines?.some((line) => line.user_edited)) output.push('本条目含本机修订，仍需教师审核。', '');
  });
  const blob = new Blob([output.join('\n')], {type:'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const link = el('a'); link.href = url; link.download = '医枢_课程资料_待校对.txt';
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('materialType').addEventListener('change', updateMaterialFilters);
$('materialFilter').addEventListener('change', filterMaterials);
$('materialSearch').addEventListener('input', filterMaterials);
$('materialLineFilter').addEventListener('change', renderMaterial);
$('materialExport').addEventListener('click', exportMaterialText);
$('materialJumpForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const position = Number($('materialJump').value);
  if (Number.isInteger(position) && position >= 1 && position <= materialItems.length) {
    materialIndex = position - 1; materialRevealed = false; renderMaterial();
  }
});
$('materialPrev').addEventListener('click', () => { materialIndex--; materialRevealed = false; renderMaterial(); });
$('materialNext').addEventListener('click', () => { materialIndex++; materialRevealed = false; renderMaterial(); });
$('materialReveal').addEventListener('click', () => { materialRevealed = !materialRevealed; renderMaterial(); });
window.addEventListener('beforeunload', (event) => {
  if (materialDrafts.size) { event.preventDefault(); event.returnValue = ''; }
});
if (location.hash === '#materials') loadCourseMaterials();
