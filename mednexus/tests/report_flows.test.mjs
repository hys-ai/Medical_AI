import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../web/learning-report.js', import.meta.url), 'utf8');
class Node {
  constructor(tag='div', className='', text='') {
    this.tag=tag; this.className=className||''; this.children=[]; this.listeners={}; this.textContent=text??'';
    this.value=''; this.disabled=false; this.hidden=false;
    this.classList={add: name=>{this.className=(this.className+' '+name).trim();}};
  }
  set textContent(value) {this._text=value;this.children=[];}
  get textContent() {return this._text;}
  set innerHTML(value) {throw Error('Report content must use text nodes');}
  append(...children) {children.forEach(child=>this.appendChild(child));}
  appendChild(child) {this.children.push(child);child.parent=this;return child;}
  setAttribute(name,value) {this[name]=value;}
  addEventListener(type,handler) {this.listeners[type]=handler;}
}
const all=node=>[node,...node.children.flatMap(all)];
const text=node=>all(node).map(item=>item.textContent).join(' ');
const buttons=(node,label)=>all(node).filter(item=>item.tag==='button'&&item.textContent===label);
const section=(container,name)=>all(container).find(item=>item.tag==='section'&&item.children.some(child=>child.tag==='h4'&&child.textContent===name));
const cards=node=>all(node).filter(item=>item.className==='report-record');
const timestamp=Date.UTC(2026,9,30,0,0)/1000;
function row(id=1,overrides={}) {
  return {attempt_id:id,concept:'light',name:'瞳孔对光反射通路',question_id:'light-d',kind:'diagnostic',
    prompt:'测试原题：请说明通路。',score:33,assisted:false,created:timestamp,
    points:[{index:0,label:'测试通路',selected:'测试选择',correct:false,reason:'测试原因',expected:'测试正确要点',category:'机制理解',status:'needs_review'}],
    is_latest_concept:true,can_study_current:true,...overrides};
}
function report(recent=[],reviews=[]) {
  return {stats:{assessed:recent.length?1:0,total:10,mastered:0},errors:recent.length?{'机制理解':2}:{},
    concepts:recent.length?[{name:'瞳孔对光反射通路',level:'掌握',status:'需巩固',attempts:recent.length,pre:33,post:67,last_assisted:true}]:[],
    evidence_report:{recent_attempts:recent,review_items:reviews,
      counts:{attempts:recent.length,independent_attempts:recent.filter(row=>!row.assisted).length,assisted_attempts:recent.filter(row=>row.assisted).length,
        review_questions:reviews.length,missing_points:reviews.reduce((n,row)=>n+row.points.filter(point=>point.status==='needs_review').length,0),
        independent_recheck_points:reviews.reduce((n,row)=>n+row.points.filter(point=>point.status==='independent_recheck').length,0)},
      limits:{recent:30,review:20,recent_total:recent.length,review_total:reviews.length,recent_truncated:false,review_truncated:false},notice:'测试报告边界说明'}};
}
function setup() {
  const container=new Node();
  const ctx=vm.createContext({el:(tag,cls,value)=>new Node(tag,cls,value)});
  vm.runInContext(source,ctx);ctx.container=container;
  return {ctx,container,mount:(data,options={})=>{ctx.data=data;ctx.options=options;return vm.runInContext('mountLearningReport(container,data,options)',ctx);}};
}

test('empty report shows actual zero assessment and no fake scores or task controls',()=>{
  const app=setup();app.mount(report(),{onReview:()=>{},onRetest:()=>{}});
  const rendered=text(app.container);
  assert.match(rendered,/已测评 0 \/ 10/);assert.match(rendered,/尚无作答记录/);assert.match(rendered,/尚无待复核错点/);
  assert.match(rendered,/这不代表所有知识点已经掌握/);assert.match(rendered,/不能作为真实学习效果/);
  assert.equal(cards(app.container).length,0);assert.equal(buttons(app.container,'复测这类题').length,0);
  assert.ok(!rendered.includes('首次 0 分'));
});

test('recent records keep real score, assistance and Beijing time with original feedback collapsed',()=>{
  const recent=row(1,{assisted:true});const app=setup();app.mount(report([recent],[]));
  const recentSection=section(app.container,'最近作答');const rendered=text(recentSection);
  assert.match(rendered,/33 分 · 辅助练习/);assert.match(rendered,/08:00/);assert.match(rendered,/2026/);
  assert.match(rendered,/测试原题/);assert.match(rendered,/当次选择：测试选择/);assert.match(rendered,/核对要点：测试正确要点/);
  const details=all(recentSection).find(node=>node.tag==='details');assert.ok(details);assert.ok(!details.open);
  assert.match(text(app.container),/首次 33 分 → 最近 67 分（辅助练习）/);
});

test('assisted corrections remain explicitly pending independent verification and cannot open unrelated current remediation',()=>{
  const assisted=row(2,{assisted:true,score:100,can_study_current:false,points:[{label:'旧错点',selected:'已选正确',correct:true,
    expected:'正确要点',status:'independent_recheck'}]});
  const app=setup();app.mount(report([assisted],[assisted]),{onReview:()=>{},onRetest:()=>{}});
  const reviewSection=section(app.container,'待复核错点');assert.match(text(reviewSection),/辅助答对，待独立复核/);
  assert.equal(buttons(reviewSection,'复习当前错点').length,0);assert.equal(buttons(reviewSection,'复测这类题').length,1);
});

test('review filtering and show-more use only loaded records and reset the page size for the chosen concept',()=>{
  const reviews=Array.from({length:8},(_,i)=>row(i+1,{concept:i===7?'face':'light',name:i===7?'面神经':'瞳孔反射'}));
  const app=setup();const data=report(reviews,reviews);data.evidence_report.limits={...data.evidence_report.limits,review_total:25,review_truncated:true};
  app.mount(data);const reviewSection=section(app.container,'待复核错点');
  assert.equal(cards(reviewSection).length,5);assert.match(text(reviewSection),/最近 8 \/ 25/);
  const more=buttons(reviewSection,'再显示 5 道待复核题')[0];more.listeners.click();assert.equal(cards(reviewSection).length,8);assert.equal(more.hidden,true);
  const select=all(reviewSection).find(node=>node.tag==='select');select.value='face';select.listeners.change();
  assert.equal(cards(reviewSection).length,1);assert.match(text(reviewSection),/面神经/);assert.ok(!text(cards(reviewSection)[0]).includes('瞳孔反射'));
  select.value='light';select.listeners.change();assert.equal(cards(reviewSection).length,5);assert.equal(more.hidden,false);
  app.mount(data);const refreshedSelect=all(section(app.container,'待复核错点')).find(node=>node.tag==='select');assert.equal(refreshedSelect.value,'light');
});

test('recent history paginates independently from pending-review filters and states a bounded response',()=>{
  const recent=Array.from({length:8},(_,i)=>row(i+1));const app=setup();const data=report(recent,[recent[0]]);
  data.evidence_report.limits={...data.evidence_report.limits,recent_total:100,recent_truncated:true};app.mount(data);
  const recentSection=section(app.container,'最近作答');assert.equal(cards(recentSection).length,5);assert.match(text(recentSection),/最近 8 \/ 100/);
  buttons(recentSection,'再显示 5 次作答')[0].listeners.click();assert.equal(cards(recentSection).length,8);
  assert.equal(cards(section(app.container,'待复核错点')).length,1);
});

test('actions return the exact server row and only the currently matching attempt can open remediation',async()=>{
  const first=row(),old=row(2,{concept:'face',name:'面神经',kind:'transfer',can_study_current:false});
  const app=setup();const calls=[];app.mount(report([],[first,old]),{onReview:async row=>calls.push(['review',row]),onRetest:async row=>calls.push(['retest',row])});
  const reviewSection=section(app.container,'待复核错点');const list=cards(reviewSection);
  assert.equal(buttons(reviewSection,'复习当前错点').length,1);
  await buttons(list[0],'复习当前错点')[0].listeners.click();await buttons(list[1],'复测这类题')[0].listeners.click();
  assert.equal(calls[0][1],first);assert.equal(calls[1][1],old);assert.equal(calls[1][1].kind,'transfer');
});

test('pending task navigation blocks all report actions and failed navigation remains retryable',async()=>{
  let release,attempts=0;const pending=new Promise(resolve=>release=resolve);const app=setup();
  app.mount(report([],[row(),row(2)]),{onRetest:async()=>{attempts++;if(attempts===1){await pending;throw Error('offline');}}});
  const list=buttons(app.container,'复测这类题');const first=list[0].listeners.click();assert.ok(list.every(button=>button.disabled));
  await list[1].listeners.click();assert.equal(attempts,1);release();await first;
  assert.match(text(app.container),/未能打开学习任务，请稍后重试/);assert.ok(list.every(button=>!button.disabled));
  await list[0].listeners.click();assert.equal(attempts,2);assert.ok(!text(app.container).includes('未能打开学习任务'));
});

test('stale report controls cannot navigate after a newer report has been mounted',async()=>{
  const app=setup();let calls=0;app.mount(report([],[row()]),{onRetest:async()=>{calls++;}});
  const old=buttons(app.container,'复测这类题')[0];app.mount(report());await old.listeners.click();assert.equal(calls,0);
});

test('unknown question kinds have no task actions and report fields are rendered as literal text without exposing extras',()=>{
  const suspicious=row(1,{name:'<img src=x onerror=alert(1)>',prompt:'<script>bad()</script>',kind:'arbitrary',
    token:'PRIVATE_TOKEN',dialogue:'PRIVATE_DISCUSSION',result:{tutor_token:'PRIVATE_TUTOR_TOKEN'}});
  const app=setup();app.mount(report([suspicious],[suspicious]),{onReview:()=>{},onRetest:()=>{}});
  const rendered=text(app.container);assert.match(rendered,/<script>bad\(\)<\/script>/);assert.match(rendered,/<img src=x/);
  assert.ok(!rendered.includes('PRIVATE_TOKEN'));assert.ok(!rendered.includes('PRIVATE_DISCUSSION'));assert.ok(!rendered.includes('PRIVATE_TUTOR_TOKEN'));
  assert.equal(buttons(app.container,'复测这类题').length,0);assert.equal(buttons(app.container,'复习当前错点').length,0);
  assert.equal(all(app.container).filter(node=>['script','img','iframe'].includes(node.tag)).length,0);
});
