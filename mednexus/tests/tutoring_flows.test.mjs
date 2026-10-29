import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const hintCode=source.slice(source.indexOf('async function requestTaskHint('),source.indexOf('async function submitAnswer('));

test('a pending hint blocks duplicate requests and stale results cannot change another task',async()=>{
  let resolve;
  const pending=new Promise(r=>resolve=r), calls=[], rendered=[];
  const button={dataset:{level:0},disabled:false,textContent:'提示'};
  const context=vm.createContext({quizLoading:false,quizSubmitting:false,quizHintLoading:false,quizTask:{token:'a'},quizPhase:'task',
    api:(_,body)=>{calls.push(body);return pending;},el:(_,__,text)=>text,toast:()=>{}});
  context.task={token:'a'};context.button=button;context.box={appendChild:text=>rendered.push(text)};
  vm.runInContext(hintCode,context);
  const first=vm.runInContext('requestTaskHint(task,0,button,box)',context);
  await vm.runInContext('requestTaskHint(task,0,button,box)',context);
  assert.equal(calls.length,1);
  context.quizTask={token:'b'};
  resolve({level:1,text:'old hint'});await first;
  assert.deepEqual(rendered,[]);assert.equal(context.quizHintLoading,false);
});

test('failed hints release the UI so the learner can retry or answer',async()=>{
  const notices=[],button={dataset:{level:0},disabled:false,textContent:'提示'};
  const context=vm.createContext({quizLoading:false,quizSubmitting:false,quizHintLoading:false,quizTask:{token:'a'},quizPhase:'task',
    api:async()=>{throw Error('offline');},toast:text=>notices.push(text)});
  context.task={token:'a'};context.button=button;context.box={appendChild:()=>{}};
  vm.runInContext(hintCode,context);
  await vm.runInContext('requestTaskHint(task,0,button,box)',context);
  assert.equal(button.disabled,false);assert.equal(button.textContent,'提示');
  assert.equal(context.quizHintLoading,false);assert.match(notices[0],/offline/);
});
