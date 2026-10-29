import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function renderChecklist('),source.indexOf('function shortBook('));

class Node {
  constructor(tag='div',className='',text='') {
    this.tag=tag;this.className=className||'';this.textContent=text??'';this.children=[];this.listeners={};this.disabled=false;
  }
  set innerHTML(value) {this.children=[];this.textContent=value;}
  append(...children) {this.children.push(...children);}
  appendChild(child) {this.children.push(child);return child;}
  setAttribute(key,value) {this[key]=value;}
  addEventListener(type,handler) {this.listeners[type]=handler;}
}
const all=(node)=>[node,...node.children.flatMap(all)];
const text=(node)=>all(node).map(n=>n.textContent).join(' ');

function context(overrides={}) {
  const panel=new Node(),status=new Node(),area=new Node(),buttons=[new Node('button','','开始'),new Node('button','','继续')];
  const checklist=new Node(),date=new Node();
  const nodes={learningPlan:panel,learningPlanStatus:status,quizArea:area,checklist,planDate:date};
  const ctx=vm.createContext({learningPlanLoading:false,quizLoading:false,quizSubmitting:false,quizHintLoading:false,
    quizPhase:'empty',quizTask:null, $:id=>nodes[id],$$:()=>buttons,
    el:(tag,cls,value)=>new Node(tag,cls,value),icon:()=>new Node('svg'),toast:()=>{},
    refreshOverview:async()=>{},showView:()=>{},...overrides});
  vm.runInContext(code,ctx);
  return {ctx,panel,status,area,buttons,checklist,date};
}

test('plan task opens the exact concept and mode without implicit restore; all task controls stay disabled while loading',async()=>{
  let resolve;
  const pending=new Promise(r=>resolve=r),calls=[],views=[];
  const setup=context({showView:(view,options)=>views.push([view,options.restoreTask]),
    loadTask:async(cid,kind)=>{calls.push([cid,kind]);await pending;setup.ctx.quizPhase='task';setup.ctx.quizTask={concept:cid};}});
  const sidebarButton=new Node('button','','侧栏继续');setup.ctx.button=sidebarButton;
  setup.ctx.item={concept:'light',name:'瞳孔反射',action:'review',kind:'transfer'};
  const first=vm.runInContext('startLearningPlanTask(item,button)',setup.ctx);
  assert.equal(setup.ctx.learningPlanLoading,true);
  assert.equal(sidebarButton.disabled,true);
  assert.ok(setup.buttons.every(b=>b.disabled));
  await vm.runInContext('startLearningPlanTask(item,button)',setup.ctx);
  assert.equal(calls.length,1);
  resolve();await first;
  assert.deepEqual(calls,[['light','transfer']]);
  assert.deepEqual(views,[['quiz',false]]);
  assert.equal(setup.ctx.learningPlanLoading,false);
  assert.equal(sidebarButton.disabled,false);
  assert.ok(setup.buttons.every(b=>!b.disabled));
});

test('failed plan task offers a usable retry and a resume task always requests auto mode',async()=>{
  let attempts=0;
  const modes=[];
  const setup=context({loadTask:async(cid,kind)=>{
    modes.push(kind);
    if(++attempts===1)throw Error('temporary failure');
    setup.ctx.quizPhase='task';setup.ctx.quizTask={concept:cid};
  }});
  setup.ctx.button=setup.buttons[0];setup.ctx.item={concept:'light',action:'resume',kind:'transfer'};
  await vm.runInContext('startLearningPlanTask(item,button)',setup.ctx);
  assert.match(text(setup.area),/temporary failure/);
  const retry=all(setup.area).find(node=>node.textContent==='重试本次学习任务');
  assert.ok(retry?.listeners.click);
  await retry.listeners.click();
  assert.equal(attempts,2);assert.deepEqual(modes,['auto','auto']);
  assert.equal(setup.ctx.quizPhase,'task');
});

test('missing plan does not invent counts or tasks and provides a course fallback',()=>{
  const views=[];const setup=context({showView:name=>views.push(name)});
  vm.runInContext('renderLearningPlan(null)',setup.ctx);
  assert.match(text(setup.panel),/暂未读取到学习计划/);
  assert.ok(!all(setup.panel).some(node=>node.className.includes('learning-plan-metrics')));
  const open=all(setup.panel).find(node=>node.textContent==='选择知识点');
  open.listeners.click();assert.deepEqual(views,['learn']);
});

test('real recommendations show their reasons and source weakness without calling recent score mastery',()=>{
  const setup=context();
  setup.ctx.plan={scope:'脑神经示例章节 · 10个知识点',method:'工程规则',counts:{due:1,weak:1,new:8,practiced_today:1},
    items:[{concept:'light',name:'瞳孔反射',action:'review',kind:'diagnostic',reason:'最近一次作答未达标',last_score:33,weak_points:['传入通路']}]};
  vm.runInContext('renderLearningPlan(plan)',setup.ctx);
  const rendered=text(setup.panel);
  assert.match(rendered,/最近一次作答未达标/);assert.match(rendered,/传入通路/);assert.match(rendered,/最近作答 33 分/);
  assert.ok(!rendered.includes('掌握率'));
  const start=all(setup.panel).find(node=>node.className.includes('learning-plan-task'));
  assert.equal(typeof start.listeners.click,'function');
});

test('hint processing blocks plan clicks until the current task is safe to switch',async()=>{
  let calls=0;const setup=context({quizHintLoading:true,loadTask:async()=>{calls++;}});
  setup.ctx.item={concept:'light',action:'learn',kind:'diagnostic'};setup.ctx.button=setup.buttons[0];
  await vm.runInContext('startLearningPlanTask(item,button)',setup.ctx);
  assert.equal(calls,0);assert.equal(setup.ctx.learningPlanLoading,false);
});

test('sidebar uses real plan tasks and Shanghai day instead of compulsory source or PubMed chores',async()=>{
  const opened=[];const setup=context();
  setup.ctx.startLearningPlanTask=(item,button)=>opened.push([item.concept,item.kind,button]);
  setup.ctx.data={day_date:'2026-10-29',questions:{day_cited:0},literature:{day:0},learning_plan:{items:[
    {concept:'light',name:'瞳孔反射',action:'resume',kind:'auto'},
    {concept:'oculomotor',name:'动眼神经',action:'review',kind:'transfer',reason:'诊断达标待迁移'},
    {concept:'face',name:'面神经',action:'learn',kind:'diagnostic'},
    {concept:'gag',name:'咽反射',action:'learn',kind:'diagnostic'}]}};
  vm.runInContext('renderChecklist(data)',setup.ctx);
  const tasks=all(setup.checklist).filter(node=>node.className.includes('learning-plan-task'));
  assert.equal(tasks.length,3);
  await tasks[1].listeners.click();
  assert.deepEqual(opened[0].slice(0,2),['oculomotor','transfer']);
  assert.equal(opened[0][2],tasks[1]);
  assert.match(text(setup.checklist),/继续：瞳孔反射/);
  assert.ok(!text(setup.checklist).includes('PubMed'));
  assert.ok(!text(setup.checklist).includes('有书页引用'));
  assert.match(setup.date.textContent,/10(?:月|\/)29/);
  assert.match(setup.date.textContent,/周四|星期四/);
});

test('sidebar with no due tasks offers the next due time and course navigation',()=>{
  const views=[];const setup=context({showView:name=>views.push(name)});
  setup.ctx.data={day_date:'2026-10-29',learning_plan:{items:[],next_due_at:Date.parse('2026-10-30T08:00:00+08:00')/1000}};
  vm.runInContext('renderChecklist(data)',setup.ctx);
  assert.match(text(setup.checklist),/下次建议复习/);
  assert.ok(!text(setup.checklist).includes('有书页引用'));
  const open=all(setup.checklist).find(node=>node.textContent==='查看课程与学习路径');
  open.listeners.click();assert.deepEqual(views,['learn']);
});

test('a loaded task remains answerable if the subsequent plan refresh fails',async()=>{
  const setup=context({loadTask:async(cid)=>{
    setup.ctx.quizTask={concept:cid};setup.ctx.quizPhase='task';
    setup.area.appendChild(new Node('button','','已载入的作答选项'));
  },refreshOverview:async()=>{throw Error('overview offline');}});
  setup.ctx.button=setup.buttons[0];setup.ctx.item={concept:'light',action:'learn',kind:'diagnostic'};
  await vm.runInContext('startLearningPlanTask(item,button)',setup.ctx);
  assert.equal(setup.ctx.quizPhase,'task');
  assert.match(text(setup.area),/已载入的作答选项/);
  assert.ok(!text(setup.area).includes('重试本次学习任务'));
  assert.match(setup.status.textContent,/题目已载入，可继续作答/);
  assert.match(setup.status.textContent,/overview offline/);
});
