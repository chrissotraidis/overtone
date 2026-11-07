// app.js: Overtone's interface. Audio graph, live spectrogram, timeline, recording and dialogs.
'use strict';
const $=id=>document.getElementById(id);
const GITHUB_URL='';   // set this once the repository is public
const opt={length:'medium',mood:'auto',drums:'on',tuning:'harmonic',palette:'magma',shape:'wide',style:'lines',seed:0,web:'on'};
const saved=(()=>{try{return JSON.parse(localStorage.getItem('overtone')||'{}')}catch{return {}}})();
for(const [k,v] of Object.entries(saved.opt||{})) if(k in opt&&typeof v===typeof opt[k]) opt[k]=v;
if(!PALETTES[opt.palette]) opt.palette='magma'; if(!LENGTHS[opt.length]) opt.length='medium';
if(typeof saved.prompt==='string'&&saved.prompt.trim()) $('prompt').value=saved.prompt;
buildLUT(opt.palette); WEB_ON=opt.web==='on';
const persist=()=>{try{localStorage.setItem('overtone',JSON.stringify({opt,prompt:$('prompt').value}))}catch{}};
const S={src:'text',image:null,imageName:'',video:null,videoName:'',videoUrl:'',videoMeta:null,frameCache:null};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const nextFrame=()=>new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0)));
const fmt=t=>{t=Math.max(0,t);return Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0')};
const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48)||'overtone';
const el=(tag,cls,text)=>{const e=document.createElement(tag); if(cls)e.className=cls; if(text!=null)e.textContent=text; return e};
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),10000)}
function toast(msg){const t=$('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toast.h); toast.h=setTimeout(()=>t.classList.remove('show'),3600)}

// ---------- logo, reused as favicon and inside recorded videos ----------
const LOGO_URL='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(document.querySelector('.mark').outerHTML);
const LOGO=new Image(); LOGO.src=LOGO_URL;
document.querySelector('link[rel=icon]').href=LOGO_URL; $('aboutLogo').src=LOGO_URL;

// ---------- spectrogram view ----------
const spec=$('spec'), sctx=spec.getContext('2d');
spec.width=VIEW_W+AXIS_W; spec.height=H;
const bg=()=>'rgb('+LUT[0]+','+LUT[1]+','+LUT[2]+')';
function drawAxis(){
  sctx.fillStyle='#0d0b13'; sctx.fillRect(VIEW_W,0,AXIS_W,H);
  sctx.font='11px '+FONT; sctx.fillStyle='#8d86a0'; sctx.strokeStyle='#3a3448'; sctx.lineWidth=1;
  [50,100,200,500,1000,2000,5000,10000].forEach(f=>{const y=Math.round(yOf(f))+.5; sctx.beginPath();sctx.moveTo(VIEW_W,y);sctx.lineTo(VIEW_W+6,y);sctx.stroke();
    sctx.fillText(f>=1000?f/1000+'k':f,VIEW_W+10,y+4)});
  sctx.save(); sctx.translate(VIEW_W+AXIS_W-8,H/2); sctx.rotate(-Math.PI/2); sctx.textAlign='center'; sctx.fillStyle='#5f5872'; sctx.fillText('pitch (Hz)',0,0); sctx.restore();
}
function clearView(){sctx.fillStyle=bg();sctx.fillRect(0,0,VIEW_W,H);drawAxis(); document.querySelector('.stagebox').style.background=bg()}
clearView();

// ---------- audio graph ----------
let ac, master, analyser, recDest, dbData, binMap, colImg; const liveIdx=new Uint8Array(H);
function ensureAudio(){
  if(ac) return;
  ac=new (window.AudioContext||window.webkitAudioContext)();
  master=ac.createGain(); master.gain.value=+$('vol').value; master.connect(ac.destination);
  analyser=ac.createAnalyser(); analyser.fftSize=4096; analyser.smoothingTimeConstant=0;
  analyser.minDecibels=DB_MIN; analyser.maxDecibels=DB_MAX; analyser.connect(master);
  recDest=ac.createMediaStreamDestination();
  // keep the recording's audio track alive with silence, so videos start at the typing, not at the first note
  const hush=ac.createConstantSource(); hush.offset.value=0; hush.connect(recDest); hush.start();
  dbData=new Float32Array(analyser.frequencyBinCount);
  const binHz=ac.sampleRate/analyser.fftSize; binMap=[];
  for(let y=0;y<H;y++){const lo=fOf(y+1)/binHz, hi=fOf(y)/binHz; binMap.push(hi-lo<1?{c:fOf(y+0.5)/binHz}:{lo:Math.floor(lo),hi:Math.ceil(hi)})}
  colImg=sctx.createImageData(1,H);
}
function dbToIdx(db,out){
  for(let y=0;y<H;y++){const m=binMap[y]; let v;
    if(m.c!==undefined){const k=Math.floor(m.c),u=m.c-k; v=db[k]*(1-u)+db[k+1]*u}
    else{v=-Infinity; for(let k=m.lo;k<=m.hi;k++)v=Math.max(v,db[k])}
    out[y]=Math.max(0,Math.min(255,Math.round((v-DB_MIN)/(DB_MAX-DB_MIN)*255)))}
}
function paintCol(idx,img){const d=img.data; for(let y=0;y<H;y++){const i=idx[y]*3; d[y*4]=LUT[i];d[y*4+1]=LUT[i+1];d[y*4+2]=LUT[i+2];d[y*4+3]=255}}

// ---------- history: the same spectrogram computed in the background, so you can jump anywhere ----------
let hist=null;
function startHistory(){
  const W=Math.ceil(scene.dur*PPS)+2, cv=document.createElement('canvas'); cv.width=W; cv.height=H;
  const cx=cv.getContext('2d'); cx.fillStyle=bg(); cx.fillRect(0,0,W,H);
  const h=hist={W,cv,cx,idx:new Uint8Array(W*H),done:new Uint8Array(W),img:cx.createImageData(1,H),data:audio,sr:ac.sampleRate};
  let x=0; const step=()=>{ if(h!==hist) return; const e=Math.min(h.W,x+40); ensureHist(x,e); x=e; if(x<h.W) setTimeout(step,0) }; setTimeout(step,0);
}
function ensureHist(a,b){
  const h=hist; if(!h) return; a=Math.max(0,a); b=Math.min(h.W,b);
  for(let x=a;x<b;x++){ if(h.done[x]) continue;
    const col=h.idx.subarray(x*H,(x+1)*H); dbToIdx(spectrumAt(h.data,Math.round(x/PPS*h.sr)),col);
    paintCol(col,h.img); h.cx.putImageData(h.img,x,0); h.done[x]=1 }
}
async function finishHistory(onP){const h=hist; if(!h) return; for(let x=0;x<h.W;x+=240){ if(h!==hist) return; ensureHist(x,x+240); onP&&onP(x/h.W); await yieldNow() }}
function recolorHistory(){const h=hist; if(!h) return; for(let x=0;x<h.W;x++) if(h.done[x]){paintCol(h.idx.subarray(x*H,(x+1)*H),h.img);h.cx.putImageData(h.img,x,0)}}
function paintHistory(t){
  const end=Math.floor(t*PPS), c0=Math.max(0,end-VIEW_W);
  sctx.fillStyle=bg(); sctx.fillRect(0,0,VIEW_W,H);
  if(hist&&end>c0){ensureHist(c0,end); sctx.drawImage(hist.cv,c0,0,end-c0,H,VIEW_W-(end-c0),0,end-c0,H)}
  shown=end;
}

// ---------- transport ----------
let desc=null, label='', scene=null, audio=null, buffer=null, src=null, buildTok=0;
let playing=false, startAt=0, pos=0, shown=0, loop=false, scoreDirty=true, hoverX=null, drag=null, endWaiters=[], lastVideo=null, rec=null;
const position=()=>playing?Math.min(ac.currentTime-startAt,scene.dur):pos;
const ICON_PLAY='<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>', ICON_PAUSE='<svg viewBox="0 0 24 24"><path d="M6 4h4.5v16H6zm7.5 0H18v16h-4.5z"/></svg>';
// every start and stop gets a few milliseconds of fade: a hard cut is a click, and a click paints a vertical line
function stopSource(){ if(src){const s=src, g=s.fade, t=ac.currentTime; src=null; s.onended=null;
  g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value,t); g.gain.linearRampToValueAtTime(0,t+0.015);
  try{s.stop(t+0.02)}catch{} setTimeout(()=>g.disconnect(),100)} }
function play(from){
  if(!buffer) return;
  from=Math.max(0,Math.min(from,scene.dur-0.05));
  stopSource();
  if(Math.floor(from*PPS)!==shown) paintHistory(from);
  const when=ac.currentTime+0.03, g=ac.createGain(); g.connect(analyser); g.connect(recDest);
  g.gain.setValueAtTime(from>0?0:1,when); if(from>0) g.gain.linearRampToValueAtTime(1,when+0.015);
  src=ac.createBufferSource(); src.buffer=buffer; src.fade=g; src.connect(g);
  src.start(when,from); startAt=when-from; playing=true;
  const me=src; me.onended=()=>{ if(src!==me) return; src=null; playing=false; pos=scene.dur; onEnded() };
  syncUI();
}
function pause(){ if(!playing) return; pos=position(); stopSource(); playing=false; syncUI() }
function togglePlay(){ if(!scene) return; if(playing) pause(); else play(pos>=scene.dur-0.1?0:pos) }
function seek(t){ if(!scene) return; t=Math.max(0,Math.min(t,scene.dur)); if(playing) play(t); else { pos=t; paintHistory(t); syncUI() } }
function onEnded(){ const w=endWaiters; endWaiters=[]; w.forEach(r=>r()); if(loop&&!rec){ play(0); return } syncUI() }
function syncUI(){
  $('play').innerHTML=playing?ICON_PAUSE:ICON_PLAY; $('play').setAttribute('aria-label',playing?'Pause':'Play');
  $('play').disabled=!scene; $('wav').disabled=!audio; $('dlvid').disabled=!lastVideo; scoreDirty=true;
  $('time').textContent=scene?fmt(position())+' / '+fmt(scene.dur):'0:00 / 0:00';
}
function tick(){
  if(playing){
    const t=position(), target=Math.floor(t*PPS), n=target-shown;
    if(n>VIEW_W/2) paintHistory(t);
    else if(n>0){ analyser.getFloatFrequencyData(dbData); dbToIdx(dbData,liveIdx); paintCol(liveIdx,colImg);
      sctx.drawImage(spec,n,0,VIEW_W-n,H,0,0,VIEW_W-n,H); for(let k=0;k<n;k++) sctx.putImageData(colImg,VIEW_W-n+k,0); shown=target }
  }
  if(scene&&(playing||scoreDirty)){ drawScore(); $('time').textContent=fmt(position())+' / '+fmt(scene.dur); scoreDirty=false }
  if(rec){ drawVideo(); const tt=fmt((performance.now()-rec.started)/1000); $('recTime').textContent=tt; $('recLabel').textContent='Stop · '+tt }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---------- score timeline ----------
const score=$('score'), scx=score.getContext('2d');
let scoreBase=null;
(function emptyScore(){scx.fillStyle='#07060b'; scx.fillRect(0,0,score.width,score.height); scx.fillStyle='#4f4962'; scx.font='13px '+FONT; scx.textAlign='center';
  scx.fillText('The score: the whole picture and its notes. Click or drag it to jump anywhere.',score.width/2,score.height/2+4); scx.textAlign='left'})();
function buildScore(){
  const w=score.width, h=110; score.height=h;
  scoreBase=document.createElement('canvas'); scoreBase.width=w; scoreBase.height=h;
  const b=scoreBase.getContext('2d'), sx=w/scene.W, sy=h/H;
  b.fillStyle='#07060b'; b.fillRect(0,0,w,h);
  b.fillStyle='rgba(255,255,255,.05)'; for(let t=0;t<scene.dur;t+=scene.bar) b.fillRect(Math.round(t*PPS*sx),0,1,h);
  b.globalAlpha=.85; b.drawImage(scene.canvas,0,0,w,h); b.globalAlpha=1;
  const col={bass:'#fca65e',arp:'#e0507a',lead:'#9fd3ff',ping:'#ffe27a'};
  for(const e of scene.events){ if(!col[e.type])continue; const f=e.f||mtof(e.m), y=yOf(f)*sy, x=e.t*PPS*sx;
    b.fillStyle=col[e.type]; if(e.type==='ping'){b.beginPath();b.arc(x,y,2,0,7);b.fill()} else b.fillRect(x,y-1,Math.max(1.5,(e.d||.1)*PPS*sx),2)}
  scoreDirty=true;
}
const xOfT=t=>t*PPS*score.width/scene.W, tOfX=x=>x*scene.W/score.width/PPS;
function drawScore(){
  if(!scoreBase) return; const h=score.height; scx.drawImage(scoreBase,0,0);
  const x=xOfT(position());
  scx.fillStyle='rgba(7,6,11,.45)'; scx.fillRect(0,0,x,h);
  scx.fillStyle='#fca65e'; scx.fillRect(x-1,0,2,h); scx.beginPath(); scx.moveTo(x-6,0); scx.lineTo(x+6,0); scx.lineTo(x,8); scx.fill();
  if(hoverX!=null&&!drag){
    scx.fillStyle='rgba(255,255,255,.4)'; scx.fillRect(hoverX,0,1,h);
    const lb=fmt(tOfX(hoverX)); scx.font='600 12px '+FONT; const tw=scx.measureText(lb).width+12, lx=Math.min(score.width-tw-2,Math.max(2,hoverX-tw/2));
    scx.fillStyle='rgba(19,17,26,.92)'; scx.beginPath(); scx.roundRect(lx,h-24,tw,19,5); scx.fill(); scx.fillStyle='#ece8f4'; scx.fillText(lb,lx+6,h-10);
  }
}
const evX=e=>{const r=score.getBoundingClientRect(); return Math.max(0,Math.min(score.width,(e.clientX-r.left)*score.width/r.width))};
score.addEventListener('pointerdown',e=>{ if(!scene||rec) return; score.setPointerCapture(e.pointerId); drag={}; pause(); seek(tOfX(evX(e))) });
score.addEventListener('pointermove',e=>{ if(!scene) return; hoverX=evX(e); if(drag) seek(tOfX(hoverX)); scoreDirty=true });
score.addEventListener('pointerup',()=>{ if(!drag) return; drag=null; play(pos) });
score.addEventListener('pointerleave',()=>{ hoverX=null; scoreDirty=true });
spec.addEventListener('click',e=>{ if(!scene||rec) return; const r=spec.getBoundingClientRect(), x=(e.clientX-r.left)*spec.width/r.width;
  if(x>=VIEW_W) return; const t=position()-(VIEW_W-x)/PPS; if(t<0) return; play(t) });

// ---------- sources: words, an image, or a video ----------
const promptText=()=>$('prompt').value.trim()||'a face and a spiral';
function setSrc(s){
  S.src=s;
  document.querySelectorAll('.src [data-src]').forEach(b=>{b.classList.toggle('on',b.dataset.src===s); b.setAttribute('aria-selected',b.dataset.src===s)});
  document.querySelectorAll('[data-pane]').forEach(p=>p.hidden=!p.dataset.pane.split(' ').includes(s));
  $('lengthSet').classList.toggle('inactive',s==='image');
  $('lengthSet').title=s==='image'?'A picture plays at its natural width':'';
  updatePlan();
}
function loadImage(file){
  if(S.imageUrl) URL.revokeObjectURL(S.imageUrl);
  const url=URL.createObjectURL(file), img=new Image(); S.imageUrl=url;
  img.onload=()=>{S.image=img; S.imageName=file.name; setDrop('img',url,file.name,img.naturalWidth+'×'+img.naturalHeight); setSrc('image')};
  img.onerror=()=>toast('That image could not be opened.');
  img.src=url;
}
function loadVideo(file){
  if(S.videoUrl) URL.revokeObjectURL(S.videoUrl);
  const url=URL.createObjectURL(file), v=document.createElement('video'); v.muted=true; v.preload='auto'; v.playsInline=true;
  v.onloadedmetadata=async()=>{
    if(!v.videoWidth){toast('That file has no picture track.');return}
    S.video=file; S.videoName=file.name; S.videoUrl=url; S.videoMeta={duration:v.duration,w:v.videoWidth,h:v.videoHeight}; S.frameCache=null;
    v.currentTime=Math.min(0.5,v.duration/2); await new Promise(r=>{v.onseeked=r; setTimeout(r,2000)});
    const t=document.createElement('canvas'); t.width=160; t.height=Math.round(160*v.videoHeight/v.videoWidth); t.getContext('2d').drawImage(v,0,0,t.width,t.height);
    setDrop('vid',t.toDataURL('image/jpeg',0.7),file.name,fmt(v.duration)+' · '+v.videoWidth+'×'+v.videoHeight); setSrc('video');
  };
  v.onerror=()=>toast('This browser can’t open that video. MP4 (H.264) works everywhere.');
  v.src=url;
}
function setDrop(kind,thumbUrl,name,meta){
  const d=$(kind+'Drop'); d.classList.add('has'); $(kind+'Thumb').style.backgroundImage='url("'+thumbUrl+'")';
  const t=$(kind+'Text'); t.textContent=''; t.append(el('b',null,name),document.createTextNode(' '),el('span','meta',meta+' · click to change'));
}
async function videoFrames(count,progress){
  const key=count+'|'+opt.style;
  if(S.frameCache&&S.frameCache.key===key&&S.frameCache.url===S.videoUrl) return S.frameCache.frames;
  const v=document.createElement('video'); v.muted=true; v.preload='auto'; v.playsInline=true; v.src=S.videoUrl;
  await new Promise((res,rej)=>{v.onloadeddata=res; v.onerror=()=>rej(new Error('Could not read that video.'))});
  const frames=[], d=v.duration;
  for(let i=0;i<count;i++){
    v.currentTime=d*(i+0.5)/count; await new Promise(r=>{v.onseeked=r; setTimeout(r,3000)});
    frames.push(processPicture(v,v.videoWidth,v.videoHeight,opt.style)); progress&&progress((i+1)/count); await nextFrame();
  }
  S.frameCache={key,url:S.videoUrl,frames};
  return frames;
}
async function makeDesc(progress){
  const target=LENGTHS[opt.length];
  if(S.src==='text'){ await resolveWeb(promptText(),ps=>overlay('Looking up “'+ps.join('”, “')+'” on Wikipedia…',0.3));
    const failed=WEB_ON?webPhrases(promptText()).filter(ph=>WEB_ERR.has(ph)):[];
    if(failed.length) toast('Couldn’t reach Wikipedia, so those words are written out. '+offlineHint());
    updatePlan(); return compose(promptText(),target,opt.seed) }
  if(S.src==='image'){ if(!S.image) throw new Error('Choose an image first.'); return imageDesc(processPicture(S.image,S.image.naturalWidth,S.image.naturalHeight,opt.style)) }
  if(!S.video) throw new Error('Choose a video first.');
  return videoDesc(await videoFrames(framesFor(S.videoMeta,target),progress));
}
const currentLabel=()=>S.src==='text'?promptText():S.src==='image'?S.imageName.replace(/\.[^.]+$/,''):S.videoName.replace(/\.[^.]+$/,'');

// ---------- the plan line: what will be painted, before you press Paint ----------
let planTimer=0;
function updatePlan(){clearTimeout(planTimer); planTimer=setTimeout(renderPlan,80)}
let lookupTimer=0;
function lookupSoon(){clearTimeout(lookupTimer); lookupTimer=setTimeout(async()=>{await resolveWeb(promptText()); updatePlan()},450)}
// inside an embedded preview (like an editor's file viewer) the page usually isn't allowed online
const EMBEDDED=(()=>{try{return window.self!==window.top}catch{return true}})();
const offlineHint=()=>EMBEDDED?'This preview window can’t go online. Open the page in your browser to look up names.':'Check your connection.';
function renderPlan(){
  const box=$('plan'); box.textContent='';
  const add=(t,cls)=>box.append(cls==='b'?el('b',null,t):cls?el('span',cls,t):document.createTextNode(t));
  const names=(arr,q)=>arr.forEach((t,i)=>{if(i) add(i===arr.length-1?' and ':', '); add(q?'“'+t+'”':t,'b')});
  const target=LENGTHS[opt.length];
  const tail=d=>{add('Music: '+musicFor(d,opt).label+'. ','len'); add('About '+fmt(estimateDur(d.rawDur,d,opt))+'.','len')};
  if(S.src==='text'){
    const phs=WEB_ON?webPhrases(promptText()):[], pending=phs.filter(ph=>!WEB.has(ph)&&!WEB_ERR.has(ph)), failed=phs.filter(ph=>WEB_ERR.has(ph));
    if(pending.length){ add('Looking up '); names(pending,true); add(' on Wikipedia… ','len'); lookupSoon(); return }
    if(failed.length){ add('Couldn’t reach Wikipedia for ','fix'); names(failed,true); add('. '+offlineHint()+' ','fix');
      const b=el('button','linkbtn','Try again'); b.type='button'; b.onclick=()=>{failed.forEach(ph=>WEB_ERR.delete(ph)); updatePlan()}; box.append(b,document.createTextNode(' ')) }
    const d=compose(promptText(),target,opt.seed), P=d.plan, of=k=>P.parts.filter(p=>p.kind===k).map(p=>p.text);
    const acts=of('action'), things=of('thing'), places=of('place'), letters=of('letter'), verbs=of('verbword');
    if(acts.length||things.length||places.length){add('Paints ');
      acts.forEach((t,i)=>{if(i) add(', then '); add(t,'b')});
      if(things.length){if(acts.length) add(', with '); names(things)}
      places.forEach(pl=>{add(acts.length||things.length?(/^olympic/i.test(pl)?' in an ':/stadium/i.test(pl)?' in a ':/sky/.test(pl)?' under a ':pl==='rain'?' in the ':' with the '):''); add(pl,'b')});
      add('. ')}
    if(verbs.length) add('No drawing for “'+verbs.join('”, “')+'” yet, so the figure acts it out and the word is written. ','fix');
    if(letters.length&&!failed.length){add(acts.length||things.length?'Writes out ':'Nothing matched, so it writes out '); names(letters,true); add(WEB_ON?' (not found on Wikipedia either). ':'. Turn on “Look up names” to find people and places. ')}
    if(P.fallback) add('Nothing matched, so it paints a face and a spiral. ');
    if(P.web&&P.web.length) add('Pictures from Wikipedia. ','len');
    if(P.fixes.length) add('Read '+P.fixes.map(([a,b])=>'“'+a+'” as “'+b+'”').join(', ')+'. ','fix');
    tail(d);
  } else if(S.src==='image'){
    if(!S.image){add('Pick or drop a picture. Lines traces its edges; Tones keeps its shading.');return}
    const w=Math.round(S.image.naturalWidth*PANEL_H/S.image.naturalHeight);
    add('Paints '); add(S.imageName,'b'); add(' as a '+(opt.style==='lines'?'line drawing':'shaded picture')+'. ');
    tail({rawDur:0.8+w/PPS+2.2,musicKey:S.imageName});
  } else {
    if(!S.video){add('Pick or drop a short video. Its frames become a film strip painted in sound.');return}
    const n=framesFor(S.videoMeta,target), fw=Math.round(S.videoMeta.w*PANEL_H/S.videoMeta.h);
    add('Paints '); add(n+' frames','b'); add(' from '); add(S.videoName,'b'); add(' as a film strip. ');
    tail({rawDur:0.8+n*(fw+FRAME_GAP)/PPS+2.2,musicKey:S.videoName});
  }
}

// ---------- painting ----------
function overlay(text,p){const o=$('overlay'); if(text==null){o.hidden=true;return} o.hidden=false; $('ovText').textContent=text; $('ovBar').style.width=Math.round((p||0)*100)+'%'}
async function rebuild(tok){
  const sc=buildScene(desc,opt);
  const a=await render(sc,ac.sampleRate,opt.tuning,p=>overlay('Composing the music…',p));
  if(tok!==buildTok) return false;
  scene=sc; audio=a; buffer=ac.createBuffer(1,a.length,ac.sampleRate); buffer.copyToChannel(a,0);
  buildScore(); startHistory(); overlay(null); syncUI(); return true;
}
async function prepare(){
  const tok=++buildTok; overlay('Composing…',0);
  try{ desc=await makeDesc(p=>overlay('Reading video frames…',p)); if(!desc.musicKey) desc.musicKey=currentLabel() }catch(e){ overlay(null); toast(e.message); return false }
  label=currentLabel(); $('hint').hidden=true;
  return rebuild(tok);
}
let composing=false;
function setComposing(on){composing=on; $('paint').disabled=on; $('remix').disabled=on; $('paintLabel').textContent=on?'Composing…':'Paint'}
async function paint(){
  if(rec||composing) return;
  setComposing(true);
  try{
    ensureAudio(); if(ac.state==='suspended') await ac.resume();
    pause(); persist();
    if(!(await prepare())) return;
    clearView(); shown=0; pos=0; play(0);
  } finally { setComposing(false) }
}
async function refresh(newDesc){
  if(!desc||rec) return;
  const t=position(), was=playing; pause(); const tok=++buildTok;
  if(newDesc){ try{ desc=await makeDesc(p=>overlay('Reading video frames…',p)); if(!desc.musicKey) desc.musicKey=currentLabel() }catch(e){ overlay(null); toast(e.message); return } }
  if(!(await rebuild(tok))) return;
  pos=Math.min(t,scene.dur); if(was) play(pos); else paintHistory(pos);
}

// ---------- settings ----------
document.querySelectorAll('.seg').forEach(seg=>seg.addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b||rec) return;
  seg.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));
  const k=seg.dataset.key; opt[k]=b.dataset.v; persist();
  if(k==='length'||k==='style'){updatePlan(); if(k==='length'&&S.src==='image') return; if(k==='style'&&S.src==='text') return; if(desc) refresh(true)}
  else if(k==='mood'){updatePlan(); refresh(false)}
  else if(k==='drums'||k==='tuning'){updatePlan(); refresh(false)}
  else if(k==='web'){WEB_ON=opt.web==='on'; updatePlan()}
}));
const sw=$('swatches');
Object.keys(PALETTES).forEach(name=>{const b=el('button','swatch'+(name===opt.palette?' on':'')); b.type='button'; b.title=PALETTES[name].name; b.setAttribute('aria-label',PALETTES[name].name+' colors');
  b.style.background=paletteCSS(name); b.onclick=()=>{ if(rec) return; opt.palette=name; persist(); sw.querySelectorAll('.swatch').forEach(x=>x.classList.toggle('on',x===b)); $('palName').textContent=PALETTES[name].name;
    buildLUT(name); recolorHistory(); if(scene) paintHistory(position()); else clearView() }; sw.append(b)});

// ---------- recording: a video of the prompt being typed, painted and heard ----------
function pickType(){return ['video/mp4;codecs=avc1.640028,mp4a.40.2','video/mp4;codecs=avc1,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm'].find(t=>window.MediaRecorder&&MediaRecorder.isTypeSupported(t))}
const SHAPES={wide:[1920,1080],square:[1080,1080],tall:[1080,1920]};
function vlayout(shape){
  const [W,Hh]=SHAPES[shape], big=shape==='wide', tall=shape==='tall';
  const L={W,H:Hh,pad:big?64:52,h1:tall?58:big?44:42,sub:tall?30:24,ph:tall?104:big?84:80,pf:tall?40:big?34:32,btnW:tall?220:big?210:190,scoreH:tall?190:big?118:110,footer:tall?120:big?58:66};
  const availW=W-2*L.pad, gapA=22, gapB=16;
  const fixed=L.h1+gapA+L.ph+gapA+gapB+L.scoreH;
  const availH=Hh-L.footer-L.pad-fixed;
  let sc=Math.min(availH/H,1.9), srcW=Math.min(VIEW_W+AXIS_W,availW/sc); sc=Math.min(sc,availW/srcW);
  L.srcW=srcW; L.sc=sc; L.dw=srcW*sc; L.dh=H*sc; L.dx=(W-L.dw)/2;
  const block=fixed+L.dh; L.top=Math.max(L.pad,(Hh-L.footer-block)/2);
  return L;
}
function rr(c,x,y,w,h,r){c.beginPath();c.roundRect(x,y,w,h,r)}
function drawVideo(){
  const L=rec.L, c=rec.cx, now=performance.now(), dx=L.dx, dw=L.dw;
  c.fillStyle='#0e0e10'; c.fillRect(0,0,L.W,L.H);
  let y=L.top;
  // header with logo
  const ls=L.h1*1.15; if(LOGO.complete) c.drawImage(LOGO,dx,y-4,ls,ls);
  c.textBaseline='alphabetic'; c.fillStyle='#eeeaf6'; c.font='700 '+L.h1+'px '+FONT; c.fillText('Overtone',dx+ls+16,y+L.h1*0.82);
  const bw=c.measureText('Overtone').width; c.fillStyle='#9c94ae'; c.font='400 '+L.sub+'px '+FONT;
  if(L.W>1200) c.fillText('music whose spectrogram paints your scene',dx+ls+16+bw+18,y+L.h1*0.82);
  if(rec.phase==='play'||rec.phase==='end'){c.textAlign='right'; c.fillText(fmt(position())+' / '+fmt(scene.dur),dx+dw,y+L.h1*0.82); c.textAlign='left'}
  y+=L.h1+22;
  // prompt box and Paint button
  const bx=dx+dw-L.btnW, iw=dw-L.btnW-14;
  rr(c,dx,y,iw,L.ph,12); c.fillStyle='#151517'; c.fill(); c.lineWidth=2; c.strokeStyle=rec.phase==='typing'?'#6f6a8f':'#2a2a2e'; c.stroke();
  c.save(); rr(c,dx,y,iw,L.ph,16); c.clip(); c.font='400 '+L.pf+'px '+FONT;
  const val=rec.box; c.fillStyle=val?'#eeeaf6':'#6f6882'; c.fillText(val||'Describe a scene…',dx+26,y+L.ph/2+L.pf*0.36);
  if((rec.phase==='intro'||rec.phase==='typing')&&(rec.phase==='typing'||Math.floor(now/530)%2===0)){const cx=dx+26+(val?c.measureText(val).width+3:0); c.fillStyle='#eeeaf6'; c.fillRect(cx,y+L.ph/2-L.pf*0.55,3,L.pf*1.1)}
  c.restore();
  const pressed=rec.phase==='press', inset=pressed?4:0;
  rr(c,bx+inset,y+inset,L.btnW-2*inset,L.ph-2*inset,12); c.fillStyle=pressed?'#d6844a':'#f39a52'; c.fill();
  c.fillStyle='#1b1206'; c.font='650 '+L.pf+'px '+FONT; c.textAlign='center'; c.fillText('Paint',bx+L.btnW/2,y+L.ph/2+L.pf*0.36); c.textAlign='left';
  y+=L.ph+22;
  // spectrogram (the newest part of the live view)
  c.save(); rr(c,dx,y,dw,L.dh,18); c.clip(); c.imageSmoothingQuality='high';
  const cols=L.srcW-AXIS_W, specW=cols*L.sc; c.fillStyle=bg(); c.fillRect(dx,y,specW,L.dh);
  if(hist&&(rec.phase==='play'||rec.phase==='end')){const end=position()*PPS, s0=end-cols, a=Math.max(0,s0), b=Math.min(end,hist.W);
    if(b>a) c.drawImage(hist.cv,a,0,b-a,H,dx+(a-s0)*L.sc,y,(b-a)*L.sc,L.dh)}
  c.drawImage(spec,VIEW_W,0,AXIS_W,H,dx+specW,y,AXIS_W*L.sc,L.dh);
  if(rec.phase==='play'){c.fillStyle='rgba(243,154,82,.5)'; c.fillRect(dx+specW-2,y,2,L.dh)}
  if(rec.phase==='end'){const a=Math.min(1,(now-rec.endAt)/700); c.fillStyle='rgba(10,9,16,'+(0.6*a)+')'; c.fillRect(dx,y,dw,L.dh);
    c.globalAlpha=a; c.textAlign='center'; const ls=Math.round(L.h1*1.7); if(LOGO.complete) c.drawImage(LOGO,dx+dw/2-ls/2,y+L.dh/2-ls-L.h1*1.9,ls,ls);
    c.fillStyle='#eeeaf6'; c.font='700 '+Math.round(L.h1*1.45)+'px '+FONT; c.fillText('Every shape here is sound.',dx+dw/2,y+L.dh/2);
    c.fillStyle='#8f8c95'; c.font='400 '+Math.round(L.sub*0.9)+'px '+FONT; c.fillText('Made with Overtone',dx+dw/2,y+L.dh/2+L.sub*4.3);
    c.fillStyle='#fca65e'; c.font='400 '+L.sub+'px '+FONT; c.fillText('“'+rec.label+'”',dx+dw/2,y+L.dh/2+L.sub*2.2); c.textAlign='left'; c.globalAlpha=1}
  c.restore(); rr(c,dx,y,dw,L.dh,18); c.strokeStyle='#272333'; c.lineWidth=2; c.stroke();
  y+=L.dh+16;
  // score, revealed as it plays
  c.save(); rr(c,dx,y,dw,L.scoreH,12); c.clip(); c.fillStyle='#07060b'; c.fillRect(dx,y,dw,L.scoreH);
  if(scoreBase&&(rec.phase==='play'||rec.phase==='end')){const px=position()/scene.dur*dw;
    c.globalAlpha=.14; c.drawImage(scoreBase,dx,y,dw,L.scoreH); c.globalAlpha=1;
    c.save(); c.beginPath(); c.rect(dx,y,px,L.scoreH); c.clip(); c.drawImage(scoreBase,dx,y,dw,L.scoreH); c.restore();
    c.fillStyle='#fca65e'; c.fillRect(dx+px-1.5,y,3,L.scoreH)}
  c.restore(); rr(c,dx,y,dw,L.scoreH,12); c.strokeStyle='#272333'; c.stroke();
  // footer
  c.fillStyle='#6f6882'; c.font='400 '+Math.round(L.sub*0.85)+'px '+FONT;
  c.fillText(L.W>1200?'No AI, no samples: the picture is a spectrogram of the music.':'The picture is a spectrogram of the music.',dx,L.H-L.footer/2+8);
}
async function recordDemo(){
  if(rec){rec.stop(); return}
  if(composing) return;
  try{ await recordInner() }
  catch(e){ console.error(e); try{rec&&rec.mr&&rec.mr.state!=='inactive'&&rec.mr.stop()}catch{} rec=null; setRecUI(false); setComposing(false); overlay(null); syncUI(); toast('Recording stopped: '+(e.message||e)) }
}
async function recordInner(){
  const type=pickType(); if(!type){toast('This browser can’t record video. Try Chrome or Safari.');return}
  ensureAudio(); if(ac.state==='suspended') await ac.resume();
  pause(); setRecUI(true); persist(); setComposing(true);
  let ok=false; try{ ok=await prepare(); if(ok){ overlay('Preparing the video…',0); await finishHistory(p=>overlay('Preparing the video…',p)); overlay(null) } } finally { setComposing(false) }
  if(!ok){setRecUI(false);return}
  clearView(); shown=0; pos=0; syncUI();
  const L=vlayout(opt.shape), cv=document.createElement('canvas'); cv.width=L.W; cv.height=L.H;
  let stopReq; const stopped=new Promise(r=>stopReq=r);
  const boxText=S.src==='text'?promptText():(S.src==='image'?'🖼  ':'🎞  ')+(S.src==='image'?S.imageName:S.videoName);
  rec={L,cv,cx:cv.getContext('2d'),phase:'intro',box:'',label,started:performance.now(),stop:()=>{rec.early=true;stopReq()}};
  drawVideo();
  const stream=new MediaStream([...cv.captureStream(60).getVideoTracks(),...recDest.stream.getAudioTracks()]);
  const chunks=[], mr=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:10e6,audioBitsPerSecond:192000});
  mr.ondataavailable=e=>e.data.size&&chunks.push(e.data);
  rec.mr=mr; mr.onerror=e=>toast('Recorder error: '+(e.error&&e.error.message||'unknown'));
  const done=new Promise(r=>mr.onstop=r); mr.start(500);
  const input=$('prompt'), typing=S.src==='text'; if(typing) input.value='';
  await Promise.race([sleep(900),stopped]);
  rec.phase='typing';
  for(const ch of boxText){ if(rec.early) break; rec.box+=ch; if(typing) input.value=rec.box; await sleep(typing?34+Math.random()*48:18) }
  rec.box=boxText; if(typing) input.value=boxText;
  if(!rec.early){await Promise.race([sleep(450),stopped]); rec.phase='press'; $('paint').classList.add('pressed'); await sleep(220); $('paint').classList.remove('pressed')}
  if(!rec.early){rec.phase='play'; const ended=new Promise(r=>endWaiters.push(r)); play(0); await Promise.race([ended,stopped]); pause()}
  rec.phase='end'; rec.endAt=performance.now(); await sleep(rec.early?400:2600);
  mr.stop(); await done;
  const blob=new Blob(chunks,{type:type.split(';')[0]}), ext=type.includes('mp4')?'mp4':'webm';
  if(rec.hidden) toast('This tab was hidden during recording, so the video may stutter. Keep it in front next time.');
  if(lastVideo) URL.revokeObjectURL(lastVideo.url);
  lastVideo={blob,ext,url:URL.createObjectURL(blob),name:slug(label)+'.'+ext,W:L.W,H:L.H};
  rec=null; setRecUI(false); syncUI(); showDone();
}
function setRecUI(on){
  document.body.classList.toggle('busy',on); $('record').classList.toggle('on',on);
  $('recLabel').textContent=on?'Stop':'Record video'; $('recPill').hidden=!on;
}
function showDone(){
  const v=$('vid'); v.src=lastVideo.url;
  const info=()=>$('vinfo').textContent=lastVideo.W+'×'+lastVideo.H+(isFinite(v.duration)?' · '+fmt(v.duration):'')+' · '+lastVideo.ext.toUpperCase()+' · '+(lastVideo.blob.size/1e6).toFixed(1)+' MB'+(lastVideo.ext==='webm'?' · X needs MP4, so record in Chrome or Safari':'');
  v.onloadedmetadata=info; info(); $('done').showModal();
}

// ---------- about ----------
(function(){
  $('sketchText').textContent='People who walk, run, race, throw (balls, javelins, frisbees, arrows), kick, jump hurdles, dance, swim, ride bikes and horses, fly kites, sit, read and cheer. '+
    SUBJECTS.filter(s=>s.words&&s.name!=='person').map(s=>s.name).join(', ')+', the sun, moon and stars, Olympic rings and stadiums, and about '+Object.keys(GLYPH).length+' everyday things traced from emoji, from elephants to guitars.';
  const gh=$('ghLink'); if(GITHUB_URL){gh.href=GITHUB_URL; gh.textContent='View on GitHub'} else {gh.removeAttribute('href'); gh.classList.add('disabled'); gh.textContent='GitHub · coming soon'}
})();

// ---------- wiring ----------
const saveWav=()=>audio&&download(wav(audio,ac.sampleRate),slug(label)+'.wav');
const saveVideo=()=>lastVideo&&download(lastVideo.blob,lastVideo.name);
$('form').addEventListener('submit',e=>{e.preventDefault(); paint()});
$('prompt').addEventListener('input',()=>{updatePlan(); persist()});
$('remix').addEventListener('click',()=>{ if(rec||composing) return; opt.seed=(opt.seed+1)%600; persist(); updatePlan(); paint() });
$('restart').addEventListener('click',()=>{ if(!scene) return; if(playing) play(0); else seek(0) });
$('copyCap').addEventListener('click',async()=>{const t='“'+label+'”, painted entirely with sound. Every shape you see is the music’s spectrogram.';
  try{await navigator.clipboard.writeText(t); toast('Caption copied')}catch{toast(t)}});
document.addEventListener('visibilitychange',()=>{ if(rec&&document.hidden) rec.hidden=true });
window.addEventListener('error',e=>{ overlay(null); toast('Something went wrong: '+(e.message||'unknown error')) });
window.addEventListener('unhandledrejection',e=>{ overlay(null); toast('Something went wrong: '+((e.reason&&e.reason.message)||e.reason)) });
$('exampleList').addEventListener('click',e=>{const b=e.target.closest('button'); if(!b)return; $('examples').open=false; $('prompt').value=b.textContent; updatePlan(); setSrc('text'); paint()});
document.addEventListener('click',e=>{if(!e.target.closest('#examples')) $('examples').open=false});
document.querySelectorAll('.src [data-src]').forEach(b=>b.addEventListener('click',()=>{ if(!rec) setSrc(b.dataset.src) }));
$('imgFile').addEventListener('change',e=>{const f=e.target.files[0]; if(f) loadImage(f); e.target.value=''});
$('vidFile').addEventListener('change',e=>{const f=e.target.files[0]; if(f) loadVideo(f); e.target.value=''});
$('play').addEventListener('click',togglePlay);
$('loop').addEventListener('click',()=>{loop=!loop; $('loop').setAttribute('aria-pressed',loop)});
$('vol').addEventListener('input',e=>{ if(master) master.gain.setTargetAtTime(+e.target.value,ac.currentTime,0.02) });
$('wav').addEventListener('click',saveWav); $('dlwav2').addEventListener('click',saveWav);
$('dlvid').addEventListener('click',saveVideo); $('dlvid2').addEventListener('click',saveVideo);
$('record').addEventListener('click',recordDemo);
$('aboutBtn').addEventListener('click',()=>$('about').showModal());
document.querySelectorAll('dialog [data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d) d.close()}));
const toggleFs=()=>document.fullscreenElement?document.exitFullscreen():$('stage').requestFullscreen();
$('fs').addEventListener('click',toggleFs);
document.addEventListener('dragover',e=>{e.preventDefault(); document.body.classList.add('dragging')});
document.addEventListener('dragleave',e=>{if(!e.relatedTarget) document.body.classList.remove('dragging')});
document.addEventListener('drop',e=>{e.preventDefault(); document.body.classList.remove('dragging'); if(rec) return;
  const f=[...e.dataTransfer.files][0]; if(!f) return;
  if(f.type.startsWith('image/')) loadImage(f); else if(f.type.startsWith('video/')) loadVideo(f); else toast('Drop an image or a video.')});
document.addEventListener('keydown',e=>{
  if(rec||e.target.matches('input[type=text]')||e.metaKey||e.ctrlKey||document.querySelector('dialog[open]')) return;
  if(e.code==='Space'){e.preventDefault(); togglePlay()}
  else if(e.key==='ArrowLeft'){e.preventDefault(); seek(position()-2)}
  else if(e.key==='ArrowRight'){e.preventDefault(); seek(position()+2)}
  else if(e.key==='f'||e.key==='F') toggleFs();
});
document.querySelectorAll('.seg[data-key]').forEach(seg=>seg.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.v===opt[seg.dataset.key])));
$('palName').textContent=PALETTES[opt.palette].name; clearView();
setSrc('text'); syncUI();
window.overtone={compose,buildScene,render,wav,processPicture,recordDemo,paint,seek,play,pause,opt,S,
  state:()=>({playing,pos:scene?position():0,dur:scene&&scene.dur,histDone:hist?hist.done.reduce((a,b)=>a+b,0):0,histW:hist&&hist.W}),
  lastVideo:()=>lastVideo, setSrc, loadImage, loadVideo};










