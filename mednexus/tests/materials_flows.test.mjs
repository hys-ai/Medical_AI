import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source=readFileSync(new URL('../web/materials.js',import.meta.url),'utf8');
const segment=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end));
const loadingCode=segment('async function loadCourseMaterials()', 'function updateMaterialFilters()');

test('drafts survive other-line saves and preserve the revision they were edited against',()=>{
  const context=vm.createContext({materialDrafts:new Map()});
  vm.runInContext(segment('function materialDraftKey(', 'async function showLocalMaterialMatches('),context);
  const item={image_number:8};
  const a={index:0,text:'original A',visually_checked:false,review_token:'tokenA',review_revision:0};
  const b={index:1,text:'original B',visually_checked:false,review_token:'tokenB',review_revision:2};
  context.item=item;context.a=a;context.b=b;
  vm.runInContext("rememberMaterialDraft(item,a,'draft A',false);rememberMaterialDraft(item,b,'draft B',true)",context);
  context.materialDrafts.delete('8:0'); // Saving A may only discard A's draft.
  assert.equal(context.materialDrafts.get('8:1').text,'draft B');
  b.review_revision=3;b.review_token='newToken';
  vm.runInContext("rememberMaterialDraft(item,b,'updated draft B',false)",context);
  assert.equal(context.materialDrafts.get('8:1').revision,2);
  assert.equal(context.materialDrafts.get('8:1').token,'tokenB');
  vm.runInContext('rebaseMaterialDraft(item,b)',context);
  assert.equal(context.materialDrafts.get('8:1').revision,3);
  assert.equal(context.materialDrafts.get('8:1').checked,false);
  vm.runInContext("rememberMaterialDraft(item,b,'original B',false)",context);
  assert.equal(context.materialDrafts.size,0);
});

test('simultaneous material requests await the same load instead of losing search results',async()=>{
  let resolve;
  const pending=new Promise(r=>resolve=r), calls=[], filters=[];
  const context=vm.createContext({courseMaterials:null,materialLoading:null,
    api:()=>{calls.push('load');return pending;},updateMaterialFilters:()=>filters.push('update')});
  vm.runInContext(loadingCode,context);
  const a=vm.runInContext('loadCourseMaterials()',context);
  const b=vm.runInContext('loadCourseMaterials()',context);
  const data={histology:{pages:[]}};
  resolve(data);
  assert.equal(await a,data);assert.equal(await b,data);
  assert.equal(calls.length,1);assert.equal(filters.length,1);
  assert.equal(context.materialLoading,null);
});

test('a failed material load can be retried',async()=>{
  let attempts=0;
  const node={textContent:'',appendChild:()=>{}};
  const context=vm.createContext({courseMaterials:null,materialLoading:null,
    api:async()=>{if(++attempts===1)throw Error('offline');return {cards:[]};},
    $:()=>node,el:()=>({addEventListener:()=>{}}),updateMaterialFilters:()=>{}});
  vm.runInContext(loadingCode,context);
  await vm.runInContext('loadCourseMaterials()',context);
  assert.match(node.textContent,/offline/);
  assert.equal(context.materialLoading,null);
  await vm.runInContext('loadCourseMaterials()',context);
  assert.equal(attempts,2);assert.ok(context.courseMaterials);
});

test('refreshing saved material preserves selection and reveal state; new filters reset them',()=>{
  const nodes={materialType:{value:'histology'},materialSearch:{value:''},materialFilter:{value:''}};
  const context=vm.createContext({courseMaterials:{histology:{pages:[
    {id:'a',text:'first',lines:[],review_count:0},
    {id:'b',text:'second',lines:[{user_edited:true}],review_count:1}]}},
    materialItems:[],materialIndex:0,materialRevealed:true,
    $:id=>nodes[id],materialProgress:()=>({}),renderMaterial:()=>{}});
  vm.runInContext(segment('function filterMaterials(', 'function renderMaterial()'),context);
  vm.runInContext("filterMaterials('b')",context);
  assert.equal(context.materialIndex,1);assert.equal(context.materialRevealed,true);
  nodes.materialFilter.value='含本机修订';
  vm.runInContext('filterMaterials()',context);
  assert.equal(context.materialItems.length,1);assert.equal(context.materialItems[0].id,'b');
  assert.equal(context.materialIndex,0);assert.equal(context.materialRevealed,false);
});
