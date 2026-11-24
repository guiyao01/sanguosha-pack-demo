import {openCarton} from './carton-flow.js';

const startButton = document.querySelector('#demo-start');
const artwork = startButton.querySelector('img');
const home = new URL('./', location.href);
const config = {id:'mountain', name:'山包'};
let carton;
history.replaceState(null, '', home.href);

function closeCarton() {
  carton?.destroy();
  carton = null;
  startButton.disabled = false;
  startButton.focus({preventScroll:true});
}
function openDemo() {
  if (carton) return;
  startButton.disabled = true;
  const state = {id:'mountain', lot:217086121, cartonSize:5, unwrapped:false, opened:[], revealed:{}};
  carton = openCarton({
    pack:config, count:5, state, sourceImage:artwork, exitLabel:'返回',
    dismissPurchase() {}, save() {},
    exit(replay) {
      if (replay) {
        closeCarton();
        openDemo();
      } else if (history.state?.demoBox) {
        history.back();
      } else {
        closeCarton();
      }
    }
  });
}
startButton.addEventListener('click', () => {
  if (carton) return;
  history.pushState({demoBox:true}, '', home.href);
  openDemo();
});
window.addEventListener('popstate', () => {
  if (history.state?.demoBox) openDemo();
  else closeCarton();
});
