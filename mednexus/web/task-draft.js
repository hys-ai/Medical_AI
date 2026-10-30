/* Unsubmitted work belongs to one learner, one task and this browser session. */
const TASK_CONFIDENCE = ['未填写', '不确定', '一般', '很有把握'];

function taskDraftKey(identity) { return 'mednexus-task-draft-' + identity; }

function taskReflectionPrivate(text) {
  return /[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?<!\d)1[3-9]\d{9}(?!\d)|(?<!\d)\d{17}[0-9x](?!\d)|(?:姓名|住址|病历号|住院号|patient name|medical record(?: number)?|home address)\s*[:：]/i.test(text);
}

function validTaskDraft(value, task) {
  return !!(value && value.version === 1 && task && /^[a-f0-9]{32}$/.test(task.token) &&
    value.token === task.token && value.concept === task.concept && value.kind === task.kind &&
    value.prompt === task.prompt && Array.isArray(task.points) && task.points.length === 3 &&
    Array.isArray(value.labels) && value.labels.length === task.points.length &&
    Array.isArray(value.answers) && value.answers.length === task.points.length &&
    task.points.every((point, index) => point.label === value.labels[index] && Array.isArray(point.options) &&
      (value.answers[index] === null || point.options.includes(value.answers[index]))) &&
    TASK_CONFIDENCE.includes(value.confidence) && typeof value.reasoning === 'string' &&
    value.reasoning.length <= 3000 && !taskReflectionPrivate(value.reasoning));
}

function readTaskDraft(storage, identity, task) {
  if (!/^[a-f0-9]{48}$/.test(identity)) return null;
  try {
    const value = JSON.parse(storage.getItem(taskDraftKey(identity)) || 'null');
    if (validTaskDraft(value, task)) return value;
    storage.removeItem(taskDraftKey(identity));
  } catch (_) { /* A blocked storage area must not prevent answering. */ }
  return null;
}

function saveTaskDraft(storage, identity, task, draft) {
  if (!/^[a-f0-9]{48}$/.test(identity)) return 'unavailable';
  try {
    const value = {version:1, token:task.token, concept:task.concept, kind:task.kind, prompt:task.prompt,
      labels:task.points.map(point => point.label), answers:task.points.map((_, index) => draft.answers[index] ?? null),
      confidence:draft.confidence, reasoning:draft.reasoning};
    if (!validTaskDraft(value, task)) {
      storage.removeItem(taskDraftKey(identity));
      return taskReflectionPrivate(value.reasoning) ? 'private' : 'unavailable';
    }
    storage.setItem(taskDraftKey(identity), JSON.stringify(value));
    return 'saved';
  } catch (_) { return 'unavailable'; }
}

function clearTaskDraft(storage, identity, token = null) {
  if (!/^[a-f0-9]{48}$/.test(identity)) return;
  try {
    if (token) {
      const value = JSON.parse(storage.getItem(taskDraftKey(identity)) || 'null');
      if (value?.token !== token) return;
    }
    storage.removeItem(taskDraftKey(identity));
  } catch (_) {}
}
