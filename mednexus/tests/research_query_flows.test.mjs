import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const code=readFileSync(new URL('../web/research-query.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const slice=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b));
class Node {
  constructor(tag='div',cls='',value=''){this.tag=tag;this.className=cls||'';this.textContent=value??'';this.value='';this.listeners={};this.hidden=false;}
  set textContent(v){this._text=v;this.children=[];}get textContent(){return this._text;}
  set innerHTML(v){assert.equal(v,'');this.children=[];}
  append(...children){children.forEach(child=>this.appendChild(child));}appendChild(child){this.children.push(child);return child;}
  addEventListener(type,fn){this.listeners[type]=fn;}setAttribute(key,value){this[key]=value;}focus(){}
}
const all=n=>[n,...n.children.flatMap(all)],text=n=>all(n).map(x=>x.textContent).join(' ');
const button=(n,label)=>all(n).find(x=>x.tag==='button'&&x.textContent===label);
const proposal=()=>({query:'oculomotor AND recovery[Title/Abstract]',original_query:'oculomotor AND pupil[Title/Abstract]',
  mode:'focused',mapping:'规则建议，需核对',matches:[{term:'恢复',label:'恢复',query:'recovery[Title/Abstract]'}],
  fallback_reason:'',notice:'不是逐句翻译，比较条件需编辑'});
function setup(api=async()=>({})){
  const nodes={},calls=[];const ctx=vm.createContext({el:(...args)=>new Node(...args),$:id=>nodes[id]??=new Node(),
    api:async(...args)=>{calls.push(args);return api(...args);},pmRequestId:0,readingRequestId:0,
    researchContext:null,wanderOriginConcept:null,overviewData:null,toast(){},renderPapers(){}});
  vm.runInContext(code,ctx);vm.runInContext(slice('function resetResearchContext()', 'async function loadPaperReading'),ctx);
  vm.runInContext(slice('$("pmForm").addEventListener', '$$(".pm-chip")'),ctx);
  return {ctx,nodes,calls};
}

test('proposal shows literal word mapping, original template and a collapsed comparison without a search',()=>{
  const s=setup(),root=new Node();let selected;
  s.ctx.mountResearchQueryPlan(root,proposal(),query=>selected=query);
  assert.match(text(root),/“恢复” → 恢复：recovery/);assert.match(text(root),/不是逐句翻译/);
  assert.ok(!all(root).find(n=>n.tag==='details').open);
  button(root,'恢复原知识点模板').listeners.click();assert.equal(selected,proposal().original_query);
  button(root,'使用焦点建议式').listeners.click();assert.equal(selected,proposal().query);assert.equal(s.calls.length,0);
});

test('fallback does not claim a focus was applied and edited status never overwrites the actual text',()=>{
  const s=setup(),root=new Node(),p=proposal();p.mode='template';p.query=p.original_query;p.fallback_reason='包含多个主题，未自动合并';
  s.ctx.mountResearchQueryPlan(root,p,()=>{});assert.match(text(root),/未自动合并/);assert.ok(!button(root,'使用焦点建议式'));
  s.ctx.updateResearchQueryPlan(root,'manual query');assert.match(text(root),/以文本框中的实际内容为准/);
});

test('detached suggestion buttons cannot alter a new question and supplied text is never interpreted as HTML',()=>{
  const s=setup(),root=new Node(),p=proposal();p.matches[0].term='<img src=x onerror=alert(1)>';let count=0;
  s.ctx.mountResearchQueryPlan(root,p,()=>count++);const old=button(root,'恢复原知识点模板');
  assert.match(text(root),/<img src=x onerror=alert\(1\)>/);
  s.ctx.clearResearchQueryPlan(root);old.listeners.click();assert.equal(count,0);assert.equal(root.children.length,0);
});

test('gate mounts the plan, applying either suggestion only edits the draft, and confirm sends its literal query',async()=>{
  const p=proposal(),s=setup(async(path,body)=>path==='/api/research'?{eligible:true,reason:'可探索',mapping:p.mapping,query:p.query,query_plan:p}:
    {note:body.query,papers:[],count:0});
  s.ctx.$('pmQ').value='动眼神经恢复是否有差异？';
  await s.ctx.pmSearch(s.nodes.pmQ.value,'oculomotor');assert.equal(s.calls.length,1);
  button(s.nodes.researchQueryPlan,'恢复原知识点模板').listeners.click();assert.equal(s.nodes.pmQuery.value,p.original_query);
  assert.equal(s.calls.length,1);assert.match(text(s.nodes.researchQueryPlan),/当前使用原知识点模板/);
  s.nodes.pmQuery.value='oculomotor AND outcome';s.nodes.pmQuery.listeners.input();
  assert.match(text(s.nodes.researchQueryPlan),/手动修改/);assert.equal(s.nodes.pmQuery.value,'oculomotor AND outcome');
  s.nodes.runResearchQuery.listeners.click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(s.calls[1][0],'/api/pubmed');assert.equal(s.calls[1][1].query,'oculomotor AND outcome');
  assert.equal(s.calls[1][1].question,'动眼神经恢复是否有差异？');
  assert.ok(!text(s.nodes.researchQueryPlan).includes('尚未向 PubMed 发送'));
});

test('editing the original question removes its mapping and prevents stale controls from restoring it',async()=>{
  const p=proposal(),s=setup(async()=>({eligible:true,reason:'可探索',query:p.query,query_plan:p}));
  s.ctx.$('pmQ').value='动眼神经恢复有差异？';await s.ctx.pmSearch(s.nodes.pmQ.value,'oculomotor');
  const old=button(s.nodes.researchQueryPlan,'恢复原知识点模板');s.nodes.pmQ.value='新的疑问';s.nodes.pmQ.listeners.input();
  old.listeners.click();assert.equal(s.nodes.researchQueryPlan.children.length,0);assert.equal(s.nodes.pmQuery.value,p.query);
  assert.equal(s.calls.length,1);assert.equal(s.nodes.researchQueryEditor.hidden,true);
});
