// sketchbook.js: Overtone's drawings and the scene planner.
// There is no AI here. The planner reads the prompt for people, actions, objects, places and things,
// picks matching drawings, and lays them out in time. Unknown words become lettering.
// Everything is white ink on black: brightness becomes loudness, height becomes pitch, left to right becomes time.
'use strict';

const ink=(c,a=1)=>{c.strokeStyle=c.fillStyle='rgba(255,255,255,'+a+')'};
function line(c,x1,y1,x2,y2){c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke()}
function circ(c,x,y,r,fill){c.beginPath();c.arc(x,y,r,0,Math.PI*2);fill?c.fill():c.stroke()}
function oval(c,x,y,rx,ry,rot,fill){c.beginPath();c.ellipse(x,y,rx,ry,rot,0,Math.PI*2);fill?c.fill():c.stroke()}
function poly(c,pts,fill){c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();fill?c.fill():c.stroke()}
function cut(c,fn){c.save();c.globalCompositeOperation='destination-out';ink(c,1);fn();c.restore()}
function pen(c,w=7,a=1){c.lineWidth=w;c.lineCap='round';c.lineJoin='round';ink(c,a)}
function blob(c,circles,a){ink(c,a);c.beginPath();for(const [x,y,r] of circles){c.moveTo(x+r,y);c.arc(x,y,r,0,Math.PI*2)}c.fill()}
function leg(c,hx,hy,a,len,foot=7){const ex=hx+Math.sin(a)*len, ey=hy+Math.cos(a)*len; line(c,hx,hy,ex,ey); if(foot) line(c,ex,ey,ex+foot,ey)}
function rng(seed){let s=Math.abs(Math.round(seed))%2147483646+1;return()=>(s=(s*16807)%2147483647)/2147483647}
const G=()=>GROUND-2;

// ---------- people: a jointed figure with named poses ----------
// angles in degrees from straight down; positive swings toward the way the figure faces.
// a = [back arm, front arm] as [upper, fore]; l = [back leg, front leg] as [thigh, shin]; t = torso lean
const POSES={
  stand:{t:0,a:[[-10,-4],[10,4]],l:[[-6,-6],[6,6]]},
  walkA:{t:2,a:[[-26,-12],[26,46]],l:[[-22,-12],[24,6]]},
  walkB:{t:2,a:[[24,44],[-24,-10]],l:[[20,2],[-20,-30]]},
  runA:{t:16,a:[[-50,25],[60,130]],l:[[-30,-95],[62,-8]]},
  runB:{t:16,a:[[60,130],[-50,25]],l:[[62,-8],[-30,-95]]},
  carryA:{t:14,a:[[-112,-168],[60,130]],l:[[-30,-95],[62,-8]]},
  carryB:{t:14,a:[[-112,-168],[-45,25]],l:[[62,-8],[-30,-95]]},
  windup:{t:-14,a:[[-102,-96],[95,112]],l:[[-32,-28],[34,26]]},
  release:{t:24,a:[[155,122],[-45,-20]],l:[[-42,-75],[30,10]]},
  kick:{t:-10,a:[[-70,-50],[70,55]],l:[[2,2],[82,72]]},
  jump:{t:14,a:[[155,170],[140,165]],l:[[75,-20],[55,-35]],lift:56},
  cheer:{t:0,a:[[-150,-168],[150,168]],l:[[-8,-8],[8,8]]},
  wave:{t:0,a:[[-10,-4],[150,172]],l:[[-6,-6],[6,6]]},
  danceA:{t:-8,a:[[-150,-120],[70,140]],l:[[-28,-4],[30,70]]},
  danceB:{t:8,a:[[60,150],[-135,-170]],l:[[34,-40],[-14,-14]]},
  danceC:{t:0,a:[[-95,-150],[95,150]],l:[[-22,-22],[22,22]]},
  sit:{t:-4,a:[[25,70],[35,80]],l:[[88,2],[94,6]],seat:true},
  read:{t:6,a:[[40,120],[50,128]],l:[[88,2],[94,6]],seat:true},
  ride:{t:4,a:[[40,95],[50,100]],l:[[70,8],[60,0]]},
  cycle:{t:30,a:[[40,0],[30,-5]],l:[[10,-10],[50,-15]]},
  hold:{t:0,a:[[-10,-4],[150,162]],l:[[-6,-6],[6,6]]},
  swing:{t:-8,a:[[92,98],[96,100]],l:[[-24,-16],[26,10]]},
  carry:{t:2,a:[[-26,-12],[40,120]],l:[[-22,-12],[24,6]]},
  carry2:{t:2,a:[[24,44],[40,120]],l:[[20,2],[-20,-30]]},
  offer:{t:0,a:[[-12,-4],[40,120]],l:[[-6,-6],[6,6]]},
  bite:{t:-3,a:[[-12,-4],[60,205]],l:[[-6,-6],[6,6]]},
  strum:{t:0,a:[[30,100],[45,115]],l:[[-8,-8],[8,8]]},
  sing:{t:-6,a:[[-25,-70],[60,205]],l:[[-6,-6],[6,6]]},
  pet:{t:24,a:[[-10,-4],[38,28]],l:[[-16,-10],[14,8]]},
  hug:{t:6,a:[[78,96],[86,104]],l:[[-6,-6],[6,6]]},
  reach:{t:8,a:[[-12,-4],[76,86]],l:[[-12,-6],[12,6]]},
  slump:{t:16,a:[[4,2],[8,4]],l:[[-4,-4],[4,4]]},
  cry:{t:12,a:[[55,205],[60,208]],l:[[-4,-4],[4,4]]},
  think:{t:0,a:[[40,90],[50,200]],l:[[-6,-6],[6,6]]},
  box:{t:8,a:[[50,150],[70,160]],l:[[-24,-18],[24,12]]},
  punch:{t:14,a:[[50,150],[90,92]],l:[[-30,-22],[28,12]]},
  talk:{t:0,a:[[-10,-4],[50,100]],l:[[-6,-6],[6,6]]},
  yell:{t:14,a:[[-40,-60],[60,110]],l:[[-16,-10],[16,8]]},
  fly:{t:84,a:[[96,96],[92,92]],l:[[-86,-90],[-80,-86]]},
};
const LEN={th:33,sh:31,torso:56,ua:27,fa:26,neck:7,head:16};
let ACTOR=null;   // who the scene is about: costume, size and companions, applied to every figure that isn't marked "other"
function poseGeom(x,o={}){
  if(ACTOR&&!o.other&&!o.companion&&o.scale==null) o={...o,scale:ACTOR.scale};
  const s=o.scale||1, L={th:LEN.th*s,sh:LEN.sh*s,torso:LEN.torso*s,ua:LEN.ua*s,fa:LEN.fa*s,neck:LEN.neck*s,head:LEN.head*s};
  const P=POSES[o.pose]||POSES.stand, f=o.facing||1;
  const v=(a,l)=>[Math.sin(a*Math.PI/180)*f*l,Math.cos(a*Math.PI/180)*l], add=(p,q)=>[p[0]+q[0],p[1]+q[1]];
  const legs=P.l.map(([a,b])=>{const k=v(a,L.th); return [k,add(k,v(b,L.sh))]});
  const sh=v(180-P.t,L.torso), hd=v(180-P.t,L.torso+L.neck+L.head);
  const arms=P.a.map(([u,w])=>{const e=add(sh,v(u,L.ua)); return [e,add(e,v(w,L.fa))]});
  const g=o.ground!=null?o.ground:G();
  const hy=o.hipY!=null?o.hipY:P.seat?g-L.sh-3:g-Math.max(legs[0][1][1],legs[1][1][1])-2-(P.lift||0)*s-(o.lift||0);
  const T=p=>[x+p[0],hy+p[1]];
  return {f,s,L,hip:[x,hy],sh:T(sh),head:T(hd),arms:arms.map(a=>a.map(T)),legs:legs.map(l=>l.map(T))};
}
function person(c,x,o={}){
  const A=ACTOR&&!o.other&&!o.companion?ACTOR:null;
  if(A){o={...o}; if(o.outfit==null) o.outfit=A.outfit; if(o.scale==null) o.scale=A.scale;
    if(A.group&&A.group.length&&!o.solo&&o.hipY==null&&o.ground==null){const f0=o.facing||1;
      A.group.forEach((g,k)=>{c.save(); c.globalAlpha=.62; person(c,x-f0*(48+k*44),{...o,companion:true,kind:g.kind,outfit:g.outfit,scale:g.scale||1,hold:null,book:false}); c.restore()})}}
  const P=poseGeom(x,o), f=P.f, s=P.s, kind=o.kind||'man';
  const limb=(from,[j,e],a)=>{pen(c,8*s,a);c.beginPath();c.moveTo(from[0],from[1]);c.lineTo(j[0],j[1]);c.lineTo(e[0],e[1]);c.stroke()};
  const foot=(e,a)=>{pen(c,7*s,a);line(c,e[0],e[1],e[0]+f*9*s,e[1])};
  if(o.outfit==='cape') drawOutfit(c,P,'cape');
  limb(P.hip,P.legs[0],.72); foot(P.legs[0][1],.72); limb(P.sh,P.arms[0],.72);
  const ux=(P.sh[0]-P.hip[0])/P.L.torso, uy=(P.sh[1]-P.hip[1])/P.L.torso, nx=-uy, ny=ux;
  if(kind==='girl'){ink(c,.85); poly(c,[[P.sh[0]+nx*7*s,P.sh[1]+ny*7*s],[P.sh[0]-nx*7*s,P.sh[1]-ny*7*s],[P.hip[0]-ux*16*s-nx*24*s,P.hip[1]-uy*16*s-ny*24*s],[P.hip[0]-ux*16*s+nx*24*s,P.hip[1]-uy*16*s+ny*24*s]],true)}
  else {pen(c,14*s,.85); line(c,P.hip[0]+ux*4*s,P.hip[1]+uy*4*s,P.sh[0]-ux*3*s,P.sh[1]-uy*3*s)}
  limb(P.hip,P.legs[1],1); foot(P.legs[1][1],1); limb(P.sh,P.arms[1],1);
  const hr=P.L.head;
  pen(c,7*s); line(c,P.sh[0],P.sh[1],P.head[0]-ux*12*s,P.head[1]-uy*12*s);
  const [hx,hy]=P.head; ink(c,1); circ(c,hx,hy,hr,true);
  cut(c,()=>circ(c,hx+f*7*s,hy-2*s,2.6*s,true));
  pen(c,5*s); c.beginPath();
  if(kind==='girl'){c.arc(hx,hy-1,hr+3*s,Math.PI*0.9,Math.PI*2.1); c.stroke(); ink(c,.9); oval(c,hx-f*19*s,hy+8*s,6*s,16*s,f*0.35,true)}
  else {c.arc(hx,hy-1,hr+2.5*s,Math.PI*1.05,Math.PI*1.95); c.stroke()}
  if(o.outfit&&o.outfit!=='cape') drawOutfit(c,P,o.outfit);
  if(o.medal){pen(c,2.5,.9); line(c,P.sh[0]-6,P.sh[1]-2,P.sh[0]+2,P.sh[1]+20); line(c,P.sh[0]+8,P.sh[1]-2,P.sh[0]+2,P.sh[1]+20); ink(c,1); circ(c,P.sh[0]+2,P.sh[1]+25,7,true)}
  if(o.hold){const [ex,ey]=P.arms[o.hold.hand||0][1]; c.save(); c.translate(ex,ey); c.scale(f,1); c.rotate(o.hold.ang||0); (OBJ[o.hold.obj]||OBJ.ball).draw(c); c.restore()}
  if(o.book){const [ex,ey]=P.arms[1][1]; ink(c,.9); poly(c,[[ex-14,ey-10],[ex,ey-4],[ex+14,ey-10],[ex+14,ey+6],[ex,ey+12],[ex-14,ey+6]],true); cut(c,()=>{c.lineWidth=2; line(c,ex,ey-4,ex,ey+12)})}
  return P;
}
// costumes, so a chef, a king and a dude look different
function drawOutfit(c,P,id){
  const [hx,hy]=P.head, f=P.f, s=P.s, hr=P.L.head, top=hy-hr, F=v=>v*s;
  const feet=Math.max(P.legs[0][1][1],P.legs[1][1][1]);
  switch(id){
    case 'chef': ink(c,1); c.fillRect(hx-hr*.8,top-F(22),hr*1.6,F(24)); blob(c,[[hx-hr*.55,top-F(24),F(10)],[hx,top-F(29),F(11)],[hx+hr*.55,top-F(24),F(10)]],1); cut(c,()=>c.fillRect(hx-hr*.8,top-F(3),hr*1.6,F(2.5))); break;
    case 'crown': ink(c,1); poly(c,[[hx-hr*.85,top+F(4)],[hx-hr*.85,top-F(14)],[hx-hr*.42,top-F(4)],[hx,top-F(18)],[hx+hr*.42,top-F(4)],[hx+hr*.85,top-F(14)],[hx+hr*.85,top+F(4)]],true); cut(c,()=>circ(c,hx,top-F(1),F(2.5),true)); break;
    case 'wizard': ink(c,.95); poly(c,[[hx-hr*.95,top+F(5)],[hx-f*F(14),top-F(44)],[hx+hr*.95,top+F(5)]],true); oval(c,hx,top+F(5),hr*1.6,F(4.5),0,true); cut(c,()=>star5(c,hx-f*F(3),top-F(12),F(5))); break;
    case 'cowboy': ink(c,1); oval(c,hx,top+F(4),hr*1.75,F(4.5),0,true); c.beginPath(); c.roundRect(hx-hr*.75,top-F(14),hr*1.5,F(17),F(6)); c.fill(); cut(c,()=>c.fillRect(hx-hr*.75,top-F(1),hr*1.5,F(2.5))); break;
    case 'pirate': ink(c,1); poly(c,[[hx-hr*1.3,top+F(5)],[hx-hr*.7,top-F(14)],[hx,top-F(7)],[hx+hr*.7,top-F(14)],[hx+hr*1.3,top+F(5)]],true);
      cut(c,()=>{circ(c,hx,top-F(2),F(3),true); circ(c,hx+f*F(7),hy-F(2),F(5.5),true); c.lineWidth=F(2); line(c,hx-f*hr*.9,hy-F(10),hx+f*hr*.95,hy+F(1))}); break;
    case 'knight': ink(c,.92); circ(c,hx,hy,hr+F(3),true); cut(c,()=>c.fillRect(hx+(f>0?0:-hr-F(3)),hy-F(5),hr+F(3),F(3.5)));
      pen(c,F(5),.9); c.beginPath(); c.moveTo(hx,top-F(2)); c.quadraticCurveTo(hx-f*F(10),top-F(26),hx-f*F(30),top-F(14)); c.stroke(); break;
    case 'soldier': case 'fire': ink(c,1); c.beginPath(); c.arc(hx,hy-F(1),hr+F(3),Math.PI,Math.PI*2); c.fill(); oval(c,hx-(id==='fire'?f*F(6):0),hy-F(1),hr+F(id==='fire'?11:6),F(3.5),0,true); break;
    case 'astro': {pen(c,F(3),.85); circ(c,hx,hy,hr+F(9),false); line(c,hx,top-F(9),hx,top-F(20)); ink(c,1); circ(c,hx,top-F(22),F(3),true);
      const bx=P.sh[0]-f*F(10); ink(c,.8); c.fillRect(f>0?bx-F(16):bx,P.sh[1]+F(4),F(16),F(36)); break}
    case 'backpack': {const bx=P.sh[0]-f*F(9); ink(c,.8); c.beginPath(); c.roundRect(f>0?bx-F(15):bx,P.sh[1]+F(4),F(15),F(30),F(5)); c.fill(); break}
    case 'shades': ink(c,1); c.beginPath(); c.arc(hx,hy-F(2),hr+F(2),Math.PI,Math.PI*2); c.fill(); oval(c,hx-f*(hr+F(5)),hy-F(4),F(9),F(3.5),0,true);
      cut(c,()=>c.fillRect(hx+(f>0?F(1):-F(14)),hy-F(6),F(13),F(6))); break;
    case 'elder': case 'glasses': cut(c,()=>{c.lineWidth=F(2.2); circ(c,hx+f*F(7),hy-F(2),F(5),false); line(c,hx+f*F(2),hy-F(3),hx-f*F(8),hy-F(5))});
      if(id==='elder'){const [ex,ey]=P.arms[1][1]; if(ey>P.hip[1]-F(14)){pen(c,F(4),.9); line(c,ex,ey,ex+f*F(5),feet); line(c,ex,ey,ex-f*F(7),ey-F(4))}} break;
    case 'police': ink(c,1); c.fillRect(hx-hr*.95,top-F(9),hr*1.9,F(11)); oval(c,hx+f*hr*.7,top+F(2),hr*.75,F(3),0,true); cut(c,()=>star5(c,hx,top-F(4),F(3.5))); break;
    case 'santa': ink(c,.95); poly(c,[[hx-hr,top+F(4)],[hx+hr,top+F(4)],[hx-f*hr*1.5,top-F(18)]],true); ink(c,1); circ(c,hx-f*hr*1.6,top-F(18),F(5),true);
      c.fillRect(hx-hr*1.05,top,hr*2.1,F(6)); oval(c,hx+f*F(3),hy+hr*.75,hr*.8,hr*.75,0,true); break;
    case 'headband': cut(c,()=>c.fillRect(hx-hr,hy-hr*.62,hr*2,F(3.5))); pen(c,F(2.5),.85); line(c,hx-f*hr,hy-hr*.55,hx-f*(hr+F(12)),hy-hr*.3); break;
    case 'ninja': cut(c,()=>c.fillRect(hx-hr-1,hy-F(7),hr*2+2,F(8))); ink(c,1); circ(c,hx+f*F(7),hy-F(3),F(2.2),true);
      pen(c,F(3),.85); line(c,hx-f*hr,hy-F(3),hx-f*(hr+F(14)),hy+F(4)); line(c,hx-f*hr,hy-F(3),hx-f*(hr+F(12)),hy+F(10)); break;
    case 'clown': ink(c,1); circ(c,hx+f*(hr+F(2)),hy+F(3),F(5),true); blob(c,[[hx-hr,hy-F(6),F(8)],[hx+hr,hy-F(6),F(8)],[hx-hr*.9,hy+F(3),F(6)],[hx+hr*.9,hy+F(3),F(6)]],.9); break;
    case 'farmer': ink(c,.9); oval(c,hx,top+F(4),hr*1.95,F(4.5),0,true); c.beginPath(); c.roundRect(hx-hr*.7,top-F(11),hr*1.4,F(14),F(5)); c.fill(); break;
    case 'doctor': pen(c,F(2),.9); c.beginPath(); c.arc(hx,hy,hr+F(1),Math.PI*1.1,Math.PI*1.9); c.stroke(); ink(c,1); circ(c,hx+f*F(4),top+F(3),F(5),true); cut(c,()=>circ(c,hx+f*F(4),top+F(3),F(2),true));
      pen(c,F(2),.85); c.beginPath(); c.moveTo(P.sh[0]-F(6),P.sh[1]); c.quadraticCurveTo(P.sh[0],P.sh[1]+F(28),P.sh[0]+f*F(7),P.sh[1]+F(15)); c.stroke(); break;
    case 'cape': ink(c,.6); poly(c,[[P.sh[0],P.sh[1]],[P.sh[0]-f*F(36),P.hip[1]+F(24)],[P.sh[0]-f*F(6),P.hip[1]+F(10)]],true); break;
    case 'tutu': ink(c,.95); oval(c,P.hip[0],P.hip[1]-F(4),F(28),F(7),0,true); break;
  }
}
const OUTFIT={}; [['chef','chef chefs'],['doctor','doctor doctors nurse nurses'],['crown','king kings queen queens prince princess'],['pirate','pirate pirates'],
  ['cowboy','cowboy cowboys cowgirl'],['wizard','wizard wizards witch witches'],['knight','knight knights'],['soldier','soldier soldiers'],['astro','astronaut astronauts'],
  ['shades','dude dudes bro bros'],['elder','grandpa grandma grandmother grandfather grandparents'],['glasses','teacher teachers professor scientist nerd'],
  ['backpack','student students hiker tourist'],['headband','athlete athletes runner runners'],['police','police cop cops policeman officer'],['santa','santa'],
  ['ninja','ninja ninjas'],['clown','clown clowns'],['farmer','farmer farmers'],['fire','firefighter firefighters fireman'],['cape','superhero superheroes superman'],['tutu','ballerina']]
  .forEach(([id,ws])=>ws.split(' ').forEach(w=>OUTFIT[w]=id));
const SCALE={baby:.58,babies:.58,toddler:.62,toddlers:.62,kid:.72,kids:.72,child:.72,children:.72,boy:.84,boys:.84,girl:.84,girls:.84,teen:.92,teenager:.92,teenagers:.92,son:.8,daughter:.8};
const NUMW={two:2,both:2,couple:2,pair:2,twins:2,three:3,four:3,five:3,several:3,group:3,'2':2,'3':3,'4':3};
const GROUPW={friends:2,people:3,kids:2,children:2,family:3,crowd:3,team:3,men:2,women:2,boys:2,girls:2,guys:2,dudes:2,bros:2,students:2,players:2,athletes:2,
  couple:2,fans:3,workers:2,soldiers:2,knights:2,chefs:2,pirates:2,ninjas:2,babies:2,twins:2,cops:2,teenagers:2,dancers:2,runners:2,grandparents:2,kings:2,witches:2,wizards:2,clowns:2,farmers:2};
const MIXED=new Set('friends people kids children family crowd team couple fans students players athletes workers dancers teenagers runners grandparents'.split(' '));
// with companions walking behind each figure, repeated figures need more room
const sp=v=>Math.round(v*(ACTOR&&ACTOR.group&&ACTOR.group.length?1+0.62*ACTOR.group.length:1));
function makeActor(words,personIdx,who,kind,p){
  const role=w=>({outfit:OUTFIT[w]||(/\bold\b/.test(p)&&/^(man|woman|lady|guy|men|women)$/.test(w)?'elder':null),scale:SCALE[w]||1});
  const girlish=w=>GIRL_RE.test(' '+w+' ');
  const group=personIdx.slice(1).map(i=>({...role(words[i]),kind:girlish(words[i])?'girl':'man'}));
  let n=Math.max(personIdx.length,...words.map(w=>NUMW[w]||GROUPW[w]||0)); if(words.includes('family')) n=3; n=Math.min(3,n);
  while(group.length<n-1){const k=group.length;
    if(words.includes('family')) group.push(k===0?{kind:kind==='girl'?'man':'girl',scale:1}:{kind:k%2?'girl':'man',scale:.72});
    else if(MIXED.has(who)||words.includes('couple')) group.push({...role(who),kind:k%2===0?(kind==='girl'?'man':'girl'):kind});
    else group.push({...role(who),kind});}
  return {...role(who),kind,group:group.slice(0,2)};
}

// ---------- things people throw, kick and carry ----------
const OBJ={
  javelin:{long:true,stuck:true,draw:c=>{pen(c,4.5);line(c,-74,0,58,0);ink(c,1);poly(c,[[56,-5],[82,0],[56,5]],true);pen(c,8);line(c,-8,0,8,0)}},
  arrow:{long:true,stuck:true,draw:c=>{pen(c,3.5);line(c,-46,0,36,0);ink(c,1);poly(c,[[34,-7],[50,0],[34,7]],true);pen(c,3,.85);[-46,-38].forEach(x=>{line(c,x,0,x-10,-9);line(c,x,0,x-10,9)})}},
  ball:{spin:true,bounce:true,draw:c=>{ink(c,1);circ(c,0,0,11,true);cut(c,()=>{c.lineWidth=2.5;c.beginPath();c.arc(-5,0,10,-1.0,1.0);c.stroke()})}},
  frisbee:{draw:c=>{ink(c,1);oval(c,0,0,18,5,0,true);cut(c,()=>oval(c,0,-1,10,2,0,true))}},
  rock:{spin:true,bounce:true,draw:c=>{ink(c,.92);poly(c,[[-12,4],[-8,-9],[4,-12],[13,-3],[9,10],[-4,11]],true)}},
  stick:{draw:c=>{pen(c,5);line(c,-30,0,30,0);pen(c,3);line(c,10,0,20,-11)}},
  bat:{draw:c=>{pen(c,5);line(c,-6,0,30,-4);pen(c,9);line(c,30,-4,66,-9)}},
};
OBJ.spear=OBJ.javelin;

// ---------- animals ----------
function dog(c,x,{phase=0,pose='run',facing=1,ball=false}={}){
  const g=G(); c.save(); c.translate(x,g); c.scale(facing,1); pen(c,7);
  const head=(hx,hy)=>{ ink(c,1); circ(c,hx,hy,15,true); oval(c,hx+17,hy+4,13,7.5,0,true); circ(c,hx+29,hy+1,4.5,true);
    ink(c,.85); oval(c,hx-7,hy-3,6.5,14,0.45,true); cut(c,()=>circ(c,hx+5,hy-5,2.6,true)); ink(c,1) };
  if(pose==='sit'){
    ink(c,1); oval(c,-8,-30,24,28,0,true); oval(c,10,-62,16,30,0.35,true);
    pen(c,7); leg(c,16,-40,0.05,38,8); leg(c,27,-40,0.1,38,8);
    head(24,-100); c.beginPath(); c.moveTo(-28,-8); c.quadraticCurveTo(-50,-4,-58,-18); c.stroke();
    cut(c,()=>{c.lineWidth=3; line(c,6,-82,24,-86)});
    if(ball) circ(c,58,-92,9,true);
  } else {
    if(pose==='leap'){c.translate(0,-48);c.rotate(-0.28)}
    ink(c,1); oval(c,0,-50,42,16,0,true); oval(c,26,-54,17,19,0,true);
    pen(c,10); line(c,32,-60,44,-74); pen(c,7);
    head(48,-78);
    cut(c,()=>{c.lineWidth=3; line(c,33,-66,44,-61)});
    pen(c,7); const w=pose==='leap'?0:8*Math.sin(phase*2);
    c.beginPath(); c.moveTo(-40,-56); c.quadraticCurveTo(-58,-62,-62,-80+w); c.stroke();
    [[28,1],[18,1],[-24,-1],[-34,-1]].forEach(([hx,side],i)=>{
      const a=pose==='leap'?side*(i%2?0.9:1.15):0.55*Math.sin(phase+(side<0?Math.PI:0)+(i%2));
      leg(c,hx,-42,a,40,7)});
    if(ball) circ(c,80,-72,9,true);
  }
  c.restore();
}
function cat(c,x,{phase=0,facing=1}={}){
  const g=G(); c.save(); c.translate(x,g); c.scale(facing*0.9,0.9); pen(c,6);
  ink(c,1); oval(c,0,-46,38,13,0,true);
  const hx=42,hy=-68; circ(c,hx,hy,14,true);
  poly(c,[[hx-12,hy-5],[hx-9,hy-28],[hx+1,hy-12]],true); poly(c,[[hx+1,hy-12],[hx+11,hy-28],[hx+13,hy-4]],true);
  cut(c,()=>{circ(c,hx+6,hy-2,2.4,true)});
  pen(c,2,.7); line(c,hx+10,hy+4,hx+32,hy+1); line(c,hx+10,hy+7,hx+31,hy+11);
  pen(c,6); c.beginPath(); c.moveTo(-36,-50); c.bezierCurveTo(-64,-56,-46,-98,-66,-106+6*Math.sin(phase)); c.stroke();
  [[26,1],[16,1],[-22,-1],[-31,-1]].forEach(([lx,side],i)=>leg(c,lx,-38,0.5*Math.sin(phase+(side<0?Math.PI:0)+(i%2)),36,6));
  c.restore();
}
function horse(c,x,{phase=0,facing=1}={}){
  const g=G(); c.save(); c.translate(x,g); c.scale(facing,1);
  ink(c,1); oval(c,0,-94,56,22,0,true);
  pen(c,18); line(c,40,-104,66,-146);
  ink(c,1); oval(c,82,-148,24,11,0.55,true); poly(c,[[60,-160],[63,-178],[70,-160]],true);
  cut(c,()=>circ(c,76,-154,2.6,true));
  pen(c,4,.85); for(let i=0;i<6;i++){const u=i/5, px=40+26*u, py=-106-40*u; line(c,px,py,px-14,py+3)}
  pen(c,4,.8); [0,1,2].forEach(k=>{c.beginPath(); c.moveTo(-54,-100); c.quadraticCurveTo(-74,-90+k*6,-72-k*6,-46+k*4); c.stroke()});
  pen(c,8); [[40,1],[28,1],[-36,-1],[-46,-1]].forEach(([hx,side],i)=>leg(c,hx,-76,0.6*Math.sin(phase+(side<0?Math.PI:0)+(i%2)*0.8),72,8));
  c.restore();
}
function rabbit(c,x,{lift=0,facing=1}={}){
  const g=G()-lift; c.save(); c.translate(x,g); c.scale(facing,1);
  ink(c,.95); oval(c,0,-26,26,20,0,true); oval(c,-6,-10,17,9,0,true);
  circ(c,22,-46,13,true); oval(c,15,-74,5,18,-0.25,true); oval(c,27,-72,5,18,0.2,true);
  ink(c,1); circ(c,-26,-32,8,true);
  cut(c,()=>circ(c,27,-49,2.2,true));
  pen(c,5); line(c,16,-12,24,-3);
  c.restore();
}
function bird(c,x,y,flap,s=1){
  pen(c,5); const tip=flap?y-14*s:y+10*s, ctl=flap?y-16*s:y-6*s;
  c.beginPath();c.moveTo(x-26*s,tip);c.quadraticCurveTo(x-12*s,ctl,x,y);c.quadraticCurveTo(x+12*s,ctl,x+26*s,tip);c.stroke();
  ink(c,1); oval(c,x+2*s,y+2*s,7*s,4*s,0,true);
}
function butterfly(c,x,y,open){
  const s=open?1:0.55;
  ink(c,.8); oval(c,x-12*s,y-10,14*s,16,-0.5,true); oval(c,x+12*s,y-10,14*s,16,0.5,true);
  ink(c,.55); oval(c,x-9*s,y+10,10*s,11,0.4,true); oval(c,x+9*s,y+10,10*s,11,-0.4,true);
  pen(c,4); line(c,x,y-16,x,y+18); pen(c,2,.8); line(c,x,y-16,x-8,y-30); line(c,x,y-16,x+8,y-30);
  cut(c,()=>{circ(c,x-12*s,y-12,3.5*s,true);circ(c,x+12*s,y-12,3.5*s,true)});
}
function fish(c,x,y,rot){
  c.save();c.translate(x,y);c.rotate(rot);ink(c,.9);oval(c,0,0,28,13,0,true);
  poly(c,[[-22,0],[-44,-14],[-44,14]],true); poly(c,[[-6,-11],[6,-22],[12,-10]],true);
  cut(c,()=>{circ(c,15,-3,3.5,true); c.lineWidth=2; line(c,6,-9,6,9)});c.restore();
}
function whale(c,x){
  whaleBody(c,x);
}
function boat(c,x){
  const g=G()-14;
  ink(c,.85); poly(c,[[x-74,g-26],[x+78,g-26],[x+54,g],[x-54,g]],true); cut(c,()=>{for(let i=0;i<3;i++) circ(c,x-30+i*28,g-13,4,true)});
  pen(c,5); line(c,x,g-26,x,g-182);
  ink(c,.65); poly(c,[[x+5,g-176],[x+5,g-36],[x+82,g-36]],true);
  ink(c,.45); poly(c,[[x-5,g-160],[x-5,g-36],[x-58,g-36]],true);
  ink(c,1); poly(c,[[x,g-182],[x+22,g-176],[x,g-170]],true);
}
function whaleBody(c,x){
  const g=G()-12;
  ink(c,.78); c.beginPath(); c.moveTo(x-96,g); c.bezierCurveTo(x-90,g-70,x+70,g-82,x+102,g-10); c.lineTo(x+102,g); c.closePath(); c.fill();
  pen(c,10,.78); c.beginPath(); c.moveTo(x-92,g-8); c.quadraticCurveTo(x-120,g-20,x-128,g-58); c.stroke();
  ink(c,.78); poly(c,[[x-128,g-58],[x-160,g-78],[x-132,g-68],[x-122,g-92]],true);
  cut(c,()=>{circ(c,x+62,g-34,4,true); c.lineWidth=3; c.beginPath(); c.moveTo(x+98,g-14); c.quadraticCurveTo(x+70,g-6,x+40,g-12); c.stroke()});
  pen(c,4,.7); [-0.6,0,0.6].forEach(a=>{c.beginPath(); c.moveTo(x+30,g-64); c.quadraticCurveTo(x+30+a*30,g-132,x+30+a*72,g-122); c.stroke()});
}

// ---------- places and things ----------
function tree(c,x){
  const g=G(), r=rng(x*7+3);
  ink(c,.9); c.beginPath(); c.moveTo(x-12,g); c.lineTo(x-7,g-120); c.lineTo(x+7,g-120); c.lineTo(x+12,g); c.fill();
  pen(c,6,.85); line(c,x,g-95,x-34,g-140); line(c,x+2,g-110,x+30,g-150);
  blob(c,[[x,g-178,56],[x-50,g-140,40],[x+50,g-142,40],[x-22,g-222,38],[x+26,g-218,36]],.55);
  ink(c,.9); for(let i=0;i<16;i++){const a=r()*Math.PI*2, d=r()*58; circ(c,x+Math.cos(a)*d*1.1,g-180+Math.sin(a)*d*0.8,3+r()*4,true)}
  cut(c,()=>{for(let i=0;i<7;i++){const a=r()*Math.PI*2,d=r()*42; circ(c,x+Math.cos(a)*d,g-176+Math.sin(a)*d*0.8,3+r()*2,true)}});
}
function pine(c,x,h){const g=G(); ink(c,.85); poly(c,[[x,g-h-12],[x-13,g-8],[x+13,g-8]],true); c.fillRect(x-2,g-10,4,10)}
function house(c,x,{lit=false}={}){
  const g=G();
  ink(c,.8); c.fillRect(x+30,g-178,18,44);
  pen(c,4,.45); for(let i=0;i<3;i++){c.beginPath(); c.arc(x+44+i*16,g-196-i*20,8+i*3,Math.PI*0.2,Math.PI*1.7); c.stroke()}
  ink(c,.42); poly(c,[[x-84,g-98],[x,g-170],[x+84,g-98]],true);
  pen(c,3,.9); for(let k=1;k<4;k++){const y=g-98-k*17, hw=84*(1-k*17/72); line(c,x-hw+8,y,x+hw-8,y)}
  pen(c,7); c.beginPath(); c.moveTo(x-88,g-96); c.lineTo(x,g-172); c.lineTo(x+88,g-96); c.stroke();
  c.strokeRect(x-66,g-98,132,98);
  ink(c,.8); c.beginPath(); c.roundRect(x-46,g-58,32,58,[14,14,0,0]); c.fill(); cut(c,()=>circ(c,x-21,g-28,3,true));
  ink(c,lit?1:.7); c.fillRect(x+10,g-80,42,32); cut(c,()=>{c.fillRect(x+29.5,g-80,3,32); c.fillRect(x+10,g-65.5,42,3)});
}
function flower(c,x,h,type=0){
  const g=G(); pen(c,5,.8); c.beginPath(); c.moveTo(x,g); c.quadraticCurveTo(x+8,g-h/2,x,g-h); c.stroke();
  ink(c,.7); oval(c,x+10,g-h*0.4,10,4,-0.5,true);
  if(type===0){ ink(c,.9); for(let i=0;i<7;i++){const a=i*Math.PI*2/7; oval(c,x+Math.cos(a)*15,g-h+Math.sin(a)*15,9,6,a,true)} ink(c,1); circ(c,x,g-h,7,true); cut(c,()=>circ(c,x,g-h,3,true)) }
  else { ink(c,.92); c.beginPath(); c.moveTo(x-15,g-h-20); c.lineTo(x-8,g-h-6); c.lineTo(x,g-h-22); c.lineTo(x+8,g-h-6); c.lineTo(x+15,g-h-20); c.quadraticCurveTo(x+16,g-h+8,x,g-h+8); c.quadraticCurveTo(x-16,g-h+8,x-15,g-h-20); c.fill() }
}
function mountains(c,x){
  const g=G();
  [[x-120,x-10,x+100,200],[x+10,x+120,x+230,150]].forEach(([a,p,b,h])=>{
    ink(c,.16); poly(c,[[a,g],[p,g-h],[b,g]],true);
    pen(c,7); c.beginPath();c.moveTo(a,g);c.lineTo(p,g-h);c.lineTo(b,g);c.stroke();
    ink(c,.92); poly(c,[[p-30,g-h+36],[p,g-h],[p+30,g-h+36],[p+14,g-h+28],[p,g-h+40],[p-14,g-h+28]],true);
    pen(c,3,.42); for(let i=1;i<6;i++){const u=i/6; line(c,p+(b-p)*u*0.9,g-h+h*u*0.9,p+(b-p)*u*0.9-14,g-h+h*u*0.9+26)}
  });
  for(let i=0;i<4;i++) pine(c,x-92+i*36,38+((i*17)%22));
}
function car(c,x,trail=200){
  const g=G(); ink(c,.75); c.beginPath(); c.roundRect(x-80,g-64,160,40,14); c.fill();
  ink(c,.6); poly(c,[[x-46,g-64],[x-24,g-98],[x+30,g-98],[x+56,g-64]],true);
  cut(c,()=>{poly(c,[[x-36,g-68],[x-20,g-92],[x-2,g-92],[x-2,g-68]],true); poly(c,[[x+6,g-68],[x+6,g-92],[x+26,g-92],[x+44,g-68]],true)});
  ink(c,1); circ(c,x+74,g-50,5,true);
  for(const wx of [x-48,x+48]){ink(c,1); circ(c,wx,g-20,18,true); cut(c,()=>circ(c,wx,g-20,7,true))}
  pen(c,4,.6); [g-36,g-58,g-80].forEach((y,i)=>line(c,x-90-trail+i*24,y,x-100,y));
}
function wheel(c,x,g,r=12){ink(c,1); circ(c,x,g-r-2,r,true); cut(c,()=>circ(c,x,g-r-2,r*0.4,true))}
function train(c,x,span){
  const g=G(), ex=x+span-150;
  pen(c,3,.6); line(c,x,g,x+span,g);
  for(let cx=x; cx+140<ex; cx+=150){ ink(c,.6); c.beginPath(); c.roundRect(cx,g-80,138,56,8); c.fill();
    cut(c,()=>{for(let k=0;k<3;k++) c.fillRect(cx+14+k*42,g-68,28,20)}); wheel(c,cx+30,g); wheel(c,cx+108,g);
    pen(c,5,.8); line(c,cx+138,g-38,cx+150,g-38) }
  ink(c,.85); c.beginPath(); c.roundRect(ex,g-72,104,50,10); c.fill(); c.fillRect(ex,g-116,48,50); c.fillRect(ex+70,g-104,16,34);
  cut(c,()=>c.fillRect(ex+10,g-106,28,22));
  ink(c,.85); poly(c,[[ex+104,g-30],[ex+128,g-6],[ex+104,g-6]],true); ink(c,1); circ(c,ex+106,g-60,6,true);
  wheel(c,ex+26,g,16); wheel(c,ex+78,g,16);
  for(let i=0;i<7;i++){ink(c,Math.max(.12,.45-i*.05)); circ(c,ex+78-i*44,g-124-i*11-(i%2)*8,12+i*3,true)}
}
function rocket(c,x,y,ang){
  c.save(); c.translate(x,y); c.rotate(ang);
  ink(c,.88); c.beginPath(); c.moveTo(48,0); c.quadraticCurveTo(26,-17,-26,-14); c.lineTo(-26,14); c.quadraticCurveTo(26,17,48,0); c.fill();
  ink(c,1); poly(c,[[-18,-14],[-38,-32],[-30,-12]],true); poly(c,[[-18,14],[-38,32],[-30,12]],true);
  cut(c,()=>circ(c,12,0,6,true));
  ink(c,.7); poly(c,[[-28,-9],[-64,0],[-28,9]],true);
  c.restore();
}
function rocketFlight(c,x,span){
  const g=G(), x0=x+80, y0=g-50, x1=x+span-70, y1=SKY+80, ang=Math.atan2(y1-y0,x1-x0);
  for(let u=0;u<=1.001;u+=0.035){ink(c,0.12+0.22*u); circ(c,x0+(x1-x0)*u-30,y0+(y1-y0)*u+12,5+9*(1-u),true)}
  [0,0.5,1].forEach(u=>rocket(c,x0+(x1-x0)*u,y0+(y1-y0)*u,ang));
}
function plane(c,x,y){
  ink(c,.88); oval(c,x,y,64,12,0,true); poly(c,[[x+60,y-6],[x+80,y],[x+60,y+6]],true);
  ink(c,1); poly(c,[[x+6,y],[x-24,y+44],[x-8,y+44],[x+28,y]],true); poly(c,[[x-46,y-4],[x-62,y-34],[x-52,y-34],[x-34,y-4]],true);
  cut(c,()=>{for(let i=0;i<6;i++) circ(c,x+40-i*13,y-3,2.6,true)});
}
function planeFlight(c,x,span){
  const y0=170, y1=80, n=Math.max(2,Math.floor(span/320));
  pen(c,3,.3); c.setLineDash([10,12]); line(c,x+20,y0+4,x+span-120,y1+4); c.setLineDash([]);
  for(let i=0;i<n;i++){const u=n===1?1:i/(n-1); plane(c,x+90+(span-220)*u,y0+(y1-y0)*u)}
}
function city(c,x,span){
  const g=G(), r=rng(x+11); let bx=x;
  while(bx<x+span-50){ const w=48+r()*46, h=80+r()*150;
    ink(c,.3); c.fillRect(bx,g-h,w,h); pen(c,4,.85); c.strokeRect(bx,g-h,w,h);
    ink(c,.95); for(let wy=g-h+14; wy<g-18; wy+=22) for(let wx=bx+10; wx<bx+w-14; wx+=18) if(r()>0.42) c.fillRect(wx,wy,8,10);
    if(h>200){pen(c,3); line(c,bx+w/2,g-h,bx+w/2,g-h-30); ink(c,1); circ(c,bx+w/2,g-h-32,4,true)}
    bx+=w+8+r()*14 }
}
function cloud(c,x,y,s=1,a=.45){blob(c,[[x,y,26*s],[x-30*s,y+8*s,20*s],[x+30*s,y+8*s,20*s],[x+12*s,y-14*s,20*s]],a)}
function rain(c,x,span,storm){
  const r=rng(x+5);
  for(let cx=x+70; cx<x+span-50; cx+=210) cloud(c,cx,70+r()*25,1.15,.55);
  pen(c,3,.55); for(let i=0;i<span/8;i++){const rx=x+40+r()*(span-60), ry=115+r()*160; line(c,rx,ry,rx-7,ry+22)}
  if(storm){ink(c,1); const lx=x+span*0.5; poly(c,[[lx,92],[lx-26,172],[lx-6,172],[lx-30,252],[lx+20,150],[lx,150],[lx+18,92]],true)}
}
function waves(c,x0,x1,y){pen(c,6,.8); c.beginPath(); for(let x=x0;x<=x1;x+=4)c.lineTo(x,y+Math.sin(x/22)*7); c.stroke()}
function sun(c,x,y){ink(c,.22); circ(c,x,y,42,true); ink(c,.92); circ(c,x,y,24,true); pen(c,5,.9);
  for(let i=0;i<12;i++){const a=i*Math.PI/6; line(c,x+Math.cos(a)*34,y+Math.sin(a)*34,x+Math.cos(a)*50,y+Math.sin(a)*50)}}
function moon(c,x,y){ink(c,.9); circ(c,x,y,28,true); cut(c,()=>circ(c,x+13,y-7,25,true)); ink(c,.5); circ(c,x-12,y+8,3,true)}
function stars(c,x0,x1,seed){const r=rng(seed); ink(c,.85); for(let x=x0;x<x1;x+=40+r()*60) circ(c,x,SKY+12+r()*90,2.5+r()*2,true)}
function star5(c,x,y,r){c.beginPath(); for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5, rr=i%2?r*0.45:r; c.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr)} c.closePath(); c.fill()}
function shootingStar(c,x,y,len){for(let i=0;i<22;i++){const u=i/22; ink(c,0.08+0.6*u); circ(c,x+len*u,y+len*0.3*u,1.5+3*u,true)} ink(c,1); star5(c,x+len,y+len*0.3,15)}
function sparkle(c,x,y){ink(c,1); star5(c,x,y,12); ink(c,.8); star5(c,x-46,y+26,8); star5(c,x+44,y+18,9); pen(c,3,.6); [[-30,-20],[32,-24],[0,-40]].forEach(([dx,dy])=>line(c,x+dx*0.6,y+dy*0.6,x+dx,y+dy))}
function heart(c,x,y,s=1){ink(c,.9); c.beginPath(); c.moveTo(x,y+30*s); c.bezierCurveTo(x-60*s,y-10*s,x-28*s,y-48*s,x,y-20*s); c.bezierCurveTo(x+28*s,y-48*s,x+60*s,y-10*s,x,y+30*s); c.fill()}
function spiral(c,x,y,R){pen(c,6); c.beginPath(); for(let a=0;a<Math.PI*8;a+=0.05){const r=R*a/(Math.PI*8); c.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r)} c.stroke()}
function face(c,x,y,r=72){
  ink(c,.72); circ(c,x,y,r,true);
  cut(c,()=>{circ(c,x-24,y-16,10,true);circ(c,x+24,y-16,10,true);c.lineWidth=9;c.lineCap='round';c.beginPath();c.arc(x,y+6,34,0.2*Math.PI,0.8*Math.PI);c.stroke()});
  ink(c,1); circ(c,x-22,y-18,3.5,true); circ(c,x+26,y-18,3.5,true);
  pen(c,6); for(let i=-3;i<=3;i++) line(c,x+i*14,y-r+4,x+i*18,y-r-22);
}
function horizon(c,x0,x1){pen(c,3,.22); c.beginPath(); for(let x=x0;x<=x1;x+=6)c.lineTo(x,G()-30-12*Math.sin(x/150)-6*Math.sin(x/53)); c.stroke()}
function track(c,x0,x1){const g=G(); pen(c,3,.4); line(c,x0,g+1,x1,g+1); pen(c,3,.25); for(let x=x0+60;x<x1;x+=150) line(c,x,g-8,x,g+1)}
function rings(c,x,y){pen(c,5,.9); [[-50,0],[0,0],[50,0],[-25,22],[25,22]].forEach(([dx,dy])=>circ(c,x+dx,y+dy,21,false))}
function bunting(c,x0,x1,y){pen(c,2,.5); c.beginPath(); for(let x=x0;x<=x1;x+=8)c.lineTo(x,y+14*Math.sin(Math.PI*((x-x0)%300)/300)); c.stroke();
  for(let x=x0+16;x<x1-10;x+=34){const yy=y+14*Math.sin(Math.PI*((x-x0)%300)/300); ink(c,(x/34|0)%2?.85:.5); poly(c,[[x-10,yy],[x+10,yy],[x,yy+22]],true)}}
function podium(c,x,m){
  const g=G(); ink(c,.55); c.fillRect(x-95,g-34,62,34); c.fillRect(x-31,g-56,62,56); c.fillRect(x+33,g-22,62,22);
  cut(c,()=>{c.font='800 24px '+FONT; c.textAlign='center'; c.fillText('1',x,g-22); c.fillText('2',x-64,g-9); c.font='800 16px '+FONT; c.fillText('3',x+64,g-5)}); c.textAlign='left';
  person(c,x,{pose:'cheer',kind:m.kind,ground:g-56,medal:true}); sparkle(c,x,g-270);
}
function hurdle(c,x){const g=G(); pen(c,4,.8); line(c,x-22,g,x-22,g-58); line(c,x+22,g,x+22,g-58); pen(c,8); line(c,x-30,g-58,x+30,g-58)}
function goal(c,x){const g=G(); pen(c,3,.35); for(let gx=x+14;gx<x+120;gx+=16) line(c,gx,g,gx,g-96); for(let gy=g-16;gy>g-96;gy-=16) line(c,x,gy,x+120,gy); pen(c,6); c.strokeRect(x,g-96,120,96)}
function finishFlag(c,x){const g=G(); pen(c,4); line(c,x,g,x,g-160); ink(c,1); c.fillRect(x,g-160,48,30); cut(c,()=>{for(let i=0;i<4;i++)for(let j=0;j<2;j++) if((i+j)%2) c.fillRect(x+i*12,g-160+j*15,12,15)})}
function bench(c,x){const g=G(); pen(c,6,.8); line(c,x-48,g-30,x+48,g-30); line(c,x-40,g-30,x-40,g); line(c,x+40,g-30,x+40,g); pen(c,5,.6); line(c,x-48,g-58,x+40,g-58); line(c,x-44,g-58,x-44,g-30)}
function zzz(c,x,y){ink(c,.9); c.font='800 30px '+FONT; c.fillText('z',x,y); c.font='800 22px '+FONT; c.fillText('z',x+20,y-24); c.font='800 16px '+FONT; c.fillText('z',x+36,y-42)}
function note(c,x,y,k){ink(c,1); oval(c,x,y,9,6.5,-0.4,true); pen(c,3.5); line(c,x+8,y-2,x+8,y-34); if(k%2){line(c,x+8,y-34,x+30,y-28); line(c,x+30,y-28,x+30,y-6); ink(c,1); oval(c,x+22,y-4,9,6.5,-0.4,true)} else {c.beginPath(); c.moveTo(x+8,y-34); c.quadraticCurveTo(x+24,y-26,x+20,y-12); c.stroke()}}
function bike(c,x){
  const g=G(), r=24, ry=g-r-2;
  pen(c,4,.95); circ(c,x-40,ry,r,false); circ(c,x+40,ry,r,false); ink(c,1); circ(c,x-40,ry,4,true); circ(c,x+40,ry,4,true);
  pen(c,5); c.beginPath(); c.moveTo(x-40,ry); c.lineTo(x-4,ry); c.lineTo(x-14,g-70); c.closePath(); c.stroke();
  c.beginPath(); c.moveTo(x-4,ry); c.lineTo(x+26,g-72); c.lineTo(x+40,ry); c.stroke(); line(c,x-14,g-70,x+26,g-72);
  pen(c,5); line(c,x+26,g-72,x+22,g-88); line(c,x+16,g-88,x+34,g-88); pen(c,7); line(c,x-22,g-74,x-6,g-74);
}
function kite(c,kx,ky,hx,hy){
  pen(c,2,.45); c.beginPath(); c.moveTo(hx,hy); c.quadraticCurveTo((hx+kx)/2,ky+120,kx,ky+36); c.stroke();
  ink(c,.85); poly(c,[[kx,ky-34],[kx+24,ky],[kx,ky+36],[kx-24,ky]],true); cut(c,()=>{c.lineWidth=3; line(c,kx,ky-34,kx,ky+36); line(c,kx-24,ky,kx+24,ky)});
  pen(c,3,.7); c.beginPath(); c.moveTo(kx,ky+36); for(let i=1;i<=6;i++) c.lineTo(kx-6*i+(i%2?10:-10),ky+36+i*14); c.stroke();
  ink(c,.9); [2,4,6].forEach(i=>{const bx=kx-6*i, by=ky+36+i*14; poly(c,[[bx-8,by-5],[bx,by],[bx-8,by+5]],true); poly(c,[[bx+8,by-5],[bx,by],[bx+8,by+5]],true)});
}
function swimmer(c,x,phase){
  const w=G()-22;
  pen(c,9,.3); line(c,x-16,w+6,x-72,w+10); pen(c,6,.3); line(c,x-72,w+10,x-96,w+2);
  ink(c,1); circ(c,x,w-8,13,true); cut(c,()=>circ(c,x+6,w-11,2.2,true));
  pen(c,7); c.beginPath();
  if(phase){c.moveTo(x-12,w-2); c.quadraticCurveTo(x+4,w-62,x+42,w-6)} else {c.moveTo(x-14,w-2); c.quadraticCurveTo(x-30,w-50,x-56,w-30)}
  c.stroke(); ink(c,.7); [[30,-14],[40,-22],[50,-12]].forEach(([dx,dy])=>circ(c,x+(phase?dx:-dx-30),w+dy,3,true));
}
const LETTER_FONT='800 80px '+FONT;
function lettering(c,x,word){c.font=LETTER_FONT; ink(c,.95); c.fillText(word,x,215)}

// ---------- everyday things, drawn from the computer's emoji font and traced into line art ----------
const GLYPH={}, SKY_GLYPH=new Set('airplane plane jet helicopter ufo balloon comet planet saturn earth globe world bat eagle angel fairy lightning rainbow snowflake snow ghost parachute satellite'.split(' '));
('elephant🐘 lion🦁 tiger🐅 bear🐻 panda🐼 monkey🐒 gorilla🦍 giraffe🦒 zebra🦓 cow🐄 pig🐖 sheep🐑 goat🐐 chicken🐓 rooster🐓 owl🦉 eagle🦅 penguin🐧 parrot🦜 '+
'flamingo🦩 peacock🦚 swan🦢 frog🐸 turtle🐢 tortoise🐢 snake🐍 lizard🦎 dragon🐉 dinosaur🦕 trex🦖 shark🦈 octopus🐙 crab🦀 lobster🦞 snail🐌 bee🐝 '+
'ladybug🐞 spider🕷️ ant🐜 mouse🐁 rat🐀 fox🦊 wolf🐺 deer🦌 camel🐫 kangaroo🦘 squirrel🐿️ hedgehog🦔 bat🦇 unicorn🦄 sloth🦥 otter🦦 koala🐨 hippo🦛 '+
'rhino🦏 crocodile🐊 alligator🐊 seal🦭 dolphin🐬 duck🦆 guitar🎸 piano🎹 drum🥁 trumpet🎺 violin🎻 saxophone🎷 microphone🎤 headphones🎧 trophy🏆 '+
'medal🏅 crown👑 gift🎁 present🎁 balloon🎈 umbrella☂️ clock⏰ bell🔔 key🔑 lightbulb💡 lamp💡 pencil✏️ phone📱 computer💻 laptop💻 camera📷 television📺 '+
'tv📺 glasses👓 hat🎩 shoe👟 scooter🛴 motorcycle🏍️ bus🚌 tractor🚜 ambulance🚑 firetruck🚒 airplane✈️ plane✈️ jet✈️ helicopter🚁 ufo🛸 anchor⚓ sword🗡️ '+
'shield🛡️ robot🤖 ghost👻 alien👽 skull💀 snowman⛄ pumpkin🎃 candle🕯️ fire🔥 campfire🔥 rainbow🌈 snowflake❄️ snow❄️ lightning⚡ volcano🌋 island🏝️ '+
'castle🏰 tent⛺ church⛪ tower🗼 statue🗽 bridge🌉 fountain⛲ mushroom🍄 cactus🌵 palm🌴 leaf🍁 apple🍎 banana🍌 pizza🍕 burger🍔 hamburger🍔 cake🎂 '+
'cupcake🧁 donut🍩 cookie🍪 coffee☕ tea🍵 wine🍷 beer🍺 cheese🧀 carrot🥕 egg🥚 watermelon🍉 cherry🍒 strawberry🍓 grapes🍇 lemon🍋 pineapple🍍 '+
'avocado🥑 bread🍞 taco🌮 sushi🍣 earth🌍 globe🌍 world🌍 planet🪐 saturn🪐 comet☄️ telescope🔭 basketball🏀 baseball⚾ tennis🎾 bowling🎳 golf⛳ '+
'chess♟️ dice🎲 skateboard🛹 diamond💎 money💰 bomb💣 magnet🧲 hourglass⌛ baby👶 king🤴 queen👸 princess👸 prince🤴 wizard🧙 witch🧙 angel👼 santa🎅 '+
'astronaut🧑‍🚀 ninja🥷 zombie🧟 vampire🧛 mermaid🧜 fairy🧚 superhero🦸 clown🤡 cowboy🤠 puzzle🧩 parachute🪂 satellite🛰️ lighthouse🗼 windmill🌬️ '+
'mailbox📫 envelope✉️ letter✉️ map🗺️ compass🧭 backpack🎒 bicycle🚲 bike🚲 sled🛷 trumpet🎺 accordion🪗 banjo🪕 flute🪈 crystal🔮 wand🪄').split(' ').forEach(e=>{const m=e.match(/^([a-z]+)(.+)$/u); if(m) GLYPH[m[1]]=m[2]});
const MULTI_EXTRA={'eiffel tower':'🗼','tokyo tower':'🗼','mount fuji':'🗻','statue of':'🗽','new york':'🗽','golden gate':'🌉','big ben':'🕰️','tower bridge':'🌉','great wall':'🧱','space station':'🛰️','pizza slice':'🍕'};
const MULTI={...MULTI_EXTRA,'ice cream':'🍦','christmas tree':'🎄','ferris wheel':'🎡','roller coaster':'🎢','hot dog':'🌭','teddy bear':'🧸','t rex':'🦖','polar bear':'🐻‍❄️','race car':'🏎️','hot air':'🎈','space shuttle':'🚀'};
const glyphCache=new Map();
function glyphPanel(e){
  if(glyphCache.has(e)) return glyphCache.get(e);
  const S=240, cv=document.createElement('canvas'); cv.width=cv.height=S; const cx=cv.getContext('2d',{willReadFrequently:true});
  cx.font='190px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; cx.textAlign='center'; cx.textBaseline='middle'; cx.fillText(e,S/2,S/2+10);
  const px=cx.getImageData(0,0,S,S).data, n=S*S, A=new Float32Array(n), L=new Float32Array(n);
  let x0=S,y0=S,x1=-1,y1=-1;
  for(let i=0;i<n;i++){const a=px[i*4+3]/255; A[i]=a; L[i]=(0.3*px[i*4]+0.59*px[i*4+1]+0.11*px[i*4+2])/255; if(a>0.1){const x=i%S,y=(i/S)|0; if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y}}
  if(x1<0||(x1-x0)<8){glyphCache.set(e,null);return null}
  const EL=new Float32Array(n), EA=new Float32Array(n), samp=[];
  for(let y=1;y<S-1;y++)for(let x=1;x<S-1;x++){const i=y*S+x;
    const sob=M=>Math.hypot(M[i-S+1]+2*M[i+1]+M[i+S+1]-M[i-S-1]-2*M[i-1]-M[i+S-1], M[i+S-1]+2*M[i+S]+M[i+S+1]-M[i-S-1]-2*M[i-S]-M[i-S+1]);
    EL[i]=sob(L); EA[i]=sob(A); if(A[i]>0.5&&(i%3===0)) samp.push(EL[i])}
  samp.sort((a,b)=>a-b); const top=samp[Math.floor(samp.length*0.93)]||1;
  const W=x1-x0+5, Hh=y1-y0+5, out=document.createElement('canvas'); out.width=W; out.height=Hh;
  const oc=out.getContext('2d'), od=oc.createImageData(W,Hh);
  for(let y=0;y<Hh;y++)for(let x=0;x<W;x++){const sx=x+x0-2, sy=y+y0-2; if(sx<0||sy<0||sx>=S||sy>=S) continue; const i=sy*S+sx;
    let v=Math.max(0.3*A[i], Math.min(1,EL[i]/top)*0.95*A[i], Math.min(1,EA[i]*0.9)); if(v<0.1) v=0;
    const o=(y*W+x)*4; od.data[o]=od.data[o+1]=od.data[o+2]=v*255; od.data[o+3]=255}
  oc.putImageData(od,0,0); glyphCache.set(e,out); return out;
}
function drawGlyph(c,x,it,span){
  const pnl=glyphPanel(it.e); if(!pnl){lettering(c,x+20,it.word); return}
  const sky=!it.big&&SKY_GLYPH.has(it.word), h=it.big?250:sky?120:165, w=pnl.width*h/pnl.height, y=sky?SKY+40:G()-h-2;
  const n=span?Math.max(1,Math.floor((span-40)/(w+70))):1, gap=n>1?(span-40-n*w)/n:0;
  c.save(); c.globalCompositeOperation='lighter';
  for(let k=0;k<n;k++) c.drawImage(pnl,x+30+k*(w+gap),y-(sky&&k%2?24:0),w,h);
  c.restore();
}
const biteCache=new Map();
function glyphAt(c,e,cx,cy,h,o={}){
  let pnl=glyphPanel(e); if(!pnl) return false;
  if(o.bites){const key=e+'|'+o.bites; if(!biteCache.has(key)){const t=document.createElement('canvas'); t.width=pnl.width; t.height=pnl.height; const tc=t.getContext('2d'); tc.drawImage(pnl,0,0);
    tc.globalCompositeOperation='destination-out'; const R=pnl.height*0.21;
    for(let i=0;i<o.bites;i++){tc.beginPath(); tc.arc(-R*0.2+i*R*1.05,pnl.height*(0.3+0.22*(i%2)),R,0,7); tc.arc(-R*0.2+i*R*1.05,pnl.height*(0.62-0.2*(i%2)),R*0.8,0,7); tc.fill()}
    biteCache.set(key,t)} pnl=biteCache.get(key)}
  const w=pnl.width*h/pnl.height;
  c.save(); c.globalCompositeOperation='lighter'; c.translate(cx,cy); if(o.flip) c.scale(-1,1); c.rotate(o.tilt||0); c.drawImage(pnl,-w/2,-h/2,w,h); c.restore(); return true;
}
// ---------- nouns: hand-picked emoji first, then ~1,400 names from the Unicode emoji list ----------
const ALIAS={speech:'🎙️',elections:'🗳️',vote:'🗳️',votes:'🗳️',ballot:'🗳️',job:'💼',school:'🏫',office:'🏢',hospital:'🏥',game:'🎮',games:'🎮',videogames:'🎮',music:'🎵',idea:'💡',ideas:'💡',
  war:'⚔️',birthday:'🎂',wedding:'💒',christmas:'🎄',halloween:'🎃',internet:'🌐',news:'📰',time:'⏰',homework:'📝',exam:'📝',test:'📝',lottery:'🎟️',ticket:'🎟️',tickets:'🎟️',
  movie:'🎬',movies:'🎬',concert:'🎤',championship:'🏆',contest:'🏆',debate:'🎤',politics:'🗳️',president:'🏛️',government:'🏛️',court:'⚖️',law:'⚖️',stocks:'📈',crypto:'🪙',bitcoin:'🪙',
  laptop:'💻',computer:'💻',email:'📧',couch:'🛋️',sofa:'🛋️',bed:'🛏️',chair:'🪑',table:'🪑',desk:'🪑',car:'🚗',cars:'🚗',truck:'🚚',bus:'🚌',bike:'🚲',boat:'⛵',house:'🏠',tree:'🌳',beach:'🏖️',sea:'🌊',ocean:'🌊',lake:'🌊',river:'🌊',waves:'🌊',cup:'☕',mug:'☕',soup:'🍲',stew:'🍲',noodles:'🍜',ramen:'🍜',pasta:'🍝',steak:'🥩',meat:'🍖',beer:'🍺',juice:'🧃',milk:'🥛',soda:'🥤',drink:'🥤',
  smoothie:'🥤',water:'🥛',salad:'🥗',chips:'🍟',fries:'🍟',chocolate:'🍫',candy:'🍬',cereal:'🥣',pancakes:'🥞',pancake:'🥞',waffle:'🧇',sandwich:'🥪',
  burger:'🍔',cheeseburger:'🍔',hotdog:'🌭',icecream:'🍦',pie:'🥧',dumpling:'🥟',rice:'🍚',doughnut:'🍩',book:'📖',newspaper:'📰',cocktail:'🍸',
  bone:'🦴',popcorn:'🍿',spaghetti:'🍝',lollipop:'🍭',soccer:'⚽',football:'🏈',volleyball:'🏐',bat:'🦇',phone:'📱',smartphone:'📱',food:'🍽️',meal:'🍽️',
  lunch:'🍱',dinner:'🍽️',breakfast:'🍳',snack:'🍪',fruit:'🍎',vegetables:'🥦',broccoli:'🥦',corn:'🌽',potato:'🥔',tomato:'🍅',orange:'🍊',peach:'🍑',pear:'🍐'};
function emojiKind(e){
  const cp=e.codePointAt(0);
  if([0x2615,0x1F375,0x1F376,0x1F377,0x1F378,0x1F379,0x1F37A,0x1F37B,0x1F942,0x1F943,0x1F95B,0x1F964,0x1F9C3,0x1F9C9,0x1F9CB].includes(cp)) return 'drink';
  if((cp>=0x1F32D&&cp<=0x1F32F)||(cp>=0x1F345&&cp<=0x1F37F)||(cp>=0x1F950&&cp<=0x1F96F)||(cp>=0x1F9C0&&cp<=0x1F9CB)||(cp>=0x1FAD0&&cp<=0x1FADB)||cp===0x1F9B4) return 'food';
  if((cp>=0x1F3B7&&cp<=0x1F3BB)||[0x1F941,0x1FA95,0x1FA97,0x1FA98,0x1FA87,0x1FA88,0x1F3A4,0x1F3A7,0x1FA88,0x1FA97].includes(cp)) return 'instrument';
  if((cp>=0x1F400&&cp<=0x1F43F)||(cp>=0x1F980&&cp<=0x1F9AE)||[0x1F98C,0x1F54A,0x1F577,0x1FAB0,0x1FAB1,0x1FAB2,0x1FAB3,0x1FABC,0x1F984,0x1F985].includes(cp)) return 'animal';
  if((cp>=0x1F680&&cp<=0x1F6C5)||(cp>=0x1F6E9&&cp<=0x1F6FC)||[0x26F5,0x2708].includes(cp)) return 'vehicle';
  if([0x1F4D6,0x1F4D5,0x1F4F1,0x1F4F7,0x2602,0x1F302,0x1F388,0x1F381,0x1F339,0x1F337,0x1F33B,0x1F33C,0x1F511,0x270F,0x1F58A,0x1F58C,0x1F4F0,0x1F3C6,0x1F3C5,0x1F5E1,0x1FA84,0x1F56F,0x1F526,0x26BD,0x1F3C0,0x1F3C8,0x26BE,0x1F3BE,0x1F3D0,0x1F3D3,0x1F3F8,0x1F94E,0x1F94F,0x1F52B,0x1FA83,0x1F3A9,0x1F453,0x1F45C,0x1F4BC,0x1F392,0x2709,0x1F48C,0x1F4E6,0x1F9F8,0x1FA81,0x1F9F9,0x1F528,0x1F527,0x1FA9B,0x1F9EF,0x1F4A1,0x1F50D,0x1F5FA,0x1F9ED,0x1F3AE,0x1F579,0x1F4BB,0x1F4F8,0x1F3A5,0x1F9F4,0x1F9FD,0x1FAA5,0x1FAA3].includes(cp)) return 'held';
  return 'thing';
}
function lookupNoun(w){
  if(!w||w.length<3||STOP.has(w)) return null;
  const tryW=x=>{const e=GLYPH[x]||ALIAS[x]||(typeof EMOJI!=='undefined'&&EMOJI[x]?EMOJI[x][0]:null); return e?{e,word:x,kind:emojiKind(e)}:null};
  return tryW(w)||(w.endsWith('ies')&&tryW(w.slice(0,-3)+'y'))||(w.endsWith('es')&&tryW(w.slice(0,-2)))||(w.endsWith('s')&&tryW(w.slice(0,-1)))||null;
}
const glyphWidth=it=>{const p=glyphPanel(it.e); if(!p) return null; const h=it.big?250:SKY_GLYPH.has(it.word)?120:165; return p.width*h/p.height};

// ---------- stories: actions acted out across time ----------
function hoop(c,x,rim){const g=G(); pen(c,6,.85); line(c,x+56,g,x+56,rim-50); line(c,x+56,rim-40,x+36,rim-40); ink(c,.75); c.fillRect(x+30,rim-76,10,82);
  pen(c,4); oval(c,x+6,rim,24,5,0,false); pen(c,2,.7); for(let k=-2;k<=2;k++) line(c,x+6+k*10,rim+3,x+6+k*6,rim+34); line(c,x-14,rim+16,x+26,rim+16)}
function storyThrow(x0,span,m){
  const tw=m.target&&m.target.word, bb=tw==='baseball', bk=tw==='basketball';
  const name=m.object||'ball', o=OBJ[name]||OBJ.ball, g=G(), ops=[], arcs=[];
  const flight=bb?380:Math.round(Math.max(440,Math.min(1000,span*0.45))), tail=m.sport?320:bb?620:170;
  const step=sp(o.long?124:84), nRun=bb||bk?1:Math.max(2,Math.min(o.long?5:7,Math.round((span-flight-tail-200)/step)));
  let x=x0+60;
  for(let i=0;i<nRun;i++){const px=x, pose=o.long?(i%2?'carryB':'carryA'):(i%2?'runB':'runA'); ops.push(c=>person(c,px,{pose,kind:m.kind,hold:o.long?{obj:name,hand:0,ang:-0.12}:null})); x+=step}
  x+=o.long?50:20; const wx=x; ops.push(c=>person(c,wx,{pose:'windup',kind:m.kind,hold:{obj:name,hand:0,ang:o.long?-0.3:0}})); x+=o.long?150:122;
  const rx=x, R=poseGeom(rx,{pose:'release'}), hx=R.arms[0][1][0], hy=R.arms[0][1][1];
  ops.push(c=>person(c,rx,{pose:'release',kind:m.kind}));
  const y1=bb?hy+14:bk?g-178:o.stuck?g-50:g-12, apex=bb?hy-46:bk?SKY+30:SKY+48, lx=hx+flight, hump=(hy+y1)/2-apex;
  const P=u=>[hx+flight*u,hy+(y1-hy)*u-4*hump*u*(1-u)], A=u=>Math.atan2((y1-hy)-4*hump*(1-2*u),flight);
  ops.push(c=>{
    ink(c,.3); for(let s=26;s<flight-20;s+=24){const [px,py]=P(s/flight); circ(c,px,py,2.2,true)}
    const n=Math.max(3,Math.round(flight/170));
    for(let i=1;i<=n;i++){const u=i/n,[px,py]=P(u); c.save(); c.translate(px,py); if(!o.spin) c.rotate(A(u)); o.draw(c); c.restore()}
    if(o.bounce&&!bb&&!bk){ink(c,.75); circ(c,lx+46,g-34,9,true); ink(c,.6); circ(c,lx+86,g-18,8,true)}
    if(bk) hoop(c,lx,y1);
  });
  arcs.push({xa:hx,xb:lx,y0:hy,y1,apex});
  x=lx+(o.stuck?120:160);
  if(bb){ // the batter swings, and the ball flies off for a home run
    const bx=lx+44, B=poseGeom(bx,{pose:'swing',facing:-1,other:true}), [tx,ty]=B.arms[1][1], hx2=tx-50, hy2=ty-6, f2=520, y2=SKY+34;
    const hump2=(hy2+y2)/2-(SKY+10), P2=u=>[hx2+f2*u,hy2+(y2-hy2)*u-4*hump2*u*(1-u)];
    ops.push(c=>{person(c,bx,{pose:'swing',facing:-1,other:true,kind:'man',hold:{obj:'bat',hand:1,ang:0}});
      ink(c,1); star5(c,hx2,hy2,16); pen(c,3,.8); [[-24,-20],[-30,4],[-18,22]].forEach(([dx,dy])=>line(c,hx2+dx*0.6,hy2+dy*0.6,hx2+dx*1.3,hy2+dy*1.3));
      ink(c,.3); for(let q=30;q<f2;q+=26){const [px,py]=P2(q/f2); circ(c,px,py,2.2,true)} for(let i=1;i<=3;i++){const [px,py]=P2(i/3); c.save(); c.translate(px,py); OBJ.ball.draw(c); c.restore()}
      ink(c,.95); c.font='800 30px '+FONT; c.fillText('HOME RUN!',hx2+f2-150,y2+70)});
    arcs.push({xa:hx2,xb:hx2+f2,y0:hy2,y1:y2,apex:SKY+10}); x=hx2+f2+60; return {ops,arcs,width:x-x0}}
  if(m.sport){const px=x+90; ops.push(c=>podium(c,px,m)); x+=260} else {const px=x; ops.push(c=>{person(c,px,{pose:'cheer',kind:m.kind}); sparkle(c,px,G()-230)}); x+=130}
  return {ops,arcs,width:x-x0};
}
function storyKick(x0,span,m){
  const g=G(), ops=[], arcs=[]; let x=x0+60;
  const nRun=Math.max(2,Math.min(6,Math.round((span-900)/82)));
  for(let i=0;i<nRun;i++){const px=x; ops.push(c=>person(c,px,{pose:i%2?'runB':'runA',kind:m.kind})); x+=sp(82)}
  x+=16; const kx=x, K=poseGeom(kx,{pose:'kick'}), [fx,fy]=K.legs[1][1];
  ops.push(c=>{person(c,kx,{pose:'kick',kind:m.kind}); ink(c,1); c.save(); c.translate(fx+14,fy-6); OBJ.ball.draw(c); c.restore()});
  const flight=Math.max(420,Math.min(700,span*0.4)), hx=fx+14, hy=fy-6, y1=m.goal?g-60:g-12, apex=g-250, lx=hx+flight, hump=(hy+y1)/2-apex;
  const P=u=>[hx+flight*u,hy+(y1-hy)*u-4*hump*u*(1-u)];
  ops.push(c=>{ink(c,.3); for(let s=24;s<flight;s+=24){const [px,py]=P(s/flight); circ(c,px,py,2.2,true)} for(let i=1;i<=4;i++){const [px,py]=P(i/4); c.save(); c.translate(px,py); OBJ.ball.draw(c); c.restore()} if(m.goal) goal(c,lx-30)});
  arcs.push({xa:hx,xb:lx,y0:hy,y1,apex});
  x=lx+(m.goal?190:120); const cx=x; ops.push(c=>{person(c,cx,{pose:'cheer',kind:m.kind}); sparkle(c,cx,G()-230)}); x+=130;
  return {ops,arcs,width:x-x0};
}
function storyRun(x0,span,m){
  const ops=[]; let x=x0+50; const n=Math.max(3,Math.min(9,Math.floor((span-(m.finish?260:80))/sp(86))));
  for(let i=0;i<n;i++){const px=x; ops.push(c=>person(c,px,{pose:i%2?'runB':'runA',kind:m.kind})); x+=sp(86)}
  if(m.finish){const fx=x+10; ops.push(c=>finishFlag(c,fx)); x+=110; const cx=x; ops.push(c=>{person(c,cx,{pose:'cheer',kind:m.kind}); sparkle(c,cx,G()-230)}); x+=120}
  return {ops,arcs:[],width:x-x0};
}
function storyJump(x0,span,m){
  const ops=[], arcs=[]; let x=x0+50;
  for(let i=0;i<2;i++){const px=x; ops.push(c=>person(c,px,{pose:i%2?'runB':'runA',kind:m.kind})); x+=sp(84)}
  const k=Math.max(1,Math.floor((span-260)/sp(190))), hurdles=m.hurdle||m.sport;
  for(let i=0;i<k;i++){
    const a=x, mid=a+95, b=a+190, h0=poseGeom(a,{pose:'runA'}).head[1], hA=poseGeom(mid,{pose:'jump',lift:62}).head[1];
    ops.push(c=>{ if(hurdles) hurdle(c,mid); person(c,mid,{pose:'jump',kind:m.kind,lift:62}); person(c,b,{pose:i%2?'runA':'runB',kind:m.kind}) });
    arcs.push({xa:a,xb:b,y0:h0,y1:h0,apex:hA-30}); x=b;
  }
  x+=110; const cx=x; ops.push(c=>{person(c,cx,{pose:'cheer',kind:m.kind}); if(m.sport) sparkle(c,cx,G()-230)}); x+=110;
  return {ops,arcs,width:x-x0};
}
function storyDance(x0,span,m){
  const ops=[]; let x=x0+60; const n=Math.max(3,Math.floor((span-60)/sp(100))), P=['danceA','danceB','danceC'];
  for(let i=0;i<n;i++){const px=x; ops.push(c=>{person(c,px,{pose:P[i%3],kind:m.kind}); if(i<n-1) note(c,px+44,G()-236+((i*37)%50),i)}); x+=sp(100)}
  return {ops,arcs:[],width:x-x0+20};
}
function storySwim(x0,span,m){
  const ops=[]; const n=Math.max(2,Math.floor((span-80)/140));
  ops.push(c=>{waves(c,x0,x0+span,G()-22); waves(c,x0+11,x0+span+11,G()-6); for(let i=0;i<n;i++) swimmer(c,x0+110+i*140,i%2)});
  return {ops,arcs:[],width:span};
}
function storyRide(x0,span,m){
  const ops=[]; let x=x0+90;
  if(m.horse){const n=Math.max(2,Math.floor((span-80)/165)); for(let i=0;i<n;i++){const px=x; ops.push(c=>{horse(c,px,{phase:i*1.9}); person(c,px-10,{pose:'ride',kind:m.kind,hipY:G()-118})}); x+=165}}
  else {const n=Math.max(2,Math.floor((span-80)/160)); for(let i=0;i<n;i++){const px=x; ops.push(c=>{bike(c,px); person(c,px-14,{pose:'cycle',kind:m.kind,hipY:G()-76})}); x+=160}}
  return {ops,arcs:[],width:x-x0};
}
function storyKite(x0,span,m){
  const ops=[]; let x=x0+60; const n=Math.max(2,Math.floor((span-60)/200));
  for(let i=0;i<n;i++){const px=x; ops.push(c=>{const P=person(c,px,{pose:'hold',kind:m.kind}); const [hx,hy]=P.arms[1][1]; kite(c,px+110,SKY+70+(i%2)*40,hx,hy)}); x+=200}
  return {ops,arcs:[],width:x-x0};
}
function storySit(x0,span,m){
  if(m.restingAnimal){const ops=[], px=x0+130, t=m.target, a=m.restingAnimal, sleeping=/sleep|nap|rest/.test(m.verb||'');
    ops.push(c=>{ if(t&&t.e) glyphAt(c,t.e,px,G()-70,140);
      c.save(); if(t&&t.e){c.translate(0,-70)} if(a==='dog') dog(c,px-10,{pose:'sit'}); else if(a==='cat') cat(c,px-40,{}); else if(a==='rabbit') rabbit(c,px-20,{}); else horse(c,px,{});
      c.restore(); if(sleeping) zzz(c,px+44,G()-(t&&t.e?230:160)) });
    return {ops,arcs:[],width:300}}
  const ops=[], px=x0+120, reading=/read|book/.test(m.verb||''), sleeping=/sleep|nap/.test(m.verb||'');
  const about=m.target&&m.target.e&&reading?m.target:null;
  ops.push(c=>{bench(c,px); const P=person(c,px-6,{pose:reading?'read':'sit',kind:m.kind,book:reading}); if(sleeping) zzz(c,px+30,G()-150);
    if(about){const bx=px+60, by=P.head[1]-90; bubble(c,bx,by,128,96,null,{thought:true,tx:P.head[0]+20,ty:P.head[1]-24}); glyphAt(c,about.e,bx,by,62)}});
  return {ops,arcs:[],width:260};
}
function storyCheer(x0,span,m){
  const ops=[]; let x=x0+60; const n=Math.max(2,Math.floor((span-60)/sp(100)));
  for(let i=0;i<n;i++){const px=x; ops.push(c=>{person(c,px,{pose:i%2?'wave':'cheer',kind:m.kind}); if(i%2===0) sparkle(c,px,G()-230)}); x+=sp(100)}
  return {ops,arcs:[],width:x-x0};
}
function chomp(c,x,y,f){pen(c,3,.85); for(let i=0;i<3;i++){const a=-0.6+i*0.6; line(c,x+f*Math.cos(a)*12,y+Math.sin(a)*12,x+f*Math.cos(a)*22,y+Math.sin(a)*22)}}
function crumbs(c,x){const g=G(); ink(c,.8); [[0,0],[10,-4],[-8,-2],[18,2],[4,-9],[26,-3]].forEach(([dx,dy])=>circ(c,x+dx,g-6+dy,2.6,true))}
function steam(c,x,y){pen(c,3,.55); for(let k=0;k<3;k++){c.beginPath(); c.moveTo(x-12+k*12,y); c.bezierCurveTo(x-20+k*12,y-14,x-4+k*12,y-24,x-12+k*12,y-38); c.stroke()}}
function heldItem(c,P,t,size,o={}){
  const [hx,hy]=P.arms[1][1], f=P.f;
  if(t&&t.e&&glyphAt(c,t.e,hx+f*(o.dx!=null?o.dx:size*0.3),hy+(o.dy!=null?o.dy:-size*0.3),size,o)) return;
  if(t&&t.obj&&OBJ[t.obj]){c.save(); c.translate(hx,hy); c.scale(f,1); OBJ[t.obj].draw(c); c.restore()}
}
// eating and drinking: carry it in, take bites (or sips) until it's gone, then a happy ending
function storyConsume(x0,span,m){
  if(m.eater){const t=m.target&&m.target.e?m.target:{e:'🍖'}, a=m.eater, step=230, ops=[]; let x=x0+70; const n=Math.max(2,Math.floor((span-60)/step));
    for(let i=0;i<n;i++){const px=x, bites=Math.min(3,i%4); ops.push(c=>{
      if(a==='dog') dog(c,px,{pose:'run',phase:0.3}); else if(a==='cat') cat(c,px,{phase:0.3}); else if(a==='rabbit') rabbit(c,px,{}); else horse(c,px,{});
      if(i%4===3){heart(c,px+30,G()-150,0.55); crumbs(c,px+70)} else {glyphAt(c,t.e,px+(a==='horse'?150:96),G()-30,58,{bites}); chomp(c,px+(a==='horse'?122:68),G()-60,1)}}); x+=step}
    return {ops,arcs:[],width:x-x0}}
  const drink=m.kindAct==='drink', t=m.target&&m.target.e?m.target:{e:drink?'🥤':'🍔',word:drink?'drink':'food'}, S=drink?56:60, step=sp(132), ops=[];
  const beats=drink?[['carry',0],['offer',0],['sip',0.6],['offer',0],['sip',1.1],['cheer',-1]]
                   :[['carry',0],['offer',0],['bite',0],['offer',1],['bite',1],['offer',2],['bite',2],['offer',3],['cheer',-1]];
  const per=beats.length*step+40, rounds=Math.max(1,Math.floor((span-60)/per));
  let x=x0+60;
  for(let r=0;r<rounds;r++){
    beats.forEach(([pose,st])=>{const px=x; ops.push(c=>{
      const P=person(c,px,{pose:pose==='sip'?'bite':pose,kind:m.kind});
      if(st<0){ if(drink) sparkle(c,px,G()-232); else {heart(c,px+4,G()-238,0.6); crumbs(c,px-44)} return }
      const mouth=pose==='bite'||pose==='sip';
      if(drink) heldItem(c,P,t,S,{dx:mouth?S*0.28:S*0.32,dy:mouth?-S*0.2:-S*0.3,tilt:mouth?-P.f*st:0});
      else heldItem(c,P,t,S,{dx:mouth?S*0.25:S*0.32,dy:mouth?-S*0.12:-S*0.32,bites:st});
      if(mouth&&!drink) chomp(c,P.head[0]+P.f*40,P.head[1]+6,P.f);
    }); x+=step});
    x+=40;
  }
  return {ops,arcs:[],width:x-x0};
}
// playing an instrument or singing
function storyMusic(x0,span,m){
  const sing=/sing|song/.test(m.verb||''), t=m.target&&m.target.e?m.target:(sing?{e:'🎤'}:{e:'🎸'}), step=sp(132), ops=[];
  const n=Math.max(2,Math.floor((span-60)/step)); let x=x0+60;
  for(let i=0;i<n;i++){const px=x; ops.push(c=>{
    const P=person(c,px,{pose:sing?(i%4===3?'cheer':'sing'):'strum',kind:m.kind});
    if(sing){ if(i%4!==3) heldItem(c,P,t,34,{dx:8,dy:-2}) } else heldItem(c,P,t,84,{dx:-6,dy:-4,tilt:-0.45});
    note(c,px+48,G()-212-((i*29)%40),i); if(i%2) note(c,px+80,G()-246,i+1);
  }); x+=step}
  return {ops,arcs:[],width:x-x0};
}
// hugging or petting an animal or a person
function storyHug(x0,span,m){
  const t=m.target, step=270, ops=[]; const n=Math.max(1,Math.floor((span-60)/step)); let x=x0+60;
  const other=(c,px)=>{ const s=t&&t.s&&t.s.name;
    if(s==='dog') dog(c,px+10,{pose:'sit',facing:-1}); else if(s==='cat') cat(c,px+40,{facing:-1});
    else if(s==='person'||!t){const pr=m.pair||{}; person(c,px-10,{pose:'hug',facing:-1,other:true,kind:pr.kind||(m.kind==='girl'?'man':'girl'),outfit:pr.outfit,scale:pr.scale})}
    else if(t.e) glyphAt(c,t.e,px+20,G()-62,120,{flip:true}); else if(t.s) t.s.draw(c,px-100,240,m) };
  for(let i=0;i<n;i++){const px=x, petting=/pet|stroke/.test(m.verb||'')&&t&&t.s&&t.s.name!=='person'; ops.push(c=>{
    person(c,px,{pose:petting?'pet':'hug',kind:m.kind,solo:!t||(t.s&&t.s.name==='person')}); other(c,px+(petting?96:62));
    heart(c,px+44,G()-222,0.5); if(i%2) heart(c,px+86,G()-252,0.36) }); x+=step}
  return {ops,arcs:[],width:x-x0};
}
// cooking: a pan on the go, then the dish
function storyCook(x0,span,m){
  const t=m.target, step=sp(130), ops=[]; let x=x0+60; const n=Math.max(2,Math.min(5,Math.floor((span-(t?280:60))/step)));
  for(let i=0;i<n;i++){const px=x; ops.push(c=>{const P=person(c,px,{pose:'offer',kind:m.kind}); heldItem(c,P,{e:'🍳'},58); steam(c,P.arms[1][1][0]+P.f*22,P.arms[1][1][1]-58)}); x+=step}
  if(t&&t.e){const px=x+70; ops.push(c=>{glyphAt(c,t.e,px,G()-82,150); sparkle(c,px,G()-232)}); x+=220}
  return {ops,arcs:[],width:x-x0};
}
// any other verb: hold the thing, or stand by it and reach for it; with no thing, act it out and write the verb
function storyUse(x0,span,m){
  const t=m.target, ops=[]; let x=x0+60;
  const small=t&&(t.obj||(t.e&&['food','drink','instrument','held'].includes(t.kind)));
  if(t&&!small){
    const big=!!t.big, step=big?460:380, n=Math.max(1,Math.floor((span-60)/step));
    const wet=/wash|clean|scrub|rins|water|spray|hos/.test(m.verb||'');
    for(let i=0;i<n;i++){const px=x; ops.push(c=>{const P=person(c,px,{pose:i%2?'offer':'reach',kind:m.kind}); const art=/paint|draw|sketch/.test(m.verb||'');
      if(art&&t.e){const ex=px+190; pen(c,6,.85); line(c,ex-60,G(),ex-30,G()-230); line(c,ex+60,G(),ex+30,G()-230); line(c,ex,G()-10,ex,G()-230); line(c,ex-70,G()-60,ex+70,G()-60);
        glyphAt(c,t.e,ex,G()-150,170); const [hx,hy]=P.arms[1][1]; pen(c,4); line(c,hx,hy,hx+26,hy-22); glyphAt(c,'🎨',P.arms[0][1][0]-10,P.arms[0][1][1]-6,38)}
      else if(t.e) glyphAt(c,t.e,big?px+190:px+150,big?G()-128:G()-82,big?250:150); else if(t.s) t.s.draw(c,px+50,280,m);
      if(wet){const [hx,hy]=P.arms[1][1]; ink(c,.9); glyphAt(c,'🧽',hx+10,hy,30); pen(c,2.5,.8); const r=rng(px); for(let k=0;k<9;k++) circ(c,hx+40+r()*120,hy-60+r()*80,3+r()*7,false)}}); x+=step}
  } else {
    if(!t){scratch.font=LETTER_FONT; const w=m.verb, lw=scratch.measureText(w).width, lx=x; ops.push(c=>lettering(c,lx,w)); x+=lw+70}
    const poses=t?['carry','offer','carry2','offer']:['walkA','stand','walkB','stand'], step=sp(118);
    for(let i=0;(x<x0+span-60&&i<(t?99:6))||i<2;i++){const px=x, pose=poses[i%4]; ops.push(c=>{const P=person(c,px,{pose,kind:m.kind}); if(t) heldItem(c,P,t,60)}); x+=step}
  }
  return {ops,arcs:[],width:x-x0};
}
// walking somewhere, with whoever or whatever comes along
function storyWalk(x0,span,m){
  const t=m.target, a=t&&t.s&&['dog','cat','horse','rabbit'].includes(t.s.name)?t.s.name:null, step=sp(t?190:100), ops=[];
  let x=x0+60; const n=Math.max(2,Math.floor((span-60)/step));
  for(let i=0;i<n;i++){const px=x; ops.push(c=>{const P=person(c,px,{pose:t?(i%2?'carry2':'carry'):(i%2?'walkB':'walkA'),kind:m.kind});
    if(a==='dog'){const [hx,hy]=P.arms[1][1]; pen(c,2.5,.7); c.beginPath(); c.moveTo(hx,hy); c.quadraticCurveTo(hx+40,hy+30,px+118,G()-76); c.stroke(); dog(c,px+80,{phase:i*1.7})}
    else if(a==='cat') cat(c,px+70,{phase:i*1.7}); else if(a==='horse') horse(c,px+110,{phase:i*1.9}); else if(a==='rabbit') rabbit(c,px+70,{lift:i%2?30:0});
    else if(t&&t.e) heldItem(c,P,t,54); }); x+=step}
  return {ops,arcs:[],width:x-x0};
}
function tear(c,x,y,s=1){ink(c,.95); c.beginPath(); c.moveTo(x,y-7*s); c.quadraticCurveTo(x+5*s,y+1*s,x,y+4*s); c.quadraticCurveTo(x-5*s,y+1*s,x,y-7*s); c.fill()}
function bubble(c,x,y,w,h,txt,o={}){
  pen(c,4,.85);
  if(o.jag){c.beginPath(); const n=16; for(let i=0;i<=n;i++){const a=i/n*Math.PI*2, r=i%2?0.74:1; c.lineTo(x+Math.cos(a)*w/2*r,y+Math.sin(a)*h/2*r)} c.closePath(); c.stroke()}
  else oval(c,x,y,w/2,h/2,0,false);
  if(o.tx!=null){ if(o.thought){ink(c,.85); circ(c,x+(o.tx-x)*0.55,y+h/2+(o.ty-y-h/2)*0.45,5,true); circ(c,x+(o.tx-x)*0.85,y+h/2+(o.ty-y-h/2)*0.8,3,true)}
    else {const sx=x+(o.tx>x?w*0.1:-w*0.1); pen(c,4,.85); line(c,sx-7,y+h/2-4,o.tx,o.ty); line(c,sx+7,y+h/2-4,o.tx,o.ty)} }
  if(txt){ink(c,.95); c.font='800 '+Math.round(h*0.42)+'px '+FONT; c.textAlign='center'; c.textBaseline='middle'; c.fillText(txt,x,y+1); c.textAlign='left'; c.textBaseline='alphabetic'}
}
function storyFeel(x0,span,m){
  const mode=m.kindAct, t=m.target&&!m.target.implicit&&m.target.e?m.target:null, ops=[], g=G(); let x=x0+60;
  if(mode==='talk'&&m.speech){
    const step=sp(260), n=Math.max(1,Math.floor((span-60)/step));
    for(let i=0;i<n;i++){const px=x; ops.push(c=>{const P=person(c,px,{pose:i%2?'yell':'talk',kind:m.kind}); const lx=px+66;
      ink(c,.75); poly(c,[[lx-24,g],[lx+24,g],[lx+30,g-92],[lx-30,g-92]],true); ink(c,.9); c.fillRect(lx-36,g-100,72,10);
      pen(c,3,.85); line(c,lx-12,g-100,lx-22,g-128); ink(c,1); oval(c,lx-24,g-132,5,7,0.4,true);
      bubble(c,P.head[0]+30,P.head[1]-80,112,56,['…and so','we can!','thank you'][i%3],{tx:P.head[0]+8,ty:P.head[1]-22})}); x+=step}
  } else if(mode==='talk'||mode==='argue'||mode==='fight'){
    const pr=m.pair||{kind:m.kind==='girl'?'man':'girl',scale:1}, gap=mode==='fight'?96:132, step=gap+200, n=Math.max(1,Math.floor((span-60)/step));
    for(let i=0;i<n;i++){const px=x; ops.push(c=>{
      const PP=mode==='fight'?[i%2?'punch':'box',i%2?'box':'punch']:mode==='argue'?[i%2?'talk':'yell',i%2?'yell':'talk']:[i%2?'stand':'talk',i%2?'talk':'stand'];
      const A=person(c,px,{pose:PP[0],kind:m.kind,solo:true}), B=person(c,px+gap,{pose:PP[1],facing:-1,other:true,kind:pr.kind,outfit:pr.outfit,scale:pr.scale});
      if(mode==='fight'){ink(c,1); star5(c,px+gap/2,g-150,18); ink(c,.9); c.font='800 24px '+FONT; c.textAlign='center'; c.fillText(i%2?'BAM':'POW',px+gap/2,g-192); c.textAlign='left'}
      else {const sp=i%2?B:A, sx=sp.head[0]+(i%2?44:-44); bubble(c,sx,sp.head[1]-74,mode==='argue'?120:98,58,mode==='argue'?['#@!','!!','?!'][i%3]:['hi!','…','ha','?'][i%4],{jag:mode==='argue',tx:sp.head[0],ty:sp.head[1]-22})}
      if(t&&i===0) glyphAt(c,t.e,px+gap/2,g-262,62);
    }); x+=step}
  } else if(mode==='think'){
    const step=sp(250), n=Math.max(1,Math.floor((span-60)/step));
    for(let i=0;i<n;i++){const px=x; ops.push(c=>{const P=person(c,px,{pose:'think',kind:m.kind}); const bx=px+78, by=P.head[1]-96;
      bubble(c,bx,by,132,94,t?null:'?',{thought:true,tx:P.head[0]+14,ty:P.head[1]-22}); if(t) glyphAt(c,t.e,bx,by,60)}); x+=step}
  } else if(mode==='fly'){
    const step=230, n=Math.max(2,Math.floor((span-60)/step)), under=m.target&&m.target.s&&!m.target.implicit?m.target.s:null;
    if(under) ops.push(c=>under.draw(c,x0+20,span-40,m));
    for(let i=0;i<n;i++){const px=x; ops.push(c=>{const hy=g-170-(i%2)*48; person(c,px,{pose:'fly',kind:m.kind,hipY:hy});
      pen(c,3,.45); [0,12,24].forEach(d=>line(c,px-64,hy-14+d,px-118,hy-14+d)); if(i%2===0&&!under) cloud(c,px+30,g-56,0.8,.35)}); x+=step}
  } else {
    const sad=mode==='sad', step=sp(sad?122:112);
    if(t){const gx=x+50; ops.push(c=>glyphAt(c,t.e,gx,g-72,132)); x+=170}
    const n=Math.max(2,Math.min(7,Math.floor((x0+span-x-40)/step)));
    for(let i=0;i<n;i++){const px=x; ops.push(c=>{
      if(sad){const P=person(c,px,{pose:i%2?'cry':'slump',kind:m.kind}), [hx,hy]=P.head; tear(c,hx+P.f*13,hy+14); tear(c,hx+P.f*16,hy+34,.8);
        cloud(c,hx,hy-66,.62,.55); pen(c,2.5,.5); for(let k=0;k<4;k++) line(c,hx-18+k*12,hy-48,hx-22+k*12,hy-34)}
      else {const P=person(c,px,{pose:i%2?'jump':'cheer',kind:m.kind}); ink(c,.9); c.font='800 24px '+FONT; c.fillText(i%2?'ha!':'ha ha',P.head[0]+20,P.head[1]-30)}
    }); x+=step}
  }
  return {ops,arcs:[],width:x-x0};
}
// everyday verbs bring their own prop when the prompt doesn't name one
const PROPS={};
('type:💻 code:💻 program:💻 work:💻 email:💻 text:📱 call:📱 scroll:📱 write:✏️ draw:✏️ sketch:✏️ paint:🎨 shop:🛍️ fix:🔧 repair:🔧 garden:🌱 plant:🌱 '+
 'fish:🎣 study:📚 learn:📚 teach:📚 photograph:📷 film:🎥 vote:🗳️ clean:🧹 sweep:🧹 mop:🧹 vacuum:🧹 wait:⏰ camp:⛺ skate:🛹 ski:🎿 game:🎮 knit:🧶 sew:🧵 '+
 'climb:🪜 dig:⛏️ chop:🪓 row:🛶 present:📊 deliver:📦 carry:📦 pack:🧳 travel:🧳 shower:🚿 brush:🪥 hammer:🔨 mow:🌱 shave:🪒 iron:👕 fold:👕 wash:🧽 bowl:🎳 golf:⛳ '+
 'pray:🙏 meditate:🕯️ celebrate:🎉 kiss:💋 propose:💍 marry:💍 graduate:🎓 vlog:🎥 stream:🎥 podcast:🎙️ bake:🧁 order:🧾 pay:💳 buy:🛍️ sell:💰 count:💰 save:💰')
 .split(' ').forEach(e=>{const [b,em]=e.split(':'); [b,b+'s',b+'ed',b+'ing',b.replace(/e$/,'')+'ing',b+b.slice(-1)+'ing',b.replace(/y$/,'ies')].forEach(f=>{if(!PROPS[f]) PROPS[f]=em})});
const BIG_PROP=new Set(['⛺','🪜','🛶']);
function propFor(v){const e=PROPS[v]; return e?{e,word:null,kind:BIG_PROP.has(e)?'thing':'held',implicit:true}:null}
const STORIES={sad:storyFeel,laugh:storyFeel,talk:storyFeel,argue:storyFeel,fight:storyFeel,think:storyFeel,fly:storyFeel,walk:storyWalk,eat:storyConsume,drink:storyConsume,music:storyMusic,hug:storyHug,cook:storyCook,use:storyUse,throw:storyThrow,kick:storyKick,run:storyRun,jump:storyJump,dance:storyDance,swim:storySwim,ride:storyRide,kite:storyKite,sit:storySit,cheer:storyCheer};

// ---------- vocabulary ----------
const wordsRe=s=>new RegExp('\\b('+s.trim().split(/\s+/).join('|')+')\\b');
const SUBJECTS=[
  {name:'dog',words:'dog dogs puppy puppies pup pups doggo doggos',base:4.4,min:2,grow:true,
    draw:(c,x,s)=>{const n=Math.max(2,Math.floor((s-40)/118)); for(let i=0;i<n;i++) dog(c,x+60+i*118,{phase:i*1.7})}},
  {name:'cat',words:'cat cats kitty kitties kitten kittens',base:3.6,min:2,grow:true,
    draw:(c,x,s)=>{const n=Math.max(2,Math.floor((s-40)/108)); for(let i=0;i<n;i++) cat(c,x+55+i*108,{phase:i*1.7})}},
  {name:'horse',words:'horse horses pony ponies stallion stallions',base:4.8,min:2.6,grow:true,
    draw:(c,x,s)=>{const n=Math.max(2,Math.floor((s-80)/150)); for(let i=0;i<n;i++) horse(c,x+90+i*150,{phase:i*1.9})}},
  {name:'rabbit',words:'rabbit rabbits bunny bunnies hare hares',base:4.0,min:2,grow:true,
    draw:(c,x,s)=>{const n=Math.max(3,Math.floor((s-60)/90)); for(let i=0;i<n;i++) rabbit(c,x+50+i*90,{lift:i%2?34:0})},
    pings:(x,s)=>{const n=Math.max(3,Math.floor((s-60)/90)), out=[]; for(let i=0;i+2<n;i+=2) out.push({xa:x+70+i*90,xb:x+70+(i+2)*90,y0:G()-70,y1:G()-70,apex:G()-140}); return out}},
  {name:'person',words:'man men woman women person people girl girls boy boys kid kids child children guy lady someone dad mom father mother friend friends he she grandpa grandma athlete athletes player players knight knights soldier soldiers farmer hunter i we dude dudes bro bros guys chef doctor nurse teacher student students baby babies toddler teen teenager teenagers boss worker workers pirate cowboy ninja grandmother grandfather uncle aunt son daughter brother sister husband wife boyfriend girlfriend couple family crowd fan fans me you dancer singer musician king kings queen queens prince princess wizard wizards witch witches astronaut astronauts police cop cops policeman officer firefighter firefighters fireman santa clown clowns superhero superheroes superman ballerina cowgirl chefs pirates ninjas runners grandparents grandmother grandfather professor scientist nerd hiker tourist',base:3.9,min:2.2,grow:true,stretch:0.5,
    draw:(c,x,s,m)=>{const n=Math.max(2,Math.floor((s-150)/95)); for(let i=0;i<n;i++) person(c,x+40+i*95,{pose:i%2?'walkB':'walkA',kind:m.kind}); person(c,x+40+n*95+20,{pose:'wave',kind:m.kind})}},
  {name:'birds',words:'bird birds flock flocks seagull seagulls gull gulls crow crows pigeon pigeons geese',base:4.0,min:2,grow:true,
    draw:(c,x,s)=>{const n=Math.max(3,Math.floor((s-30)/62)); for(let i=0;i<n;i++) bird(c,x+30+i*62,150-((i*13)%91)+(i%2)*20,i%2,1-(i%7)*0.04)}},
  {name:'butterflies',words:'butterfly butterflies moth moths',base:3.6,min:2,grow:true,
    draw:(c,x,s)=>{const n=Math.max(3,Math.floor((s-40)/80)), pt=i=>[x+40+i*80,150+Math.sin(i*1.3)*45];
      pen(c,2,.35); c.setLineDash([4,8]); c.beginPath(); for(let i=0;i<n;i++){const [px,py]=pt(i); c.lineTo(px,py+30)} c.stroke(); c.setLineDash([]);
      for(let i=0;i<n;i++){const [px,py]=pt(i); butterfly(c,px,py,i%2)}}},
  {name:'fish',words:'fish fishes salmon trout',base:4.8,min:3,grow:true,
    draw:(c,x,s)=>{waves(c,x,x+s,G()-24); waves(c,x+11,x+s+11,G()-6);
      for(let j=0;j<Math.max(1,Math.floor(s/520));j++) for(let i=0;i<5;i++){const u=i/4; fish(c,x+70+j*520+u*400,G()-30-4*130*u*(1-u),-(1-2*u)*0.9)}}},
  {name:'boat',words:'boat boats ship ships sail sailboat sailboats sailing yacht yachts canoe canoes',base:4.0,min:2.5,grow:true,
    draw:(c,x,s)=>{waves(c,x,x+s,G()-12); for(let i=0;i<Math.max(1,Math.floor(s/430));i++) boat(c,x+210+i*430)}},
  {name:'whale',words:'whale whales orca orcas',base:5.0,min:3,grow:true,
    draw:(c,x,s)=>{for(let i=0;i<Math.max(1,Math.floor(s/600));i++) whale(c,x+300+i*600); waves(c,x,x+s,G()-6)}},
  {name:'car',words:'car cars drive driving road truck trucks taxi',base:2.8,min:2,grow:true,draw:(c,x,s)=>car(c,x+s-110,s-230)},
  {name:'train',words:'train trains railway locomotive railroad',base:5.0,min:3,grow:true,draw:(c,x,s)=>train(c,x+20,s-40)},
  {name:'rocket',words:'rocket rockets launch launches launching spaceship spaceships space',base:4.2,min:2.5,grow:true,draw:(c,x,s)=>rocketFlight(c,x,s),
    pings:(x,s)=>[{xa:x+80,xb:x+s-70,y0:G()-50,y1:SKY+80,apex:null}]},
  {name:'plane',words:'plane planes airplane airplanes jet jets aeroplane',base:3.6,min:2.5,grow:true,draw:(c,x,s)=>planeFlight(c,x,s)},
  {name:'city',words:'city town skyline building buildings downtown skyscraper skyscrapers',base:4.0,min:2.5,grow:true,draw:(c,x,s)=>city(c,x+20,s-40)},
  {name:'rain',words:'rain rainy raining rainstorm storm storms stormy cloud clouds cloudy thunder thunderstorm',base:3.6,min:2.5,grow:true,draw:(c,x,s,m)=>rain(c,x,s,m.storm)},
  {name:'tree',words:'tree trees forest park woods',base:1.7,min:1.7,draw:(c,x)=>tree(c,x+95)},
  {name:'house',words:'house home cabin cottage',base:2.3,min:2.3,draw:(c,x,s,m)=>house(c,x+125,{lit:m.night})},
  {name:'flowers',words:'flower flowers garden rose roses bloom blooms tulip tulips daisy daisies',base:2.2,min:2.2,
    draw:(c,x)=>{flower(c,x+40,70,0);flower(c,x+95,110,1);flower(c,x+150,62,0);flower(c,x+205,92,1)}},
  {name:'mountains',words:'mountain mountains hill hills peak peaks alps',base:3.3,min:3.3,draw:(c,x)=>mountains(c,x+140)},
  {name:'heart',words:'heart hearts love',base:1.6,min:1.6,draw:(c,x)=>heart(c,x+75,150,1.6)},
  {name:'face',words:'face faces smiley portrait selfie',base:2.0,min:2,draw:(c,x)=>face(c,x+110,160)},
  {name:'spiral',words:'spiral spirals galaxy galaxies swirl swirls vortex',base:1.8,min:1.8,draw:(c,x)=>spiral(c,x+95,150,72)},
  {name:'shooting star',base:2.4,min:2.4,draw:(c,x,s)=>shootingStar(c,x+20,48,s-70)},
  {name:'bunting',base:3.0,min:2,grow:true,draw:(c,x,s)=>bunting(c,x+10,x+s-10,SKY+40)},
];
SUBJECTS.forEach(s=>{if(s.words) s.re=wordsRe(s.words)});
const SUB=Object.fromEntries(SUBJECTS.map(s=>[s.name,s]));
const ACTIONS=[
  {id:'throw',words:'throw throws throwing threw thrown toss tosses tossing tossed pitch pitches pitching hurl hurls hurling javelin',min:10,max:20},
  {id:'kick',words:'kick kicks kicking kicked soccer',min:8,max:14},
  {id:'ride',words:'ride rides riding rode cycling biking cyclist cyclists bicycle bicycles bike bikes',min:5,max:12},
  {id:'kite',words:'kite kites',min:6,max:12},
  {id:'swim',words:'swim swims swimming swam swimmer swimmers',min:5,max:12},
  {id:'dance',words:'dance dances dancing danced dancer dancers ballet',min:5,max:12},
  {id:'jump',words:'jump jumps jumping jumped leap leaps leaping hurdle hurdles hurdling',min:7,max:14},
  {id:'run',words:'run runs running ran race races racing sprint sprints sprinting jog jogs jogging marathon runner runners',min:5,max:10},
  {id:'sit',words:'sit sits sitting sat read reads reading relax relaxing rest resting sleep sleeps sleeping nap napping bench',min:3.5,max:3.5},
  {id:'cheer',words:'cheer cheers cheering celebrate celebrates celebrating celebration win wins winning won victory party',min:3,max:10},
];
ACTIONS.unshift(
  {id:'eat',words:'eat eats eating ate eaten devour devours devouring munch munches munching chomp chomps chomping bite bites biting nibble nibbles nibbling snack snacking feast feasting',min:6},
  {id:'drink',words:'drink drinks drinking drank sip sips sipping slurp slurping chug chugging gulp gulping',min:5},
  {id:'music',words:'play plays playing played strum strums strumming sing sings singing sang song songs jam jamming',min:5},
  {id:'hug',words:'hug hugs hugging hugged cuddle cuddles cuddling pet pets petting stroke stroking kiss kisses kissing',min:4},
  {id:'sad',words:'lose loses losing lost cry cries crying cried sob sobs sobbing weep weeps weeping fail fails failing failed mourn mourning grieve grieving sulk sulking frown frowning',min:5},
  {id:'laugh',words:'laugh laughs laughing laughed giggle giggles giggling smile smiles smiling grin grinning chuckle chuckling',min:5},
  {id:'fight',words:'fight fights fighting fought boxing punch punches punching wrestle wrestles wrestling battle battles battling duel dueling',min:5},
  {id:'argue',words:'argue argues arguing argued yell yells yelling shout shouts shouting scream screams screaming debate debates debating complain complaining',min:5},
  {id:'talk',words:'speech lecture lecturing preach preaching talk talks talking talked chat chats chatting speak speaks speaking meet meets meeting gossip gossiping whisper whispering discuss discussing interview interviewing',min:5},
  {id:'think',words:'think thinks thinking wonder wonders wondering ponder pondering dream dreams dreaming daydream daydreaming imagine imagining remember remembering worry worrying wish wishing',min:5},
  {id:'fly',words:'fly flies flying flew soar soars soaring float floats floating hover hovering',min:5},
  {id:'walk',words:'walk walks walking walked stroll strolls strolling hike hikes hiking wander wandering',min:5},
  {id:'cook',words:'cook cooks cooking cooked bake bakes baking baked grill grills grilling fry frying',min:5});
ACTIONS.forEach(a=>{a.re=wordsRe(a.words); a.max=a.max||999});
const ACT_WORD=new Map(); ACTIONS.forEach(a=>a.words.split(/\s+/).forEach(w=>{if(!ACT_WORD.has(w)) ACT_WORD.set(w,a.id)}));
ACT_WORD.set('javelin','throw'); ACT_WORD.set('soccer','kick');
const NOT_VERB=new Set('morning evening building ceiling wedding king ring spring string thing nothing something everything anything sibling ping pudding stuffing frosting icing clothing ending'.split(' '));
const genericVerb=w=>/^[a-z]{3,}ing$/.test(w)&&!NOT_VERB.has(w)&&!ACT_WORD.has(w);
const OBJ_RE={javelin:wordsRe('javelin javelins'),spear:wordsRe('spear spears'),arrow:wordsRe('arrow arrows bow archery archer'),
  frisbee:wordsRe('frisbee frisbees disc discus'),rock:wordsRe('rock rocks stone stones pebble pebbles shotput'),stick:wordsRe('stick sticks branch'),
  ball:wordsRe('ball balls baseball football soccer basketball volleyball')};
const THEME_WORDS={night:'night nights moon moonlight moonlit star stars starry evening midnight dark',ocean:'ocean sea seas wave waves beach lake river seaside bay surf',
  city:'city town skyline downtown street',rain:'rain rainy raining storm stormy thunder',day:'sun sunny sunset sunrise day morning summer noon',
  sport:'olympics olympic olympian stadium track arena championship competition tournament athlete athletes medal race games'};
const THEME=Object.fromEntries(Object.entries(THEME_WORDS).map(([k,v])=>[k,wordsRe(v)]));
const GIRL_RE=wordsRe('witch witches nurse nurses cowgirl wife girlfriend aunt grandmother ballerina queens girl girls woman women lady she mom mother daughter sister grandma queen princess ballerina');
const MINOR_RE=wordsRe('lose losing lost cry crying sob sobbing weep weeping fail failing failed mourning grieving sad rain rainy storm stormy dark lonely winter ghost ghosts grey gray night moon midnight');
const STOP=new Set(('a an the and or of in on at to with without under over past by for from into onto through across around near some is are was were be been '+
  'his her their my your our its this that these those very big small little tiny huge giant happy sad dark bright lonely beautiful '+
  'two three four one few many lots lot fetch just like who what when where why how it they them there here up down out off away back '+
  'still not no yes while then together each every all as than too also next first last new old has have had do does did can will '+
  'about against between behind beside during until upon within toward towards because if when go goes going went get gets got make makes made see sees saw look looks looking watch watching having '+
  'fast slow slowly quickly quick really super so much more most good bad great nice cool cute funny angry tired hungry thirsty sleepy excited '+
  'red blue green yellow orange purple pink black white brown gray grey gold silver tall short long fat thin young old huge tiny').split(' '));
const VOCAB=new Set();
[...SUBJECTS.map(s=>s.words||''),...ACTIONS.map(a=>a.words),...Object.values(THEME_WORDS),'javelin javelins spear spears arrow arrows bow archery frisbee disc discus rock stone stick ball balls baseball football soccer basketball volleyball goal hurdle',
 Object.keys(GLYPH).join(' '),'olympics'].join(' ').split(/\s+/).filter(Boolean).forEach(w=>VOCAB.add(w));
function osa(a,b){const m=a.length,n=b.length,d=[];for(let i=0;i<=m;i++)d.push([i]);for(let j=1;j<=n;j++)d[0][j]=j;
  for(let i=1;i<=m;i++)for(let j=1;j<=n;j++){const k=a[i-1]===b[j-1]?0:1; d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+k);
    if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1]) d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1)} return d[m][n]}
function correct(w){
  if(w.length<4||VOCAB.has(w)||STOP.has(w)||/\d/.test(w)||lookupNoun(w)) return w;
  if(/s$/.test(w)&&VOCAB.has(w.slice(0,-1))) return w;
  const lim=w.length>=7?2:1; let best=null,bd=9,tie=false;
  for(const v of VOCAB){ if(v[0]!==w[0]||Math.abs(v.length-w.length)>lim) continue; const d=osa(w,v); if(d<bd){bd=d;best=v;tie=false} else if(d===bd&&v!==best) tie=true }
  return bd<=lim&&!tie&&!ACT_WORD.has(best)&&!genericVerb(best)?best:w;
}
const SCENE_WORDS=new Set([...SUBJECTS.map(s=>s.words||''),...ACTIONS.map(a=>a.words),...Object.values(THEME_WORDS),'javelin javelins spear spears arrow arrows bow archery archer frisbee frisbees disc discus rock rocks stone stones pebble pebbles shotput stick sticks branch ball balls baseball football soccer basketball volleyball goal goals hurdle'].join(' ').split(/\s+/));
const POOLS={night:['shooting star','house','tree','city'],ocean:['boat','whale','fish','birds'],city:['city','car','train'],
  rain:['rain','tree','house'],day:['tree','flowers','birds','butterflies','mountains','rabbit'],sport:['bunting','tree','birds']};
const scratch=document.createElement('canvas').getContext('2d');
const TITLE_FONT='bold 40px '+FONT;

// ---------- world knowledge: names and things the sketchbook doesn't know are looked up on Wikipedia ----------
// This is a lookup, not AI: Wikipedia's search finds the article, and its pictures are traced into line art.
let WEB_ON=true;
const WEB=new Map(), WEB_PENDING=new Map();
const CONNECT=new Set('of de da di del van von la le the'.split(' '));
function tokenize(raw){
  const rawToks=raw.replace(/[^A-Za-z0-9\s'-]+/g,' ').replace(/['-]/g,' ').split(/\s+/).filter(Boolean);
  const toks=rawToks.map(t=>t.toLowerCase());
  const fixes=[], words=toks.map((w,i)=>{if(/^[A-Z]/.test(rawToks[i])&&i>0) return w; const r=correct(w); if(r!==w) fixes.push([w,r]); return r});
  return {rawToks,toks,words,fixes};
}
function isKnown(w){return STOP.has(w)||ACT_WORD.has(w)||genericVerb(w)||!!lookupNoun(w)||VOCAB.has(w)||!!NUMW[w]||!!OUTFIT[w]||/^\d+$/.test(w)||
  SUBJECTS.some(s=>s.re&&s.re.test(' '+w+' '))||Object.values(THEME).some(r=>r.test(' '+w+' '))}
function webSpans(words){
  const spans=[]; let i=0;
  while(i<words.length&&spans.length<3){
    if(i+1<words.length&&MULTI[words[i]+' '+words[i+1]]){i+=2; if(words[i]==='liberty') i++; continue}
    if(isKnown(words[i])||words[i].length<2){i++;continue}
    let j=i+1;
    while(j<words.length&&j-i<5){ if(!isKnown(words[j])){j++;continue}
      if(CONNECT.has(words[j])&&j+1<words.length&&!isKnown(words[j+1])){j+=2;continue} break }
    if(j<words.length&&lookupNoun(words[j])&&!ACT_WORD.has(words[j])&&!STOP.has(words[j])) j++;   // "eiffel tower", "golden gate bridge"
    spans.push({i,j,phrase:words.slice(i,j).join(' ')}); i=j;
  }
  return spans;
}
const webPhrases=prompt=>webSpans(tokenize(prompt.trim()).words).map(s=>s.phrase);
const WAPI='https://en.wikipedia.org/w/api.php?format=json&origin=*&';
async function fetchJSON(url,ms=10000){const ab=new AbortController(), t=setTimeout(()=>ab.abort(),ms); try{const r=await fetch(url,{signal:ab.signal}); if(!r.ok) throw new Error('HTTP '+r.status); return await r.json()} finally{clearTimeout(t)}}
function loadImg(src,ms=9000){return new Promise((res,rej)=>{const im=new Image(); im.crossOrigin='anonymous'; const t=setTimeout(()=>rej(new Error('timeout')),ms);
  im.onload=()=>{clearTimeout(t); res(im)}; im.onerror=()=>{clearTimeout(t); rej(new Error('image'))}; im.src=src})}
const PERSON_DESC=/\(born|\(\d{3,4}\s*[–-]|politician|singer|actor|actress|rapper|painter|sculptor|player|president|footballer|musician|writer|polymath|scientist|businessman|businesswoman|composer|comedian|director|athlete|entrepreneur|emperor|king of|queen of|philosopher|inventor|youtuber|influencer|model|chef|boxer|wrestler|astronaut|poet|novelist/i;
const DRAWABLE=/city|town|capital|country|state of|province|tower|building|skyscraper|bridge|monument|landmark|statue|palace|castle|temple|cathedral|church|mosque|museum|stadium|park|mountain|volcano|river|lake|island|desert|painting|sculpture|film|band|video game|company|brand|car|automobile|aircraft|airliner|ship|locomotive|species|breed|genus|dish|food|cuisine|pastry|bread|cake|drink|cocktail|fictional|character|franchise|mascot|album|team|club|planet|moon|comet|galaxy|robot|dinosaur|mammal|bird|fish|insect|reptile|flower|plant|tree|fruit|vegetable|instrument|toy|vehicle|motorcycle|bicycle|spacecraft|rocket|telescope|computer|smartphone|console|weapon|sword|festival|holiday|wonder/i;
const BAD_FILE=/logo|icon|flag|signature|firma|coat_of_arms|seal|map|plan|commons|wiki|symbol|edit|question|portal|stub|ambox|padlock|shackle|nuvola|crystal|disambig|\.svg/i;
// results: WEB holds found articles and confirmed misses; WEB_ERR holds network failures, which are retried, never treated as "not found"
const WEB_ERR=new Map();
const sleepMs=ms=>new Promise(r=>setTimeout(r,ms));
async function loadPicture(src){
  const alt=src.replace(/\?.*$/,'').replace(/\/\d+px-/,'/330px-');
  for(const u of [src,alt,src]){ try{ return await loadImg(u,15000) }catch(e){ await sleepMs(400) } }
  throw new Error('image blocked or timed out');
}
async function lookupOnce(phrase){
  const d=await fetchJSON(WAPI+'action=query&generator=search&gsrlimit=1&gsrsearch='+encodeURIComponent(phrase)+'&prop=pageimages|description|extracts&piprop=thumbnail&pithumbsize=500&exintro=1&explaintext=1&exsentences=2',12000);
  const pg=d.query&&Object.values(d.query.pages)[0]; if(!pg) return null;
  const norm=x=>x.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g,''), qn=norm(phrase), tn=norm(pg.title);
  const okTitle=tn.includes(qn)||qn.includes(tn)||phrase.split(' ').filter(w=>w.length>2).every(w=>tn.includes(norm(w)))||osa(qn,tn)<=Math.max(2,Math.floor(qn.length/5));
  if(!okTitle||/disambiguation|same term/i.test(pg.description||'')) return null;
  if(!phrase.includes(' ')&&!PERSON_DESC.test(pg.description||'')&&!DRAWABLE.test(pg.description||'')) return null;
  if(!pg.thumbnail) return null;
  const desc=pg.description||'', ext=' '+(pg.extract||'').toLowerCase()+' ';
  const she=(ext.match(/ (she|her) /g)||[]).length, he=(ext.match(/ (he|his|him) /g)||[]).length;
  // the main picture must load; if it can't, that's a network problem, so throw and let it retry
  const lead=await loadPicture(pg.thumbnail.source);
  const found=[{k:0,key:'web:'+phrase+'#0'}]; glyphCache.set(found[0].key,processPicture(lead,lead.naturalWidth,lead.naturalHeight,'lines',true));
  try{ // a few more pictures from the article, in the order they appear; these are optional
    const leadFile=decodeURIComponent(pg.thumbnail.source.split('?')[0].split('/').slice(-2,-1)[0]||'');
    const pr=await fetchJSON(WAPI+'action=parse&prop=images&page='+encodeURIComponent(pg.title));
    const files=((pr.parse&&pr.parse.images)||[]).filter(f=>/\.(jpe?g|png)$/i.test(f)&&!BAD_FILE.test(f)&&f!==leadFile).slice(0,6);
    if(files.length){
      const ii=await fetchJSON(WAPI+'action=query&prop=imageinfo&iiprop=url|size&iiurlwidth=500&titles='+encodeURIComponent(files.map(f=>'File:'+f.replace(/_/g,' ')).join('|')));
      const by=new Map(Object.values(ii.query.pages).filter(p=>p.imageinfo).map(p=>[p.title.replace(/^File:/,'').replace(/ /g,'_'),p.imageinfo[0]]));
      await Promise.all(files.map(async(f,n)=>{const inf=by.get(f); if(!(inf&&inf.thumburl&&inf.width>=220&&inf.height>=160)) return;
        try{const im=await loadImg(inf.thumburl,12000), key='web:'+phrase+'#'+(n+1); const cv=processPicture(im,im.naturalWidth,im.naturalHeight,'lines',true);
          if((cv.ink||0)>0.03&&(cv.ink||0)<0.13&&(cv.speck||0)<0.45){glyphCache.set(key,cv); found.push({k:n+1,key})}}catch{}}));
    }
  }catch{}
  found.sort((x,y)=>x.k-y.k);
  return {title:pg.title,desc,person:PERSON_DESC.test(desc),kind:she>he?'girl':'man',keys:found.slice(0,4).map(x=>x.key)};
}
async function lookupWeb(phrase){
  if(WEB.has(phrase)) return WEB.get(phrase);
  if(WEB_PENDING.has(phrase)) return WEB_PENDING.get(phrase);
  const job=(async()=>{
    let err=null;
    for(let attempt=0;attempt<3;attempt++){
      try{ const v=await lookupOnce(phrase); WEB.set(phrase,v); WEB_ERR.delete(phrase); return v }
      catch(e){ err=e; console.warn('Wikipedia lookup for "'+phrase+'" failed (attempt '+(attempt+1)+'):',e); await sleepMs(700*(attempt+1)) }
    }
    WEB_ERR.set(phrase,(err&&err.name==='AbortError')?'Wikipedia took too long to answer':(err&&err.message)||'network error'); return null;
  })();
  WEB_PENDING.set(phrase,job);
  try{ return await job } finally{ WEB_PENDING.delete(phrase) }
}
async function resolveWeb(prompt,onStatus){
  if(!WEB_ON) return;
  const ps=webPhrases(prompt).filter(p=>!WEB.has(p)); if(!ps.length) return;
  ps.forEach(p=>WEB_ERR.delete(p));   // failed lookups are always tried again
  onStatus&&onStatus(ps); await Promise.all(ps.map(lookupWeb));
}
// a bare topic becomes a little scene
const TOPIC={baseball:'a player throwing a baseball',basketball:'a player throwing a basketball',soccer:'a player kicking a soccer ball into the goal',
  football:'a player throwing a football',volleyball:'a player throwing a volleyball',frisbee:'a girl throwing a frisbee',javelin:'a man throwing a javelin at the olympics',
  hurdles:'an athlete jumping hurdles',marathon:'a woman running a marathon',boxing:'two boxers fighting',ballet:'a ballerina dancing',karaoke:'a girl singing',
  picnic:'a family eating sandwiches in the park',birthday:'kids eating cake at a party',breakfast:'a man eating pancakes',coffee:'a woman drinking coffee'};

// ---------- the planner ----------
function compose(...args){try{return composeInner(...args)}finally{ACTOR=null}}
function composeInner(prompt,target=30,seed=0,shownTitle=null){
  const raw=prompt.trim()||'a face and a spiral';
  const {rawToks,toks,words,fixes}=tokenize(raw);
  // a bare topic ("baseball", "picnic") becomes a scene, keeping what was typed as the title
  if(!shownTitle){const tk=words.find(w=>TOPIC[w]);
    if(tk&&!words.some(w=>ACT_WORD.has(w)||genericVerb(w)||SUB.person.re.test(' '+w+' '))) return composeInner(raw.replace(new RegExp('\\b'+tk+'\\b','i'),TOPIC[tk]),target,seed,raw)}
  const spans=WEB_ON?webSpans(words).map(sp=>({...sp,info:WEB.get(sp.phrase)})).filter(sp=>sp.info):[];
  const spanAt=i=>spans.find(sp=>sp.i===i);
  const p=' '+words.join(' ')+' ', has=re=>re.test(p), first=re=>{const mm=p.match(re); return mm?mm[1]:null};
  let title=shownTitle||raw; fixes.forEach(([a,b])=>{title=title.replace(new RegExp('\\b'+a+'\\b','i'),b)});
  const night=has(THEME.night), minor=has(MINOR_RE), sport=has(THEME.sport), olympic=/\bolympi/.test(p);
  const theme=has(THEME.ocean)?'ocean':sport?'sport':has(THEME.city)?'city':has(THEME.rain)?'rain':night?'night':'day';
  const m={kind:has(GIRL_RE)?'girl':'man',storm:/\b(storm\w*|thunder\w*)\b/.test(p),night,sport,olympic,
    goal:/\b(soccer|goal|goals|football)\b/.test(p),hurdle:/\bhurdl/.test(p),finish:sport||/\b(race|races|racing|marathon|sprint\w*)\b/.test(p)};
  const ops=[], arcs=[], X=s=>s*PPS, parts=[];
  // title: the prompt itself, painted in the upper frequencies
  scratch.font=TITLE_FONT;
  const lines=[]; for(const w of title.split(/\s+/)){const l=lines.length?lines[lines.length-1]+' '+w:w;
    if(lines.length&&scratch.measureText(l).width<=430) lines[lines.length-1]=l; else lines.push(w)}
  const tl=lines.slice(0,3), base={1:[110],2:[86,136],3:[70,116,162]}[tl.length]||[];
  const tw=Math.max(0,...tl.map(l=>scratch.measureText(l).width));
  ops.push(c=>{c.font=TITLE_FONT;ink(c,1);tl.forEach((l,i)=>c.fillText(l,60,base[i]))});
  const tTitle=(60+tw+70)/PPS;
  // ---------- who does what, to what ----------
  const fetch=/\bfetch\b/.test(p)||(has(SUB.dog.re)&&/\bballs?\b/.test(p)&&/\b(throw\w*|toss\w*|play\w*)\b/.test(p));
  const used=new Set();
  const subjAt=w=>SUBJECTS.find(s=>s.re&&s.re.test(' '+w+' '));
  let who=null, whoI=-1; const personIdx=[];
  for(let i=0;i<words.length;i++) if(SUB.person.re.test(' '+words[i]+' ')){personIdx.push(i); used.add(i)}
  if(personIdx.length){whoI=personIdx[0]; who=words[whoI]}
  let webWho=null;
  if(!who) for(const sp of spans){ if(!sp.info.person) continue; const nx=words[sp.j];
    if(!nx||ACT_WORD.has(nx)||genericVerb(nx)||STOP.has(nx)){webWho=sp; who=sp.info.title; whoI=sp.i; for(let q=sp.i;q<sp.j;q++) used.add(q); m.kind=sp.info.kind; break} }
  // a name or unknown word right before a verb is the person doing it ("Bob eating", "trump losing")
  if(!who) for(let i=0;i<words.length-1;i++){const w=words[i]; if(spans.some(sp=>i>=sp.i&&i<sp.j)) continue;
    if(STOP.has(w)||VOCAB.has(w)||lookupNoun(w)||w.length<2) continue;
    if(ACT_WORD.has(words[i+1])||genericVerb(words[i+1])){who=w; whoI=i; used.add(i); break}}
  if(personIdx.length) m.kind=GIRL_RE.test(' '+who+' ')?'girl':'man';
  const actorSpec=makeActor(words,personIdx,who,m.kind,p); m.pair=actorSpec.group[0]||null; ACTOR=actorSpec;
  const numW=words.find(w=>NUMW[w]&&!['group','several'].includes(w));
  const whoLabel=!who?null:webWho?webWho.info.title:!personIdx.length?(rawToks[whoI]||who):personIdx.length>1?[...new Set(personIdx.map(i=>words[i]))].join(' and '):(numW&&!['both','couple','pair'].includes(numW)?numW+' ':'')+who;
  const animal=['dog','cat','horse','rabbit','birds','fish','whale','butterflies'].some(n=>has(SUB[n].re));
  m.object=Object.keys(OBJ_RE).find(k=>has(OBJ_RE[k]))||null; m.horse=has(SUB.horse.re);
  // verbs, in the order they appear (at most two)
  let acts=[];
  if(!fetch) for(let i=0;i<words.length;i++){
    const w=words[i]; let id=ACT_WORD.get(w)||(who&&genericVerb(w)?'use':null); if(!id) continue;
    if(acts.some(x=>x.id===id)) continue;
    acts.push({id,word:w,i});
  }
  const pet=['dog','cat','rabbit','horse'].find(n=>has(SUB[n].re));
  if(!who&&animal) acts=acts.filter(x=>(x.id==='ride'&&m.horse)||(pet&&['sit','eat','drink'].includes(x.id)));
  if(!who&&pet&&acts.some(x=>['eat','drink'].includes(x.id))){m.eater=pet; for(let i=0;i<words.length;i++) if(SUB[pet].re.test(' '+words[i]+' ')) used.add(i)}
  if(!who&&pet&&acts.some(x=>x.id==='sit')){m.restingAnimal=pet; for(let i=0;i<words.length;i++) if(SUB[pet].re.test(' '+words[i]+' ')) used.add(i)}
  // what each verb acts on: the first known thing after it
  const thingAt=j=>{const w=words[j], bi=j+1<words.length?w+' '+words[j+1]:null, sp=spanAt(j);
    if(sp&&sp!==webWho) return {e:sp.info.keys[0],word:sp.info.title,kind:'thing',j,len:sp.j-sp.i,big:true,web:sp.info};
    if(bi&&MULTI[bi]) return {e:MULTI[bi],word:bi,kind:emojiKind(MULTI[bi]),j,len:2};
    if(Object.values(THEME).some(r=>r.test(' '+w+' '))&&!SUBJECTS.some(sb=>sb.re&&sb.re.test(' '+w+' '))) return null;
    const o=Object.keys(OBJ_RE).find(k=>OBJ_RE[k].test(' '+w+' '));
    const sb=subjAt(w), n=lookupNoun(w);
    if(sb&&sb.name!=='person') return {s:sb,e:n&&n.e,kind:n?n.kind:'thing',word:w,j,len:1};
    if(sb&&sb.name==='person') return {s:sb,word:w,j,len:1,kind:'person'};
    if(n) return {...n,obj:o,j,len:1};
    if(o) return {obj:o,word:w,j,len:1};
    return null};
  const NOUNISH=new Set('soccer javelin kite kites bike bikes bicycle bicycles hurdle hurdles race races song songs ballet marathon bench party snack'.split(' '));
  acts.forEach((x,k)=>{const nx=acts.slice(k+1).find(y=>!NOUNISH.has(y.word)), stop=nx?nx.i:words.length;
    for(let j=x.i+1;j<stop;j++){ if(STOP.has(words[j])) continue; const t=thingAt(j); if(t){x.target=t; for(let q=0;q<t.len;q++) used.add(j+q); break} }
    used.add(x.i);
    // "playing" means music only with an instrument or a song
    if(x.id==='music'&&!/sing|sang|song/.test(x.word)){const t=x.target;
      if(t&&t.kind==='instrument'){} else if(t&&(t.obj==='ball'||/soccer|football/.test(t.word))) x.id=/soccer|football/.test(t.word)?'kick':'throw';
      else if(t&&t.s&&['dog','cat'].includes(t.s.name)) x.id='hug';
      else x.id=t?'use':'cheer'}
    if(x.id==='use'&&x.target&&['food'].includes(x.target.kind)&&/eat|munch|chew/.test(x.word)) x.id='eat';
    if(x.id==='use'&&x.target&&x.target.kind==='drink') x.id='drink';
    if(x.id==='use'&&x.target&&x.target.kind==='instrument') x.id='music';
    if(x.id==='fly'&&x.target&&/kite/.test(x.target.word||'')) x.id='kite';
    if(x.id==='use'&&!x.target) x.target=propFor(x.word);
    if(/speech|speeches|lecture|sermon|address|talk/.test(words.slice(x.i,x.i+4).join(' '))&&['use','talk'].includes(x.id)){x.id='talk'; m.speech=true; if(x.target&&/speech|lecture|sermon|address/.test(x.target.word||'')) x.target=null}
  });
  acts=acts.filter(x=>x.id!=='fly'||who);
  const targetIdx=new Set(acts.filter(x=>x.target).map(x=>x.target.j));
  acts=acts.filter((x,k,arr)=>!targetIdx.has(x.i)&&arr.findIndex(y=>y.id===x.id)===k).slice(0,2);
  if(acts.length>1&&acts[1].id==='cheer'&&acts[0].id!=='cheer'&&['throw','kick','run','jump'].includes(acts[0].id)) acts=acts.slice(0,1);
  // everything else that was named becomes part of the picture
  let items=[];
  for(let i=0;i<words.length;i++){
    if(used.has(i)) continue;
    const w=words[i], bi=i+1<words.length?w+' '+words[i+1]:null, sp=spanAt(i);
    if(sp){ const gallery=!acts.length&&!fetch, keys=gallery?sp.info.keys.slice(0,spans.length>1?2:6):[sp.info.keys[0]];
      keys.forEach((key,k)=>items.push({glyph:true,big:true,e:key,word:k?null:sp.info.title,i:i+k*0.01,web:sp.info})); i=sp.j-1; continue }
    if(bi&&MULTI[bi]&&!used.has(i+1)){const tri=bi==='statue of'&&words[i+2]==='liberty'; items.push({glyph:true,e:MULTI[bi],word:tri?'Statue of Liberty':bi,i}); i+=tri?2:1; continue}
    const sb=subjAt(w);
    if(sb){ if(sb.name==='person'&&(acts.length||fetch)) continue; if(sb.name==='rain'&&(acts.length||fetch||items.length)) continue; if(fetch&&sb.name==='dog') continue;
      if(acts.some(x=>x.id==='ride')&&m.horse&&sb.name==='horse') continue;
      if(!items.some(it=>it.s===sb)) items.push({s:sb,i,word:w}); continue }
    if(STOP.has(w)||ACT_WORD.has(w)||genericVerb(w)||Object.values(THEME).some(r=>r.test(' '+w+' '))||(SCENE_WORDS.has(w)&&!lookupNoun(w))) continue;
    const n=lookupNoun(w);
    if(n){ if(!items.some(it=>it.glyph&&it.e===n.e)) items.push({glyph:true,e:n.e,word:n.word,i}); continue }
    if(w.length>=3&&!/(ed|ly)$/.test(w)&&items.filter(it=>it.letter).length<3&&!items.some(it=>it.letter===w)){scratch.font=LETTER_FONT; items.push({letter:w,i,d:(scratch.measureText(w).width+90)/PPS})}
  }
  const placeWord=words.find(w=>/^(beach|sea|ocean|lake|river|waves?)$/.test(w));
  if(placeWord&&!items.some(it=>it.s&&['boat','whale','fish'].includes(it.s.name))){const e=ALIAS[placeWord.replace(/s$/,'')]||'🌊'; items.push({glyph:true,e,word:placeWord,i:words.indexOf(placeWord)})}
  items.forEach(it=>{if(it.s) it.d=it.s.base; else if(it.glyph){const gw=glyphWidth(it); if(gw==null){scratch.font=LETTER_FONT; it.d=(scratch.measureText(it.word).width+90)/PPS} else it.d=(gw+90)/PPS}});
  items.sort((a,b)=>a.i-b.i);
  let fallback=false;
  if(!fetch&&!acts.length&&!items.length&&!webWho&&!has(THEME.day)&&!night){const lw=words.filter(w=>!STOP.has(w)&&w.length>1).slice(0,3); scratch.font=LETTER_FONT;
    (lw.length?lw:[raw.slice(0,24)]).forEach((w,k)=>items.push({letter:w,i:k,d:(scratch.measureText(w).width+90)/PPS}))}
  // a famous person is introduced with their portrait before they act; on their own, their article becomes a gallery
  if(webWho&&(acts.length||fetch)) items.unshift({glyph:true,big:true,e:webWho.info.keys[0],word:null,i:-1,intro:true,web:webWho.info,d:(glyphWidth({e:webWho.info.keys[0],big:true})+90)/PPS});
  if(webWho&&!acts.length&&!fetch) webWho.info.keys.slice(0,6).forEach((key,k)=>items.push({glyph:true,big:true,e:key,word:k?null:webWho.info.title,i:whoI+k*0.01,web:webWho.info,d:(glyphWidth({e:key,big:true})+90)/PPS}));
  // ---------- fit to the chosen length by stretching what was asked for, never by adding unrelated scenery ----------
  const growers=items.filter(it=>(it.s&&it.s.grow)||(it.glyph&&!it.web&&!acts.length&&!fetch));
  const fixedD=tTitle+items.reduce((a,it)=>a+it.d,0)+2.2;
  const avail=Math.max(0,target-fixedD-(fetch?20.6:0));
  acts.forEach(x=>x.d=Math.max((ACTIONS.find(a=>a.id===x.id)||{}).min||5,avail/acts.length));
  let extra=target-(fixedD+(fetch?20.6:0)+acts.reduce((s2,x)=>s2+x.d,0));
  if(extra>0&&growers.length){const each=extra/growers.length; growers.forEach(it=>it.d+=each); extra=0}
  const webItems=items.filter(it=>it.web&&!it.intro); if(extra>0&&webItems.length){const each=Math.min(2.5,extra/webItems.length); webItems.forEach(it=>it.d+=each); extra-=each*webItems.length}
  if(extra<0){growers.filter(it=>it.s).forEach(it=>{const cutBy=Math.min(it.d-it.s.min,-extra/growers.length); it.d-=cutBy; extra+=cutBy})}
  const fills=0;
  // ---------- lay it out along the timeline ----------
  let t=tTitle;
  const toArc=a=>({ta:a.xa/PPS,tb:a.xb/PPS,y0:a.y0,y1:a.y1,apex:a.apex});
  for(const it of items.filter(q=>q.intro)){const x0=X(t); ops.push(c=>drawGlyph(c,x0,it,0)); t+=it.d}
  items=items.filter(q=>!q.intro);
  if(fetch){fetchStory(ops,arcs,X(t),m); t+=20.6; parts.push({text:(who||'man')+' and dog playing fetch',kind:'action'})}
  const rainy=has(THEME.rain)&&(acts.length||fetch);
  const REPEAT=new Set(['throw','kick','sit','run','jump']);
  acts.forEach((x,ai)=>{
    const tg=x.target, mm={...m,verb:x.word,kindAct:x.id,target:tg,object:(tg&&tg.obj)||m.object};
    const span=X(x.d); let usedW=0, guard=0;
    while(guard++<8){const st=STORIES[x.id](X(t)+usedW,span-usedW,mm); ops.push(...st.ops); arcs.push(...st.arcs.map(toArc)); usedW+=st.width;
      if(span-usedW<Math.max(260,st.width*0.7)) break}
    t+=usedW/PPS;
    const actor=ai?null:(m.restingAnimal||m.eater||whoLabel||(/runner|swimmer|dancer|cyclist/.test(x.word)?null:'person'));
    const thing=x.id==='ride'?(m.horse?'a horse':'a bike'):x.id==='kite'?'a kite':(['throw','kick'].includes(x.id)?(tg?tg.word:m.object||'ball'):tg&&!tg.implicit?tg.word:null);
    const prep=tg&&!tg.implicit&&tg.j>x.i+1?['of','over','with','at','to','on','into','about','in'].find(pw=>words.slice(x.i+1,tg.j).includes(pw)):null;
    const verb=m.speech&&x.id==='talk'?'giving a speech':x.id==='kite'?'flying':x.id==='ride'?'riding':(x.word===thing||x.word===m.object?null:x.word);
    if(rainy&&!ai) parts.push({text:'rain',kind:'place'});
    parts.push({text:[actor,verb,prep&&thing&&!['throw','kick','ride','kite'].includes(x.id)?prep:null,thing].filter(Boolean).join(' ')||x.word,kind:'action'});
    if(x.id==='use'&&!tg) parts.push({text:x.word,kind:'verbword'});
    if(x.id==='use'&&tg&&tg.implicit) parts.push({text:x.word,kind:'prop'});
  });
  for(const it of items){
    const x0=X(t), span=X(it.d);
    if(it.letter){ops.push(c=>lettering(c,x0+40,it.letter)); parts.push({text:it.letter,kind:'letter'})}
    else if(it.glyph){ops.push(c=>drawGlyph(c,x0,it,growers.includes(it)?span:0)); if(it.word) parts.push({text:it.word,kind:'thing'})}
    else { ops.push(c=>it.s.draw(c,x0,span,m)); if(it.s.pings) it.s.pings(x0,span).forEach(a=>arcs.push(toArc(a))); parts.push({text:it.word||it.s.name,kind:'thing'}) }
    t+=it.d;
  }
  const rawDur=t+2.2, endX=X(rawDur);
  // sky and ground, drawn behind everything
  const back=[];
  if(night) back.push(c=>stars(c,0,endX,7));
  if(theme==='sport') back.push(c=>track(c,X(tTitle-0.4),X(t)));
  else if(theme!=='ocean') back.push(c=>horizon(c,X(tTitle-0.4),X(t)));
  if(has(THEME.rain)&&(acts.length||fetch)){const st=m.storm; back.push(c=>{const r=rng(5+seed); for(let cx=X(tTitle)+80;cx<X(t);cx+=260) cloud(c,cx,62+r()*20,1.1,.5);
    pen(c,2.5,.45); for(let i=0;i<(X(t)-X(tTitle))/9;i++){const rx=X(tTitle)+r()*(X(t)-X(tTitle)), ry=100+r()*250; line(c,rx,ry,rx-6,ry+20)} if(st){ink(c,1); const lx=X(tTitle)+300; poly(c,[[lx,92],[lx-26,172],[lx-6,172],[lx-30,252],[lx+20,150],[lx,150],[lx+18,92]],true)}})}
  if(theme==='rain'&&rawDur>20&&!(acts.length||fetch)) back.push(c=>{const r=rng(3+seed); for(let x=X(tTitle+5);x<X(t);x+=X(7)) cloud(c,x+r()*200,48+r()*30,0.8,.28)});
  if(has(THEME.day)) back.push(c=>sun(c,X(tTitle+0.6),64));
  if(night) back.push(c=>moon(c,X(tTitle+0.6),66));
  if(olympic) back.push(c=>rings(c,X(tTitle)+(has(THEME.day)||night?260:90),SKY+56));
  ops.unshift(...back);
  if(sport) parts.push({text:olympic?'Olympic stadium':'stadium',kind:'place'});
  if(night) parts.push({text:'night sky',kind:'place'}); else if(has(THEME.day)) parts.push({text:'sun',kind:'place'});
  const hi=(p.match(/\b(soccer|ball|play\w*|run\w*|rac\w*|sprint\w*|danc\w*|party|jump\w*|kick\w*|fight\w*|chas\w*|rocket\w*|fast|wild|crazy|battle|olympi\w*|war|storm\w*|throw\w*|celebrat\w*|explod\w*|hurr\w*|rush\w*|rock|metal|jam\w*|excited|angry|laugh\w*|argu\w*|yell\w*|shout\w*|scream\w*|boxing|punch\w*|fight\w*|fly\w*)\b/g)||[]).length;
  const lo=(p.match(/\b(sleep\w*|calm|moon\w*|night|quiet|rain\w*|sad|lonely|slow\w*|gentle|read\w*|sit\w*|relax\w*|nap\w*|dream\w*|snow\w*|peace\w*|soft|cozy|lazy|float\w*|tired|sleepy|los\w*|cry\w*|sob\w*|weep\w*|fail\w*|think\w*|wonder\w*)\b/g)||[]).length;
  const energy=Math.max(0.1,Math.min(0.95,0.5+0.17*hi-0.17*lo));
  const act0=ACTOR, wrapped=ops.map(op=>c=>{const prev=ACTOR; ACTOR=act0; try{op(c)}finally{ACTOR=prev}});
  return {rawDur,ops:wrapped,arcs,minor,night,energy,musicKey:words.join(' '),plan:{parts,fixes,fills,fallback,web:[...new Set(spans.map(sp=>sp.info.title))]}};
}
function fetchStory(ops,arcs,x0,m){
  const g=G(), x=s=>x0+s*PPS, R=poseGeom(x(1.9),{pose:'release'}), [hx,hy]=R.arms[0][1];
  ops.push(c=>{
    tree(c,x(0.4)); person(c,x(1.9),{pose:'release',kind:m.kind}); dog(c,x(2.9),{pose:'sit',facing:-1});
    for(let i=0;i<5;i++) dog(c,x(4.1+i*0.95),{phase:i*1.7});
    dog(c,x(9.0),{pose:'leap'});
    for(let i=0;i<2;i++) dog(c,x(10.9+i*1.0),{phase:i*1.7+0.8,ball:true});
    dog(c,x(13.0),{pose:'sit',ball:true}); person(c,x(14.0),{pose:'cheer',facing:-1,kind:m.kind}); heart(c,x(13.5),g-215,1);
    for(let i=0;i<6;i++) bird(c,x(15.6)+i*58,120-i*12+(i%2)*18,i%2,0.9);
    spiral(c,x(19.2),140,64);
  });
  // the ball is never drawn: it is a melody of pings that traces its flight
  arcs.push({ta:hx/PPS, tb:x(9.0)/PPS+56/PPS, y0:hy, y1:g-137, apex:62});
}

// ---------- pictures and videos ----------
const PANEL_H=Math.round(GROUND-SKY-8);
// turns any picture into white-on-black ink: "lines" traces edges, "tones" keeps the shading
function processPicture(src,sw,sh,style,clean,strict=0,single=false){
  // for web pictures, try several line strengths and keep the clearest drawing (about 8% ink, few specks)
  if(clean&&!single){let best=null,bs=1e9;
    for(const k of [0,1,2,3]){const cv=processPicture(src,sw,sh,style,true,k,true), sc=Math.abs((cv.ink||0)-0.075)+0.12*(cv.speck||0)+(cv.ink<0.02?1:0); if(sc<bs){bs=sc;best=cv}}
    if((best.ink||0)<0.035){const tn=processPicture(src,sw,sh,'tones'); tn.ink=0.08; tn.speck=0; return tn}   // faint drawings (chalk, pencil) keep their shading
    return best}
  const h=PANEL_H, w=Math.max(8,Math.round(sw*h/sh)), n=w*h;
  const cv=document.createElement('canvas'); cv.width=w; cv.height=h; const cx=cv.getContext('2d',{willReadFrequently:true});
  cx.fillStyle='#fff'; cx.fillRect(0,0,w,h); cx.drawImage(src,0,0,w,h);
  const d=cx.getImageData(0,0,w,h), px=d.data, L=new Float32Array(n);
  for(let i=0;i<n;i++) L[i]=(0.3*px[i*4]+0.59*px[i*4+1]+0.11*px[i*4+2])/255;
  const pct=(arr,q)=>{const s=[]; for(let i=0;i<arr.length;i+=7)s.push(arr[i]); s.sort((a,b)=>a-b); return s[Math.floor(q*(s.length-1))]};
  let out=new Float32Array(n);
  if(style==='lines'){
    let B=new Float32Array(n);
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){let s=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)s+=L[(y+dy)*w+x+dx];B[y*w+x]=s/9}
    if(clean) for(let pass=0;pass<2;pass++){const B2=new Float32Array(n); for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){let s=0;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)s+=B[(y+dy)*w+x+dx];B2[y*w+x]=s/25} B=B2}
    const E=new Float32Array(n);
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;
      const gx=B[i-w+1]+2*B[i+1]+B[i+w+1]-B[i-w-1]-2*B[i-1]-B[i+w-1], gy=B[i+w-1]+2*B[i+w]+B[i+w+1]-B[i-w-1]-2*B[i-w]-B[i-w+1];
      E[i]=Math.hypot(gx,gy)}
    if(clean&&strict>=2) for(let pass=0;pass<2;pass++){const B2=new Float32Array(n); for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){let q=0;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)q+=B[(y+dy)*w+x+dx];B2[y*w+x]=q/25} B=B2;
      for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x; E[i]=Math.hypot(B[i-w+1]+2*B[i+1]+B[i+w+1]-B[i-w-1]-2*B[i-1]-B[i+w-1], B[i+w-1]+2*B[i+w]+B[i+w+1]-B[i-w-1]-2*B[i-w]-B[i-w+1])}}
    const top=pct(E,clean?(strict?0.985:0.95):0.97)||1, lo=clean?0.34+strict*0.16:0.2, hi=clean?0.75+strict*0.1:0.65;
    for(let i=0;i<n;i++){const v=Math.min(1,E[i]/top); out[i]=v<lo?0:v>hi?1:(v-lo)/(hi-lo)}
    const T=new Float32Array(n);
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){let mx=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)mx=Math.max(mx,out[(y+dy)*w+x+dx]);T[y*w+x]=mx}
    const bd=clean?9:4; for(let y=0;y<h;y++)for(let x=0;x<w;x++) if(x<bd||y<bd||x>=w-bd||y>=h-bd) T[y*w+x]=0;   // the picture's own border is not an edge
    if(clean){ // keep long strokes, drop speckle: remove small connected pieces
      const lab=new Int32Array(n), stack=[], minSize=Math.round(n*0.0006); let nextL=1, litAll=0, cut0=0;
      for(let i=0;i<n;i++){ if(T[i]<=0.3||lab[i]) continue; const L=nextL++; const comp=[i]; lab[i]=L; stack.push(i);
        while(stack.length){const k=stack.pop(), kx=k%w; for(const d of [-1,1,-w,w,-w-1,-w+1,w-1,w+1]){const q=k+d; if(q<0||q>=n) continue; const qx=q%w; if(Math.abs(qx-kx)>1) continue; if(T[q]>0.3&&!lab[q]){lab[q]=L; stack.push(q); comp.push(q)}}}
        litAll+=comp.length; if(comp.length<minSize){cut0+=comp.length; for(const k of comp) T[k]=0} }
      var speck=litAll?cut0/litAll:0;
      for(let i=0;i<n;i++) if(T[i]<=0.3) T[i]=0;
      let on=0; for(let i=0;i<n;i++) if(T[i]>0.5) on++;
      var ink=on/n;
    }   // still busy (old drawings, textured paintings): paint it as soft light and shade instead
    out=T;
  } else {
    let mean=0; for(let i=0;i<n;i++)mean+=L[i]; mean/=n;
    const inv=mean>0.5; for(let i=0;i<n;i++) out[i]=inv?1-L[i]:L[i];
    const lo=pct(out,0.03), hi=pct(out,0.985)||1;
    for(let i=0;i<n;i++) out[i]=Math.max(0,Math.min(1,(out[i]-lo)/((hi-lo)||1)));
  }
  for(let i=0;i<n;i++){const v=out[i]*255; px[i*4]=px[i*4+1]=px[i*4+2]=v; px[i*4+3]=255}
  cx.putImageData(d,0,0);
  if(clean){cv.speck=typeof speck==='number'?speck:0; cv.ink=typeof ink==='number'?ink:0}
  return cv;
}
function posterize(src,sw,sh){
  const h=PANEL_H, w=Math.max(8,Math.round(sw*h/sh)), n=w*h, cv=document.createElement('canvas'); cv.width=w; cv.height=h;
  const cx=cv.getContext('2d',{willReadFrequently:true}); cx.filter='blur(3px)'; cx.fillStyle='#fff'; cx.fillRect(0,0,w,h); cx.drawImage(src,0,0,w,h); cx.filter='none';
  const d=cx.getImageData(0,0,w,h), px=d.data, L=new Float32Array(n); let mean=0;
  for(let i=0;i<n;i++){L[i]=(0.3*px[i*4]+0.59*px[i*4+1]+0.11*px[i*4+2])/255; mean+=L[i]} mean/=n;
  const sorted=Float32Array.from(L).sort(), q1=sorted[Math.floor(n*0.33)], q2=sorted[Math.floor(n*0.66)];
  for(let i=0;i<n;i++){const x=i%w, y=(i/w)|0, edge=x<6||y<6||x>=w-6||y>=h-6; let v=L[i]<q1?1:L[i]<q2?0.45:0; if(mean<0.5) v=1-v-0.0; if(edge) v=0;
    px[i*4]=px[i*4+1]=px[i*4+2]=v*255; px[i*4+3]=255}
  cx.putImageData(d,0,0); return cv;
}
function imageDesc(panel){
  return {rawDur:0.8+panel.width/PPS+2.2, ops:[c=>c.drawImage(panel,PPS*0.8,SKY+4)], arcs:[], minor:false, night:false};
}
const FRAME_GAP=16;
function framesFor(meta,target){const fw=Math.round(meta.w*PANEL_H/meta.h); return Math.max(2,Math.min(48,Math.round((target-3)*PPS/(fw+FRAME_GAP))))}
function videoDesc(frames){
  const x0=PPS*0.8; let x=x0; const placed=frames.map(f=>{const at=x; x+=f.width+FRAME_GAP; return [f,at]});
  return {rawDur:x/PPS+2.2, ops:[c=>placed.forEach(([f,at])=>c.drawImage(f,at,SKY+4))], arcs:[], minor:false, night:false};
}



























