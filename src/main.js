import './style.css';

// --- DOM ---
document.querySelector('#app').innerHTML = `
  <h1>Signature Capture</h1>
  <span id="status" class="status"></span>
  <div class="actions">
    <button id="btn-sign" type="button">Sign</button>
    <button id="btn-clear" type="button" disabled>Clear</button>
  </div>
  <div id="output" style="display:none">
    <img id="sig-image" alt="Captured signature" />
    <textarea id="base64-output" readonly rows="4"></textarea>
  </div>
`;

const statusEl = document.getElementById('status');
const btnSign = document.getElementById('btn-sign');
const btnClear = document.getElementById('btn-clear');
const outputSection = document.getElementById('output');
const sigImage = document.getElementById('sig-image');
const base64Output = document.getElementById('base64-output');

// Hidden canvas for SigWeb rendering
const canvas = document.createElement('canvas');
canvas.width = 500;
canvas.height = 100;
canvas.style.display = 'none';
document.body.appendChild(canvas);

let tmr = null;
let eventTmr = null;
let autoStopTimer = null;
let resetIsSupported = false;

// --- Helpers ---
function isOlderVersion(oldVer, newVer) {
  const oldParts = oldVer.split('.');
  const newParts = newVer.split('.');
  for (let i = 0; i < oldParts.length; i++) {
    const a = parseInt(newParts[i] || '0', 10);
    const b = parseInt(oldParts[i] || '0', 10);
    if (a > b) return false;
    if (a < b) return true;
  }
  return false;
}

function setStatus(connected) {
  if (connected) {
    statusEl.textContent = 'SigWeb Detected';
    statusEl.className = 'status connected';
  } else {
    statusEl.textContent = 'SigWeb Not Detected';
    statusEl.className = 'status disconnected';
  }
}

// --- Pad Detection ---
function detectPad() {
  try {
    if (typeof IsSigWebInstalled === 'function' && IsSigWebInstalled()) {
      resetIsSupported = !isOlderVersion('1.6.4.0', GetSigWebVersion());
      setStatus(true);
      btnSign.disabled = false;
    } else {
      setStatus(false);
      btnSign.disabled = true;
    }
  } catch {
    setStatus(false);
    btnSign.disabled = true;
  }
}

// --- Signing Flow ---
function startSigning() {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  SetDisplayXSize(500);
  SetDisplayYSize(100);
  SetImageXSize(500);
  SetImageYSize(100);
  SetJustifyMode(5);
  ClearTablet();

  tmr = SetTabletState(1, ctx, 50);
  eventTmr = setInterval(SigWebEvent, 20);

  btnSign.disabled = true;
  btnClear.disabled = false;
  outputSection.style.display = 'none';
}

function finishSigning() {
  clearInterval(eventTmr);
  eventTmr = null;

  if (typeof NumberOfTabletPoints === 'function' && NumberOfTabletPoints() > 0) {
    SetTabletState(0, tmr);
    SetImageXSize(500);
    SetImageYSize(100);
    GetSigImageB64(onImageReady);
  } else {
    SetTabletState(0, tmr);
    btnSign.disabled = false;
  }
}

function onImageReady(base64Str) {
  sigImage.src = 'data:image/png;base64,' + base64Str;
  base64Output.value = base64Str;
  outputSection.style.display = 'block';
  btnSign.disabled = false;
}

// Must be on window for SigWeb callback
window.onImageReady = onImageReady;

// Pen events for auto-detect completion
window.onSigPenDown = function () {
  clearTimeout(autoStopTimer);
};

window.onSigPenUp = function () {
  clearTimeout(autoStopTimer);
  autoStopTimer = setTimeout(finishSigning, 2000);
};

// --- Clear ---
function clearSignature() {
  clearTimeout(autoStopTimer);
  if (eventTmr) {
    clearInterval(eventTmr);
    eventTmr = null;
  }
  ClearTablet();
  if (tmr) {
    SetTabletState(0, tmr);
    tmr = null;
  }
  outputSection.style.display = 'none';
  sigImage.src = '';
  base64Output.value = '';
  btnSign.disabled = false;
  btnClear.disabled = true;
}

// --- Event Listeners ---
btnSign.addEventListener('click', startSigning);
btnClear.addEventListener('click', clearSignature);

// --- Page Dismissal ---
window.addEventListener('beforeunload', () => {
  try {
    if (resetIsSupported && typeof Reset === 'function') {
      Reset();
    } else {
      if (tmr) SetTabletState(0, tmr);
      ClearTablet();
    }
  } catch {
    // SigWeb may not be available
  }
});

// --- Init ---
detectPad();
