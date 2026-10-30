import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const draftSource=readFileSync(new URL('../web/task-draft.js',import.meta.url),'utf8');
const appSource=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const segment=(start,end)=>appSource.slice(appSource.indexOf(start),appSource.indexOf(end));
const identity='a'.repeat(48), token='b'.repeat(32);
const task=()=>({token,concept:'oculomotor',kind:'diagnostic',prompt:'合成教学题',points:[0,1,2].map(i=>({label:'合成要点'+i,options:['合成选择A'+i,'合成选择B'+i,'暂时不确定']}))});
function storage() {
  const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
}
function policy(store=storage()) {
  const ctx=vm.createContext({});vm.runInContext(draftSource,ctx);
  return {ctx,store,read:(t=task(),id=identity)=>ctx.readTaskDraft(store,id,t),
    save:(draft,t=task(),id=identity)=>ctx.saveTaskDraft(store,id,t,draft),
    clear:(id=identity,t=null)=>ctx.clearTaskDraft(store,id,t)};
}
const draft=()=>({answers:['合成选择B0',null,'暂时不确定'],confidence:'很有把握',reasoning:'合成推理，仅测试保留原文。'});

test('refresh keeps literal selected options, confidence and reflection for the exact task only',()=>{
  const p=policy();assert.equal(p.save(draft()),'saved');const restored=policy(p.store).read();
  assert.deepEqual(JSON.parse(JSON.stringify(restored.answers)),draft().answers);
  assert.equal(restored.confidence,'很有把握');assert.equal(restored.reasoning,draft().reasoning);
  assert.equal(p.read(task(),'c'.repeat(48)),null);
  assert.equal(p.read({...task(),token:'d'.repeat(32)}),null);
});

test('changed question, options, malformed or oversized drafts are never restored',()=>{
  const p=policy();
  for(const mutate of [v=>v.version=2,v=>v.answers=['arbitrary',null,null],v=>v.answers=[],
    v=>v.reasoning='字'.repeat(3001),v=>v.confidence='invented',v=>v.labels[1]='changed']) {
    p.save(draft());const value=JSON.parse(p.store.getItem(p.ctx.taskDraftKey(identity)));mutate(value);
    p.store.setItem(p.ctx.taskDraftKey(identity),JSON.stringify(value));assert.equal(p.read(),null);
  }
  p.save(draft());assert.equal(p.read({...task(),prompt:'另一题'}),null);
  p.save(draft());const changed=task();changed.points[0].options=['其他'];assert.equal(p.read(changed),null);
  p.store.setItem(p.ctx.taskDraftKey(identity),'{broken');assert.equal(p.read(),null);
});

test('obvious personal fields remove the previous saved draft and blocked storage stays usable',()=>{
  const p=policy();p.save(draft());
  assert.equal(p.save({...draft(),reasoning:'姓名：合成测试名'}),'private');assert.equal(p.read(),null);
  const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};
  const b=policy(blocked);assert.equal(b.save(draft()),'unavailable');assert.equal(b.read(),null);assert.doesNotThrow(()=>b.clear());
});

test('submission clears only its task while reset clears only the current learner',()=>{
  const p=policy();p.save(draft());p.save(draft(),task(),'c'.repeat(48));
  p.clear(identity,'d'.repeat(32));assert.ok(p.read());p.clear(identity,token);assert.equal(p.read(),null);
  assert.ok(p.read(task(),'c'.repeat(48)));p.save(draft());p.clear();assert.equal(p.read(),null);
  assert.ok(p.read(task(),'c'.repeat(48)));
});

class Node {
  constructor(tag='div',cls='',text='') {this.tag=tag;this.className=cls||'';this.children=[];this.listeners={};this.attrs={};this.textContent=text??'';this.value='';this.style={};this.dataset={};
    this.classList={toggle:(name,on)=>{const set=new Set(this.className.split(' ').filter(Boolean));on?set.add(name):set.delete(name);this.className=[...set].join(' ');}};}
  set textContent(value){this._text=value;this.children=[];}get textContent(){return this._text;}
  set innerHTML(value){assert.equal(value,'');this.children=[];}
  append(...nodes){nodes.forEach(node=>this.appendChild(node));}appendChild(node){this.children.push(node);return node;}
  setAttribute(key,value){this.attrs[key]=value;}addEventListener(type,fn){this.listeners[type]=fn;}
}
const all=root=>[root,...root.children.flatMap(all)];
const text=root=>all(root).map(n=>n.textContent).join(' ');
function setup({store=storage(),api=async()=>({})}={}) {
  const nodes={},calls=[],messages=[];const t=task();
  const ctx=vm.createContext({sessionStorage:store,learnerId:()=>identity,
    el:(tag,cls,value)=>new Node(tag,cls,value),$:id=>nodes[id]??=new Node(),
    $$:(selector,root)=>all(root).filter(n=>n.className.split(' ').includes(selector.slice(1))),
    quizTask:t,quizPhase:'task',quizSubmitting:false,quizLoading:false,quizHintLoading:false,
    toast:msg=>messages.push(msg),mountTutorChat:()=>{},requestTaskHint:()=>{},
    api:async(...args)=>{calls.push(args);return api(...args);},renderQuizResult:r=>{ctx.rendered=r;},refreshOverview:async()=>{},loadLearningReport:async()=>{}});
  vm.runInContext(draftSource,ctx);
  vm.runInContext(segment('function renderTaskCard(', 'async function requestTaskHint('),ctx);
  vm.runInContext(segment('async function submitAnswer(', 'function renderQuizResult('),ctx);
  vm.runInContext(segment('function renderAnswerReflection(', 'function mountResearchBridge('),ctx);
  return {ctx,nodes,calls,messages,t,store,mount:()=>ctx.renderTaskCard(t),
    buttons:()=>all(nodes.quizArea).filter(n=>n.tag==='button'),input:label=>all(nodes.quizArea).find(n=>n.attrs['aria-label']===label)};
}

test('restored task marks the actual option and never submits, scores or asks for a hint on restoration',()=>{
  const s=setup();policy(s.store).save(draft());s.mount();
  assert.equal(s.calls.length,0);assert.match(text(s.nodes.quizArea),/已恢复本窗口未提交/);
  const selected=s.buttons().filter(n=>n.attrs['aria-pressed']==='true');assert.deepEqual(selected.map(n=>n.textContent),['合成选择B0','暂时不确定']);
  assert.equal(s.input('本次作答信心').value,'很有把握');assert.equal(s.input('补充推理').value,draft().reasoning);
});

test('selection and reflection changes save a draft; incomplete submission preserves it and no confidence is invented',async()=>{
  const s=setup();s.mount();const option=s.buttons().find(n=>n.textContent==='合成选择A0');option.listeners.click();
  const reasoning=s.input('补充推理');reasoning.value='合成分析';reasoning.listeners.input();
  assert.equal(policy(s.store).read().confidence,'未填写');assert.equal(policy(s.store).read().reasoning,'合成分析');
  await s.buttons().find(n=>n.textContent==='提交作答').listeners.click();
  assert.equal(s.calls.length,0);assert.ok(policy(s.store).read());assert.ok(s.messages.some(m=>m.includes('三个要点')));
  assert.equal(option.disabled,false);
});

test('pending submission locks edits and duplicate sends; successful grade sends a snapshot and clears only after acknowledgement',async()=>{
  let complete;const s=setup({api:()=>new Promise(resolve=>complete=resolve)});s.mount();
  for(let i=0;i<3;i++)s.buttons().find(n=>n.textContent==='合成选择A'+i).listeners.click();
  const confidence=s.input('本次作答信心');confidence.value='不确定';confidence.listeners.change();
  const reasoning=s.input('补充推理');reasoning.value='合成推理';reasoning.listeners.input();
  const submit=s.buttons().find(n=>n.textContent==='提交作答'),sending=submit.listeners.click();
  assert.ok(submit.disabled);assert.ok(confidence.disabled);assert.ok(reasoning.disabled);assert.ok(policy(s.store).read());
  s.buttons().find(n=>n.textContent==='合成选择B0').listeners.click();await submit.listeners.click();
  assert.equal(s.calls.length,1);assert.equal(s.calls[0][1].answers[0],'合成选择A0');
  assert.equal(s.calls[0][1].confidence,'不确定');assert.equal(s.calls[0][1].reasoning,'合成推理');
  complete({score:0,confidence:'不确定'});await sending;
  assert.equal(policy(s.store).read(),null);assert.equal(s.ctx.quizPhase,'result');
});

test('failed submission keeps choices and free text for retry, and stale task controls cannot submit',async()=>{
  let fail=true;const s=setup({api:async()=>{if(fail)throw Error('offline');return {score:0};}});s.mount();
  const uncertain=s.buttons().filter(n=>n.textContent==='暂时不确定');uncertain.forEach(n=>n.listeners.click());
  const submit=s.buttons().find(n=>n.textContent==='提交作答');await submit.listeners.click();
  assert.ok(policy(s.store).read());assert.equal(s.ctx.quizPhase,'task');assert.equal(submit.disabled,false);
  s.ctx.quizTask={...task(),token:'d'.repeat(32)};await submit.listeners.click();assert.equal(s.calls.length,1);
  s.ctx.quizTask=s.t;fail=false;await submit.listeners.click();assert.equal(s.calls.length,2);assert.equal(policy(s.store).read(),null);
});

test('feedback shows confidence and original reasoning as literal text while an omitted choice stays omitted',()=>{
  const s=setup(),root=new Node();s.ctx.renderAnswerReflection(root,{confidence:'很有把握',confidence_source:'self_reported',calibration:'合成信心反馈',reasoning:'<img src=x onerror=alert(1)>'});
  assert.match(text(root),/提交时的信心：很有把握/);assert.match(text(root),/合成信心反馈/);
  assert.match(text(root),/<img src=x onerror=alert\(1\)>/);assert.match(text(root),/未参与自动评分/);
  const empty=new Node();s.ctx.renderAnswerReflection(empty,{confidence:'未填写',reasoning:''});assert.equal(empty.children.length,0);
  const legacy=new Node();s.ctx.renderAnswerReflection(legacy,{confidence:'一般',reasoning:'',calibration:'old'});assert.equal(legacy.children.length,0);
});

test('learning reset removes task draft only after a successful server acknowledgement',async()=>{
  const code=segment('$("clearLearning").addEventListener', '/* ---------- 提问 ---------- */');
  for(const fail of [true,false]) {
    const s=setup();policy(s.store).save(draft());Object.assign(s.ctx,{activeRequests:0,dataResetting:false,reportRequestId:0,
      localStorage:{removeItem(){}},clearTutorChatState(){},quicknoteKey:()=>'',resetResearchContext(){},setAskContext(){}});
    s.nodes.clearConfirmed=new Node();s.nodes.clearConfirmed.checked=true;s.nodes.clearScope=new Node();s.nodes.clearScope.value='learning';
    s.ctx.api=async()=>{if(fail)throw Error('offline');};vm.runInContext(code,s.ctx);
    await s.nodes.clearLearning.listeners.click();assert.equal(!!policy(s.store).read(),fail);
  }
});
