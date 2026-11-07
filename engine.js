// engine.js: frequency mapping, music, synthesis and spectrum maths for Overtone.
// No UI code and no AI here: everything is plain arithmetic that runs in the browser.
'use strict';

// ---------- the picture's coordinate system: x is time, y is pitch on a log scale ----------
const H=512, VIEW_W=1200, AXIS_W=60, PPS=120, FMIN=40, FMAX=16000, LN=Math.log(FMAX/FMIN);
const yOf=f=>H*(1-Math.log(f/FMIN)/LN), fOf=y=>FMIN*Math.exp((1-y/H)*LN);
const IMG_LO=500, IMG_HI=14000, SKY=yOf(IMG_HI), GROUND=yOf(IMG_LO);
const mtof=m=>440*Math.pow(2,(m-69)/12), ftom=f=>69+12*Math.log2(f/440);
const FONT='-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';
const LENGTHS={short:15,medium:30,long:60,epic:120};
const yieldNow=()=>new Promise(r=>setTimeout(r,0));

// ---------- music: every prompt gets its own key, tempo, progression, bass, arpeggio, drums and melody ----------
function hashStr(str){let h=2166136261>>>0; for(const ch of str){h^=ch.codePointAt(0); h=Math.imul(h,16777619)>>>0} h^=h>>>15; h=Math.imul(h,2246822507)>>>0; h^=h>>>13; return h>>>0}
const PROGS={
  major:[[[0,1],[7,1],[9,0],[5,1]],[[0,1],[5,1],[7,1],[5,1]],[[0,1],[9,0],[5,1],[7,1]],[[0,1],[4,0],[5,1],[7,1]],[[0,1],[2,0],[5,1],[7,1]],[[0,1],[7,1],[5,1],[0,1]],[[5,1],[7,1],[0,1],[9,0]],[[0,1],[10,1],[5,1],[0,1]]],
  minor:[[[0,0],[8,1],[3,1],[10,1]],[[0,0],[5,0],[8,1],[7,1]],[[0,0],[10,1],[8,1],[7,1]],[[0,0],[3,1],[10,1],[5,0]],[[0,0],[8,1],[5,0],[7,1]],[[0,0],[0,0],[8,1],[10,1]],[[0,0],[7,0],[8,1],[5,0]]]};
const KEY_NAMES=['A','B♭','B','C','C♯','D','E♭','E','F','F♯','G','A♭'];
const DRUM_NAMES=['steady beat','four on the floor','half time','shuffle','no drums'];
function musicFor(desc,o){
  const minor=o.mood==='auto'?!!desc.minor:o.mood==='night';
  const h=hashStr((desc.musicKey||'overtone')+'#'+(o.seed||0)), bits=(sh,n)=>(h>>>sh)%n;
  const energy=desc.energy==null?0.5:desc.energy;
  let bpm=Math.round(64+energy*64+bits(3,25)-12); if(o.mood==='night') bpm=Math.round(bpm*0.9); if(o.mood==='day') bpm=Math.round(bpm*1.05);
  bpm=Math.max(60,Math.min(140,bpm));
  const key=33+bits(7,12), set=PROGS[minor?'minor':'major'], pi=bits(11,set.length);
  const prog=set[pi], progB=set[(pi+1+bits(14,set.length-1))%set.length];
  const drumStyle=o.drums==='off'?4:energy>0.7?(bits(17,3)?1:0):energy<0.3?(bits(17,2)?2:4):[0,2,3,0][bits(17,4)];
  const deg=minor?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11];
  return {minor,bpm,key,prog,progB,deg,drumStyle,energy,beat:60/bpm,bar:240/bpm,
    bassStyle:bits(19,4), arpStyle:bits(21,5), sixteenth:energy>0.62&&bits(23,2)===0, arpDecay:[6,3.5,9][bits(25,3)],
    melody:Array.from({length:8},(_,i)=>[0,2,4,1,3,5,4,2,6,0][((h>>>(i*4))+i)%10]),
    label:KEY_NAMES[(key-33)%12]+(minor?' minor':' major')+' · '+bpm+' bpm · '+DRUM_NAMES[drumStyle]};
}
const barLength=(desc,o)=>musicFor(desc||{},o||{mood:'auto'}).bar;
const estimateDur=(rawDur,desc,o)=>{const bar=barLength(desc,o); return Math.max(4,Math.ceil(rawDur/bar))*bar};
function buildScene(desc,o){
  const M=musicFor(desc,o), {beat,bar,key,minor,deg}=M;
  const bars=Math.max(4,Math.ceil(desc.rawDur/bar)), dur=bars*bar;
  const chords=[], events=[];
  const ARPS=[[0,1,2,1,2,1,0,1],[0,1,2,3,2,1,0,1],[0,2,1,3,0,2,1,3],[3,2,1,0,3,2,1,0],[0,2,3,2,0,2,3,2]];
  const reg=(m,lo,hi)=>{while(mtof(m)<lo)m+=12; while(mtof(m)>=hi)m-=12; return m};
  for(let b=0;b<bars;b++){
    const sec=b<8?0:Math.floor(b/8)%3;            // 0 = verse, 1 = lift, 2 = breakdown
    const [off,maj]=(sec===1?M.progB:M.prog)[b%4];
    let bass=key+off; if(bass>key+6) bass-=12;
    const t0=b*bar, third=maj?4:3; chords.push({t0,t1:t0+bar,bass});
    if(b===bars-1){events.push({type:'bass',t:t0,m:bass,d:bar*0.8});continue}
    const bs=sec===2?2:M.bassStyle;
    if(bs===0) [0,0,7,12].forEach((iv,i)=>events.push({type:'bass',t:t0+i*beat,m:bass+iv,d:beat*0.8}));
    else if(bs===1) [0,third,7,third+5].forEach((iv,i)=>events.push({type:'bass',t:t0+i*beat,m:bass+iv,d:beat*0.85}));
    else if(bs===2){events.push({type:'bass',t:t0,m:bass,d:beat*1.8}); events.push({type:'bass',t:t0+2*beat,m:bass+7,d:beat*1.8})}
    else [[0,0],[1.5,0],[2.5,7],[3,12]].forEach(([bt,iv])=>events.push({type:'bass',t:t0+bt*beat,m:bass+iv,d:beat*0.6}));
    if(b>0){ const ds=sec===2&&M.drumStyle!==4?2:M.drumStyle;
      if(ds===0){[0,2].forEach(i=>events.push({type:'kick',t:t0+i*beat})); for(let i=0;i<4;i++) events.push({type:'hat',t:t0+(i+0.5)*beat})}
      else if(ds===1){for(let i=0;i<4;i++){events.push({type:'kick',t:t0+i*beat}); events.push({type:'hat',t:t0+(i+0.5)*beat})}}
      else if(ds===2){events.push({type:'kick',t:t0}); events.push({type:'tom',t:t0+2*beat}); for(let i=0;i<4;i++) events.push({type:'hat',t:t0+(i+0.5)*beat})}
      else if(ds===3){[0,2].forEach(i=>events.push({type:'kick',t:t0+i*beat})); events.push({type:'kick',t:t0+3.66*beat}); for(let i=0;i<4;i++) events.push({type:'hat',t:t0+(i+0.66)*beat})}
    }
    if(b>=2){
      const tones=[0,third,7,12];
      if(sec===1){ // the lift carries a melody of its own instead of the arpeggio
        for(let j=0;j<4;j++){const d=M.melody[(b*4+j)%8]; const m=reg(key+12+deg[d%7]+(d>=7?12:0),262,494); events.push({type:'lead',t:t0+j*beat,m,d:beat*0.9})}
      } else {
        const pat=ARPS[M.arpStyle], step=M.sixteenth&&sec===0?beat/4:beat/2, n=Math.round(bar/step);
        for(let j=0;j<n;j++){ if(sec===2&&j%2) continue; const m=reg(bass+tones[pat[j%8]],262,520); events.push({type:'arp',t:t0+j*step,m,d:sec===2?0.4:Math.min(0.18,step*0.9),dec:M.arpDecay}) }
      }
    }
  }
  // melodies that trace motion (a thrown ball, a hopping rabbit, a rocket), snapped to the key
  const snap=f=>{const m=Math.round(ftom(f)); for(const d of [0,-1,1,-2,2]){if(deg.includes((((m+d-key)%12)+12)%12))return mtof(m+d)} return mtof(m)};
  for(const a of desc.arcs||[]){
    const apex=a.apex==null?(a.y0+a.y1)/2:a.apex, hump=(a.y0+a.y1)/2-apex, step=beat/2;
    for(let tt=Math.ceil(a.ta/step)*step; tt<=a.tb; tt+=step){const u=(tt-a.ta)/(a.tb-a.ta); events.push({type:'ping',t:tt,f:snap(fOf(a.y0+(a.y1-a.y0)*u-4*hump*u*(1-u)))})}
  }
  // the picture itself
  const W=Math.ceil(dur*PPS)+2, cv=document.createElement('canvas'); cv.width=W; cv.height=H;
  const c=cv.getContext('2d'); c.fillStyle='#000'; c.fillRect(0,0,W,H);
  desc.ops.forEach(op=>{c.save();op(c,W);c.restore()});
  const px=c.getImageData(0,0,W,H).data, lum=new Float32Array(W*H);
  for(let i=0;i<W*H;i++) lum[i]=px[i*4]/255;
  return {dur,W,canvas:cv,lum,chords,events,bpm:M.bpm,bar,minor,music:M};
}

// ---------- synthesis: every bright pixel becomes a sine at that pixel's pitch ----------
function rowsFor(freqs){
  const ys=freqs.map(yOf), rows=[];
  ys.forEach((y,i)=>{
    const yU=i<ys.length-1?ys[i+1]:y-1.5, yL=i>0?ys[i-1]:y+1.5;
    let a=Math.ceil(Math.max(y-3,(y+yU)/2)), b=Math.floor(Math.min(y+3,(y+yL)/2));
    if(a>b){a=b=Math.round(y)} rows.push({f:freqs[i],a:Math.max(0,a),b:Math.min(H-1,b)});
  });
  return rows;
}
// "Musical" tuning: picture rows sit on the overtones of the current chord's root
function harmonicFreqs(bassMidi){
  let r=mtof(bassMidi); while(r>=55)r/=2; while(r<27.5)r*=2;
  const out=[]; let lastY=1e9;
  for(let n=Math.ceil(IMG_LO/r); n*r<=IMG_HI; n++){const y=yOf(n*r); if(lastY-y>=1.5){out.push(n*r);lastY=y}}
  return out;
}
function sharpFreqs(){const out=[]; for(let y=GROUND;y>=SKY;y-=1.5)out.push(fOf(y)); return out}

async function render(scene,sr,mode,onProgress){
  const N=Math.ceil((scene.dur+0.3)*sr), out=new Float32Array(N);
  const TB=16384, SIN=new Float32Array(TB); for(let i=0;i<TB;i++)SIN[i]=Math.sin(2*Math.PI*i/TB);
  const {lum,W}=scene, XF=0.03, A0=0.03, DB=42, spc=sr/PPS;
  const segs=mode==='harmonic'?scene.chords.map(ch=>({t0:ch.t0,t1:ch.t1,rows:rowsFor(harmonicFreqs(ch.bass))}))
                             :[{t0:0,t1:scene.dur,rows:rowsFor(sharpFreqs())}];
  const totalRows=segs.reduce((a,s)=>a+s.rows.length,0); let doneRows=0;
  for(let si=0;si<segs.length;si++){
    const sg=segs[si], first=si===0, last=si===segs.length-1;
    const ta=first?0:sg.t0-XF, tb=last?scene.dur:sg.t1+XF;
    const x0=Math.max(0,Math.floor(ta*PPS)), x1=Math.min(W-2,Math.ceil(tb*PPS));
    const sA=Math.ceil(ta*sr), sB=Math.min(N,Math.ceil(tb*sr));
    for(const row of sg.rows){
      if(++doneRows%60===0){ onProgress&&onProgress(doneRows/totalRows*0.95); await yieldNow() }
      const amp=new Float32Array(x1-x0+2); let any=false;
      for(let x=x0;x<=x1+1;x++){let s=0;for(let y=row.a;y<=row.b;y++)s+=lum[y*W+x];
        const l=s/(row.b-row.a+1), a=l<0.04?0:A0*Math.pow(10,(l-1)*DB/20); amp[x-x0]=a; if(a)any=true}
      if(!any) continue;
      const inc=row.f*TB/sr; let ph=Math.random()*TB;
      for(let x=x0;x<=x1;x++){
        const a0=amp[x-x0], a1=amp[x-x0+1];
        const sa=Math.max(Math.ceil(x*spc),sA), sb=Math.min(Math.ceil((x+1)*spc),sB);
        if(sb<=sa) continue;
        if(a0===0&&a1===0){ph=(ph+inc*(sb-sa))%TB;continue}
        const k=(a1-a0)/spc, xs=x*spc;
        for(let s=sa;s<sb;s++){
          let g=1; const t=s/sr;
          if(!first&&t<sg.t0+XF) g=(t-(sg.t0-XF))/(2*XF);
          if(!last&&t>sg.t1-XF) g=Math.min(g,((sg.t1+XF)-t)/(2*XF));
          out[s]+=(a0+k*(s-xs))*g*SIN[ph|0]; ph+=inc; if(ph>=TB)ph-=TB;
        }
      }
    }
  }
  // smooth (raised-cosine) edges everywhere: a hard start or stop is a click, and a click paints a vertical line
  const ease=u=>u<=0?0:u>=1?1:0.5-0.5*Math.cos(Math.PI*u);
  const tone=(t,f,d,amp,partials,att,rel,decay)=>{
    const s0=Math.floor(t*sr), n=Math.floor((d+rel)*sr);
    for(let i=0;i<n&&s0+i<N;i++){const tt=i/sr;
      const e=ease(tt/att)*Math.exp(-decay*Math.max(0,tt-att))*(tt>d?1-ease((tt-d)/rel):1);
      let v=0; for(const [m,gn] of partials) v+=gn*Math.sin(2*Math.PI*f*m*tt); out[s0+i]+=amp*e*v}
  };
  for(const e of scene.events){
    if(e.type==='bass') tone(e.t,mtof(e.m),e.d,0.2,[[1,1],[2,.45],[3,.2]],0.02,0.08,1.2);
    else if(e.type==='arp') tone(e.t,mtof(e.m),e.d,0.06,[[1,1]],0.008,0.12,e.dec||6);
    else if(e.type==='lead') tone(e.t,mtof(e.m),e.d,0.075,[[1,1]],0.03,0.14,1.6);
    else if(e.type==='tom'){const s0=Math.floor(e.t*sr), L=0.3; let ph=0; for(let i=0;i<L*sr&&s0+i<N;i++){const tt=i/sr; ph+=2*Math.PI*(95+70*Math.exp(-tt/0.04))/sr; out[s0+i]+=0.26*ease(tt/0.004)*(1-ease((tt-L+0.06)/0.06))*Math.exp(-tt/0.12)*Math.sin(ph)}}
    else if(e.type==='ping') tone(e.t,e.f,0.12,0.09,[[1,1]],0.008,0.08,14);
    else if(e.type==='kick'){const s0=Math.floor(e.t*sr), L=0.4; let ph=0; for(let i=0;i<L*sr&&s0+i<N;i++){const tt=i/sr; ph+=2*Math.PI*(45+105*Math.exp(-tt/0.03))/sr; out[s0+i]+=0.35*ease(tt/0.004)*(1-ease((tt-L+0.08)/0.08))*Math.exp(-tt/0.16)*Math.sin(ph)}}
    else if(e.type==='hat'){const s0=Math.floor(e.t*sr); for(let j=0;j<5;j++){const f=14600+j*230+Math.random()*80; for(let i=0;i<0.09*sr&&s0+i<N;i++){const tt=i/sr; out[s0+i]+=0.012*ease(tt/0.006)*(1-ease((tt-0.06)/0.03))*Math.exp(-tt/0.025)*Math.sin(2*Math.PI*f*tt)}}}
  }
  let peak=0; for(let i=0;i<N;i++)peak=Math.max(peak,Math.abs(out[i]));
  const gain=0.89/(peak||1); for(let i=0;i<N;i++)out[i]*=gain;
  onProgress&&onProgress(1);
  return out;
}

// ---------- colors ----------
const PALETTES={
  magma:{name:'Magma',stops:[[0,0,4],[28,16,68],[79,18,123],[129,37,129],[181,54,122],[229,80,100],[251,135,97],[254,194,135],[252,253,191]]},
  ember:{name:'Ember',stops:[[0,0,0],[40,6,6],[110,16,8],[180,40,6],[228,90,10],[250,150,30],[255,210,90],[255,250,220]]},
  viridis:{name:'Viridis',stops:[[0,0,0],[68,1,84],[59,82,139],[33,145,140],[94,201,98],[253,231,37]]},
  aurora:{name:'Aurora',stops:[[0,0,2],[0,30,40],[0,80,70],[0,150,110],[60,210,150],[160,250,200],[240,255,245]]},
  ice:{name:'Ice',stops:[[0,0,6],[6,14,40],[10,34,82],[14,66,128],[24,106,168],[52,150,200],[110,196,224],[186,232,244],[250,255,255]]},
  neon:{name:'Neon',stops:[[0,0,0],[30,6,60],[90,10,130],[200,30,200],[255,60,170],[60,200,255],[200,250,255]]},
  mono:{name:'Mono',stops:[[0,0,0],[255,255,255]]},
  paper:{name:'Paper',stops:[[248,245,238],[200,192,182],[120,108,104],[50,40,48],[12,8,16]]},
};
const LUT=new Uint8ClampedArray(768);
function buildLUT(name){const P=PALETTES[name].stops,n=P.length-1; for(let i=0;i<256;i++){const v=i/255*n,k=Math.min(n-1,Math.floor(v)),u=v-k; for(let j=0;j<3;j++)LUT[i*3+j]=P[k][j]+(P[k+1][j]-P[k][j])*u}}
const paletteCSS=name=>'linear-gradient(90deg,'+PALETTES[name].stops.map(s=>'rgb('+s.join(',')+')').join(',')+')';
buildLUT('magma');
const DB_MIN=-100, DB_MAX=-28;

// ---------- the same spectrum the browser's AnalyserNode computes (Blackman window, 4096-point FFT) ----------
const FN=4096, LOG2N=12, fftRev=new Uint16Array(FN), cosT=new Float64Array(FN/2), sinT=new Float64Array(FN/2), fftWin=new Float64Array(FN);
for(let i=0;i<FN;i++){let r=0;for(let b=0;b<LOG2N;b++)r|=((i>>b)&1)<<(LOG2N-1-b);fftRev[i]=r; fftWin[i]=0.42-0.5*Math.cos(2*Math.PI*i/FN)+0.08*Math.cos(4*Math.PI*i/FN)}
for(let k=0;k<FN/2;k++){cosT[k]=Math.cos(2*Math.PI*k/FN);sinT[k]=Math.sin(2*Math.PI*k/FN)}
const fre=new Float64Array(FN), fim=new Float64Array(FN), fdb=new Float32Array(FN/2+1);
function spectrumAt(data,end){
  for(let i=0;i<FN;i++){const s=end-FN+i; fre[fftRev[i]]=(s>=0&&s<data.length)?data[s]*fftWin[i]:0; fim[fftRev[i]]=0}
  for(let size=2;size<=FN;size<<=1){const half=size>>1, step=FN/size;
    for(let i=0;i<FN;i+=size) for(let j=0,k=0;j<half;j++,k+=step){const a=i+j,b=a+half;
      const tr=fre[b]*cosT[k]+fim[b]*sinT[k], ti=fim[b]*cosT[k]-fre[b]*sinT[k];
      fre[b]=fre[a]-tr; fim[b]=fim[a]-ti; fre[a]+=tr; fim[a]+=ti}}
  for(let k=0;k<=FN/2;k++){const re=fre[k%FN],im=fim[k%FN]; fdb[k]=20*Math.log10(Math.sqrt(re*re+im*im)/FN+1e-12)}
  return fdb;
}

// ---------- WAV export ----------
function wav(data,sr){
  const b=new ArrayBuffer(44+data.length*2),v=new DataView(b),w=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i))};
  w(0,'RIFF');v.setUint32(4,36+data.length*2,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
  v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,data.length*2,true);
  for(let i=0;i<data.length;i++)v.setInt16(44+i*2,Math.max(-1,Math.min(1,data[i]))*32767,true);
  return new Blob([b],{type:'audio/wav'});
}




