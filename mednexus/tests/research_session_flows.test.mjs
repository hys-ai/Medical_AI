import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source=readFileSync(new URL('../web/research-session.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const slice=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b));
const identity='a'.repeat(48);
function setup(overrides={}) {
  const values=new Map(),nodes={};
  const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const ctx=vm.createContext({sessionStorage:storage,learnerId:()=>identity,overviewData:{concepts:[{id:'light',name:'瞳孔反射'}]},
    wanderOriginConcept:null,researchContext:null,pmRequestId:0,readingRequestId:0,
    $:id=>nodes[id]??={value:'',textContent:'',innerHTML:'',hidden:true},...overrides});
  vm.runInContext(source,ctx);vm.runInContext(slice('function resetResearchContext()', 'function openResearch('),ctx);
  return {ctx,values,nodes,storage};
}

test('refresh restores the exact concept, question and edited template without calling an API',()=>{
  let network=0;const s=setup({api:()=>network++});
  s.ctx.draft={concept:'light',question:'瞳孔反射是否有差异？',query:'pupillary light reflex AND recovery',ready:true};
  vm.runInContext('saveResearchDraft(sessionStorage,learnerId(),draft,["light"]);restoreResearchWorkspace()',s.ctx);
  assert.equal(s.ctx.wanderOriginConcept,'light');assert.equal(s.nodes.pmQ.value,s.ctx.draft.question);
  assert.equal(s.nodes.pmQuery.value,s.ctx.draft.query);assert.equal(s.nodes.researchQueryEditor.hidden,false);
  assert.match(s.nodes.researchContextLabel.textContent,/瞳孔反射/);assert.equal(s.nodes.researchReturn.hidden,false);
  assert.equal(network,0);assert.match(s.nodes.pmStatus.textContent,/未自动重查/);
});

test('editing the question hides old confirmation and persists the new draft through a reload',()=>{
  const s=setup();s.ctx.wanderOriginConcept='light';
  s.ctx.$('pmQ').value='新疑问';s.ctx.$('pmQuery').value='old query';s.ctx.$('researchQueryEditor').hidden=true;
  vm.runInContext('rememberResearchWorkspace()',s.ctx);
  s.ctx.$('pmQ').value='';vm.runInContext('restoreResearchWorkspace()',s.ctx);
  assert.equal(s.nodes.pmQ.value,'新疑问');assert.equal(s.nodes.researchQueryEditor.hidden,true);
});

test('explicit reset clears the session and visible input, and another learner never sees the draft',()=>{
  const s=setup();s.ctx.draft={concept:'light',question:'待恢复疑问',query:'light',ready:true};
  vm.runInContext('saveResearchDraft(sessionStorage,learnerId(),draft,["light"])',s.ctx);
  assert.equal(vm.runInContext('readResearchDraft(sessionStorage,"'+'b'.repeat(48)+'",["light"])',s.ctx),null);
  vm.runInContext('restoreResearchWorkspace();resetResearchContext();restoreResearchWorkspace()',s.ctx);
  assert.equal(s.nodes.pmQ.value,'');assert.equal(s.nodes.pmQuery.value,'');
  assert.equal(s.ctx.wanderOriginConcept,null);assert.equal(s.values.size,0);
});

test('corrupt, outdated, unknown-concept and private drafts are ignored rather than restored or rendered',()=>{
  const s=setup();
  for (const value of ['not json',JSON.stringify({version:0}),JSON.stringify({version:1,concept:'unknown',question:'x',query:'y',ready:true}),
    JSON.stringify({version:1,concept:'light',question:'patient name: TEST',query:'light',ready:true})]) {
    s.storage.setItem('mednexus-research-draft-'+identity,value);
    assert.equal(vm.runInContext('readResearchDraft(sessionStorage,learnerId(),["light"])',s.ctx),null);
  }
  s.ctx.draft={concept:'light',question:'test@example.com',query:'light',ready:true};
  vm.runInContext('saveResearchDraft(sessionStorage,learnerId(),draft,["light"])',s.ctx);
  assert.equal(s.values.size,0);
});

test('blocked session storage does not break current-page search or restoration',()=>{
  const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};
  const s=setup({sessionStorage:blocked});
  assert.doesNotThrow(()=>vm.runInContext('rememberResearchWorkspace();restoreResearchWorkspace();resetResearchContext()',s.ctx));
});
