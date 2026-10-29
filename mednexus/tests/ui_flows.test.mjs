import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const segment=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end));
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}

test('older PubMed response cannot replace a newer question',async()=>{
  const pending=[],rendered=[],nodes={};
  const context=vm.createContext({pmRequestId:0,readingRequestId:0,wanderOriginConcept:null,researchContext:null,
    $:id=>nodes[id]??=( {textContent:'',innerHTML:'',hidden:false}),toast:()=>{},
    api:()=>{const d=deferred();pending.push(d);return d.promise;},
    renderPapers:(_,papers)=>rendered.push(papers[0].title)});
  vm.runInContext(segment('function resetResearchContext()', 'async function loadPaperReading'),context);
  const first=vm.runInContext("pmSearch('first')",context);
  const second=vm.runInContext("pmSearch('second')",context);
  pending[1].resolve({papers:[{title:'second'}]});await second;
  pending[0].resolve({papers:[{title:'first'}]});await first;
  assert.deepEqual(rendered,['second']);
  assert.equal(vm.runInContext('researchContext.question',context),'second');
  vm.runInContext('resetResearchContext()',context);
  assert.equal(context.wanderOriginConcept,null);
});

test('switching concepts during task creation cannot send a second mutation',async()=>{
  const d=deferred(),calls=[],rendered=[];
  const context=vm.createContext({quizLoading:false,quizSubmitting:false,quizHintLoading:false,quizPhase:'empty',quizConcept:null,quizTask:null,overviewData:null,
    $:()=>({textContent:''}),toast:()=>{},renderQuiz:()=>{},
    api:(_,body)=>{calls.push(body.concept);return d.promise;},renderTaskCard:t=>rendered.push(t.concept)});
  vm.runInContext(segment('async function loadTask(', 'function renderTaskCard('),context);
  const first=vm.runInContext("loadTask('light')",context);
  await vm.runInContext("loadTask('oculomotor')",context);
  d.resolve({concept:'light'});await first;
  assert.deepEqual(calls,['light']);assert.deepEqual(rendered,['light']);
  assert.equal(context.quizLoading,false);
});
