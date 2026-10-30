import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const segment=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b));
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};};
function setup(overrides={}) {
  const nodes={};const node=()=>({textContent:'',children:[],appendChild(n){this.children.push(n);},addEventListener(t,fn){this[t]=fn;},scrollIntoView(){}});
  const ctx=vm.createContext({reportRequestId:0,quizLoading:false,quizSubmitting:false,quizHintLoading:false,quizPhase:'empty',quizTask:null,quizConcept:null,overviewData:null,
    $:id=>nodes[id]??=node(),el:()=>node(),mountLearningReport:()=>{},renderQuiz:()=>{},renderTaskCard:()=>{},renderQuizResult:()=>{},toast:()=>{},...overrides});
  vm.runInContext(segment('async function loadLearningReport()', '/* ---------- 本机 PDF'),ctx);
  vm.runInContext(segment('async function resumeActiveTask()', 'function renderQuiz('),ctx);
  return {ctx,nodes};
}

test('an older report response or error cannot replace a report loaded after a new answer',async()=>{
  for (const failure of [false,true]) {
    const calls=[],pending=[];const s=setup({api:()=>{const d=deferred();pending.push(d);return d.promise;},mountLearningReport:(_,data)=>calls.push(data.id)});
    const first=vm.runInContext('loadLearningReport()',s.ctx),second=vm.runInContext('loadLearningReport()',s.ctx);
    pending[1].resolve({id:'latest'});await second;
    if(failure)pending[0].reject(Error('old failure'));else pending[0].resolve({id:'old'});await first;
    assert.deepEqual(calls,['latest']);assert.ok(!s.nodes.learningReportBody.textContent.includes('old failure'));
  }
});

test('report actions use the exact concept and original task kind, respect pending tasks and reject non-current study',async()=>{
  const calls=[];let actions;const s=setup({api:async()=>({}),mountLearningReport:(_,__,options)=>actions=options,
    showView:(v,opt)=>calls.push([v,opt.restoreTask]),loadTask:async(...args)=>calls.push(args),showStudyForResult:async r=>calls.push(['study',r.concept])});
  await vm.runInContext('loadLearningReport()',s.ctx);
  await actions.onRetest({concept:'light',kind:'transfer'});assert.deepEqual(calls,[['quiz',false],['light','transfer']]);
  await actions.onReview({concept:'light',can_study_current:false});assert.equal(calls.length,2);
  await actions.onReview({concept:'light',can_study_current:true});assert.deepEqual(calls.slice(2),[['quiz',false],['study','light']]);
  s.ctx.quizHintLoading=true;await actions.onRetest({concept:'other',kind:'diagnostic'});assert.equal(calls.length,4);
});

test('failed report and bootstrap requests expose retries without leaving the interface locked',async()=>{
  let fail=true;const s=setup({api:async()=>{if(fail)throw Error('offline');return {};}});
  await vm.runInContext('loadLearningReport();resumeActiveTask()',s.ctx);
  // loadLearningReport starts separately, so flush its rejected promise as well.
  await Promise.resolve();assert.match(s.nodes.learningReportBody.textContent,/offline/);
  assert.equal(s.ctx.quizLoading,false);assert.match(s.nodes.quizArea.textContent,/offline/);
  fail=false;await s.nodes.learningReportBody.children[0].click();await s.nodes.quizArea.children[0].click();
  assert.equal(s.ctx.quizLoading,false);
});

test('refresh restores the last submitted feedback and tutor token without sending an answer again',async()=>{
  const calls=[],rendered=[];const result={concept:'light',kind:'transfer',score:33,tutor_token:'saved-token'};
  const s=setup({api:async path=>{calls.push(path);return {active:null,last_result:result};},renderQuizResult:r=>rendered.push(r)});
  await vm.runInContext('resumeActiveTask()',s.ctx);
  assert.deepEqual(calls,['/api/bootstrap']);assert.equal(rendered[0],result);
  assert.equal(s.ctx.quizPhase,'result');assert.equal(s.ctx.quizConcept,'light');assert.equal(s.ctx.quizTask,null);
  assert.equal(s.nodes.quizKind.textContent,'上次迁移题结果');
});

test('an unfinished task takes precedence over older submitted feedback on refresh',async()=>{
  const tasks=[],results=[];const active={concept:'light',token:'active-token'};
  const s=setup({api:async()=>({active,last_result:{concept:'old'}}),renderTaskCard:r=>tasks.push(r),renderQuizResult:r=>results.push(r)});
  await vm.runInContext('resumeActiveTask()',s.ctx);
  assert.deepEqual(tasks,[active]);assert.deepEqual(results,[]);assert.equal(s.ctx.quizPhase,'task');
});
