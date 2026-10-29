import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../property-media.js',import.meta.url),'utf8');
function fixture({seconds=60,count=0}={}){
 const nodes=[],calls=[];let pending=[];
 class Node{constructor(tag,text=''){this.tag=tag;this.textContent=text;this.dataset={};this.value='';this.files=[];this.disabled=false;nodes.push(this)}append(...children){this.children=(this.children||[]).concat(children)}setAttribute(){}removeAttribute(){}load(){}set src(v){queueMicrotask(()=>{this.duration=seconds;this.onloadedmetadata?.()})}}
 const card=new Node('article');card.dataset.listing='test-listing';const properties=new Node('div');
 const client={auth:{getUser:async()=>{calls.push('auth');return{data:{user:{id:'test-user'}},error:null}}},rpc:async(name,args)=>{calls.push(name);return{data:name==='get_my_listing_media_progress'?{assets:Array.from({length:count},()=>({media_type:'video',review_status:'pending'}))}:{},error:null}},storage:{from:()=>({upload:async()=>{calls.push('upload');return{error:null}},remove:async()=>{calls.push('remove')}})}};
 vm.runInNewContext(source,{window:{LajemboAuth:{client,ready:{then:fn=>({catch:()=>{}})}}},document:{getElementById:id=>id==='properties'?properties:null,querySelectorAll:()=>[card],createElement:tag=>new Node(tag)},MutationObserver:class{observe(){}},URL:{createObjectURL:()=> 'blob:fixture',revokeObjectURL(){}},Date,Number,Map,setTimeout,clearTimeout,queueMicrotask,crypto:{randomUUID:()=> 'random-id'}});
 const upload=nodes.find(n=>n.tag==='button'),file=nodes.find(n=>n.tag==='input'&&n.type==='file'),date=nodes.find(n=>n.type==='datetime-local'),type=nodes.find(n=>n.tag==='select');type.value='video';date.value='2026-01-01T12:00';file.files=[{type:'video/mp4',size:1024}];
 return{calls,upload,status:()=>nodes.filter(n=>n.tag==='p').at(-1).textContent};
}
test('website rejects short, long and unreadable-duration video before upload',async()=>{
 for(const seconds of [4,59,120.01,NaN]){const f=fixture({seconds});await f.upload.onclick();assert.match(f.status(),/between 1 and 2 minutes/);assert.equal(f.calls.length,0);assert.equal(f.upload.disabled,false)}
});
test('website accepts 60 and 120 seconds and registers privately after upload',async()=>{
 for(const seconds of [60,120]){const f=fixture({seconds});await f.upload.onclick();assert.deepEqual(f.calls,['auth','get_my_listing_media_progress','upload','register_my_listing_media_asset']);assert.match(f.status(),/does not publish/)}
});
test('website stops a second active video before uploading',async()=>{
 const f=fixture({count:1});await f.upload.onclick();assert.match(f.status(),/limit has been reached/);assert.equal(f.calls.includes('upload'),false);
});
