/* Explain a conservative query proposal; applying one never sends a search. */
const researchQueryPlans = new WeakMap();

function clearResearchQueryPlan(container) {
  researchQueryPlans.delete(container); container.textContent = '';
}

function mountResearchQueryPlan(container, proposal, onUse) {
  clearResearchQueryPlan(container);
  if (!proposal || typeof proposal.query !== 'string' || typeof proposal.original_query !== 'string') return;
  const state = {proposal, onUse}; researchQueryPlans.set(container, state);
  container.append(el('h4', 'query-plan-title', proposal.mode === 'focused' ? '把研究焦点转换为检索条件' : '核对知识点模板'),
    el('p', 'study-source', proposal.mapping || '请自行核对建议与原疑问。'));
  const matches = Array.isArray(proposal.matches) ? proposal.matches : [];
  if (matches.length) {
    const list = el('ul', 'query-focus-matches');
    matches.forEach(match => list.appendChild(el('li', null,
      '“' + match.term + '” → ' + match.label + '：' + match.query)));
    container.appendChild(list);
  }
  if (proposal.fallback_reason && !String(proposal.mapping || '').includes(proposal.fallback_reason)) {
    container.appendChild(el('p', 'query-plan-warning', proposal.fallback_reason));
  }
  if (proposal.notice) container.appendChild(el('p', 'study-source', proposal.notice));
  const details = el('details', 'query-plan-original');
  details.append(el('summary', null, '比较原知识点模板'), el('pre', null, proposal.original_query));
  container.appendChild(details);
  const actions = el('div', 'query-plan-actions');
  const addAction = (label, query) => {
    const button = el('button', 'btn', label); button.type = 'button';
    button.addEventListener('click', () => {
      if (researchQueryPlans.get(container) !== state || typeof onUse !== 'function') return;
      onUse(query);
    });
    actions.appendChild(button);
  };
  if (proposal.mode === 'focused' && proposal.query !== proposal.original_query) addAction('使用焦点建议式', proposal.query);
  addAction('恢复原知识点模板', proposal.original_query);
  const status = el('p', 'query-plan-status'); status.setAttribute('role', 'status'); state.status = status;
  container.append(actions, status); updateResearchQueryPlan(container, proposal.query);
}

function updateResearchQueryPlan(container, query) {
  const state = researchQueryPlans.get(container);
  if (!state) return;
  const {proposal, status} = state;
  status.textContent = query === proposal.query && proposal.mode === 'focused' ?
    '当前使用焦点建议式；请核对原疑问与英文条件，再主动查询。' :
    query === proposal.original_query ? '当前使用原知识点模板；请核对后主动查询。' :
    '检索式已手动修改；词语对照仅供参考，查询以文本框中的实际内容为准。';
}
