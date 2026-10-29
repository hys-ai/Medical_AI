import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../web/course-catalog.js', import.meta.url), 'utf8');

class Node {
  constructor(tag = 'div', className = '', value = '') {
    this.tag = tag; this.className = className || ''; this.children = []; this.listeners = {};
    this.textContent = value ?? ''; this.value = ''; this.disabled = false;
    this.classList = {add: name => {this.className = `${this.className} ${name}`.trim();}};
  }
  set textContent(value) {this._text = value; this.children = [];}
  get textContent() {return this._text;}
  append(...children) {children.forEach(child => this.appendChild(child));}
  appendChild(child) {this.children.push(child); child.parent = this; return child;}
  setAttribute(name, value) {this[name] = value;}
  addEventListener(type, callback) {this.listeners[type] = callback;}
  querySelector(selector) {return all(this).find(node => node.className.split(' ').includes(selector.slice(1)));}
  remove() {this.parent.children = this.parent.children.filter(child => child !== this);}
}
const all = node => [node, ...node.children.flatMap(all)];
const text = node => all(node).map(item => item.textContent).join(' ');
const button = (node, label) => all(node).find(item => item.tag === 'button' && item.textContent === label);
const selected = node => all(node).find(item => item.tag === 'select');
const sampleChapter = '第十七章 周围神经系统';

function materials() {
  const chapters = ['绪论', '第一章 骨学', sampleChapter];
  return {syllabus: {source: '本机课程大纲.docx', note: '段落编号不是教材页码。', chapters, items: [
    {id: 'intro', chapter: chapters[0], category: '知识目标', level: '了解', text: '了解人体解剖学的定义。', locator: '文档段落 21'},
    {id: 'bone', chapter: chapters[1], category: '知识目标', level: '掌握', text: '掌握骨的分类。', locator: '文档段落 31'},
    {id: 'nerve', chapter: sampleChapter, category: '知识目标', level: '掌握', text: '掌握脑神经的名称、分支和分布。', locator: '文档段落 290'},
    {id: 'ability', chapter: sampleChapter, category: '能力目标', level: '未单列', text: '结合标本讲解脑神经的走行。', locator: '文档段落 295'},
    {id: 'ethics', chapter: sampleChapter, category: '思政目标', text: '尊重生命，关爱患者。', locator: '文档段落 298'}
  ]}};
}

function setup(overrides = {}) {
  const container = new Node(), nodes = {materialType: new Node('select'), materialSearch: new Node('input'), materialFilter: new Node('select')};
  nodes.materialSearch.value = '旧搜索';
  const calls = [];
  const ctx = vm.createContext({el: (tag, cls, value) => new Node(tag, cls, value),
    loadCourseMaterials: async () => materials(), showView: (...args) => calls.push(['view', ...args]),
    loadTask: async (...args) => calls.push(['task', ...args]), $: id => nodes[id],
    updateMaterialFilters: () => {calls.push(['update', nodes.materialType.value, nodes.materialSearch.value]); nodes.materialFilter.value = '';},
    filterMaterials: () => calls.push(['filter', nodes.materialFilter.value]), ...overrides});
  vm.runInContext(source, ctx);
  ctx.container = container;
  return {ctx, container, nodes, calls, mount: options => {ctx.options = options; return vm.runInContext('mountCourseCatalog(container, options)', ctx);}};
}

test('catalog defaults to the actual brain nerve chapter and renders only its original requirements', async () => {
  const app = setup();
  await app.mount({});
  assert.equal(selected(app.container).value, sampleChapter);
  assert.equal(all(app.container).filter(node => node.tag === 'option').length, 3);
  const rendered = text(app.container);
  assert.match(rendered, /掌握脑神经的名称、分支和分布。/);
  assert.match(rendered, /能力目标/); assert.match(rendered, /思政目标/);
  assert.match(rendered, /未单列/); assert.match(rendered, /文档段落 290 · 非教材页码/);
  assert.match(rendered, /10 个知识点/); assert.match(rendered, /尚未与大纲逐项审定映射/);
  assert.ok(!rendered.includes('了解人体解剖学的定义。'));
  assert.ok(!rendered.includes('掌握骨的分类。'));
  assert.ok(button(app.container, '进入脑神经示例学习'));
  assert.equal(button(app.container, '查询教材依据'), undefined);
});

test('switching chapters clears previous requirements without inventing mastery or exposing sample grading', async () => {
  const app = setup(); await app.mount({});
  const select = selected(app.container); select.value = '第一章 骨学'; select.listeners.change();
  const rendered = text(app.container);
  assert.match(rendered, /掌握骨的分类。/); assert.match(rendered, /尚无自动测评，不代表已掌握/);
  assert.ok(!rendered.includes('掌握脑神经的名称、分支和分布。'));
  assert.ok(!rendered.includes('0%'));
  assert.equal(button(app.container, '进入脑神经示例学习'), undefined);
  await app.mount({});
  assert.equal(selected(app.container).value, '第一章 骨学');
});

test('requirements use a closed native disclosure while chapter actions stay visible; switching resets it', async () => {
  const app = setup(); await app.mount({});
  const disclosure = all(app.container).find(node => node.tag === 'details');
  assert.ok(disclosure);
  assert.equal(disclosure.open, false);
  assert.equal(disclosure.children[0].tag, 'summary');
  assert.equal(disclosure.children[0].textContent, '查看本章 3 条大纲要求');
  assert.match(text(disclosure), /掌握脑神经的名称、分支和分布。/);
  assert.match(text(disclosure), /文档段落 290 · 非教材页码/);
  assert.ok(!all(disclosure).includes(button(app.container, '进入脑神经示例学习')));
  assert.ok(!all(disclosure).includes(button(app.container, '查看本章原资料')));
  assert.ok(!text(disclosure).includes('脑神经示例学习可用'));
  disclosure.open = true;
  const select = selected(app.container); select.value = '第一章 骨学'; select.listeners.change();
  const next = all(app.container).find(node => node.tag === 'details');
  assert.notEqual(next, disclosure);
  assert.equal(next.open, false);
  assert.equal(next.children[0].textContent, '查看本章 1 条大纲要求');
  assert.match(text(next), /掌握骨的分类。/);
  assert.ok(!text(next).includes('掌握脑神经的名称、分支和分布。'));
});

test('all syllabus chapters remain selectable while no sample is shown for unrelated brain nerve text', async () => {
  const data = materials();
  data.syllabus.chapters = Array.from({length: 22}, (_, i) => `章节 ${i + 1}`);
  data.syllabus.items = data.syllabus.chapters.map(chapter => ({chapter, category: '知识目标', level: '了解', text: `${chapter} 的脑神经相关内容`}));
  const app = setup({loadCourseMaterials: async () => data}); await app.mount({});
  assert.equal(selected(app.container).value, '章节 1');
  assert.equal(all(app.container).filter(node => node.tag === 'option').length, 22);
  assert.match(text(app.container), /22 个章节/);
  assert.equal(button(app.container, '进入脑神经示例学习'), undefined);
  assert.ok(!text(app.container).includes('章节 2 的脑神经相关内容'));
});

test('view original source clears stale search and filters the selected chapter after setting syllabus type', async () => {
  const app = setup(); await app.mount({});
  selected(app.container).value = '第一章 骨学'; selected(app.container).listeners.change();
  button(app.container, '查看本章原资料').listeners.click();
  assert.deepEqual(app.calls, [['view', 'materials'], ['update', 'syllabus', ''], ['filter', '第一章 骨学']]);
});

test('source questions call the supplied callback with literal original text and item metadata', async () => {
  const asked = [], data = materials(); data.syllabus.items[2].text = '<img onerror=alert(1)> 脑神经要求原文';
  const app = setup({loadCourseMaterials: async () => data});
  await app.mount({onAsk: (question, item) => asked.push([question, item.id])});
  button(app.container, '查询教材依据').listeners.click();
  assert.deepEqual(asked, [['<img onerror=alert(1)> 脑神经要求原文', 'nerve']]);
  assert.ok(!all(app.container).some(node => node.tag === 'img'));
});

test('sample entry invokes explicit callback once while pending, then allows retry after error', async () => {
  let release, attempts = 0;
  const pending = new Promise(resolve => release = resolve);
  const app = setup();
  await app.mount({onStart: async chapter => {assert.equal(chapter, sampleChapter); if (++attempts === 1) {await pending; throw Error('test');}}});
  const start = button(app.container, '进入脑神经示例学习');
  const first = start.listeners.click(); assert.equal(start.disabled, true);
  await start.listeners.click(); assert.equal(attempts, 1);
  release(); await first;
  assert.match(text(app.container), /示例学习未能打开，请重试/);
  assert.equal(start.disabled, false);
  await start.listeners.click(); assert.equal(attempts, 2);
  assert.ok(!text(app.container).includes('示例学习未能打开，请重试'));
});

test('default sample entry uses the recommended concept and auto mode without restoring an unrelated task', async () => {
  const app = setup({overviewData: {recommendation: {id: 'facial'}}}); await app.mount({});
  await button(app.container, '进入脑神经示例学习').listeners.click();
  assert.equal(app.calls[0][1], 'quiz'); assert.equal(app.calls[0][2].restoreTask, false);
  assert.deepEqual(app.calls[1], ['task', 'facial', 'auto']);
});

test('missing data is honest and retry can recover after a swallowed loader error', async () => {
  let attempts = 0;
  const app = setup({loadCourseMaterials: async () => ++attempts === 1 ? undefined : materials()});
  await app.mount({}); assert.match(text(app.container), /暂未读取到可用的课程大纲/);
  assert.equal(all(app.container).filter(node => node.tag === 'select').length, 0);
  await button(app.container, '重新读取课程大纲').listeners.click();
  assert.equal(selected(app.container).value, sampleChapter);
});

test('network failure provides retry and an older request never overwrites a newer mount', async () => {
  let reject;
  const pending = new Promise((_, no) => reject = no);
  let attempts = 0;
  const app = setup({loadCourseMaterials: () => ++attempts === 1 ? pending : Promise.resolve(materials())});
  const first = app.mount({}); await app.mount({});
  reject(Error('network')); await first;
  assert.equal(selected(app.container).value, sampleChapter);
  const failed = setup({loadCourseMaterials: async () => {throw Error('network');}});
  await failed.mount({}); assert.match(text(failed.container), /课程大纲读取失败/);
  assert.ok(button(failed.container, '重新读取课程大纲'));
});
