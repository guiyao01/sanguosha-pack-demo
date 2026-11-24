'use strict';

(() => {
  const WIDTH = 344;
  const HEIGHT = 610;
  const RATIO = WIDTH / HEIGHT;
  const limit = value => Math.max(0, Math.min(1, value));
  const smooth = value => value * value * (3 - 2 * value);
  const mix = (a, b, t) => a + (b - a) * t;

  // A cubic flight with separate tangents at the carton lip and the resting place.
  function cubic(a, b, c, d, t) {
    const u = 1 - t;
    return u*u*u*a + 3*u*u*t*b + 3*u*t*t*c + t*t*t*d;
  }

  // Map the foil's four UV corners to the same projected plane as the carton.
  // The denominator varies across the width and height of the print, preserving perspective.
  function projectFoil(quad, bounds) {
    const [p,q,r,s] = quad;
    const dx1=q.x-r.x, dx2=s.x-r.x, dx3=p.x-q.x+r.x-s.x;
    const dy1=q.y-r.y, dy2=s.y-r.y, dy3=p.y-q.y+r.y-s.y;
    const det=dx1*dy2-dx2*dy1;
    const g=(dx3*dy2-dx2*dy3)/det, h=(dx1*dy3-dx3*dy1)/det;
    const x=p.x-bounds.left, y=p.y-bounds.top;
    return 'matrix3d('+[
      (q.x-p.x+g*(q.x-bounds.left))/WIDTH,(q.y-p.y+g*(q.y-bounds.top))/WIDTH,0,g/WIDTH,
      (s.x-p.x+h*(s.x-bounds.left))/HEIGHT,(s.y-p.y+h*(s.y-bounds.top))/HEIGHT,0,h/HEIGHT,
      0,0,1,0,x,y,0,1
    ].join(',')+')';
  }

  function centerOf(quad) {
    return {x:(quad[0].x+quad[1].x+quad[2].x+quad[3].x)/4,
      y:(quad[0].y+quad[1].y+quad[2].y+quad[3].y)/4};
  }

  function seatCorners(seat) {
    const angle=seat.angle*Math.PI/180, wx=Math.cos(angle)*seat.w/2, wy=Math.sin(angle)*seat.w/2;
    const hx=-Math.sin(angle)*seat.h/2, hy=Math.cos(angle)*seat.h/2;
    return [{x:-wx-hx,y:-wy-hy},{x:wx-hx,y:wy-hy},{x:wx+hx,y:wy+hy},{x:-wx+hx,y:-wy+hy}];
  }

  window.createCartonPacks = function createCartonPacks(host, {packId, count, opened, revealed, onSelect, onExtract, signal}) {
    const mat = document.createElement('div');
    mat.className = 'carton-packs-mat';
    mat.setAttribute('role', 'group');
    mat.setAttribute('aria-label', '选择卡包');
    host.append(mat);

    const remaining = Array.from({length:count}, (_, index) => index).filter(index => !opened?.includes(index));
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const source = packId && packId !== 'mixed' ? 'packs/' + packId + '.webp' : 'packs/arrival/mixed.webp';
    let phase = '';
    let dead = false;
    let requested = false;
    let frame = 0;
    let finishFrame = null;
    let dealTask = null;
    let choiceTask = null;
    let selected = null;
    let destination = null;
    let bounds;
    let seats;

    function setPhase(next) {
      phase = next;
      mat.dataset.packPhase = host.dataset.packPhase = next;
    }

    const items = remaining.map(index => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'carton-pack';
      button.dataset.packIndex = index;
      button.disabled = true;
      button.setAttribute('aria-label', '选择第 ' + (index + 1) + ' 包');
      const skin = document.createElement('span');
      skin.className = 'carton-pack-skin';
      const image = new Image(WIDTH, HEIGHT);
      image.alt = '';
      image.draggable = false;
      image.src = source;
      skin.append(image);
      const serial = document.createElement('span');
      serial.className = 'carton-pack-index';
      serial.setAttribute('aria-hidden', 'true');
      serial.textContent = String(index + 1).padStart(2,'0');
      if(Array.isArray(revealed?.[index])){
        const progress='已翻 '+revealed[index].length+'/5';
        serial.classList.add('has-progress');
        serial.textContent+=' · '+progress;
        button.setAttribute('aria-label','继续第 '+(index+1)+' 包，'+progress);
      }
      button.append(skin, serial);
      mat.append(button);
      button.addEventListener('click', () => {
        if (dead || index !== 1 || phase !== 'ready' || requested) return;
        requested = true;
        try {
          onSelect(index);
        } finally {
          // choose() itself owns the lock as soon as it starts.
          requested = false;
        }
      });
      return {index, button, skin};
    });

    function measure() {
      bounds = mat.getBoundingClientRect();
      const w = bounds.width, h = bounds.height;
      const n = items.length;
      const columns = Math.max(1, Math.min(n, w / Math.max(1,h) >= 1.08 ? 6 : 3));
      const rows = Math.ceil(n / columns) || 1;
      const gapX = Math.max(8, Math.min(w * .026, 34));
      const gapY = Math.max(28, Math.min(h * .052, 56));
      const usableW = w * (columns > 3 ? .86 : .89);
      const usableH = h * (rows === 1 ? .53 : .64);
      const width = Math.max(1, Math.min(
        (usableW - gapX * (columns - 1)) / columns,
        ((usableH - gapY * (rows - 1)) / rows) * RATIO,
        (columns > 3 ? .23 : .26) * w,
        182
      ));
      const height = width / RATIO;
      const middleY = h * (rows === 1 ? .54 : .545);
      seats = items.map((item, order) => {
        const row = Math.floor(order / columns);
        const col = order % columns;
        const inRow = Math.min(columns, n - row * columns);
        const offset = col - (inRow - 1) / 2;
        const slope = inRow > 1 ? offset * 2 / (inRow - 1) : 0;
        item.button.style.setProperty('--index-scale', WIDTH / width);
        return {
          x:w / 2 + offset * (width + gapX),
          y:middleY + (row - (rows - 1) / 2) * (height + gapY) + slope*slope*height*.037,
          w:width, h:height, angle:slope*(rows === 1 ? 5 : 3), yaw:0
        };
      });
    }

    function paint(item, p, opacity = 1, highlight = 0) {
      const style = item.button.style;
      style.transform = 'translate(' + p.x + 'px,' + p.y + 'px) perspective(860px) rotate(' +
        p.angle + 'deg) rotateY(' + p.yaw + 'deg) scale(' + p.w / WIDTH + ',' + p.h / HEIGHT + ') translate(-50%,-50%)';
      style.opacity = opacity;
      style.setProperty('--foil-catch', highlight);
    }

    function run(duration, update) {
      const start = performance.now();
      return new Promise(resolve => {
        finishFrame = resolve;
        function next(now) {
          if (dead) return;
          const t = Math.min(1, (now - start) / duration);
          update(t);
          if (t < 1) frame = requestAnimationFrame(next);
          else {
            frame = 0;
            finishFrame = null;
            resolve(true);
          }
        }
        next(start);
      });
    }

    function destinationPose() {
      const rect = typeof destination === 'function' ? destination() : destination;
      const w = rect?.width, h = rect?.height;
      if (!(w > 0 && h > 0)) return null;
      return {x:rect.left + w/2 - bounds.left, y:rect.top + h/2 - bounds.top, w, h, angle:0, yaw:0};
    }

    function resized() {
      measure();
      if (phase === 'ready') items.forEach((item, i) => paint(item, seats[i]));
      if (phase === 'landed') {
        const pose = destinationPose();
        if (pose) paint(selected, pose);
      }
    }
    const observer = new ResizeObserver(resized);
    observer.observe(mat);
    measure();
    setPhase('idle');

    async function dealFromMouth(packetQuad) {
      if (dead) return false;
      measure();
      setPhase('dealing');
      const count=items.length;
      const flight=reduced ? 165 : 1440, stagger=reduced ? 18 : 268;
      const duration=flight+Math.max(0,count-1)*stagger;
      const clearance=.47;
      const endSlope=.30;
      let started=0, cleared=false;
      // The nearest pouch crosses in front of the ones still rising from the rear slots.
      items.forEach((item,i)=>{item.button.style.zIndex=String(count-i);});
      const done=await run(duration,clock=>{
        const elapsed=clock*duration;
        const taken=Math.min(count,Math.ceil(elapsed/stagger));
        if(taken>started){
          started=taken;
          onExtract?.(count-taken);
        }
        if(!cleared && elapsed>=(count-1)*stagger+flight*clearance){
          cleared=true;
          setPhase('cleared');
        }
        // Read the moving carton before writing transforms, so all packets share this camera frame.
        const poses=items.map((item,i)=>{
          const t=limit((elapsed-i*stagger)/flight);
          if(!t || reduced || t===1)return {t};
          if(t<clearance){
            const u=t/clearance;
            const lift=u*u*(3-endSlope+(endSlope-2)*u);
            return {t,lift,quad:packetQuad(i,count,lift)};
          }
          return {t,quad:packetQuad(i,count,1),previous:centerOf(packetQuad(i,count,.9))};
        });
        items.forEach((item,i)=>{
          const {t,lift,quad:launch,previous}=poses[i];
          if(!t)return;
          const seat=seats[i], style=item.button.style;
          if(reduced || t===1){
            style.clipPath='';
            item.skin.style.removeProperty('--lip-shadow');
            paint(item,seat,reduced ? smooth(t) : 1);
            return;
          }
          if(t<clearance){
            style.transform=projectFoil(launch,bounds);
            style.opacity='1';
            // A horizontal UV cut is the oblique physical slot line after projection.
            // The portion below it stays inside the box, including the shadow cast by the foil.
            style.clipPath='inset(-2px -2px '+((1-lift)*100)+'% -2px)';
            item.skin.style.setProperty('--lip-line',(lift*100)+'%');
            item.skin.style.setProperty('--lip-shadow',Math.min(1,lift*18));
            style.setProperty('--foil-catch',.17*Math.sin(Math.PI*lift));
            return;
          }
          style.clipPath='';
          item.skin.style.removeProperty('--lip-shadow');
          const u=(t-clearance)/(1-clearance), turn=smooth(u);
          const c=centerOf(launch);
          const sx=seat.x+bounds.left, sy=seat.y+bounds.top;
          const tangent=endSlope*(1-clearance)/(clearance*.1*3);
          const x=cubic(c.x,c.x+(c.x-previous.x)*tangent,mix(c.x,sx,.90),sx,u);
          const y=cubic(c.y,c.y+(c.y-previous.y)*tangent,sy-Math.min(seat.h*.22,bounds.height*.07),sy,u);
          const offsets=seatCorners(seat);
          // Keep the projected pose at release, then roll the print toward its place on the table.
          const bank=Math.sin(Math.PI*u)**2*(sx-c.x)/Math.max(1,bounds.width)*.25;
          const cos=Math.cos(bank), sin=Math.sin(bank);
          const quad=launch.map((point,j)=>{
            const dx=mix(point.x-c.x,offsets[j].x,turn), dy=mix(point.y-c.y,offsets[j].y,turn);
            return {x:x+dx*cos-dy*sin,y:y+dx*sin+dy*cos};
          });
          style.transform=projectFoil(quad,bounds);
          style.opacity='1';
          style.setProperty('--foil-catch',.42*Math.sin(Math.PI*turn));
        });
      });
      if (!done || dead) return false;
      items.forEach((item, i) => {
        item.button.style.zIndex='';
        item.button.style.clipPath='';
        item.skin.style.removeProperty('--lip-line');
        item.skin.style.removeProperty('--lip-shadow');
        paint(item,seats[i]);
        item.button.disabled = item.index !== 1;
      });
      setPhase('ready');
      return true;
    }

    async function moveToTable(picked) {
      setPhase('choosing');
      selected = items[picked];
      items.forEach(item => { item.button.disabled = true; });
      selected.button.style.zIndex = 2;
      const done = await run(reduced ? 130 : 965, clock => {
        const target = destinationPose() || seats[picked];
        const travel = smooth(clock);
        const arc = reduced ? 0 : Math.sin(travel * Math.PI);
        items.forEach((item, i) => {
          const seat = seats[i];
          if (i === picked) {
            paint(item, {
              x:mix(seat.x, target.x, travel),
              y:mix(seat.y, target.y, travel) - arc * Math.min(35, bounds.height * .045),
              w:mix(seat.w, target.w, travel), h:mix(seat.h, target.h, travel),
              angle:mix(seat.angle, 0, travel), yaw:arc*7
            }, 1, arc*.65);
          } else {
            const fade = smooth(limit(clock/.68));
            const scale = 1 - (reduced ? 0 : fade*.08);
            paint(item, {...seat, y:seat.y + (reduced ? 0 : fade*seat.h*.09), w:seat.w*scale,h:seat.h*scale}, 1-fade);
          }
        });
      });
      if (!done || dead) return false;
      setPhase('landed');
      return true;
    }

    function destroy() {
      if (dead) return;
      dead = true;
      observer.disconnect();
      signal?.removeEventListener('abort',destroy);
      cancelAnimationFrame(frame);
      if (finishFrame) finishFrame(false);
      mat.remove();
      delete host.dataset.packPhase;
    }
    signal?.addEventListener('abort',destroy,{once:true});
    if (signal?.aborted) destroy();
    return {
      deal(packetQuad) {
        if (!dealTask) dealTask = dealFromMouth(packetQuad);
        return dealTask;
      },
      choose(index, targetRect) {
        if (dead) return Promise.resolve(false);
        if (choiceTask) return choiceTask;
        const picked = items.findIndex(item => item.index === index);
        if (index !== 1 || phase !== 'ready' || picked < 0) return Promise.resolve(false);
        destination = targetRect;
        choiceTask = moveToTable(picked);
        return choiceTask;
      },
      destroy
    };
  };
})();
