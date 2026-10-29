import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const code=readFileSync(new URL('../web/tutor-chat.js',import.meta.url),'utf8');
const TOKEN_A='a'.repeat(32),TOKEN_B='b'.repeat(32);
class Node {
  constructor(tag='div',className='',value='') {
    this.tag=tag;this.className=className||'';this.children=[];this.listeners={};this.attributes={};this.value='';this.disabled=false;this.textContent=value;
  }
  get textContent(){return this._text;}
  set textContent(value){this._text=value;this.children=[];}
  appendChild(child){this.children.push(child);return child;}
  append(...children){children.forEach(child=>this.appendChild(child));}
  setAttribute(key,value){this.attributes[key]=value;}
  addEventListener(type,handler){this.listeners[type]=handler;}
  focus(){this.focused=true;}
}
const nodes=root=>[root,...root.children.flatMap(nodes)];
const text=root=>nodes(root).map(n=>n.textContent).join(' ');
const klass=(root,name)=>nodes(root).find(n=>n.className.split(' ').includes(name));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function response(token=TOKEN_A,extra={}) {
  return {token,concept:'oculomotor',name:'动眼神经',provider:{mode:'local',label:'本地资料对话',available:false,note:'未连接生成模型，仅根据本机资料提供摘录。'},messages:[],remaining:12,...extra};
}
function setup(api) {
  let random=0;
  const ctx=vm.createContext({Map,WeakMap,Uint8Array,crypto:{getRandomValues:array=>array.fill(++random)},
    el:(tag,cls,value)=>new Node(tag,cls,value),api});
  vm.runInContext(code,ctx);
  return {ctx,mount:(container,token=TOKEN_A)=>ctx.mountTutorChat(container,token),
    entry:(token=TOKEN_A)=>vm.runInContext(`tutorChatEntries.get('${token}')`,ctx)};
}
function type(root,value) {
  const input=klass(root,'tutor-input');input.value=value;input.listeners.input();
}
function submit(root) {klass(root,'tutor-chat-form').listeners.submit({preventDefault(){}});}

test('restored transcript displays provider and verified-source fields as text and blocks script URLs',async()=>{
  const root=new Node();
  const fake=response(TOKEN_A,{messages:[{role:'user',content:'我有一个疑问'},{role:'assistant',content:'<img src=x onerror=alert(1)>',follow_up:'你如何理解？',mode:'本地资料对话',sources:[
    {id:'note-oculomotor',title:'自编学习卡',quote:'结构与功能',url:'javascript:alert(1)',provenance:'不是教材页码'}]}]});
  const s=setup(async()=>fake);s.mount(root);await flush();
  assert.match(text(root),/本地资料对话/);assert.match(text(root),/未连接生成模型/);
  assert.match(text(root),/<img src=x onerror=alert\(1\)>/);
  assert.equal(nodes(root).filter(node=>node.tag==='a').length,0);
  assert.match(text(root),/结构与功能/);assert.match(text(root),/你如何理解/);
});

test('multiple free-text turns preserve context and prevent duplicate sends while a reply is pending',async()=>{
  const root=new Node(),posts=[];let complete;
  const s=setup(async(path,body)=>{
    if(!body)return response();posts.push(body);return new Promise(resolve=>complete=resolve);
  });s.mount(root);await flush();
  type(root,'我认为上睑下垂与提上睑肌有关');submit(root);submit(root);
  assert.equal(posts.length,1);assert.equal(klass(root,'tutor-input').disabled,true);
  const first=[{role:'user',content:posts[0].message},{role:'assistant',content:'请继续说明支配关系',follow_up:'是哪条神经？'}];
  complete(response(TOKEN_A,{messages:first,remaining:11}));await flush();
  assert.equal(klass(root,'tutor-input').value,'');assert.match(text(root),/请继续说明支配关系/);
  type(root,'那为什么不能归到面神经？');submit(root);
  assert.equal(posts.length,2);assert.notEqual(posts[0].request_id,posts[1].request_id);
  assert.equal(posts[1].token,TOKEN_A);
  complete(response(TOKEN_A,{messages:[...first,{role:'user',content:posts[1].message},{role:'assistant',content:'需要区分提上睑和闭眼。'}],remaining:10}));await flush();
  assert.match(text(root),/支配关系/);assert.match(text(root),/需要区分提上睑和闭眼/);
});

test('failed sends keep the same draft and idempotency ID for a safe retry',async()=>{
  const root=new Node(),calls=[];let fail=true;
  const s=setup(async(path,body)=>{
    if(!body)return response();calls.push(body);
    if(fail)throw Error('network interrupted');
    return response(TOKEN_A,{messages:[{role:'user',content:body.message},{role:'assistant',content:'本轮回答'}],remaining:11});
  });s.mount(root);await flush();
  type(root,'请解释我刚才的问题');submit(root);await flush();
  assert.equal(klass(root,'tutor-input').value,'请解释我刚才的问题');assert.match(text(root),/草稿已保留/);
  fail=false;submit(root);await flush();
  assert.equal(calls.length,2);assert.equal(calls[0].request_id,calls[1].request_id);
  assert.equal(klass(root,'tutor-input').value,'');assert.match(text(root),/本轮回答/);
});

test('a late response from another question cannot overwrite the newly mounted question',async()=>{
  const root=new Node();let oldResolve;
  const s=setup(path=>path.includes(TOKEN_A)?new Promise(resolve=>oldResolve=resolve):Promise.resolve(response(TOKEN_B,{name:'展神经'})));
  s.mount(root,TOKEN_A);s.mount(root,TOKEN_B);await flush();
  assert.match(text(root),/展神经/);
  oldResolve(response(TOKEN_A,{name:'旧题',messages:[{role:'assistant',content:'过期回复'}]}));await flush();
  assert.ok(!text(root).includes('旧题'));assert.ok(!text(root).includes('过期回复'));
});

test('draft and pending reply survive remounting, with one mutation and no parallel history load',async()=>{
  const first=new Node(),second=new Node();let resolve,gets=0,posts=0;
  const s=setup(async(path,body)=>{
    if(!body){gets++;return response();}posts++;return new Promise(done=>resolve=done);
  });s.mount(first);await flush();
  type(first,'能否按我的推理继续？');s.mount(second);await flush();
  assert.equal(klass(second,'tutor-input').value,'能否按我的推理继续？');
  submit(second);s.mount(first);
  assert.equal(klass(first,'tutor-input').value,'能否按我的推理继续？');
  assert.equal(klass(first,'tutor-input').disabled,true);assert.equal(gets,2);assert.equal(posts,1);
  resolve(response(TOKEN_A,{messages:[{role:'assistant',content:'继续追问你的依据'}],remaining:11}));await flush();
  assert.match(text(first),/继续追问你的依据/);assert.equal(klass(first,'tutor-input').value,'');
});

test('history load failures remain retryable and turn limits disable further messages',async()=>{
  const root=new Node();let calls=0;
  const s=setup(async()=>{if(++calls===1)throw Error('offline');return response(TOKEN_A,{remaining:0});});
  s.mount(root);await flush();assert.match(text(root),/对话暂未载入/);
  const retry=nodes(root).find(node=>node.textContent==='重新载入对话');retry.listeners.click();await flush();
  assert.equal(calls,2);assert.equal(klass(root,'tutor-input').disabled,true);assert.match(text(root),/12轮上限/);
  type(root,'我还有一个问题');submit(root);await flush();assert.equal(calls,2);
});

test('clearing learning state invalidates pending responses and discards window drafts',async()=>{
  const root=new Node();let resolve;
  const s=setup(()=>new Promise(done=>resolve=done));s.mount(root);
  type(root,'这段草稿不应在清理后恢复');s.ctx.clearTutorChatState();
  resolve(response(TOKEN_A,{messages:[{role:'assistant',content:'不应渲染的旧记录'}]}));await flush();
  assert.equal(s.entry(),undefined);assert.ok(!text(root).includes('不应渲染的旧记录'));
});
