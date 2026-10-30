import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function renderQuiz(data)'),source.indexOf('function renderTaskCard('));
class Node {
  constructor(tag='div',className='',text='') {
    this.tag=tag;this.className=className||'';this.children=[];this.textContent=text;this.listeners={};this.dataset={};
    this.classes=new Set(this.className.split(' ').filter(Boolean));
    this.classList={toggle:(name,on)=>{if(on)this.classes.add(name);else this.classes.delete(name);}};
  }
  set innerHTML(value) {this.children=[];this.textContent=value;}
  append(...children) {this.children.push(...children);}
  appendChild(child) {this.children.push(child);return child;}
  addEventListener(type,handler) {this.listeners[type]=handler;}
}
function setup(flags={}) {
  const nodes={quizConcepts:new Node(),quizReport:new Node(),quizMetrics:new Node(),quizArea:new Node()};
  const calls=[],rendered=[],toasts=[];
  let release;
  const response=new Promise(resolve=>release=resolve);
  const data={stats:{},concepts:[{id:'oculomotor',name:'动眼神经'},{id:'light',name:'瞳孔反射'}]};
  const ctx=vm.createContext({quizConcept:'oculomotor',quizTask:{token:'old'},quizPhase:'task',
    quizLoading:false,quizSubmitting:false,quizHintLoading:false,overviewData:data,...flags,
    $:id=>nodes[id],$$:(_,root)=>root.children.filter(node=>node.tag==='button'),
    el:(...args)=>new Node(...args),toast:message=>toasts.push(message),
    api:(path,body)=>{calls.push([path,body]);return response;},
    renderTaskCard:task=>rendered.push(task.concept)});
  vm.runInContext(code,ctx);vm.runInContext('renderQuiz(overviewData)',ctx);
  return {ctx,nodes,calls,rendered,toasts,release};
}
const selected=s=>s.nodes.quizConcepts.children.filter(node=>node.classes.has('is-active')).map(node=>node.dataset.cid);
const target=s=>s.nodes.quizConcepts.children.find(node=>node.dataset.cid==='light');

for (const flag of ['quizLoading','quizSubmitting','quizHintLoading']) {
  test(`clicking another concept while ${flag} keeps selection with the unchanged task`,()=>{
    const s=setup({[flag]:true});
    target(s).listeners.click();
    assert.equal(s.calls.length,0);assert.equal(s.ctx.quizConcept,'oculomotor');
    assert.deepEqual(selected(s),['oculomotor']);assert.equal(s.ctx.quizTask.token,'old');
    assert.equal(s.toasts.length,1);
  });
}

test('after pending work finishes, a real switch loads the requested concept before changing selection',async()=>{
  const s=setup({quizHintLoading:true});
  target(s).listeners.click();assert.deepEqual(selected(s),['oculomotor']);
  s.ctx.quizHintLoading=false;target(s).listeners.click();
  assert.equal(s.calls.length,1);assert.equal(s.calls[0][1].concept,'light');assert.equal(s.calls[0][1].kind,'auto');
  assert.deepEqual(selected(s),['oculomotor']);
  s.release({concept:'light',token:'new'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(s.rendered,['light']);assert.deepEqual(selected(s),['light']);
  assert.equal(s.ctx.quizTask.token,'new');assert.equal(s.ctx.quizLoading,false);
});
