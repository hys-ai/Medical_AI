/* Public teaching demonstration. State stays in this browser, not a server DB.
   Answers are shipped to the browser: this is a learning tool, not a secure exam. */
const STORE_KEY = 'mednexus-public-demo-v1';
const fresh = () => ({concept:'oculomotor',active:null,last_result:null,attempts:[],events:[],sources:[],cache:{}});
const fail = message => { throw new Error(message); };
const clone = value => JSON.parse(JSON.stringify(value));
export class DemoAgent {
  constructor(catalog, storage, network = globalThis.fetch.bind(globalThis)) {
    this.catalog=catalog;this.storage=storage;this.network=network;
    this.concepts=catalog.concepts;this.map=new Map(this.concepts.map(c=>[c.id,c]));
    this.questions=new Map(this.concepts.flatMap(c=>c.questions.map(q=>[q.id,{c,q}])));
    try {this.state=JSON.parse(storage.getItem(STORE_KEY)||'null')||fresh();} catch {this.state=fresh();}
  }
  save(){this.storage.setItem(STORE_KEY,JSON.stringify(this.state));}
  event(kind,concept='',payload={}){this.state.events.push({kind,concept,payload:JSON.stringify(payload),created:Date.now()/1000});}
  progress(){return this.concepts.map(c=>{
    const rows=this.state.attempts.filter(a=>a.concept===c.id);let ema=null;const latest=new Map();
    for(const a of rows){ema=ema===null?a.rawScore:.4*ema+.6*a.rawScore;latest.set(a.question,a);}
    const passed=[...latest.values()].filter(a=>a.rawScore>=.8);
    const mastered=passed.length>=2&&passed.some(a=>a.kind==='transfer')&&rows.length>=2&&rows.slice(-2).every(a=>a.rawScore>=.8)&&ema>=.8;
    const status=mastered?'已掌握':rows.length?(rows.at(-1).rawScore>=.8?'初步达标':'需巩固'):'未测评';
    return {id:c.id,name:c.name,unit:c.unit,level:c.level,status,score:ema===null?null:Math.round(ema*100),attempts:rows.length,distinct:latest.size,viewed:this.state.events.some(ev=>ev.kind==='study'&&ev.concept===c.id),pre:rows.length?rows[0].score:null,post:rows.length>1?rows.at(-1).score:null,last_score:rows.length?rows.at(-1).rawScore:null};
  });}
  recommendation(items){return items.filter(i=>i.status==='需巩固').sort((a,b)=>a.score-b.score)[0]||items.find(i=>i.status==='初步达标')||items.find(i=>i.status==='未测评')||items[0];}
  builtinSources(){return this.concepts.map(c=>({id:'note-'+c.id,book:'MedNexus 自编学习卡',chapter:'脑神经 · '+c.name,page:null,text:c.note,keywords:c.terms,url:this.catalog.sources[c.source].url,locator:this.catalog.sources[c.source].section,reference:this.catalog.sources[c.source].title,kind:'note',provenance:'自编教学摘要，参考公开资料；不是原书逐字摘录',concept:c.id}));}
  sources(){return [...this.builtinSources(),...this.state.sources];}
  active(){const a=this.state.active;if(!a)return null;const {q}=this.questions.get(a.question);return {token:a.token,concept:a.concept,kind:q.kind,prompt:q.prompt,points:q.points.map((p,i)=>({label:p.label,options:a.options[i]}))};}
  snapshot(){const items=this.progress();return {course:this.catalog.course,concepts:items,recommendation:this.recommendation(items),active:this.active(),last_result:this.state.last_result,current:this.state.concept,stats:{mastered:items.filter(c=>c.status==='已掌握').length,weak:items.filter(c=>c.status==='需巩固').length,assessed:items.filter(c=>c.attempts).length,viewed:items.filter(c=>c.viewed).length,attempts:this.state.attempts.length,total:items.length},model:{configured:false,name:'在线演示 · 浏览器规则引擎',note:'在线演示不配置付费模型。学习记录和导入资料保存在本浏览器；PubMed 检索直接访问 NCBI。'},sources:this.sources().map(({text,...s})=>s)};}
  task(cid,kind='auto'){
    const c=this.map.get(cid)||fail('未知知识点');
    if(this.state.active?.concept===cid&&kind==='auto')return this.active();
    if(!['auto','diagnostic','transfer'].includes(kind))fail('未知测试模式');
    const rows=this.state.attempts.filter(a=>a.concept===cid);
    if(kind==='auto')kind=rows.length&&(rows.at(-1).kind==='diagnostic'||rows.at(-1).rawScore<.8)?'transfer':'diagnostic';
    const q=c.questions.find(q=>q.kind===kind);
    const options=q.points.map(p=>{const a=p.options.slice(0,-1);for(let i=a.length-1;i>0;i--){const j=crypto.getRandomValues(new Uint32Array(1))[0]%(i+1);[a[i],a[j]]=[a[j],a[i]];}return [...a,'暂时不确定'];});
    this.state.active={token:crypto.randomUUID(),concept:cid,question:q.id,options};this.state.concept=cid;this.event('task',cid,{question:q.id});return this.active();
  }
  answer(body){
    const old=this.state.attempts.find(a=>a.token===body.token);if(old)return clone(old.result);
    const a=this.state.active;if(!a||a.token!==body.token)fail('这道题已切换，请刷新后继续当前任务');
    const {c,q}=this.questions.get(a.question),answers=body.answers;
    if(!Array.isArray(answers)||answers.length!==3||answers.some((v,i)=>typeof v!=='string'||!a.options[i].includes(v)))fail('请完成三个要点的选择');
    const confidence=body.confidence||'一般';if(!['一般','不确定','很有把握'].includes(confidence))fail('未知信心选项');
    const rubric=q.points.map((p,i)=>({label:p.label,selected:answers[i],correct:answers[i]===p.correct,expected:p.correct,reason:p.reason,category:p.category}));
    const score=rubric.filter(p=>p.correct).length/3;
    let action,label,why;
    if(!score){action='study';label='先补回基础，再试一次';why='三个关键要点尚未获得作答证据，先拆开结构、功能和表现。';}
    else if(score<.8){action='followup';label='补上缺失环节，再做迁移题';why='已有部分理解；缺失要点会决定本次补学的重点。';}
    else if(q.kind==='diagnostic'){action='transfer';label='换个情境，验证能否迁移';why='这道题已达标，但单题正确还不足以判定掌握。';}
    else{action='next';label='查看学习结果与下一知识点';why='迁移题已达标；掌握判断还会检查不同题目与最近表现。';}
    const r={concept:c.id,question:q.id,kind:q.kind,score:Math.round(score*100),rubric,action,label,why,confidence,calibration:confidence==='很有把握'&&score<.8?'信心与表现有差异，建议回看推理依据。':'',reasoning:String(body.reasoning||'').slice(0,3000),grading:'结构化要点评分；补充推理仅记录，未自动评分'};
    this.state.attempts.push({id:this.state.attempts.length+1,token:a.token,concept:c.id,question:q.id,kind:q.kind,rawScore:score,score:r.score,created:Date.now()/1000,result:clone(r)});
    this.state.active=null;this.state.last_result=r;this.event('decision',c.id,{action,why});return r;
  }
  report(){const errors={};for(const a of this.state.attempts)for(const p of a.result.rubric)if(!p.correct)errors[p.category]=(errors[p.category]||0)+1;return {...this.snapshot(),errors,history:this.state.attempts.map(({rawScore,token,...a})=>a),events:this.state.events.slice(-50).reverse(),method:'要点等权计分；EMA=0.4×旧值+0.6×本次原始得分。掌握需两个不同题目均达标、包含迁移题、最近两次均≥80%且EMA≥80%。阅读不算掌握。规则未作真实学习效果验证。'};}
  study(cid){const c=this.map.get(cid)||fail('未知知识点');this.event('study',cid);this.state.concept=cid;return {concept:cid,name:c.name,note:c.note,source:this.catalog.sources[c.source],goals:this.catalog.course.goal_source,local_sources:this.retrieve(c.name).filter(s=>s.kind!=='note'),last_result:this.state.last_result?.concept===cid?this.state.last_result:null};}
  tokenize(text){const out=String(text).toLowerCase().match(/[a-z0-9]+/g)||[];for(const chunk of String(text).match(/[\u4e00-\u9fff]+/g)||[])for(let i=0;i<chunk.length-1;i++)out.push(chunk.slice(i,i+2));return new Set(out.filter(t=>!['什么','怎么','为什么','如何','一个','哪些','可以','以及','还是','有没有'].includes(t)));}
  retrieve(query){const sources=this.sources(),qt=this.tokenize(query);if(!qt.size)return [];const docs=sources.map(s=>this.tokenize(s.chapter+(s.text||'')+(s.keywords||[]).join(' ')));const weights=new Map([...qt].map(t=>[t,Math.log(1+(docs.length+1)/(1+docs.filter(d=>d.has(t)).length))]));const denom=[...weights.values()].reduce((a,b)=>a+b,0)||1;return sources.map((s,i)=>{const intersection=[...qt].filter(t=>docs[i].has(t));const coverage=intersection.reduce((n,t)=>n+weights.get(t),0)/denom;const explicit=(s.keywords||[]).some(t=>t.length>2&&query.toLowerCase().includes(t.toLowerCase()));return {...s,coverage,eligible:coverage>=.33&&(intersection.length>=2||explicit)};}).filter(s=>s.eligible).sort((a,b)=>b.coverage-a.coverage).slice(0,3);}
  ask(body){let query=String(body.query||'').trim();if(query.length<2||query.length>1000)fail('请输入2–1000字的问题');const c=this.map.get(body.concept)||this.concepts[0];let expanded=query;if(query.length<35&&/^(它|这条通路|这个表现|这一点|与之)/.test(query))expanded=c.name+' '+query;const hits=this.retrieve(expanded),textual=hits.filter(s=>s.text);this.event('ask',c.id,{query,source_ids:hits.map(s=>s.id)});if(!textual.length)return {refused:true,query,message:'现有资料不足以给出可核对的解释。请补充本章具体问题，或导入含授权文本的页码索引。仅有页码定位时不会编造答案。',citations:hits,mode:'浏览器本地证据检索'};return {refused:false,query,segments:textual.map(s=>({source_id:s.id,quote:s.text.slice(0,120),explanation:''})),citations:textual,mode:'浏览器本地抽取 · 未调用大模型',message:'以下为检索到的相关学习依据；本地抽取不等同于完整的问题解答。',warning:''};}
  research(cid,text){const c=this.map.get(cid)||fail('未知知识点');const question=String(text||'').trim()||c.research;const relevant=question===c.research||c.terms.some(t=>question.toLowerCase().includes(t.toLowerCase()));const eligible=relevant&&(question===c.research||/研究|证据|争议|尚不明确|未明|差异|恢复|病因|指标|是否|能否|影响|不同|前沿|验证/.test(question));const out={eligible,question,reason:eligible?'疑问涉及可检验的差异、机制或证据，可以从真实文献继续探索；相关性仍需人工核对。':'当前更像概念或通路问题，先用学习卡和定向练习补齐。请明确要比较的机制、条件或证据。',query:eligible?c.query:'',suggestion:c.research,mapping:'基于当前知识点的人工编写英文检索模板；可编辑，不是逐句翻译你的疑问'};this.event('research-gate',cid,out);return out;}
  async importRecords(records){
    if(!Array.isArray(records)||!records.length||records.length>1000)fail('每次导入1–1000条记录');const cleaned=[];
    for(const [i,s] of records.entries()){
      if(!s||typeof s!=='object'||typeof s.book!=='string'||!s.book.trim()||typeof s.chapter!=='string'||!s.chapter.trim())fail(`第${i+1}条必须包含book和chapter字符串`);
      if(!Number.isInteger(s.page)||s.page<1||s.page>100000)fail(`第${i+1}条page必须为正整数印刷页码`);
      const text=String(s.text||'');if(text.length>15000)fail('文本过长，请拆分段落');
      const keywords=s.keywords||[];if(!Array.isArray(keywords)||keywords.length>100||keywords.some(t=>typeof t!=='string'))fail('keywords必须是字符串数组');
      const url=String(s.url||'');if(url){let u;try{u=new URL(url);}catch{fail('来源链接格式错误');}if(u.protocol!=='https:')fail('来源链接只支持https');}
      const clean={book:s.book.slice(0,200),chapter:s.chapter.slice(0,200),page:s.page,text,keywords:keywords.map(t=>t.slice(0,100)),url:url.slice(0,2000),locator:String(s.edition||'版本未注明').slice(0,100),kind:text?'local':'metadata',provenance:'用户导入索引；页码待对照正版教材人工核验',reference:'浏览器本地资料'};
      const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(clean)));clean.id='local-'+[...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('').slice(0,20);cleaned.push(clean);
    }
    for(const s of cleaned){const i=this.state.sources.findIndex(x=>x.id===s.id);if(i<0)this.state.sources.push(s);else this.state.sources[i]=s;}this.event('import','',{count:cleaned.length});return {count:cleaned.length,message:'已导入当前浏览器。资料不会上传到站点服务器，页码仍待人工核验。'};
  }
  async ncbi(endpoint,params){const url='https://eutils.ncbi.nlm.nih.gov/entrez/eutils/'+endpoint+'?'+new URLSearchParams({...params,tool:'MedNexusLearningDemo'});const response=await this.network(url,{signal:AbortSignal.timeout(18000)});if(!response.ok)throw new Error('NCBI HTTP '+response.status);return response;}
  parsePapers(xml){const doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.querySelector('parsererror'))fail('PubMed返回的XML无法解析');const txt=(n,sel)=>n.querySelector(sel)?.textContent.trim()||'';return [...doc.querySelectorAll('PubmedArticle')].map(n=>{const a=n.querySelector('MedlineCitation > Article'),pmid=txt(n,'MedlineCitation > PMID');if(!a||!pmid)return null;const types=[...a.querySelectorAll('PublicationType')].map(x=>x.textContent.trim());const labels=[['Meta-Analysis','荟萃分析'],['Systematic Review','系统综述'],['Randomized Controlled Trial','随机对照试验'],['Review','综述'],['Case Reports','病例报告']];const doi=[...n.querySelectorAll('ArticleId')].find(x=>x.getAttribute('IdType')==='doi')?.textContent.trim()||'';return {pmid,title:txt(a,'ArticleTitle'),journal:txt(a,'Journal > Title'),year:txt(a,'PubDate > Year')||txt(a,'PubDate > MedlineDate'),authors:[...a.querySelectorAll('Author')].slice(0,8).map(x=>(txt(x,'LastName')+' '+txt(x,'Initials')).trim()||txt(x,'CollectiveName')),types,evidence:labels.find(([key])=>types.includes(key))?.[1]||'其他研究 · 请核对设计',abstract:[...a.querySelectorAll('AbstractText')].map(x=>({label:x.getAttribute('Label')||'',text:x.textContent.trim()})),url:'https://pubmed.ncbi.nlm.nih.gov/'+pmid+'/',doi:doi?'https://doi.org/'+doi:''};}).filter(Boolean);}
  async literature(body){const c=this.map.get(body.concept)||fail('未知知识点');const query=String(body.query||'').trim();if(query.length<3||query.length>1500||!/[a-zA-Z]{3}/.test(query))fail('请填写有效英文检索式');if(!this.research(c.id,body.question).eligible)fail('请先明确与当前知识点有关的开放性疑问');const cached=this.state.cache[query];if(cached&&Date.now()/1000-cached.fetched_at<86400)return {...cached,cached:true};
    try{const search=await (await this.ncbi('esearch.fcgi',{db:'pubmed',term:query,retmode:'json',retmax:5,sort:'relevance'})).json();const x=search.esearchresult;if(!x||x.errorlist)fail('PubMed未能识别检索式');let papers=[];if(x.idlist?.length){const xml=await (await this.ncbi('efetch.fcgi',{db:'pubmed',id:x.idlist.join(','),retmode:'xml'})).text();papers=this.parsePapers(xml);}const out={papers,count:Number(x.count||0),translation:x.querytranslation||query,query,cached:false,fetched_at:Date.now()/1000};this.state.cache[query]=out;this.event('literature',c.id,{query,pmids:papers.map(p=>p.pmid)});return out;}
    catch(error){const out=new Error('PubMed目前未能连接，可能是网络、跨域限制或接口限流。未补造任何论文，可重试或打开PubMed原站。');out.url='https://pubmed.ncbi.nlm.nih.gov/?term='+encodeURIComponent(query);throw out;}
  }
  readPaper(body){const c=this.map.get(body.concept)||fail('未知知识点');const paper=Object.values(this.state.cache).flatMap(x=>x.papers).find(p=>p.pmid===String(body.pmid));if(!paper)fail('请先检索并选择真实文献');this.event('read-paper',c.id,{pmid:paper.pmid});return {paper,concept:c.id,mode:'摘要阅读框架 · 未自动推断研究结论',question:String(body.question||c.research),evidence:paper.abstract.filter(a=>/result|conclusion|finding/i.test(a.label)),limitations:'请核对人群、设计、样本量与结局。文献类型不等于证据质量；摘要没有报告的内容不能补写。',relationship:'这篇文献是当前知识疑问的候选补充证据。是否支持、补充或与课程知识有分歧，需阅读内容后判断。'};}
  async call(path,body={}){let out;switch(path){case 'bootstrap':out=this.snapshot();break;case 'report':out=this.report();break;case 'export':out={version:1,edition:'public-browser-demo',exported_at:Date.now()/1000,report:this.report()};break;case 'task':out=this.task(body.concept,body.kind);break;case 'answer':out=this.answer(body);break;case 'study':out=this.study(body.concept);break;case 'ask':out=this.ask(body);break;case 'research':out=this.research(body.concept,body.question);break;case 'import':out=await this.importRecords(body.records);break;case 'literature':out=await this.literature(body);break;case 'read-paper':out=this.readPaper(body);break;case 'reset':if(body.confirmation!=='CLEAR_MY_LEARNING')fail('清空需明确确认');this.state=fresh();out={ok:true};break;default:fail('接口不存在');}this.save();return clone(out);}
}
let agentPromise;
export async function demoApi(path,body){if(!agentPromise)agentPromise=fetch('/course.json').then(r=>{if(!r.ok)throw new Error('课程数据加载失败');return r.json();}).then(c=>new DemoAgent(c,localStorage));return (await agentPromise).call(path,body);}
