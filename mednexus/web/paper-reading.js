/* Display source-labelled excerpts, never manufacture a study summary. */
function mountPaperReading(container, data) {
  container.textContent = '';
  const paper = data.paper || {};
  container.append(el('h4', 'reading-title', paper.title || '标题未提供'),
    el('p', 'study-label', '围绕问题：' + data.question));
  const meta = [paper.journal, paper.year].filter(Boolean).join(' · ');
  if (meta) container.appendChild(el('p', 'study-source', meta));
  if (/^\d{1,12}$/.test(String(paper.pmid || ''))) {
    const source = el('a', 'reading-original', '核对 PubMed 原始记录 · PMID ' + paper.pmid + ' ↗');
    source.href = 'https://pubmed.ncbi.nlm.nih.gov/' + paper.pmid + '/';
    source.target = '_blank'; source.rel = 'noopener noreferrer'; container.appendChild(source);
  }
  container.appendChild(el('p', 'reading-notice', data.notice ||
    '以下仅为摘要原文节选，不是中文翻译、全文解读或研究质量评价。'));
  const sections = Array.isArray(data.sections) ? data.sections : [{
    id:'results', title:'结果或结论节选', excerpts:(data.evidence || []),
    missing_notice:'摘要未提供可直接提取的结果或结论段落。'
  }];
  const grid = el('div', 'paper-reading-grid');
  const missing = el('details', 'reading-missing');
  missing.appendChild(el('summary', null, '核对摘要中未识别或未展示的环节'));
  let displayed = 0, absent = 0;
  sections.forEach(section => {
    const excerpts = (Array.isArray(section.excerpts) ? section.excerpts : []).filter(part => typeof part?.text === 'string' && part.text);
    if (!excerpts.length) {
      absent++;
      missing.appendChild(el('p', 'study-source', (section.title || '未标注环节') + '：' +
        (section.missing_notice || '未识别到对应摘要标签，请打开原文核对。')));
      return;
    }
    displayed++;
    const block = el('section', 'reading-section');
    block.appendChild(el('h5', null, section.title || '摘要节选'));
    excerpts.forEach(part => {
      if (part.label || part.category) block.appendChild(el('p', 'reading-origin-label',
        '原摘要标签：' + (part.label || '未标注') + (part.category ? ' · NLM ' + part.category : '')));
      block.appendChild(el('blockquote', 'reading-excerpt', part.text));
      if (part.truncated) block.appendChild(el('small', 'study-source', '本段仅显示开头节选，请在 PubMed 核对完整摘要。'));
    });
    if (Number.isInteger(section.omitted_count) && section.omitted_count > 0) {
      block.appendChild(el('p', 'study-source', '本环节另有 ' + section.omitted_count + ' 段未展示，请打开 PubMed 核对。'));
    }
    grid.appendChild(block);
  });
  if (displayed) container.appendChild(grid);
  else container.appendChild(el('p', 'study-source', '未取得可展示的摘要节选，请打开 PubMed 核对是否提供摘要。'));
  if (absent) container.appendChild(missing);
  if (data.excerpt_limits?.truncated) container.appendChild(el('p', 'study-source',
    '本卡受节选长度和段数限制，未展示完整摘要；未展示不等于原文没有报告。'));
  if (data.limitations) container.appendChild(el('p', 'study-source', data.limitations));
  if (data.relationship) container.appendChild(el('p', 'study-source', data.relationship));
  if (data.ai_guide) {
    const guide = el('details', 'reading-ai');
    guide.appendChild(el('summary', null, 'AI 辅助摘要解读（需对照原摘要核验）'));
    [['question', '问题'], ['evidence', '证据'], ['limitations', '局限'], ['relationship', '与课程知识的关系']].forEach(([key, label]) => {
      guide.appendChild(el('p', 'study-source', label + '：' + (data.ai_guide[key] || '摘要未报告')));
    });
    container.appendChild(guide);
  }
  if (data.warning) container.appendChild(el('p', 'study-source', data.warning));
}
