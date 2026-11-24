/* Photo registration and pinhole camera match 美术原稿/包装印版/render_cartons.py. */
(() => {
  'use strict';
  const W = 1.48, D = .75, H = 4;
  const VW = 1248, VH = 1512, OX = 144, OY = 378;
  const ownURL = document.currentScript?.src || new URL('packs/carton-object.js', document.baseURI);
  const editions = new Set(['standard', 'wind', 'forest', 'fire', 'mountain', 'mixed']);
  const clamp = x => Math.min(1, Math.max(0, x));
  const ease = t => (t = clamp(t), t*t*(3-2*t));
  const dot = (a,b) => a.reduce((n,v,i) => n + v*b[i],0);
  const unit = a => { const l=Math.hypot(...a); return a.map(x=>x/l); };
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const axis = [6.85,-12.5,4.83];
  const eye = axis.map((x,i) => x*2.15+(i===2?1.97:0));
  const forward = unit(axis.map(x=>-x));
  const right = unit(cross(forward,[0,0,1]));
  const up = cross(right,forward);
  const focal = Math.hypot(...axis)*2.15*1080/5.05;
  function project(x,y,z) {
    const v=[x-eye[0],y-eye[1],z-eye[2]], s=focal/dot(v,forward);
    return [480+s*dot(v,right),540-s*dot(v,up)];
  }
  const backL = project(-W,D,H), backR = project(W,D,H);
  const frontL = project(-W,-D,H), frontR = project(W,-D,H);
  const footL = project(-W,-D,0), footR = project(W,-D,0), footSide = project(W,D,0);
  const topFace = [backL,backR,frontR,frontL];
  const hull = [backL,backR,footSide,footR,footL,frontL];
  function canvas(w,h) { const c=document.createElement('canvas'); c.width=w; c.height=h; return c; }
  function path(ctx,pts,closed=true) {
    ctx.beginPath();
    pts.forEach(([x,y],i)=> i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
    if(closed) ctx.closePath();
  }
  function line(ctx,pts,style,width=1) {
    path(ctx,pts,false); ctx.strokeStyle=style;ctx.lineWidth=width;ctx.stroke();
  }
  function polygon(ctx,pts,fill) {
    path(ctx,pts);ctx.fillStyle=fill;ctx.fill();
  }
  function grad(ctx,from,to,stops) {
    const g=ctx.createLinearGradient(...from,...to);
    stops.forEach(([where,color])=>g.addColorStop(where,color));
    return g;
  }
  function mapQuad(ctx,tex,src,dst) {
    for(const ids of [[0,1,2],[0,2,3]]) {
      const [a,b,c]=ids.map(i=>src[i]), [p,q,r]=ids.map(i=>dst[i]);
      const u=b[0]-a[0],v=b[1]-a[1],w=c[0]-a[0],h=c[1]-a[1], det=u*h-v*w;
      const dx=q[0]-p[0],dy=q[1]-p[1],ex=r[0]-p[0],ey=r[1]-p[1];
      const A=(dx*h-ex*v)/det, B=(dy*h-ey*v)/det, C=(ex*u-dx*w)/det, E=(ey*u-dy*w)/det;
      if(Math.abs(A*E-B*C)<.0001) continue;
      ctx.save();path(ctx,[p,q,r]);ctx.clip();
      ctx.transform(A,B,C,E,p[0]-A*a[0]-C*a[1],p[1]-B*a[0]-E*a[1]);ctx.drawImage(tex,0,0);
      ctx.restore();
    }
  }
  const boardStocks = {
    standard:['#4d211c','#866447','#ccaa7e'],wind:['#233845','#69777c','#b6beb8'],
    forest:['#2c4030','#73745b','#b8b696'],fire:['#552b21','#906248','#c7a17a'],
    mountain:['#393839','#77716b','#b6b0a5'],mixed:['#4e2524','#80624e','#c7a88c']
  };
  const die=(y,height)=>[[0,y],[720,y],[720,y+height],[0,y+height]];
  const plates={outer:die(0,360),liner:die(360,360),wing:die(720,240),tab:die(960,90),seal:die(1050,32)};
  const bagH=3.78, bagHalf=bagH*344/610/2;
  function packetLine(slot) {
    return {y:D-.17-slot*.206, z:H-.09+(slot%3)*.009};
  }
  function packetCorners(slot,lift) {
    const {y,z}=packetLine(slot),top=z+bagH*lift;
    return [project(-bagHalf,y,top),project(bagHalf,y,top),project(bagHalf,y,top-bagH),project(-bagHalf,y,top-bagH)];
  }
  function coat(ctx,atlas,plate,face,base) {
    polygon(ctx,face,base);
    if(atlas.complete && atlas.naturalWidth) mapQuad(ctx,atlas,plate,face);
  }
  function crease(ctx,a,b,width,light,dark) {
    line(ctx,[a,b],dark,width);
    line(ctx,[[a[0],a[1]-.8],[b[0],b[1]-.8]],light,width*.35);
  }
  function cartonWell(ctx,count,atlas,stock) {
    const lip=[[-W+.019,D-.027],[W-.019,D-.027],[W-.019,-D+.027],[-W+.019,-D+.027]];
    const hole=lip.map(([x,y])=>project(x,y,H));
    const well=lip.map(([x,y])=>project(x,y,H-.62));
    polygon(ctx,topFace,stock[1]);
    ctx.save();path(ctx,hole);ctx.clip();
    polygon(ctx,hole,'#131316');
    for(const i of [0,1,3]) {
      const j=(i+1)%4, wall=[hole[i],hole[j],well[j],well[i]];
      polygon(ctx,wall,stock[0]);
      polygon(ctx,wall,grad(ctx,hole[i],well[i],[[0,'#18171b2e'],[.43,'#0b0d10a8'],[1,'#0a0b0de8']]));
      line(ctx,[hole[i],well[i]],'#100f138c',2);
    }
    for(let slot=0;slot<count;slot++){
      const {y,z}=packetLine(slot);
      const rim=[project(-bagHalf,y,z),project(bagHalf,y,z)];
      const seal=[...rim,project(bagHalf,y,z-.108),project(-bagHalf,y,z-.108)];
      coat(ctx,atlas,plates.seal,seal,stock[1]);
      polygon(ctx,seal,grad(ctx,rim[0],seal[3],[[0,'#0f101000'],[.46,'#13101333'],[1,'#09080b8a']]));
      line(ctx,rim,stock[2],1.05);
    }
    ctx.restore();
    line(ctx,[frontL,frontR],'rgba(31,28,29,.84)',3.1);
    line(ctx,[hole[3],hole[2]],stock[2],1.65);
    line(ctx,[backL,frontL],stock[2],1.15);
    line(ctx,[frontR,backR],stock[2],1.3);
  }
  function dustWing(ctx,sign,t,atlas,stock) {
    const delay=sign<0?.23:.32;
    const angle=1.99*ease((t-delay)/(.99-delay));
    const wing=(dist,y)=>project(sign*(W-dist*Math.cos(angle)),y,H-.024+dist*Math.sin(angle));
    const max=.53;
    const outline=[wing(0,D-.012),wing(0,-D+.016),wing(.31,-D+.044),wing(.485,-D+.205),
      wing(max,-D+.32),wing(max,D-.17),wing(.37,D-.055)];
    // Image coordinates follow the score and the machine direction of the board.
    const rect=[wing(max,D),wing(max,-D),wing(0,-D),wing(0,D)];
    ctx.save();path(ctx,outline);ctx.clip();
    coat(ctx,atlas,plates.wing,rect,stock[0]);
    polygon(ctx,outline,grad(ctx,wing(0,0),wing(max,0),[[0,'#05060a9c'],[.17,'#14131a58'],[.83,'#ccccba08'],[1,'#eee1c526']]));
    ctx.restore();
    line(ctx,outline.slice(1),stock[1],2.2);
    line(ctx,outline.slice(2,6),stock[2],.95);
    crease(ctx,outline[0],outline[1],2.8,stock[1],'#1c191d');
  }
  function raisedLid(ctx,photo,atlas,stock,t,count) {
    const angle=1.84*ease(t/.93), depth=2*D;
    const lidPoint=(x,d)=>project(x,D-d*Math.cos(angle),H+d*Math.sin(angle));
    const lid=[backL,backR,lidPoint(W,depth),lidPoint(-W,depth)];
    const span=(backR[0]-backL[0])*(lid[3][1]-backL[1])-(backR[1]-backL[1])*(lid[3][0]-backL[0]);
    const inside=span<0;
    cartonWell(ctx,count,atlas,stock);
    const wings=()=>{dustWing(ctx,-1,t,atlas,stock);dustWing(ctx,1,t,atlas,stock);};
    if(t<.46) wings();
    // Reversing the two rows puts the liner artwork upright on the lifted leaf.
    const inner=[lid[3],lid[2],lid[1],lid[0]];
    coat(ctx,atlas,inside?plates.liner:plates.outer,inside?inner:lid,stock[0]);
    if(!inside && photo.complete && photo.naturalWidth){
      ctx.save();ctx.globalAlpha=1-ease(angle/.28);
      mapQuad(ctx,photo,topFace,lid);
      ctx.restore();
    }
    if(inside) {
      // Ambient occlusion in the hinge and a soft studio light along the crown.
      polygon(ctx,lid,grad(ctx,lidPoint(0,0),lidPoint(0,depth),[[0,'#111015b3'],[.09,'#17151a69'],
        [.31,'#24202717'],[.80,'#d0c7af09'],[1,'#ded9c21e']]));
      crease(ctx,lidPoint(-W+.018,.030),lidPoint(W-.018,.030),2.2,stock[1],'#17171b');
    }
    // The free end carries a narrow tuck tab. It first slides out from behind
    // the front wall; the front lip clips its covered portion during the pull.
    const tongueAngle=angle-1.47+.93*ease((t-.14)/.72);
    const tongue=(x,d)=>project(x,D-depth*Math.cos(angle)-d*Math.cos(tongueAngle),
      H+depth*Math.sin(angle)+d*Math.sin(tongueAngle));
    const w=W-.065, h=.34;
    const tab=[[ -w,0],[w,0],[w,.14],[w-.05,.23],[w-.145,.32],[w-.22,h],
      [-w+.22,h],[-w+.145,.32],[-w+.05,.23],[-w,.14]].map(([x,d])=>tongue(x,d));
    ctx.save();
    const slope=(frontR[1]-frontL[1])/(frontR[0]-frontL[0]);
    const lipY=x=>frontL[1]+slope*(x-frontL[0]);
    path(ctx,[[-OX,-OY],[VW,-OY],[VW,lipY(VW)],[-OX,lipY(-OX)]]);ctx.clip();
    ctx.save();path(ctx,tab);ctx.clip();
    coat(ctx,atlas,plates.tab,[tongue(-w,h),tongue(w,h),tongue(w,0),tongue(-w,0)],stock[0]);
    polygon(ctx,tab,grad(ctx,tongue(0,0),tongue(0,h),[[0,'#08070c75'],[.22,'#16121623'],[1,'#d9c6a424']]));
    ctx.restore();
    if(t>.04) {
      line(ctx,tab.slice(1),stock[1],3.1);
      line(ctx,tab.slice(3,9),stock[2],1.1);
      crease(ctx,tongue(-w,0),tongue(w,0),3,stock[1],'#201b1e');
    }
    ctx.restore();
    if(inside) {
      line(ctx,[lid[0],lid[3]],stock[1],2.6);
      line(ctx,[lid[1],lid[2]],stock[2],2);
      crease(ctx,backL,backR,3.5,stock[1],'#1a161a');
    }
    if(t>=.46) wings();
  }
  function wrapStock() {
    const c=canvas(960,1080), ctx=c.getContext('2d');
    ctx.lineJoin='round';ctx.lineCap='round';
    const faces=[
      {p:[frontL,frontR,footR,footL],a:[80,270],b:[700,680],shine:.21},
      {p:[frontR,backR,footSide,footR],a:[667,470],b:[826,525],shine:.30},
      {p:topFace,a:[256,28],b:[445,198],shine:.30},
    ];
    for(const {p,a,b,shine} of faces) {
      ctx.save();path(ctx,p);ctx.clip();
      const tint=(n)=>'rgba(225,238,245,'+n+')';
      ctx.fillStyle=grad(ctx,a,b,[[0,tint(.018)],[.14,tint(.055)],[.175,tint(shine)],[.20,tint(.045)],
        [.32,tint(.012)],[.59,tint(.015)],[.67,tint(shine*.34)],[.70,tint(.017)],[.88,tint(.023)],[.96,tint(shine*.65)],[1,tint(.04)]]);
      ctx.fillRect(0,0,960,1080);
      // Layered corner folds taper into the flat film instead of spanning the artwork.
      for(let k=0;k<4;k++) {
        const a=p[k], b=p[(k+1)%4], d=p[(k+3)%4];
        const uv=(u,v)=>[a[0]+(b[0]-a[0])*u+(d[0]-a[0])*v,a[1]+(b[1]-a[1])*u+(d[1]-a[1])*v];
        for(let j=0;j<3;j++) {
          const start=uv(.005,.002+j*.013),mid=uv(.046+j*.013,.029+j*.009),end=uv(.06+j*.042,.15-j*.025);
          polygon(ctx,[start,mid,end],grad(ctx,start,end,[[0,tint(.29-j*.04)],[.37,tint(.08)],[1,tint(0)]]));
          line(ctx,[start,mid,end],grad(ctx,start,end,[[0,tint(.35)],[.50,tint(.11)],[1,tint(0)]]),1.2+j*.25);
        }
      }
      ctx.restore();
    }
    // A heat-weld on the narrow side, split into an overlapping clear film seam.
    const seam=[project(W,-.45,.03),project(W,-.445,1.35),project(W,-.46,3.48),project(W,-.432,3.94)];
    line(ctx,seam,'rgba(236,248,251,.32)',1.7);
    line(ctx,seam.map(([x,y])=>[x+3.7,y]),'rgba(22,22,24,.22)',2);
    line(ctx,[...hull,hull[0]],'rgba(207,227,235,.39)',2.6);
    line(ctx,[frontL,frontR,footR],'rgba(240,248,248,.48)',2.2);
    return c;
  }
  function inBox([x,y]) {
    let inside=false;
    for(let i=0,j=hull.length-1;i<hull.length;j=i++) {
      const a=hull[i],b=hull[j];
      if((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
    }
    return inside;
  }
  function tornFilm(ctx,stock,traces,distance) {
    ctx.clearRect(0,0,960,1080);ctx.drawImage(stock,0,0);
    if(!distance)return;
    ctx.save();path(ctx,hull);ctx.clip();
    for(const trace of traces) {
      if(trace.length<2)continue;
      const n=trace.length, left=[],right=[];
      for(let i=0;i<n;i++) {
        const p=trace[i],a=trace[Math.max(0,i-1)],b=trace[Math.min(n-1,i+1)];
        const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1;
        const width=(1.5+Math.sin(Math.PI*i/(n-1))*Math.min(27,5+distance*.054))*(.91+.13*Math.sin(i*2.39));
        const nx=-dy/len,ny=dx/len;
        left.push([p[0]+nx*width,p[1]+ny*width]);
        right.push([p[0]-nx*width*.37,p[1]-ny*width*.37]);
      }
      const exposed=[...left,...[...right].reverse()];
      ctx.globalCompositeOperation='destination-out';polygon(ctx,exposed,'black');
      ctx.globalCompositeOperation='source-over';
      line(ctx,left,'rgba(28,23,24,.45)',3.2);
      line(ctx,left.map(([x,y])=>[x-.6,y-.9]),'rgba(232,245,253,.70)',1.7);
      line(ctx,right,'rgba(225,235,234,.44)',1.3);
      // A doubled-over lip refracts the bevels beneath it. It widens with the pull
      // and reflects the softbox along its crease, leaving the rest translucent.
      const tip=left[n-1], idx=Math.max(0,Math.floor(n*.38)), base=left[idx];
      const dx=tip[0]-base[0],dy=tip[1]-base[1],len=Math.hypot(dx,dy)||1;
      const nx=-dy/len,ny=dx/len, lift=Math.min(58,len*.42);
      if(lift>1) {
        const tipFold=[tip[0]+nx*lift*.32-dx*.06,tip[1]+ny*lift*.32-dy*.06];
        const wing=[base[0]+dx*.40+nx*lift,base[1]+dy*.40+ny*lift];
        const root=[base[0]-dx*.14,base[1]-dy*.14];
        const flap=[root,...left.slice(idx),tipFold,wing];
        ctx.save();path(ctx,flap);ctx.clip();
        ctx.drawImage(stock,nx*lift*.65,ny*lift*.65);
        const shine=grad(ctx,base,wing,[[0,'rgba(153,175,183,.12)'],[.32,'rgba(196,215,222,.18)'],
          [.57,'rgba(225,240,246,.49)'],[.67,'rgba(239,250,255,.68)'],[.76,'rgba(170,198,206,.32)'],[1,'rgba(221,240,245,.07)']]);
        polygon(ctx,flap,shine);ctx.restore();
        line(ctx,[root,wing,tipFold,tip],'rgba(232,244,250,.56)',1.6);
        const strips=grad(ctx,tip,wing,[[0,'rgba(244,249,251,.53)'],[1,'rgba(240,248,249,0)']]);
        for(const fraction of [.26,.57,.80]) {
          line(ctx,[tip,[root[0]+(wing[0]-root[0])*fraction, root[1]+(wing[1]-root[1])*fraction]],strips,1.15);
        }
      }
    }
    ctx.restore();
  }
  function flyingFilm(ctx,film,trace,t) {
    const end=trace?.at(-1)||[580,510],start=trace?.[0]||[310,445];
    let dx=end[0]-start[0],dy=end[1]-start[1];
    if(Math.hypot(dx,dy)<5) { const near=trace?.at(-3)||[end[0]-1,end[1]]; dx=end[0]-near[0]||1;dy=end[1]-near[1]; }
    const len=Math.hypot(dx,dy);
    const tx=dx/len,ty=dy/len,nx=-ty,ny=tx;
    const move=ease(t),cx=(end[0]+start[0])*.5,cy=(end[1]+start[1])*.5;
    for(const side of [-1,1]) {
      ctx.save();ctx.globalAlpha=1-ease((t-.20)/.80);
      ctx.translate(move*(tx*90+side*nx*145),move*(ty*84+side*ny*105)-65*move);
      ctx.translate(cx,cy);ctx.rotate(move*side*.19);ctx.scale(1-.065*move,1-.13*move);ctx.translate(-cx,-cy);
      const a=[cx-tx*2400,cy-ty*2400],b=[cx+tx*2400,cy+ty*2400];
      path(ctx,[a,b,[b[0]+side*nx*2200,b[1]+side*ny*2200],[a[0]+side*nx*2200,a[1]+side*ny*2200]]);ctx.clip();
      ctx.drawImage(film,0,0);
      path(ctx,hull);ctx.clip();
      const wave=(.25+.65*move)*side*190;
      const p=[cx+nx*wave,cy+ny*wave],q=[p[0]+nx*side*72,p[1]+ny*side*72];
      ctx.fillStyle=grad(ctx,p,q,[[0,'rgba(235,248,255,0)'],[.42,'rgba(231,244,249,'+(Math.sin(t*Math.PI)*.30)+')'],[1,'rgba(235,248,255,0)']]);
      ctx.fillRect(0,0,960,1080);ctx.restore();
    }
  }
  let stock;
  window.createCartonObject = function createCartonObject(host,{packId='standard',packCount=6,onOpen,signal}={}) {
    const photo=document.createElement('img');
    photo.className='carton-paper-shell';photo.alt='';photo.draggable=false;
    const edition=editions.has(packId)?packId:'standard';
    photo.src=new URL('boxes/'+edition+'.webp',ownURL).href;
    const atlas=new Image();
    atlas.src=new URL('boxes/linings/'+edition+'.webp',ownURL).href;
    const surface=document.createElement('canvas');surface.className='carton-material';surface.setAttribute('aria-hidden','true');
    const ctx=surface.getContext('2d');
    const mouth=document.createElement('span');mouth.className='carton-mouth';mouth.setAttribute('aria-hidden','true');
    host.append(photo,surface,mouth);
    const film=canvas(960,1080), fctx=film.getContext('2d');
    if(!stock) stock=wrapStock();
    const listeners=new AbortController(), opts={signal:listeners.signal};
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    const traces=[];
    let activeId=null,current=null,distance=0,enabled=false,stage='sealed',changed=true;
    let startTime=0,frame=0,gone=false,openCalled=false,remaining=Math.max(0,Math.min(12,Math.round(packCount)||0));
    let lastTrace=null;
    function stageTo(value) {stage=value;host.dataset.stage=value;}
    stageTo(stage);host.dataset.progress='0';host.dataset.enabled='false';
    function schedule() { if(!gone && !frame) frame=requestAnimationFrame(paint); }
    function renderFit() {
      const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
      const scale=Math.min(1.85,(window.devicePixelRatio||1)*Math.max(w/960,h/1080));
      const target=Math.max(1,Math.round(VW*scale));
      if(surface.width!==target || surface.height!==Math.round(VH*scale)) {
        surface.width=target;surface.height=Math.max(1,Math.round(VH*scale));
      }
    }
    function paint(now) {
      frame=0;if(gone)return;
      renderFit();
      const sx=surface.width/VW, sy=surface.height/VH;
      ctx.setTransform(sx,0,0,sy,OX*sx,OY*sy);ctx.clearRect(-OX,-OY,VW,VH);
      if(changed){tornFilm(fctx,stock,traces,distance);changed=false;}
      if(stage==='peeling') {
        const t=clamp((now-startTime)/(reduced.matches?105:570));
        flyingFilm(ctx,film,lastTrace,t);
        if(t>=1){stageTo('opening');startTime=now;}
        schedule();
      } else if(stage==='opening'||stage==='open') {
        const t=stage==='open'?1:clamp((now-startTime)/(reduced.matches?150:1120));
        raisedLid(ctx,photo,atlas,boardStocks[edition],t,remaining);
        if(t<1) schedule();
        else if(!openCalled) {stageTo('open');openCalled=true;onOpen?.();}
      } else ctx.drawImage(film,0,0);
    }
    function release() {
      const id=activeId;activeId=null;current=null;host.dataset.held='false';
      if(id!==null && host.hasPointerCapture?.(id))host.releasePointerCapture(id);
    }
    function openWithoutGesture() {
      if(gone || stage==='peeling'||stage==='opening'||stage==='open')return;
      release();host.dataset.progress='1';host.dataset.enabled='false';
      stageTo('peeling');startTime=performance.now();schedule();
    }
    function local(e) {
      const r=host.getBoundingClientRect();
      return [(e.clientX-r.left)*960/r.width,(e.clientY-r.top)*1080/r.height];
    }
    host.addEventListener('pointerdown',e=>{
      if(!enabled||activeId!==null||!e.isPrimary||e.button!==0||!['sealed','tearing'].includes(stage))return;
      const p=local(e);if(!inBox(p))return;
      e.preventDefault();host.setPointerCapture(e.pointerId);
      activeId=e.pointerId;current=[p];host.dataset.held='true';
    },opts);
    function addPoint(e) {
      if(e.pointerId!==activeId||!current)return;
      const p=local(e),last=current[current.length-1];
      const dx=p[0]-last[0],dy=p[1]-last[1],length=Math.hypot(dx,dy);
      if(length<(current.length===1?8:3))return;
      if(current.length===1)traces.push(current);
      // Sample by distance so low-rate touch events still leave a continuous edge.
      const steps=Math.max(1,Math.ceil(length/8));
      for(let i=1;i<=steps;i++)current.push([last[0]+dx*i/steps,last[1]+dy*i/steps]);
      distance+=length;lastTrace=current;changed=true;stageTo('tearing');
      host.dataset.progress=String(Math.round(clamp(distance/318)*1000)/1000);
      schedule();if(distance>=318)openWithoutGesture();
    }
    host.addEventListener('pointermove',e=>{
      if(e.pointerId!==activeId)return;
      e.preventDefault();
      for(const sample of e.getCoalescedEvents?.()||[])addPoint(sample);
      addPoint(e);
    },opts);
    host.addEventListener('pointerup',e=>{if(e.pointerId===activeId){addPoint(e);release();}},opts);
    for(const type of ['pointercancel','lostpointercapture']) {
      host.addEventListener(type,e=>{if(e.pointerId===activeId)release();},opts);
    }
    photo.addEventListener('load',schedule,opts);
    atlas.addEventListener('load',schedule,opts);
    const observer=new ResizeObserver(schedule);observer.observe(host);
    function setRemaining(n) {
      if(!gone && Number.isFinite(n)){remaining=Math.max(0,Math.min(12,Math.round(n)));schedule();}
    }
    function restoreOpen(n) {
      if(gone)return;
      release();enabled=false;openCalled=true;setRemaining(n);
      host.dataset.enabled='false';host.dataset.progress='1';stageTo('open');
      cancelAnimationFrame(frame);frame=0;paint(performance.now());
    }
    function destroy() {
      if(gone)return;gone=true;release();cancelAnimationFrame(frame);
      observer.disconnect();listeners.abort();signal?.removeEventListener('abort',destroy);
      photo.remove();surface.remove();mouth.remove();
      for(const key of ['enabled','stage','held','progress'])delete host.dataset[key];
    }
    signal?.addEventListener('abort',destroy,{once:true});
    if(signal?.aborted)destroy();else schedule();
    return {
      enable(){if(!gone && ['sealed','tearing'].includes(stage)){enabled=true;host.dataset.enabled='true';}},
      getPacketQuad(index,total,lift=0){
        const rect=host.getBoundingClientRect();
        const slot=Math.max(0,total-1-index);
        return packetCorners(slot,lift).map(([x,y])=>({x:rect.left+x*rect.width/960,y:rect.top+y*rect.height/1080}));
      },
      openWithoutGesture,restoreOpen,setRemaining,destroy
    };
  };
})();
