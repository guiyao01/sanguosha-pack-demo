import './carton-object.js';
import './carton-packs.js';

function imageBounds(image) {
  const rect = image.getBoundingClientRect();
  const scale = Math.min(rect.width / (image.naturalWidth || 960), rect.height / (image.naturalHeight || 1080));
  const width = (image.naturalWidth || 960) * scale;
  const height = (image.naturalHeight || 1080) * scale;
  return new DOMRect(rect.left + (rect.width-width)/2, rect.top + (rect.height-height)/2, width, height);
}

export function openCarton({pack, count, state, sourceImage, dismissPurchase, save, exit, resumeSlot, exitLabel='返回选盒'}) {
  state.revealed ??= {};
  const allCards=[0,1,2,3,4];
  const progressFor=slot=>state.opened.includes(slot)?allCards:state.revealed[slot];
  const canResume=()=>Number.isInteger(resumeSlot) && resumeSlot>=0 && resumeSlot<count && state.unwrapped &&
    !state.opened.includes(resumeSlot) && Array.isArray(state.revealed[resumeSlot]);
  const controller = new AbortController();
  const {signal} = controller;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dialog = document.createElement('dialog');
  dialog.id = 'carton-stage';
  dialog.setAttribute('aria-labelledby','carton-title');
  dialog.dataset.stage = 'approach';
  dialog.innerHTML = `<div class="carton-room"></div>
    <div class="carton-board-host"></div>
    <div class="carton-holder"><div class="carton-lift"><div class="carton-object" role="button" aria-label="撕开卡盒外膜" tabindex="-1"></div></div></div>
    <div class="carton-pack-layer"></div>
    <div class="carton-head"><div><h2 id="carton-title"></h2><span class="carton-count"></span></div>
      <button class="carton-exit" type="button">返回选盒</button></div>
    <div class="carton-foot"><p class="carton-hint" role="status"></p><button class="carton-retry" type="button" hidden>重新载入牌桌</button></div>
    <div class="carton-destination" aria-hidden="true"></div>`;
  const find = selector => dialog.querySelector(selector);
  const room = find('.carton-room'), holder = find('.carton-holder'), lift = find('.carton-lift');
  const objectHost = find('.carton-object'), mat = find('.carton-pack-layer'), board = find('.carton-board-host');
  const hint = find('.carton-hint'), retry = find('.carton-retry');
  find('.carton-exit').textContent=exitLabel;
  find('#carton-title').textContent = pack.name.replace(/(?:卡)?包$/, '') + '卡盒';
  const origin = imageBounds(sourceImage);
  const originalVisibility = sourceImage.style.visibility;
  const cover = sourceImage.cloneNode(false);
  cover.removeAttribute('id');
  cover.src = 'packs/boxes/' + pack.id + '.webp';
  cover.className = 'carton-cover';
  cover.alt = '';
  if(!state.unwrapped) lift.append(cover);
  document.body.append(dialog);
  dialog.showModal();
  const destination = lift.getBoundingClientRect();
  function animate(element, frames, duration) {
    const animation = element.animate(frames,{duration:reduced ? 1 : duration,easing:'cubic-bezier(.24,.74,.24,1)',fill:'backwards'});
    return animation.finished.catch(()=>{});
  }
  const travel = !state.unwrapped && origin.width && destination.width ? animate(lift, [
    {transform:'translate('+ (origin.left-destination.left) +'px,'+(origin.top-destination.top)+'px) scale('+(origin.width/destination.width)+','+(origin.height/destination.height)+')'},
    {transform:'none'}
  ],850) : Promise.resolve();
  const backdrop = state.unwrapped ? Promise.resolve() : animate(room,[{opacity:0},{opacity:1}],830);
  sourceImage.style.visibility = 'hidden';
  let frame = null, packs, selected = null, readySlot = null, readyRestored=false, lastRect = null, landed = false;
  let slowTimer, warmTick;
  let renderedProgress='';
  const stage = name => {dialog.dataset.stage=name;};
  const remaining = () => count-state.opened.length;
  const first = () => 1;
  const countLabel = () => {find('.carton-count').textContent = state.opened.length ? '本盒剩余 '+remaining()+' / '+count+' 包' : '一盒 '+count+' 包 · 每包 5 张';};
  countLabel();

  const packSignature=()=>JSON.stringify([state.opened,state.revealed]);
  function createPacks() {
    packs?.destroy();
    renderedProgress=packSignature();
    packs = window.createCartonPacks(mat,{packId:pack.id,count,opened:state.opened,revealed:state.revealed,onSelect:select,onExtract:n=>object.setRemaining(n),signal});
  }
  const object = window.createCartonObject(objectHost,{packId:pack.id,packCount:count,signal,onOpen(){
    if(signal.aborted || state.unwrapped) return;
    state.unwrapped=true;
    save();
    deal();
  }});
  createPacks();
  objectHost.addEventListener('keydown', event=>{
    if(dialog.dataset.stage==='wrapped' && ['Enter',' '].includes(event.key)){
      event.preventDefault();
      object.openWithoutGesture();
    }
  },{signal});
  objectHost.addEventListener('click', event=>{
    if(event.detail===0 && dialog.dataset.stage==='wrapped') object.openWithoutGesture();
  },{signal});
  function clearFrame(){
    clearTimeout(slowTimer);
    frame?.remove();
    frame=null; readySlot=null; readyRestored=false; lastRect=null;
  }
  function warm(slot) {
    if(signal.aborted || slot===undefined) return;
    clearFrame();
    const url = new URL('./play.html', location.href);
    url.searchParams.set(pack.id==='mixed'?'play':'pack', pack.id==='mixed'?'1':pack.id);
    url.searchParams.set('carton','1'); url.searchParams.set('lot',state.lot);
    if(state.cartonSize===5) url.searchParams.set('cartonSize','5');
    url.searchParams.set('slot',slot);
    frame=document.createElement('iframe');
    frame.addEventListener('carton-progress',event=>{
      if(dialog.dataset.stage==='playing' && event.detail?.slot===selected) noteRevealed(event.detail.revealed);
    });
    frame.title=pack.name+'开包牌桌';
    frame.inert=true; frame.tabIndex=-1; frame.src=url.href;
    board.append(frame);
  }
  function sendSelection(){
    if(frame && selected!==null) frame.contentWindow?.postMessage({type:'carton-select',slot:selected,revealed:progressFor(selected)},location.origin);
  }
  function targetRect(){
    if(!lastRect || !frame) return find('.carton-destination').getBoundingClientRect();
    const bounds=frame.getBoundingClientRect();
    const {x,y,width,height}=lastRect;
    return new DOMRect(bounds.left+x,bounds.top+y,width,height);
  }
  function noteRevealed(indices){
    if(selected===null || state.opened.includes(selected) || !Array.isArray(indices) ||
      !indices.every(i=>Number.isInteger(i) && i>=0 && i<5))return;
    const old=state.revealed[selected];
    const merged=Array.from(new Set([...(old??[]),...indices]));
    if(old && merged.length===old.length)return;
    state.revealed[selected]=merged;
    if(merged.length===5)state.opened.push(selected);
    save(selected);
    countLabel();
  }
  const readyForSelection=()=>selected!==null && readySlot===selected && readyRestored===!!progressFor(selected);
  async function handoff(){
    if(dialog.dataset.stage!=='flying' || !landed || !readyForSelection())return;
    clearTimeout(slowTimer); retry.hidden=true; hint.textContent='';
    stage('handoff');
    await Promise.all([animate(board,[{opacity:0},{opacity:1}],330),animate(mat,[{opacity:1},{opacity:0}],330)]);
    if(signal.aborted || dialog.dataset.stage!=='handoff') return;
    stage('playing'); frame.inert=false; frame.tabIndex=0; frame.focus({preventScroll:true});
    if(progressFor(selected))syncSelected();
  }
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin || !frame || event.source!==frame.contentWindow) return;
    const data=event.data || {};
    if(data.type==='carton-ready'){
      const rect=data.rect;
      if(!Number.isInteger(data.slot) || !rect || ![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite) || rect.width<=0 || rect.height<=0) return;
      lastRect=rect; readySlot=data.slot; readyRestored=!!data.restored;
      if(dialog.dataset.stage==='flying' && !readyForSelection())sendSelection();
      else handoff();
    } else if(dialog.dataset.stage==='playing' && data.slot===selected){
      if(data.type==='carton-opened') noteRevealed(allCards);
      else if(data.type==='carton-return'){noteRevealed(allCards); exit(true);}
      else if(data.type==='carton-exit') exit(false);
    }
  },{signal});
  function warnIfSlow(){
    clearTimeout(slowTimer);
    slowTimer=setTimeout(()=>{
      if(dialog.dataset.stage==='flying'){
        hint.textContent='牌桌仍在载入'; retry.hidden=false;
      }
    },12000);
  }
  retry.addEventListener('click',()=>{
    if(dialog.dataset.stage!=='flying')return;
    retry.hidden=true; hint.textContent='正在准备牌桌…';
    warm(selected); warnIfSlow();
  },{signal});
  async function select(slot){
    if(dialog.dataset.stage!=='picking' || slot!==1 || state.opened.includes(slot))return;
    selected=slot; landed=false;
    stage('flying'); hint.textContent='';
    if(!frame)warm(slot);
    sendSelection(); warnIfSlow();
    landed=await packs.choose(slot,targetRect);
    if(signal.aborted || dialog.dataset.stage!=='flying')return;
    if(!readyForSelection() && retry.hidden)hint.textContent='正在准备牌桌…';
    handoff();
  }
  // The box and the packet share a camera. Leave room for the full foil seal
  // to clear the slot, even on a short landscape screen.
  function frameExtraction(){
    const countLeft = remaining();
    const rect = objectHost.getBoundingClientRect();
    if(!countLeft || !rect.height) return;
    let highest = rect.top;
    for (const order of new Set([0,countLeft-1])) {
      for (const corner of object.getPacketQuad(order,countLeft,1)) highest = Math.min(highest,corner.y);
    }
    const h = dialog.clientHeight, boxHeight = holder.offsetHeight;
    const aboveCenter = (.5 + (rect.top-highest)/rect.height) * boxHeight;
    const top = h*.09, bottom = h*.923;
    const scale = Math.min(1,(bottom-top)/(aboveCenter+boxHeight*.5));
    const center = Math.max(top+aboveCenter*scale, Math.min(h*.55,bottom-boxHeight*.5*scale));
    holder.style.setProperty('--carton-draw-scale',String(scale));
    holder.style.setProperty('--carton-draw-offset',(center-h*.55)+'px');
  }
  const framing = new ResizeObserver(()=>{
    if(dialog.dataset.stage==='dealing') frameExtraction();
  });
  framing.observe(dialog);
  async function deal(){
    if(signal.aborted)return;
    object.restoreOpen(remaining());
    objectHost.tabIndex=-1; objectHost.removeAttribute('role');
    hint.textContent=''; countLabel();
    if(!remaining()){
      stage('empty');hint.textContent='这一盒已全部开完';
      find('.carton-exit').focus({preventScroll:true}); return;
    }
    frameExtraction();
    stage('dealing');
    const dealing=packs;
    await dealing.deal(object.getPacketQuad);
    if(signal.aborted || dealing!==packs || dialog.dataset.stage!=='dealing')return;
    object.setRemaining(0);
    stage('picking');hint.textContent='点开第 02 包';
    mat.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
  }
  find('.carton-exit').addEventListener('click',()=>exit(false),{signal});
  dialog.addEventListener('cancel',event=>{event.preventDefault();if(dialog.dataset.stage!=='playing')exit(false);},{signal});
  const entering=Promise.all([travel,backdrop]);
  warmTick=requestAnimationFrame(()=>{warmTick=requestAnimationFrame(()=>{if(!frame)warm(canResume()?resumeSlot:first());});});
  entering.then(async ()=>{
    if(signal.aborted)return;
    dismissPurchase(); sourceImage.style.visibility=originalVisibility;
    if(canResume()){
      selected=resumeSlot;landed=true;stage('flying');
      if(!frame)warm(selected);
      sendSelection();warnIfSlow();handoff();
      return;
    }
    if(state.unwrapped){deal();return;}
    await animate(cover,[{opacity:1},{opacity:0}],180);
    if(signal.aborted)return;
    cover.remove();
    if(state.unwrapped){deal();return;}
    stage('wrapped');
    object.enable();objectHost.tabIndex=0;objectHost.focus({preventScroll:true});
    hint.textContent='沿盒面滑动，撕开外膜';
  });
  function syncProgress(latest){
    if(signal.aborted || !latest || state.lot!==latest.lot)return;
    state.unwrapped ||= !!latest.unwrapped;
    state.opened=Array.from(new Set([...state.opened,...latest.opened]));
    for(const [key,indices] of Object.entries(latest.revealed??{})){
      state.revealed[key]=Array.from(new Set([...(state.revealed[key]??[]),...indices]));
    }
    countLabel();
    const current=dialog.dataset.stage;
    if((current==='dealing' || current==='picking' || (current==='wrapped' && state.unwrapped))
      && (current==='wrapped' || renderedProgress!==packSignature())){
      createPacks();deal();
    }else if(current==='flying'){
      sendSelection();
    }else if((current==='playing' || current==='handoff') && progressFor(selected)){
      syncSelected();
    }
  }
  function syncSelected(){
    frame?.contentWindow?.postMessage({type:'carton-sync',slot:selected,revealed:progressFor(selected)},location.origin);
  }
  return {syncProgress,destroy(){
    framing.disconnect(); controller.abort(); cancelAnimationFrame(warmTick); clearFrame();
    for(const animation of dialog.getAnimations({subtree:true}))animation.cancel();
    sourceImage.style.visibility=originalVisibility;
    dialog.close(); dialog.remove();
  }};
}
