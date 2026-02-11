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
let scrn = 0;

// LCD constants
const LCD_W = 240, LCD_H = 64;
const SIG_Y = 22, SIG_H = 40;
const HOTSPOT_CONTINUE = 0;
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
      var retmod = TabletModelNumber();
      SetTabletState(0);
      console.log('SigWeb tablet model (raw):', retmod, typeof retmod);
      isLcdPad = (retmod == 11 || retmod == 12 || retmod == 15);

      if (isLcdPad) {
        setStatus('SigWeb Detected (LCD pad)', true);
        btnSign.disabled = false;
      } else {
        setStatus('LCD pad required (model ' + retmod + ' detected)', false);
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

// --- LCD cleanup (matches demo endDemo) ---
function resetTablet() {
  LcdRefresh(0, 0, 0, LCD_W, LCD_H);
  LCDSetWindow(0, 0, LCD_W, LCD_H);
  SetSigWindow(1, 0, 0, LCD_W, LCD_H);
  KeyPadClearHotSpotList();
  SetLCDCaptureMode(1);
  SetTabletState(0, tmr);
  ClearTablet();
}

// --- Signing Flow ---
// Replicates demo startTablet() exactly:
// 1. Enable tablet + polling
// 2. Load graphics to layer 1
// 3. Show "Continue" on layer 0 with hotspot
// 4. Set 1x1 windows (signing DISABLED until Continue is pressed)
// 5. Graphics load in background while user sees Continue
function startSigning() {
  if (!isLcdPad) {
    setStatus('LCD pad required', false);
    return;
  }

  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Start tablet + event polling
  eventTmr = setInterval(SigWebEvent, 20);
  tmr = SetTabletState(1, ctx, 50) || tmr;

  // 2. Initial LCD setup
  SetLCDCaptureMode(2);
  LcdRefresh(0, 0, 0, LCD_W, LCD_H);
  SetJustifyMode(0);
  KeyPadClearHotSpotList();
  ClearSigWindow(1);
  SetDisplayXSize(500);
  SetDisplayYSize(100);
  SetImageXSize(500);
  SetImageYSize(100);
  SetLCDCaptureMode(2);

  // 3. Load button graphics to layer 1 (persist entire session)
  LCDSendGraphicUrl(1, 2, 0, 20, BMP_BASE + 'Sign.bmp');
  LCDSendGraphicUrl(1, 2, 207, 4, BMP_BASE + 'OK.bmp');
  LCDSendGraphicUrl(1, 2, 15, 4, BMP_BASE + 'CLEAR.bmp');

  // 4. Continue screen on layer 0
  LCDWriteString(0, 2, 25, 15, '9pt Arial', 15, 'Please press Continue to sign.');
  LCDWriteString(0, 2, 15, 45, '9pt Arial', 15, 'Continue');
  KeyPadAddHotSpot(HOTSPOT_CONTINUE, 1, 12, 40, 40, 15);

  // 5. Disable signing (1x1 windows) while graphics load
  ClearTablet();
  LCDSetWindow(0, 0, 1, 1);
  SetSigWindow(1, 0, 0, 1, 1);
  SetLCDCaptureMode(2);

  scrn = 1;

  window.onSigPenUp = function () { processPenUp(); };
  SetLCDCaptureMode(2);

  btnSign.disabled = true;
  btnClear.disabled = false;
  outputSection.style.display = 'none';
  setStatus('Press Continue on the pad', true);
}

// Handles all pad button presses via hotspot detection
function processPenUp() {
  // --- CONTINUE (scrn 1 → scrn 2) ---
  if (KeyPadQueryHotSpot(HOTSPOT_CONTINUE) > 0) {
    ClearSigWindow(1);
    LcdRefresh(1, 16, 45, 50, 15);
    if (scrn == 1) {
      // Activate signing screen — graphics already loaded on layer 1
      LcdRefresh(2, 0, 0, LCD_W, LCD_H);
      ClearTablet();
      KeyPadClearHotSpotList();
      KeyPadAddHotSpot(HOTSPOT_CLEAR, 1, 10, 5, 53, 17);
      KeyPadAddHotSpot(HOTSPOT_OK, 1, 197, 5, 19, 17);
      LCDSetWindow(2, SIG_Y, LCD_W - 4, SIG_H);
      SetSigWindow(1, 0, SIG_Y, LCD_W, SIG_H);
      scrn = 2;
      setStatus('Sign on the pad, then press OK', true);
    }
    SetLCDCaptureMode(2);
  }

  // --- CLEAR ---
  if (KeyPadQueryHotSpot(HOTSPOT_CLEAR) > 0) {
    ClearSigWindow(1);
    LcdRefresh(1, 10, 0, 53, 17);
    LcdRefresh(2, 0, 0, LCD_W, LCD_H);
    ClearTablet();
  }

  // --- OK ---
  if (KeyPadQueryHotSpot(HOTSPOT_OK) > 0) {
    ClearSigWindow(1);
    LcdRefresh(1, 210, 3, 14, 14);
    if (NumberOfTabletPoints() > 0) {
      // Signature exists — capture it
      LcdRefresh(0, 0, 0, LCD_W, LCD_H);
      LCDWriteString(0, 2, 35, 25, '9pt Arial', 15, 'Signature capture complete.');
      clearInterval(eventTmr);
      eventTmr = null;
      // Extract image while tablet still active
      SetImageXSize(500);
      SetImageYSize(100);
      GetSigImageB64(onImageReady);
    } else {
      // No signature — show "please sign" then return to signing
      LcdRefresh(0, 0, 0, LCD_W, LCD_H);
      LCDSendGraphicUrl(0, 2, 4, 20, BMP_BASE + 'please.bmp');
      ClearTablet();
      LcdRefresh(2, 0, 0, LCD_W, LCD_H);
      SetLCDCaptureMode(2);
    }
  }

  ClearSigWindow(1);
}

function onImageReady(base64Str) {
  // Cleanup AFTER image is captured
  resetTablet();
  tmr = null;
  scrn = 0;

  sigImage.src = 'data:image/png;base64,' + base64Str;
  base64Output.value = base64Str;
  outputSection.style.display = 'block';
  btnSign.disabled = false;
  btnClear.disabled = true;
  setStatus('Signature captured', true);
}

// Must be on window for SigWeb callback
window.onImageReady = onImageReady;

// --- Clear (web button) ---
function clearSignature() {
  if (eventTmr) {
    clearInterval(eventTmr);
    eventTmr = null;
  }
  try { resetTablet(); } catch { /* pad may not be active */ }
  tmr = null;
  scrn = 0;
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
    if (resetIsSupported && typeof Reset === 'function') {
      Reset();
    } else {
      resetTablet();
    }
  } catch (error) { 
    console.warn('Error during cleanup:', error);
  }
});

// --- Init ---
setTimeout(detectPad, 500);
