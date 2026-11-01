import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const reading=readFileSync(new URL('../web/paper-reading.js',import.meta.url),'utf8');
const segment=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end));
class Node {
  constructor(tag='div',cls='',text=''){this.tag=tag;this.className=cls||'';this.textContent=text??'';this.listeners={};this.attrs={};this.hidden=false;this.value='';}
  set textContent(value){this._text=value;this.children=[];}get textContent(){return this._text;}
  set innerHTML(value){assert.equal(value,'');this.children=[];}
  append(...children){children.forEach(child=>this.appendChild(child));}appendChild(child){this.children.push(child);return child;}
  addEventListener(type,fn){this.listeners[type]=fn;}setAttribute(key,value){this.attrs[key]=value;}
  scrollIntoView(){}
}
const all=n=>[n,...n.children.flatMap(all)],text=n=>all(n).map(x=>x.textContent).join(' ');
const button=(root,label)=>all(root).find(n=>n.tag==='button'&&n.textContent===label);
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {resolve,reject,promise};};
const response=()=>({paper:{pmid:'123',title:'Synthetic paper',journal:'Fixture journal',year:'2026'},question:'original question',
  notice:'原文节选，不自动翻译或评价质量',limitations:'局限未识别不代表不存在',relationship:'需核对是否相关',sections:[
    {id:'methods',title:'研究方法',excerpts:[{label:'PATIENTS AND METHODS',category:'METHODS',text:'Verbatim fixture methods.',truncated:true}]},
    {id:'results',title:'研究结果',excerpts:[{label:'RESULTS',category:'RESULTS',text:'Verbatim fixture result.'}]},
    {id:'limitations',title:'研究局限',excerpts:[],missing_notice:'未识别明确局限标签，请核对。'}]});
function setup(api=async()=>response(),context={concept:null,question:'microglia synaptic pruning'}){
  const nodes={},calls=[];const ctx=vm.createContext({researchContext:context,wanderOriginConcept:context?.concept,
    readingRequestId:0,pmRequestId:0,$:id=>nodes[id]??=new Node(),el:(...args)=>new Node(...args),
    api:async(...args)=>{calls.push(args);return api(...args);},rememberResearchWorkspace(){}});
  vm.runInContext(reading,ctx);vm.runInContext(segment('async function loadPaperReading(', '/* ---------- 数据加载 ---------- */'),ctx);
  return {ctx,nodes,calls,load:paper=>ctx.loadPaperReading(paper)};
}

test('independent results offer reading and send the original question without an unrelated course concept',async()=>{
  const s=setup();vm.runInContext(segment('function paperCard(', 'function renderPapers('),s.ctx);
  const card=s.ctx.paperCard({pmid:'123',title:'Synthetic'});assert.ok(button(card,'阅读摘要与证据 →'));
  await button(card,'阅读摘要与证据 →').listeners.click();
  assert.equal(s.calls[0][0],'/api/read-paper');assert.equal(s.calls[0][1].concept,null);
  assert.equal(s.calls[0][1].question,'microglia synaptic pruning');
  assert.ok(!s.nodes.researchReturn);assert.match(text(s.nodes.paperReadingBody),/Verbatim fixture methods/);
});

test('reading shows source labels, exact excerpts, truncation notices, missing sections and canonical PubMed link',()=>{
  const s=setup(),root=new Node(),data=response();data.sections[0].omitted_count=2;data.excerpt_limits={truncated:true};s.ctx.mountPaperReading(root,data);
  const rendered=text(root);assert.match(rendered,/PATIENTS AND METHODS · NLM METHODS/);
  assert.match(rendered,/Verbatim fixture methods/);assert.match(rendered,/开头节选/);assert.match(rendered,/局限未识别不代表不存在/);
  const missing=all(root).find(n=>n.className==='reading-missing');assert.ok(!missing.open);
  assert.match(text(missing),/未识别明确局限标签/);
  assert.equal(all(root).find(n=>n.tag==='a').href,'https://pubmed.ncbi.nlm.nih.gov/123/');
  assert.match(rendered,/另有 2 段未展示/);assert.match(rendered,/未展示不等于原文没有报告/);
});

test('unstructured and missing abstracts never masquerade as inferred results',()=>{
  const s=setup(),root=new Node(),data=response();data.sections=[{id:'unclassified',title:'未分栏摘要',excerpts:[{text:'Unstructured fixture.',label:'',category:'UNASSIGNED'}]}];
  s.ctx.mountPaperReading(root,data);assert.match(text(root),/未分栏摘要/);assert.ok(!text(root).includes('研究结果'));
  data.sections=[];s.ctx.mountPaperReading(root,data);assert.match(text(root),/未取得可展示的摘要/);
});

test('source text and optional AI guide are rendered literally and script source links are not accepted',()=>{
  const s=setup(),root=new Node(),data=response();data.paper.pmid='javascript:alert(1)';data.paper.url='javascript:alert(1)';
  data.sections[0].excerpts[0].text='<img src=x onerror=alert(1)>';
  data.ai_guide={question:'<script>fixture</script>',evidence:'模型解释，待核对'};
  s.ctx.mountPaperReading(root,data);assert.equal(all(root).filter(n=>n.tag==='a').length,0);
  assert.match(text(root),/<img src=x onerror=alert\(1\)>/);assert.match(text(root),/<script>fixture<\/script>/);
  assert.match(text(root),/AI 辅助摘要解读（需对照原摘要核验）/);
});

test('reading failure can retry the same paper and question while detached retry cannot revive an old context',async()=>{
  let failed=true;const s=setup(async()=>{if(failed)throw Error('offline');return response();});
  await s.load({pmid:'123'});const retry=button(s.nodes.paperReadingBody,'重试读取这篇摘要');assert.ok(retry);
  failed=false;await retry.listeners.click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(s.calls.length,2);assert.match(text(s.nodes.paperReadingBody),/Synthetic paper/);
  s.ctx.researchContext={concept:'light',question:'other question'};await retry.listeners.click();assert.equal(s.calls.length,2);
});

test('editing a query hides stale papers and invalidates in-flight reading and search without auto querying',async()=>{
  const pending=deferred(),s=setup(()=>pending.promise);
  vm.runInContext(segment('$("pmForm").addEventListener', '$$(".pm-chip")'),s.ctx);
  const readingCall=s.load({pmid:'123'});const before=s.ctx.pmRequestId;
  s.nodes.pmQuery.listeners.input();assert.equal(s.ctx.pmRequestId,before+1);assert.equal(s.nodes.paperReading.hidden,true);
  pending.resolve(response());await readingCall;assert.ok(!text(s.nodes.paperReadingBody).includes('Synthetic paper'));
  assert.equal(s.calls.length,1);assert.match(s.nodes.pmStatus.textContent,/检索式已修改/);
});
