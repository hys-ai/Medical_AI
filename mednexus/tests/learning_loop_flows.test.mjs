import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const segment=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end));
class Node {
  constructor(tag='div',className='',text='') {this.tag=tag;this.className=className||'';this.children=[];this.listeners={};this.textContent=text;this.value='';this.hidden=false;}
  set textContent(value) {this._text=value??'';this.children=[];}
  get textContent() {return this._text;}
  set innerHTML(value) {this.textContent=value;}
  append(...children) {this.children.push(...children);}
  appendChild(child) {this.children.push(child);return child;}
  setAttribute(key,value) {this[key]=value;}
  addEventListener(type,handler) {this.listeners[type]=handler;}
  querySelector(selector) {return all(this).slice(1).find(n=>n.className.split(' ').includes(selector.slice(1)))||null;}
  focus() {}
  scrollIntoView() {}
}
const all=node=>[node,...node.children.flatMap(all)];
const text=node=>all(node).map(n=>n.textContent).join(' ');
const button=(node,label)=>all(node).find(n=>n.tag==='button'&&n.textContent===label);
function setup(overrides={}) {
  const nodes={};
  const ctx=vm.createContext({pmRequestId:0,readingRequestId:0,wanderOriginConcept:null,researchContext:null,
    quizLoading:false,quizSubmitting:false,quizHintLoading:false,quizPhase:'empty',quizConcept:null,quizTask:null,overviewData:null,
    $:id=>nodes[id]??=new Node(),el:(...args)=>new Node(...args),toast:()=>{},
    renderPapers:()=>{},renderQuiz:()=>{},showView:()=>{},loadTask:()=>{},openConceptQuestion:()=>{},...overrides});
  vm.runInContext(segment('function resetResearchContext()', 'async function loadPaperReading'),ctx);
  vm.runInContext(segment('function mountResearchBridge(', 'async function loadLearningReport('),ctx);
  return {ctx,nodes};
}

test('concept research first shows an editable template without contacting PubMed, then sends the original question and concept',async()=>{
  const calls=[],rendered=[];
  const s=setup({api:async(path,body)=>{
    calls.push([path,JSON.parse(JSON.stringify(body))]);
    return path==='/api/research'?{eligible:true,reason:'可探索',mapping:'人工模板',query:'trochlear AND recovery'}:
      {papers:[{title:'Actual fixture'}],note:body.query,count:1,mapping:'已编辑'};
  },renderPapers:(_,papers)=>rendered.push(papers[0].title)});
  await vm.runInContext("pmSearch('上斜肌与外直肌恢复是否不同？','trochlear')",s.ctx);
  assert.equal(calls.length,1);assert.equal(calls[0][0],'/api/research');
  assert.equal(s.nodes.researchQueryEditor.hidden,false);assert.equal(s.nodes.pmQuery.value,'trochlear AND recovery');
  assert.equal(s.nodes.researchReturn.hidden,false);
  await vm.runInContext("pmSearch('上斜肌与外直肌恢复是否不同？','trochlear','trochlear AND regeneration')",s.ctx);
  assert.deepEqual(calls[1],['/api/pubmed',{question:'上斜肌与外直肌恢复是否不同？',retmax:6,concept:'trochlear',query:'trochlear AND regeneration'}]);
  assert.deepEqual(rendered,['Actual fixture']);assert.equal(s.ctx.researchContext.concept,'trochlear');
});

test('rejected recall questions never trigger PubMed and still offer return to the original concept',async()=>{
  const calls=[];const s=setup({api:async(path)=>{calls.push(path);return {eligible:false,reason:'先补齐概念'};}});
  await vm.runInContext("pmSearch('动眼神经是第几对？','oculomotor')",s.ctx);
  assert.deepEqual(calls,['/api/research']);assert.equal(s.nodes.researchQueryEditor.hidden,true);
  assert.equal(s.nodes.researchReturn.hidden,false);assert.match(s.nodes.pmStatus.textContent,/先补齐概念/);
});

test('editing and resubmitting a research question preserves concept while invalidating old results',async()=>{
  const calls=[];const s=setup({api:async(path,body)=>{calls.push([path,body.concept]);return {eligible:true,reason:'可探索',query:'oculomotor'};}});
  vm.runInContext(segment('$("pmForm").addEventListener', '$$(".pm-chip")'),s.ctx);
  s.ctx.wanderOriginConcept='oculomotor';s.nodes.pmQ.value='眼睑下垂是否与病因有关？';
  await s.nodes.pmForm.listeners.submit({preventDefault(){}});
  assert.deepEqual(calls,[['/api/research','oculomotor']]);
  const before=s.ctx.pmRequestId;s.nodes.pmQ.listeners.input();
  assert.equal(s.ctx.pmRequestId,before+1);assert.equal(s.nodes.researchQueryEditor.hidden,true);
  assert.equal(s.ctx.wanderOriginConcept,'oculomotor');
  vm.runInContext('resetResearchContext()',s.ctx);assert.equal(s.ctx.wanderOriginConcept,null);
});

test('remediation renders only server-selected missing points, separates locators from quotes, and follows server retest mode',async()=>{
  const tasks=[];const s=setup({api:async()=>({concept:'light',name:'瞳孔反射',study_mode:'targeted',retest_kind:'transfer',
    note:'自编测试学习卡',local_sources:[{id:'one'}],focus:[{label:'传入通路',reason:'漏答',expected:'测试正确要点',evidence:[
      {book:'定位测试书',page:42,kind:'metadata',evidence_type:'locator',excerpt:'不得引用这段',evidence_notice:'仅作书页定位'},
      {book:'文本测试书',page:9,evidence_type:'text',excerpt:'可核对的测试原句',evidence_notice:'请核验'}]}]}),
    loadTask:(...args)=>tasks.push(args)});
  await vm.runInContext("showStudyForResult({concept:'light',score:0,rubric:[{correct:false,label:'伪造客户端错点'}]})",s.ctx);
  const rendered=text(s.nodes.quizArea);
  assert.match(rendered,/传入通路/);assert.match(rendered,/第 42 页/);assert.match(rendered,/原文节选：可核对的测试原句/);
  assert.ok(!rendered.includes('伪造客户端错点'));assert.ok(!rendered.includes('不得引用这段'));
  assert.equal(s.ctx.quizConcept,'light');assert.equal(s.nodes.quizKind.textContent,'针对性补学');
  button(s.nodes.quizArea,'补完做迁移题').listeners.click();assert.deepEqual(tasks,[['light','transfer']]);
  assert.ok(button(s.nodes.quizArea,'围绕这个知识点查询教材'));
  assert.ok(button(s.nodes.quizArea,'判断能否进入文献漫游'));
});

test('overview study has no invented missing points, honestly marks absent pages, and failed loading remains retryable',async()=>{
  let fail=true;const s=setup({api:async()=>{if(fail)throw Error('暂不可用');return {concept:'light',name:'测试',study_mode:'overview',retest_kind:'diagnostic',focus:[],local_sources:[],note:'示例学习卡'};}});
  await vm.runInContext("showStudyForResult({concept:'light'})",s.ctx);
  assert.equal(s.ctx.quizLoading,false);assert.match(text(s.nodes.quizArea),/暂不可用/);
  fail=false;await button(s.nodes.quizArea,'重试补学').listeners.click();
  assert.match(text(s.nodes.quizArea),/学习准备/);assert.match(text(s.nodes.quizArea),/尚无可核对的教材页码/);
  assert.ok(button(s.nodes.quizArea,'补完再测基础题'));
});

test('changing a bridge question while the gate is pending cannot leave an entry for the old question',async()=>{
  let resolve;const s=setup({api:()=>new Promise(r=>resolve=r)});s.ctx.container=new Node();
  vm.runInContext("mountResearchBridge(container,'light')",s.ctx);
  const input=all(s.ctx.container).find(n=>n.tag==='input');input.value='瞳孔反射是否存在差异？';
  const pending=button(s.ctx.container,'判断能否进入文献漫游').listeners.click();
  input.value='不同疑问';input.listeners.input();resolve({eligible:true,reason:'可探索'});await pending;
  assert.equal(s.ctx.container.querySelector('.research-enter'),null);
});

test('paper reading preserves the learning question and labels optional model interpretation separately from actual excerpts',async()=>{
  const calls=[];const s=setup({researchContext:{concept:'light',question:'瞳孔反射是否存在差异？'},
    api:async(path,body)=>{calls.push([path,body]);return {paper:{title:'Synthetic test paper'},question:body.question,
      evidence:[{text:'Actual fixture excerpt.'}],limitations:'阅读局限',relationship:'候选证据',
      ai_guide:{question:'测试问题',evidence:'测试解释',limitations:'摘要未报告',relationship:'需核对'}};}});
  vm.runInContext(segment('async function loadPaperReading(', '/* ---------- 数据加载 ---------- */'),s.ctx);
  await vm.runInContext("loadPaperReading({pmid:'123'})",s.ctx);
  assert.equal(calls[0][1].concept,'light');assert.equal(calls[0][1].question,'瞳孔反射是否存在差异？');
  const rendered=text(s.nodes.paperReadingBody);
  assert.match(rendered,/Actual fixture excerpt/);assert.match(rendered,/AI 辅助摘要解读（需对照原摘要核验）/);assert.match(rendered,/证据：测试解释/);
});

test('resetting research while an abstract is pending prevents the old paper from appearing in the new context',async()=>{
  let release;const s=setup({researchContext:{concept:'light',question:'旧问题'},api:()=>new Promise(r=>release=r)});
  vm.runInContext(segment('async function loadPaperReading(', '/* ---------- 数据加载 ---------- */'),s.ctx);
  const pending=vm.runInContext("loadPaperReading({pmid:'123'})",s.ctx);
  vm.runInContext('resetResearchContext()',s.ctx);
  release({paper:{title:'STALE PAPER'},evidence:[]});await pending;
  assert.equal(s.nodes.paperReading.hidden,true);assert.ok(!text(s.nodes.paperReadingBody).includes('STALE PAPER'));
});
