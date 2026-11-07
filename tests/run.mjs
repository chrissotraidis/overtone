#!/usr/bin/env node
// Runs every prompt in tests/cases.js through Overtone in headless Chrome and checks the plan line.
// Also renders the audio for a few prompts and checks it isn't silent or clipped.
// Usage: node tests/run.mjs [--web]     (needs Google Chrome; no npm packages)
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const web=process.argv.includes('--web');
const CHROME=process.env.CHROME||['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>fs.existsSync(p));
if(!CHROME){console.error('Google Chrome not found. Set CHROME=/path/to/chrome.');process.exit(2)}
const types={'.html':'text/html','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer((q,r)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0])); if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end();return}
  r.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'}); fs.createReadStream(f).pipe(r)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port, dport=20000+Math.floor(Math.random()*20000), profile=fs.mkdtempSync('/tmp/overtone-test-');
const chrome=spawn(CHROME,['--headless=new','--remote-debugging-port='+dport,'--user-data-dir='+profile,'--no-first-run','about:blank'],{stdio:'ignore'});
let targets; for(let k=0;k<50;k++){try{targets=await (await fetch('http://127.0.0.1:'+dport+'/json')).json(); if(targets.some(t=>t.type==='page')) break}catch{} await new Promise(r=>setTimeout(r,300))}
const ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
let id=0; const pend={}, pageErrors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.method==='Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text); if(m.id&&pend[m.id]){pend[m.id](m);delete pend[m.id]}};
const send=(method,params={})=>new Promise(r=>{const i=++id; pend[i]=r; ws.send(JSON.stringify({id:i,method,params}))});
const ev=async expr=>{const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true}); if(r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description||'evaluate failed'); return r.result.result.value};
await send('Runtime.enable'); await send('Page.navigate',{url:'http://127.0.0.1:'+port+'/index.html'}); await new Promise(r=>setTimeout(r,1500));
const cases=Function(fs.readFileSync(path.join(root,'tests/cases.js'),'utf8')+';return {CASES,WEB_CASES}')();
await ev("localStorage.clear(); EMOJI_FONT_READY");
await ev("(()=>{const b=document.querySelector('[data-key=web] [data-v="+(web?'on':'off')+"]'); b&&b.click()})()");
let pass=0, fail=0;
for(const [prompt,exp] of [...cases.CASES,...(web?cases.WEB_CASES:[])]){
  let plan='';
  try{ plan=await ev('(async()=>{const p='+JSON.stringify(prompt)+'; document.getElementById("prompt").value=p; await resolveWeb(p); renderPlan(); const d=overtone.compose(p,30,0); overtone.buildScene(d,overtone.opt); return document.getElementById("plan").innerText})()') }
  catch(e){ plan='ERROR: '+e.message }
  const low=plan.toLowerCase(), miss=(exp.has||[]).filter(s=>!low.includes(s.toLowerCase())), bad=(exp.not||[]).filter(s=>low.includes(s.toLowerCase()));
  if(miss.length||bad.length||plan.startsWith('ERROR')){fail++; console.log('FAIL  '+prompt+'\n      plan: '+plan+(miss.length?'\n      missing: '+miss.join(' | '):'')+(bad.length?'\n      should not say: '+bad.join(' | '):''))}
  else pass++;
}
// audio: not silent, not clipped
for(const p of ['dude eating a hamburger','a cat walking home under the moon']){
  const st=await ev('(async()=>{const sc=overtone.buildScene(overtone.compose('+JSON.stringify(p)+',15,0),overtone.opt); const a=await overtone.render(sc,48000,"harmonic"); let pk=0,ss=0; for(const v of a){pk=Math.max(pk,Math.abs(v)); ss+=v*v} return {peak:pk,rms:Math.sqrt(ss/a.length),dur:sc.dur}})()');
  if(st.peak>0.95||st.rms<0.02){fail++; console.log('FAIL  audio for "'+p+'": peak '+st.peak.toFixed(3)+', rms '+st.rms.toFixed(3))} else pass++;
}
if(pageErrors.length){fail++; console.log('FAIL  page errors:\n  '+pageErrors.join('\n  '))}
console.log((fail?'✗':'✓')+' '+pass+' passed, '+fail+' failed'+(web?'':' (Wikipedia cases skipped; add --web)'));
ws.close(); chrome.kill(); server.close(); await new Promise(r=>setTimeout(r,500)); try{fs.rmSync(profile,{recursive:true,force:true})}catch{}
process.exit(fail?1:0);

