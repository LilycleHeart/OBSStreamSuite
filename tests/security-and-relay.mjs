import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import os from 'node:os';import {spawn} from 'node:child_process';import assert from 'node:assert/strict';import {WebSocket} from 'ws';
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'obs-suite-test-')),port=18792,token=crypto.randomBytes(32).toString('hex'),songToken=crypto.randomBytes(32).toString('hex');
fs.copyFileSync('dist/service/bridge-server.cjs',folder+'/bridge-server.cjs');fs.writeFileSync(folder+'/bridge-config.json',JSON.stringify({port,token,songToken}));
const child=spawn(process.execPath,[folder+'/bridge-server.cjs'],{windowsHide:true,stdio:['ignore','pipe','pipe']});const peers=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function opened(route,key,origin){const ws=new WebSocket(`ws://127.0.0.1:${port}/${route}${key?'?token='+key:''}`,{origin});ws.messages=[];ws.on('message',raw=>ws.messages.push(JSON.parse(raw)));await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});peers.push(ws);return ws;}
async function wait(fn){for(let i=0;i<60;i++){if(fn())return;await sleep(50)}throw Error('Timed out');}
try{
 await new Promise((r,j)=>{child.stdout.once('data',r);child.once('error',j);child.once('exit',()=>j(Error('Relay exited')))});
 await assert.rejects(opened('publish','wrong','null'));await assert.rejects(opened('view',null,'https://untrusted.example'));
 const pub=await opened('publish',token,'null'),song=await opened('song-publish',songToken,'null');
 const viewer=await opened('view',null,`http://127.0.0.1:${port}`);
 pub.send(JSON.stringify({type:'snapshot',lyrics:{lyrics:[]},settings:{},progress:{seconds:0,at:Date.now(),playing:false}}));
 song.send(JSON.stringify({type:'snapshot',song:{title:'test'},theme:{colors:{'--md-accent-color':'rgb(1,2,3)'}},progress:{seconds:0,at:Date.now(),playing:false}}));
 viewer.send(JSON.stringify({type:'presence',obs:true,ready:true,visible:true}));await wait(()=>pub.messages.some(m=>m.type==='audience'&&m.active));await wait(()=>viewer.messages.some(m=>m.type==='theme'&&m.theme.source==='material-you'));
 viewer.send(JSON.stringify({type:'presence',obs:true,ready:false,visible:false}));await wait(()=>pub.messages.filter(m=>m.type==='audience').at(-1)?.active===false);
 function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
 for(const file of files('dist')){assert(!file.endsWith('bridge-config.json'),'Runtime secrets must not be distributed');if(/\.(js|cjs|json|ps1|html|css)$/.test(file)){const text=fs.readFileSync(file,'utf8');assert(!/token=[a-f0-9]{64}/i.test(text),'Baked credential in '+file);assert(!/C:[\\/]Users[\\/]/i.test(text),'Personal path in '+file);}}
 console.log('Passed: publisher authentication, viewer origin, visibility lifecycle, shared palette, credential-free package.');
}finally{for(const p of peers)p.terminate();child.kill();}
