/* Session-only drafts; restoring never makes a network request. */
function researchDraftKey(identity) {
  return 'mednexus-research-draft-' + identity;
}

function validResearchDraft(value, concepts) {
  if (!value || value.version !== 1 || typeof value.question !== 'string' || value.question.length > 300 ||
      typeof value.query !== 'string' || value.query.length > 1500 || typeof value.ready !== 'boolean') return false;
  if (value.concept !== null && (typeof value.concept !== 'string' || !concepts.includes(value.concept))) return false;
  // Do not keep obvious contact/identity fields in browser drafts either.
  return !/[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?<!\d)1[3-9]\d{9}(?!\d)|(?<!\d)\d{17}[0-9x](?!\d)|(?:姓名|住址|病历号|住院号|patient name|medical record(?: number)?|home address)\s*[:：]/i.test(value.question + '\n' + value.query);
}

function saveResearchDraft(storage, identity, draft, concepts) {
  try {
    if (!/^[a-f0-9]{48}$/.test(identity)) return;
    const value = {version:1, concept:draft.concept, question:draft.question, query:draft.query, ready:draft.ready};
    if (!validResearchDraft(value, concepts)) { storage.removeItem(researchDraftKey(identity)); return; }
    storage.setItem(researchDraftKey(identity), JSON.stringify(value));
  } catch (_) { /* Storage may be unavailable; the current page still works. */ }
}

function readResearchDraft(storage, identity, concepts) {
  try {
    if (!/^[a-f0-9]{48}$/.test(identity)) return null;
    const value = JSON.parse(storage.getItem(researchDraftKey(identity)) || 'null');
    return validResearchDraft(value, concepts) ? value : null;
  } catch (_) { return null; }
}

function clearResearchDraft(storage, identity) {
  try { if (/^[a-f0-9]{48}$/.test(identity)) storage.removeItem(researchDraftKey(identity)); } catch (_) {}
}
