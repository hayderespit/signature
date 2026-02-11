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
let resetIsSupported = false;
let isLcdPad = false;

// LCD constants
const LCD_W = 240, LCD_H = 64;
const SIG_Y = 22, SIG_H = 40;
const HOTSPOT_CLEAR = 2, HOTSPOT_OK = 3;
const BMP_BASE = 'http://www.sigplusweb.com/SigWeb/';

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

function setStatus(text, connected) {
  statusEl.textContent = text;
  statusEl.className = 'status ' + (connected ? 'connected' : 'disconnected');
}

// --- Pad Detection ---
function detectPad() {
  try {
    if (typeof IsSigWebInstalled === 'function' && IsSigWebInstalled()) {
      resetIsSupported = !isOlderVersion('1.6.4.0', GetSigWebVersion());

      SetTabletState(1);
      const model = parseInt(TabletModelNumber(), 10);
      SetTabletState(0);
      console.log('SigWeb tablet model:', model);
      isLcdPad = [11, 12, 15].includes(model);

      if (isLcdPad) {
        setStatus('SigWeb Detected (LCD pad)', true);
        btnSign.disabled = false;
      } else {
        setStatus(`LCD pad required (model ${model} detected)`, false);
        btnSign.disabled = true;
      }
    } else {
      setStatus('SigWeb Not Detected', false);
      btnSign.disabled = true;
    }
  } catch {
    setStatus('SigWeb Not Detected', false);
    btnSign.disabled = true;
  }
}

// --- LCD Functions ---
function setupLcdSigningScreen() {
  LcdRefresh(0, 0, 0, LCD_W, LCD_H);
  LCDSendGraphicUrl(1, 2, 15, 4, BMP_BASE + 'CLEAR.bmp');
  LCDSendGraphicUrl(1, 2, 207, 4, BMP_BASE + 'OK.bmp');
  LCDSendGraphicUrl(1, 2, 0, 20, BMP_BASE + 'Sign.bmp');
  LcdRefresh(2, 0, 0, LCD_W, LCD_H);
  ClearTablet();
  KeyPadClearHotSpotList();
  KeyPadAddHotSpot(HOTSPOT_CLEAR, 1, 10, 5, 53, 17);
  KeyPadAddHotSpot(HOTSPOT_OK, 1, 197, 5, 19, 17);
  LCDSetWindow(2, SIG_Y, LCD_W - 4, SIG_H);
  SetSigWindow(1, 0, SIG_Y, LCD_W, SIG_H);
  SetLCDCaptureMode(2);
}

function cleanupLcd() {
  LcdRefresh(0, 0, 0, LCD_W, LCD_H);
  LCDSetWindow(0, 0, LCD_W, LCD_H);
  SetSigWindow(1, 0, 0, LCD_W, LCD_H);
  KeyPadClearHotSpotList();
  SetLCDCaptureMode(1);
}

// --- Signing Flow ---
function startSigning() {
  if (!isLcdPad) {
    setStatus('LCD pad required', false);
    return;
  }

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  SetDisplayXSize(500);
  SetDisplayYSize(100);
  SetImageXSize(500);
  SetImageYSize(100);
  SetJustifyMode(0);
  ClearTablet();

  tmr = SetTabletState(1, ctx, 50);
  eventTmr = setInterval(SigWebEvent, 20);

  setupLcdSigningScreen();

  btnSign.disabled = true;
  btnClear.disabled = false;
  outputSection.style.display = 'none';
  setStatus('Sign on the pad, then press OK', true);
}

function finishSigning() {
  clearInterval(eventTmr);
  eventTmr = null;

  LcdRefresh(0, 0, 0, LCD_W, LCD_H);
  LCDWriteString(0, 2, 20, 25, '9pt Arial', 15, 'Signature captured.');
  cleanupLcd();
  SetTabletState(0, tmr);

  SetImageXSize(500);
  SetImageYSize(100);
  GetSigImageB64(onImageReady);
}

function onImageReady(base64Str) {
  sigImage.src = 'data:image/png;base64,' + base64Str;
  base64Output.value = base64Str;
  outputSection.style.display = 'block';
  btnSign.disabled = false;
  btnClear.disabled = true;
  setStatus('Signature captured', true);
}

// Must be on window for SigWeb callback
window.onImageReady = onImageReady;

// Pen events — hotspot-based for LCD
window.onSigPenUp = function () {
  if (KeyPadQueryHotSpot(HOTSPOT_CLEAR) > 0) {
    ClearSigWindow(1);
    LcdRefresh(1, 10, 0, 53, 17);
    LcdRefresh(2, 0, 0, LCD_W, LCD_H);
    ClearTablet();
    return;
  }
  if (KeyPadQueryHotSpot(HOTSPOT_OK) > 0) {
    ClearSigWindow(1);
    LcdRefresh(1, 210, 3, 14, 14);
    if (NumberOfTabletPoints() > 0) {
      finishSigning();
    } else {
      LcdRefresh(0, 0, 0, LCD_W, LCD_H);
      LCDSendGraphicUrl(0, 2, 4, 20, BMP_BASE + 'please.bmp');
      ClearTablet();
      setTimeout(setupLcdSigningScreen, 1500);
    }
  }
};
window.onSigPenDown = null;

// --- Clear ---
function clearSignature() {
  if (eventTmr) {
    clearInterval(eventTmr);
    eventTmr = null;
  }
  ClearTablet();
  try { cleanupLcd(); } catch { /* pad may not be active */ }
  if (tmr) {
    SetTabletState(0, tmr);
    tmr = null;
  }
  outputSection.style.display = 'none';
  sigImage.src = '';
  base64Output.value = '';
  btnSign.disabled = false;
  btnClear.disabled = true;
  setStatus('SigWeb Detected (LCD pad)', true);
}

// --- Event Listeners ---
btnSign.addEventListener('click', startSigning);
btnClear.addEventListener('click', clearSignature);

// --- Page Dismissal ---
window.addEventListener('beforeunload', () => {
  try {
    cleanupLcd();
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
