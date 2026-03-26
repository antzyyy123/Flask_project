// ── CLOCK ──
function tick() {
  const n = new Date();
  const t = n.toTimeString().slice(0,8);
  const d = n.toLocaleDateString('en-GB');
  document.getElementById('tbTime').textContent  = t;
  document.getElementById('hudTime').textContent = t;
  document.getElementById('sbDate').textContent  = d;
}
setInterval(tick, 1000); tick();

// ── LEAFLET MAP + GEO ──
let leafletMap = null;
let operatorMarker = null;

function initMap(lat, lon) {
  if (leafletMap) {
    leafletMap.setView([lat, lon], 13);
    placeMarker(lat, lon);
    return;
  }

  leafletMap = L.map('worldMap', {
    zoomControl: false,
    attributionControl: false,
    dragging: true,
    scrollWheelZoom: true,
  }).setView([lat, lon], 13);

  // Dark tile layer (CartoDB Dark Matter)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
  }).addTo(leafletMap);

  // Subtle scan-line overlay on top of tiles
  const scanDiv = document.createElement('div');
  scanDiv.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:400;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,20,40,0.18) 2px,rgba(0,20,40,0.18) 4px);';
  document.getElementById('worldMap').appendChild(scanDiv);

  // Tint overlay
  const tintDiv = document.createElement('div');
  tintDiv.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:399;background:rgba(0,20,50,0.35);mix-blend-mode:multiply;';
  document.getElementById('worldMap').appendChild(tintDiv);

  placeMarker(lat, lon);
}

function placeMarker(lat, lon) {
  if (operatorMarker) {
    operatorMarker.setLatLng([lat, lon]);
    return;
  }

  // Custom pulsing HUD marker
  const pulseIcon = L.divIcon({
    className: '',
    html: `<div style="position:relative;width:60px;height:60px;transform:translate(-50%,-50%)">
      <div style="position:absolute;inset:0;border-radius:50%;border:1px solid rgba(0,180,255,0.6);animation:ring-pulse 2s ease-out infinite;"></div>
      <div style="position:absolute;inset:8px;border-radius:50%;border:1px solid rgba(0,180,255,0.4);animation:ring-pulse 2s ease-out 0.6s infinite;"></div>
      <div style="position:absolute;inset:16px;border-radius:50%;border:1px solid rgba(0,180,255,0.25);animation:ring-pulse 2s ease-out 1.2s infinite;"></div>
      <div style="position:absolute;top:50%;left:50%;width:10px;height:10px;background:#00b4ff;border-radius:50%;transform:translate(-50%,-50%);box-shadow:0 0 14px #00b4ff,0 0 28px rgba(0,180,255,0.5);"></div>
      <div style="position:absolute;top:50%;left:calc(50% + 8px);font-family:'Share Tech Mono',monospace;font-size:9px;color:rgba(0,180,255,0.9);letter-spacing:1px;white-space:nowrap;transform:translateY(-50%);text-shadow:0 0 8px rgba(0,180,255,0.8);">◀ OPERATOR</div>
    </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });

  operatorMarker = L.marker([lat, lon], { icon: pulseIcon }).addTo(leafletMap);

  // Crosshair lines through marker
  const crossH = L.polyline([[lat, lon - 2], [lat, lon + 2]], {
    color: 'rgba(0,180,255,0.25)', weight: 1, dashArray: '4,6'
  }).addTo(leafletMap);
  const crossV = L.polyline([[lat - 1, lon], [lat + 1, lon]], {
    color: 'rgba(0,180,255,0.25)', weight: 1, dashArray: '4,6'
  }).addTo(leafletMap);
}

// Inject ring-pulse keyframe into page
(function() {
  const s = document.createElement('style');
  s.textContent = '@keyframes ring-pulse{0%{transform:scale(0.3);opacity:0.8}100%{transform:scale(1.8);opacity:0}}';
  document.head.appendChild(s);
})();

async function fetchGeo() {
  try {
    const r = await fetch('https://ipapi.co/json/');
    const d = await r.json();
    const lat = parseFloat(d.latitude);
    const lon = parseFloat(d.longitude);

    initMap(lat, lon);

    document.getElementById('hudLoc').textContent     = `${d.city}, ${d.country_name}`.toUpperCase();
    document.getElementById('hudCoords').textContent  = `${lat.toFixed(2)}°N ${lon.toFixed(2)}°E`;
    document.getElementById('geoIP').textContent      = d.ip;
    document.getElementById('geoCity').textContent    = `${d.city}, ${d.region}`.toUpperCase();
    document.getElementById('geoCountry').textContent = `${d.country_name} (${d.country_code})`;
    document.getElementById('geoISP').textContent     = (d.org||'—').toUpperCase().slice(0,22);
    document.getElementById('geoLatLon').textContent  = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  } catch(e) {
    // Fallback: load map centered on world view
    initMap(20, 0);
    leafletMap.setZoom(2);
    document.getElementById('hudLoc').textContent = 'UNAVAILABLE';
    document.getElementById('geoIP').textContent  = 'BLOCKED';
  }
}
fetchGeo();


// ── STATE ──
let jobId=null, pollTimer=null, activeMode='dict';
let charsets={lower:true,upper:true,digits:true,special:false}, wlMode='system';

// ── MODE SWITCH ──
function switchMode(m) {
  activeMode = m;
  document.querySelectorAll('.mode-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.mode-panel').forEach(p=>p.classList.remove('active'));
  document.getElementById('tab-'+m).classList.add('active');
  document.getElementById('panel-'+m).classList.add('active');
  document.getElementById('modeLabel').textContent  = m==='dict'?'DICT':'BRUTE';
  document.getElementById('ssModeVal').textContent  = m==='dict'?'DICTIONARY':'BRUTE FORCE';
  document.getElementById('sbMode').textContent     = m==='dict'?'MODE: DICTIONARY ATTACK':'MODE: BRUTE FORCE ATTACK';
}

// ── WORDLIST MODE ──
function selectWL(m) {
  wlMode = m;
  document.getElementById('ri-sys').classList.toggle('sel', m==='system');
  document.getElementById('ri-imp').classList.toggle('sel', m==='import');
  document.getElementById('sysWlGroup').style.display    = m==='system'?'block':'none';
  document.getElementById('importWlGroup').style.display = m==='import'?'block':'none';
}
document.getElementById('sysWlSelect').addEventListener('change', function() {
  document.getElementById('sysCustomPath').style.display = this.value==='custom'?'block':'none';
});

// ── CHARSET ──
function toggleCS(k) {
  charsets[k]=!charsets[k];
  document.getElementById('cs-'+k).classList.toggle('on',charsets[k]);
  updateEst();
}
function updateEst() {
  let s=0;
  if(charsets.lower) s+=26; if(charsets.upper) s+=26;
  if(charsets.digits) s+=10; if(charsets.special) s+=32;
  s += document.getElementById('customChars').value.length||0;
  const mn=parseInt(document.getElementById('minLen').value)||1;
  const mx=parseInt(document.getElementById('maxLen').value)||4;
  if(!s||mn>mx){document.getElementById('bfEst').textContent='No charset selected.';return;}
  let t=0; for(let l=mn;l<=mx;l++) t+=Math.pow(s,l);
  const f=t>1e12?(t/1e12).toFixed(1)+'T':t>1e9?(t/1e9).toFixed(1)+'B':t>1e6?(t/1e6).toFixed(1)+'M':t>1e3?(t/1e3).toFixed(1)+'K':t;
  document.getElementById('bfEst').textContent=`KEYSPACE: ~${f} combinations (charset: ${s}, len ${mn}–${mx})`;
}
document.getElementById('minLen').addEventListener('input',updateEst);
document.getElementById('maxLen').addEventListener('input',updateEst);
document.getElementById('customChars').addEventListener('input',updateEst);
updateEst();

// ── FILE INPUTS ──
function bindF(inp,lbl){
  document.getElementById(inp).addEventListener('change',function(){
    document.getElementById(lbl).textContent='✓ '+(this.files[0]?this.files[0].name:'No file selected');
  });
}
bindF('dictZipInput','dictZipChosen'); bindF('bruteZipInput','bruteZipChosen'); bindF('wlInput','wlChosen');
['dictZipDrop','bruteZipDrop','wlDrop'].forEach(id=>{
  const el=document.getElementById(id); if(!el)return;
  el.addEventListener('dragover',e=>{e.preventDefault();el.classList.add('over');});
  el.addEventListener('dragleave',()=>el.classList.remove('over'));
  el.addEventListener('drop',()=>el.classList.remove('over'));
});

// ── START DICT ──
async function startDict() {
  const z=document.getElementById('dictZipInput').files[0];
  if(!z){alert('Select a ZIP file.');return;}
  const fd=new FormData(); fd.append('zipfile',z); fd.append('mode','dictionary');
  if(wlMode==='system'){
    const s=document.getElementById('sysWlSelect').value;
    if(s==='custom'){const p=document.getElementById('sysCustomPath').value.trim();if(!p){alert('Enter path.');return;}fd.append('system_wordlist',p);}
    else fd.append('system_wordlist',s);
  } else {
    const w=document.getElementById('wlInput').files[0];
    if(!w){alert('Select a wordlist.');return;}
    fd.append('wordlist',w);
  }
  setRunning('dict');
  try{const r=await fetch('/crack',{method:'POST',body:fd});const d=await r.json();if(d.error){showErr(d.error);return;}jobId=d.job_id;document.getElementById('ssJobId').textContent=d.job_id;poll();}
  catch(e){showErr('Failed: '+e.message);}
}

// ── START BRUTE ──
async function startBrute() {
  const z=document.getElementById('bruteZipInput').files[0];
  if(!z){alert('Select a ZIP file.');return;}
  const cs=[];
  if(charsets.lower)cs.push('abcdefghijklmnopqrstuvwxyz');
  if(charsets.upper)cs.push('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  if(charsets.digits)cs.push('0123456789');
  if(charsets.special)cs.push('!@#$%^&*()_+-=[]{}|;:,.<>?');
  const cu=document.getElementById('customChars').value;if(cu)cs.push(cu);
  const charset=[...new Set(cs.join('').split(''))].join('');
  if(!charset){alert('Select at least one charset.');return;}
  const mn=parseInt(document.getElementById('minLen').value),mx=parseInt(document.getElementById('maxLen').value);
  if(mn>mx){alert('Min > Max.');return;}
  if(mx>8&&!confirm(`Max length ${mx} may take very long. Continue?`))return;
  const fd=new FormData();fd.append('zipfile',z);fd.append('mode','bruteforce');fd.append('charset',charset);fd.append('min_len',mn);fd.append('max_len',mx);
  setRunning('brute');
  try{const r=await fetch('/crack',{method:'POST',body:fd});const d=await r.json();if(d.error){showErr(d.error);return;}jobId=d.job_id;document.getElementById('ssJobId').textContent=d.job_id;poll();}
  catch(e){showErr('Failed: '+e.message);}
}

// ── POLL ──
function poll(){ if(pollTimer)clearInterval(pollTimer); pollTimer=setInterval(doPoll,800); }
async function doPoll(){
  if(!jobId)return;
  try{
    const r=await fetch('/status/'+jobId);const d=await r.json();
    updateLog(d.log);
    document.getElementById('ssAttempts').textContent=d.attempts||0;
    if(d.done){
      clearInterval(pollTimer);
      document.getElementById('progFill').className='prog-fill';
      document.getElementById('progFill').style.width='100%';
      resetBtn(activeMode);
      if(d.found){setOS('CRACKED','found');showResult(true,d.password,d.attempts);document.getElementById('sbStatus').textContent='STATUS: PASSWORD CRACKED';}
      else if(d.status==='error'){setOS('ERROR','error');document.getElementById('sbStatus').textContent='STATUS: ERROR';}
      else{setOS('NOT FOUND','failed');showResult(false,'',d.attempts);document.getElementById('sbStatus').textContent='STATUS: STANDBY';}
    }
  }catch(e){console.error(e);}
}

function updateLog(lines){
  const el=document.getElementById('outputLog'); el.innerHTML='';
  (lines||[]).forEach(line=>{
    const d=document.createElement('div'); d.className='ll';
    if(!line)d.className='ll blank';
    else if(line.startsWith('[+]'))d.className='ll hi';
    else if(line.startsWith('[!]'))d.className='ll warn';
    else if(line.startsWith('[X]')||line.startsWith('[ERROR]'))d.className='ll err';
    d.textContent=line; el.appendChild(d);
  });
  el.scrollTop=el.scrollHeight;
}

function showResult(ok,pw,att){
  const b=document.getElementById('resultBox'); b.style.display='block';
  b.className='result-box '+(ok?'found':'fail');
  document.getElementById('rbTitle').className='rb-title '+(ok?'ok':'bad');
  document.getElementById('rbTitle').textContent=ok?'// PASSWORD FOUND':'// NOT FOUND';
  document.getElementById('rbPw').textContent=ok?pw:'—';
  document.getElementById('rbAttempts').textContent=att+' tried';
  document.getElementById('rbMode').textContent=activeMode==='dict'?'DICTIONARY':'BRUTE FORCE';
}

function setRunning(m){
  const btn=document.getElementById(m==='dict'?'dictCrackBtn':'bruteCrackBtn');
  const cnl=document.getElementById(m==='dict'?'dictCancelBtn':'bruteCancelBtn');
  btn.disabled=true; btn.textContent='CRACKING...'; cnl.style.display='block';
  document.getElementById('progWrap').style.display='block';
  document.getElementById('resultBox').style.display='none';
  document.getElementById('outputLog').innerHTML='';
  document.getElementById('progFill').className='prog-fill running';
  setOS('RUNNING','running');
  document.getElementById('sbStatus').textContent='STATUS: CRACKING';
}
function resetBtn(m){
  const btn=document.getElementById(m==='dict'?'dictCrackBtn':'bruteCrackBtn');
  const cnl=document.getElementById(m==='dict'?'dictCancelBtn':'bruteCancelBtn');
  btn.disabled=false; btn.textContent=m==='dict'?'INITIATE DICT ATTACK':'INITIATE BRUTE FORCE'; cnl.style.display='none';
}
function setOS(t,c){const el=document.getElementById('outStatus');el.textContent=t;el.className='out-status '+c;}
function showErr(msg){resetBtn(activeMode);setOS('ERROR','error');const d=document.createElement('div');d.className='ll err';d.textContent='[ERROR] '+msg;document.getElementById('outputLog').appendChild(d);document.getElementById('sbStatus').textContent='STATUS: ERROR';}
async function cancelJob(m){if(!jobId)return;await fetch('/cancel/'+jobId,{method:'POST'});clearInterval(pollTimer);resetBtn(m);setOS('ABORTED','failed');document.getElementById('sbStatus').textContent='STATUS: STANDBY';}

// ── MODALS ──
function openModal(type) {
  document.getElementById('modal-' + type).classList.add('open');
  if (type === 'system')  loadDevice();
  if (type === 'network') loadNetwork();
}
function closeModal(type) {
  document.getElementById('modal-' + type).classList.remove('open');
}
function closeModalOutside(e, id) {
  if (e.target.id === id) closeModal(id.replace('modal-',''));
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal('system'); closeModal('network');
  }
});

async function loadDevice() {
  document.getElementById('device-loading').style.display = 'block';
  document.getElementById('device-data').style.display    = 'none';
  try {
    const r = await fetch('/api/device');
    const d = await r.json();
    if (d.error) throw new Error(d.error);

    setText('d-username', d.username);
    setText('d-device',   d.device_name);
    setText('d-ip',       d.ip_address);
    setText('d-os',       d.os);
    setText('d-osver',    d.os_version);
    setText('d-arch',     d.architecture);
    setText('d-cpu',      d.processor || '—');
    setText('d-python',   'Python ' + d.python);
    setText('d-uptime',   d.uptime);
    setText('d-timestamp',d.timestamp);

    const statusEl = document.getElementById('d-status');
    statusEl.textContent = d.status;
    statusEl.className = 'mr-val ' + (d.status === 'ONLINE' ? 'ok' : 'err');

    document.getElementById('device-loading').style.display = 'none';
    document.getElementById('device-data').style.display    = 'block';
  } catch(e) {
    document.getElementById('device-loading').textContent = '[ERROR] ' + e.message;
    document.getElementById('device-loading').style.color = 'var(--red)';
  }
}

async function loadNetwork() {
  document.getElementById('network-loading').style.display = 'block';
  document.getElementById('network-data').style.display    = 'none';
  try {
    const r = await fetch('/api/network');
    const d = await r.json();
    if (d.error) throw new Error(d.error);

    const statusEl = document.getElementById('n-status');
    statusEl.textContent = d.status;
    statusEl.className = 'mr-val ' + (d.status === 'CONNECTED' ? 'ok' : 'err');

    setText('n-devip',    d.device_ip);
    setText('n-hostname', d.hostname);
    setText('n-gwip',     d.gateway_ip);
    setText('n-gwname',   d.gateway_name);
    setText('n-dns',      d.dns);
    setText('n-fqdn',     d.fqdn);
    setText('n-timestamp',d.timestamp);

    document.getElementById('network-loading').style.display = 'none';
    document.getElementById('network-data').style.display    = 'block';
  } catch(e) {
    document.getElementById('network-loading').textContent = '[ERROR] ' + e.message;
    document.getElementById('network-loading').style.color = 'var(--red)';
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val || '—';
}



// ── ENCRYPTION TOOLKIT ──
let encType = 'hash', encAlgo = 'b64', hashAlgo = 'md5', cipherType = 'caesar';

function switchEncType(t) {
  encType = t;
  document.querySelectorAll('.enc-type-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.enc-section').forEach(s => s.classList.remove('active'));
  document.getElementById('etype-' + t).classList.add('active');
  document.getElementById('esec-' + t).classList.add('active');
}

function setAlgo(a) {
  encAlgo = a;
  document.querySelectorAll('.enc-algo-btn[id^="alg-"]').forEach(b => b.classList.remove('active'));
  document.getElementById('alg-' + a).classList.add('active');
}

function setHashAlgo(a) {
  hashAlgo = a;
  document.querySelectorAll('.enc-algo-btn[id^="halg-"]').forEach(b => b.classList.remove('active'));
  document.getElementById('halg-' + a).classList.add('active');
}

function setCipher(c) {
  cipherType = c;
  document.querySelectorAll('.enc-algo-btn[id^="cph-"]').forEach(b => b.classList.remove('active'));
  document.getElementById('cph-' + c).classList.add('active');
  document.getElementById('caesar-shift-row').style.display = c === 'caesar' ? 'block' : 'none';
}

// ── HASH IDENTIFY ──
function identifyHash() {
  const h = document.getElementById('enc-hash-input').value.trim();
  const res = document.getElementById('enc-hash-result');
  const out = document.getElementById('enc-hash-out');
  res.style.display = 'block';
  res.className = 'enc-result';
  if (!h) { res.className = 'enc-result fail'; out.textContent = 'No input provided.'; return; }

  const len = h.replace(/[^0-9a-fA-F]/g, '').length === h.length ? h.length : -1;
  const isHex = /^[0-9a-fA-F]+$/.test(h);
  const isB64 = /^[A-Za-z0-9+/=]+$/.test(h) && h.length % 4 === 0;

  let results = [];
  if (isHex) {
    if (h.length === 32)  results.push('MD5 (128-bit)');
    if (h.length === 40)  results.push('SHA-1 (160-bit)');
    if (h.length === 56)  results.push('SHA-224');
    if (h.length === 64)  results.push('SHA-256 / Keccak-256');
    if (h.length === 96)  results.push('SHA-384');
    if (h.length === 128) results.push('SHA-512 / Whirlpool');
    if (h.length === 32)  results.push('NTLM');
    if (h.length === 16)  results.push('MySQL 3.x / Half-MD5');
  }
  if (h.startsWith('$2') && h.length === 60) results.push('bcrypt');
  if (h.startsWith('$1$')) results.push('MD5-Crypt (Linux)');
  if (h.startsWith('$5$')) results.push('SHA-256-Crypt (Linux)');
  if (h.startsWith('$6$')) results.push('SHA-512-Crypt (Linux)');
  if (h.startsWith('$apr1$')) results.push('MD5-APR (Apache)');
  if (/^[A-Za-z0-9+/]{27}=$/.test(h)) results.push('Base64-encoded MD5');
  if (isB64 && h.length > 20) results.push('Possible Base64 encoded hash');
  if (h.length === 13 && /^[a-zA-Z0-9./]{13}$/.test(h)) results.push('DES-Crypt (Unix)');

  if (results.length === 0) {
    res.className = 'enc-result fail';
    out.textContent = `Unknown hash format\nLength: ${h.length} chars\nCharset: ${isHex ? 'Hexadecimal' : isB64 ? 'Base64-like' : 'Mixed/Unknown'}`;
  } else {
    out.textContent = `POSSIBLE TYPES:\n${results.map(r => '  ▸ ' + r).join('\n')}\n\nLENGTH: ${h.length} chars\nCHARSET: ${isHex ? 'Hexadecimal' : 'Mixed'}`;
  }
}

// ── ENCODE / DECODE ──
function runCodec(action) {
  const input = document.getElementById('enc-codec-input').value;
  const res   = document.getElementById('enc-codec-result');
  const out   = document.getElementById('enc-codec-out');
  const title = document.getElementById('enc-codec-title');
  res.style.display = 'block';
  res.className = 'enc-result';

  try {
    let result = '';
    const alg = encAlgo;
    title.textContent = alg.toUpperCase() + ' ' + action.toUpperCase() + ' OUTPUT';

    if (alg === 'b64') {
      result = action === 'encode'
        ? btoa(unescape(encodeURIComponent(input)))
        : decodeURIComponent(escape(atob(input)));
    } else if (alg === 'hex') {
      if (action === 'encode') {
        result = Array.from(input).map(c => c.charCodeAt(0).toString(16).padStart(2,'0')).join('');
      } else {
        result = input.replace(/[^0-9a-fA-F]/g,'').match(/.{1,2}/g).map(b => String.fromCharCode(parseInt(b,16))).join('');
      }
    } else if (alg === 'url') {
      result = action === 'encode' ? encodeURIComponent(input) : decodeURIComponent(input);
    } else if (alg === 'bin') {
      if (action === 'encode') {
        result = Array.from(input).map(c => c.charCodeAt(0).toString(2).padStart(8,'0')).join(' ');
      } else {
        result = input.trim().split(/\s+/).map(b => String.fromCharCode(parseInt(b,2))).join('');
      }
    } else if (alg === 'html') {
      if (action === 'encode') {
        const d = document.createElement('div'); d.textContent = input; result = d.innerHTML;
      } else {
        const d = document.createElement('div'); d.innerHTML = input; result = d.textContent;
      }
    }
    out.textContent = result;
  } catch(e) {
    res.className = 'enc-result fail';
    out.textContent = '[ERROR] ' + e.message;
  }
}

// ── HASH GENERATE (via SubtleCrypto) ──
async function generateHash() {
  const input = document.getElementById('enc-hashgen-input').value;
  const res   = document.getElementById('enc-hashgen-result');
  const out   = document.getElementById('enc-hashgen-out');
  const title = document.getElementById('enc-hashgen-title');
  res.style.display = 'block';
  res.className = 'enc-result';

  if (!input) { res.className = 'enc-result fail'; out.textContent = 'No input.'; return; }

  try {
    let algo, label;
    if      (hashAlgo === 'md5')    { out.textContent = md5(input); title.textContent = 'MD5 OUTPUT'; return; }
    else if (hashAlgo === 'sha1')   { algo = 'SHA-1';   label = 'SHA-1'; }
    else if (hashAlgo === 'sha256') { algo = 'SHA-256'; label = 'SHA-256'; }
    else if (hashAlgo === 'sha512') { algo = 'SHA-512'; label = 'SHA-512'; }

    title.textContent = label + ' HASH OUTPUT';
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest(algo, enc.encode(input));
    out.textContent = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  } catch(e) {
    res.className = 'enc-result fail';
    out.textContent = '[ERROR] ' + e.message;
  }
}

// Minimal MD5 implementation
function md5(s) {
  function safeAdd(x,y){var lsw=(x&65535)+(y&65535);return(((x>>16)+(y>>16)+(lsw>>16))<<16)|(lsw&65535);}
  function bitRotateLeft(num,cnt){return(num<<cnt)|(num>>>(32-cnt));}
  function md5cmn(q,a,b,x,s,t){return safeAdd(bitRotateLeft(safeAdd(safeAdd(a,q),safeAdd(x,t)),s),b);}
  function md5ff(a,b,c,d,x,s,t){return md5cmn((b&c)|((~b)&d),a,b,x,s,t);}
  function md5gg(a,b,c,d,x,s,t){return md5cmn((b&d)|(c&(~d)),a,b,x,s,t);}
  function md5hh(a,b,c,d,x,s,t){return md5cmn(b^c^d,a,b,x,s,t);}
  function md5ii(a,b,c,d,x,s,t){return md5cmn(c^(b|(~d)),a,b,x,s,t);}
  var bArr=[];for(var i=0;i<s.length*8;i+=8)bArr[i>>5]|=(s.charCodeAt(i/8)&255)<<(i%32);
  var length8=s.length*8;bArr[length8>>5]|=128<<(length8%32);bArr[(((length8+64)>>>9)<<4)+14]=length8;
  var a=1732584193,b=-271733879,c=-1732584194,d=271733878;
  for(var k=0;k<bArr.length;k+=16){var oA=a,oB=b,oC=c,oD=d;
    a=md5ff(a,b,c,d,bArr[k],7,-680876936);d=md5ff(d,a,b,c,bArr[k+1],12,-389564586);
    c=md5ff(c,d,a,b,bArr[k+2],17,606105819);b=md5ff(b,c,d,a,bArr[k+3],22,-1044525330);
    a=md5ff(a,b,c,d,bArr[k+4],7,-176418897);d=md5ff(d,a,b,c,bArr[k+5],12,1200080426);
    c=md5ff(c,d,a,b,bArr[k+6],17,-1473231341);b=md5ff(b,c,d,a,bArr[k+7],22,-45705983);
    a=md5ff(a,b,c,d,bArr[k+8],7,1770035416);d=md5ff(d,a,b,c,bArr[k+9],12,-1958414417);
    c=md5ff(c,d,a,b,bArr[k+10],17,-42063);b=md5ff(b,c,d,a,bArr[k+11],22,-1990404162);
    a=md5ff(a,b,c,d,bArr[k+12],7,1804603682);d=md5ff(d,a,b,c,bArr[k+13],12,-40341101);
    c=md5ff(c,d,a,b,bArr[k+14],17,-1502002290);b=md5ff(b,c,d,a,bArr[k+15],22,1236535329);
    a=md5gg(a,b,c,d,bArr[k+1],5,-165796510);d=md5gg(d,a,b,c,bArr[k+6],9,-1069501632);
    c=md5gg(c,d,a,b,bArr[k+11],14,643717713);b=md5gg(b,c,d,a,bArr[k],20,-373897302);
    a=md5gg(a,b,c,d,bArr[k+5],5,-701558691);d=md5gg(d,a,b,c,bArr[k+10],9,38016083);
    c=md5gg(c,d,a,b,bArr[k+15],14,-660478335);b=md5gg(b,c,d,a,bArr[k+4],20,-405537848);
    a=md5gg(a,b,c,d,bArr[k+9],5,568446438);d=md5gg(d,a,b,c,bArr[k+14],9,-1019803690);
    c=md5gg(c,d,a,b,bArr[k+3],14,-187363961);b=md5gg(b,c,d,a,bArr[k+8],20,1163531501);
    a=md5gg(a,b,c,d,bArr[k+13],5,-1444681467);d=md5gg(d,a,b,c,bArr[k+2],9,-51403784);
    c=md5gg(c,d,a,b,bArr[k+7],14,1735328473);b=md5gg(b,c,d,a,bArr[k+12],20,-1926607734);
    a=md5hh(a,b,c,d,bArr[k+5],4,-378558);d=md5hh(d,a,b,c,bArr[k+8],11,-2022574463);
    c=md5hh(c,d,a,b,bArr[k+11],16,1839030562);b=md5hh(b,c,d,a,bArr[k+14],23,-35309556);
    a=md5hh(a,b,c,d,bArr[k+1],4,-1530992060);d=md5hh(d,a,b,c,bArr[k+4],11,1272893353);
    c=md5hh(c,d,a,b,bArr[k+7],16,-155497632);b=md5hh(b,c,d,a,bArr[k+10],23,-1094730640);
    a=md5hh(a,b,c,d,bArr[k+13],4,681279174);d=md5hh(d,a,b,c,bArr[k],11,-358537222);
    c=md5hh(c,d,a,b,bArr[k+3],16,-722521979);b=md5hh(b,c,d,a,bArr[k+6],23,76029189);
    a=md5hh(a,b,c,d,bArr[k+9],4,-640364487);d=md5hh(d,a,b,c,bArr[k+12],11,-421815835);
    c=md5hh(c,d,a,b,bArr[k+15],16,530742520);b=md5hh(b,c,d,a,bArr[k+2],23,-995338651);
    a=md5ii(a,b,c,d,bArr[k],6,-198630844);d=md5ii(d,a,b,c,bArr[k+7],10,1126891415);
    c=md5ii(c,d,a,b,bArr[k+14],15,-1416354905);b=md5ii(b,c,d,a,bArr[k+5],21,-57434055);
    a=md5ii(a,b,c,d,bArr[k+12],6,1700485571);d=md5ii(d,a,b,c,bArr[k+3],10,-1894986606);
    c=md5ii(c,d,a,b,bArr[k+10],15,-1051523);b=md5ii(b,c,d,a,bArr[k+1],21,-2054922799);
    a=md5ii(a,b,c,d,bArr[k+8],6,1873313359);d=md5ii(d,a,b,c,bArr[k+15],10,-30611744);
    c=md5ii(c,d,a,b,bArr[k+6],15,-1560198380);b=md5ii(b,c,d,a,bArr[k+13],21,1309151649);
    a=md5ii(a,b,c,d,bArr[k+4],6,-145523070);d=md5ii(d,a,b,c,bArr[k+11],10,-1120210379);
    c=md5ii(c,d,a,b,bArr[k+2],15,718787259);b=md5ii(b,c,d,a,bArr[k+9],21,-343485551);
    a=safeAdd(a,oA);b=safeAdd(b,oB);c=safeAdd(c,oC);d=safeAdd(d,oD);
  }
  return [a,b,c,d].map(n=>('0'+((n<0?n+4294967296:n).toString(16))).slice(-8).match(/.{2}/g).reverse().join('')).join('');
}

// ── CIPHER ──
const MORSE = {'A':'.-','B':'-...','C':'-.-.','D':'-..','E':'.','F':'..-.','G':'--.','H':'....','I':'..','J':'.---','K':'-.-','L':'.-..','M':'--','N':'-.','O':'---','P':'.--.','Q':'--.-','R':'.-.','S':'...','T':'-','U':'..-','V':'...-','W':'.--','X':'-..-','Y':'-.--','Z':'--..','0':'-----','1':'.----','2':'..---','3':'...--','4':'....-','5':'.....','6':'-....','7':'--...','8':'---..','9':'----.',' ':' '};
const MORSE_REV = Object.fromEntries(Object.entries(MORSE).map(([k,v])=>[v,k]));

function runCipher(action) {
  const input = document.getElementById('enc-cipher-input').value;
  const res   = document.getElementById('enc-cipher-result');
  const out   = document.getElementById('enc-cipher-out');
  const title = document.getElementById('enc-cipher-title');
  res.style.display = 'block';
  res.className = 'enc-result';

  try {
    let result = '';
    const shift = parseInt(document.getElementById('enc-shift').value) || 13;
    title.textContent = cipherType.toUpperCase() + ' ' + action.toUpperCase() + ' OUTPUT';

    if (cipherType === 'rot13' || (cipherType === 'caesar' && shift === 13)) {
      result = input.replace(/[a-zA-Z]/g, c => {
        const base = c <= 'Z' ? 65 : 97;
        return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
      });
    } else if (cipherType === 'caesar') {
      const s = action === 'encrypt' ? shift : 26 - shift;
      result = input.replace(/[a-zA-Z]/g, c => {
        const base = c <= 'Z' ? 65 : 97;
        return String.fromCharCode(((c.charCodeAt(0) - base + s) % 26) + base);
      });
    } else if (cipherType === 'atbash') {
      result = input.replace(/[a-zA-Z]/g, c => {
        const base = c <= 'Z' ? 65 : 97;
        return String.fromCharCode(base + 25 - (c.charCodeAt(0) - base));
      });
    } else if (cipherType === 'morse') {
      if (action === 'encrypt') {
        result = input.toUpperCase().split('').map(c => MORSE[c] || '?').join(' ');
      } else {
        result = input.trim().split('   ').map(w => w.split(' ').map(c => MORSE_REV[c] || '?').join('')).join(' ');
      }
    }
    out.textContent = result;
  } catch(e) {
    res.className = 'enc-result fail';
    out.textContent = '[ERROR] ' + e.message;
  }
}

// ── COPY ──
function copyResult(id) {
  const text = document.getElementById(id).textContent;
  navigator.clipboard.writeText(text).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
  });
}

// ── MENUBAR helper ──
function scrollToPanel() {
  switchMode('dict');
}

// ── PYZIPPER badge check ──
async function checkPyzipper() {
  try {
    const r = await fetch('/api/device');
    const d = await r.json();
    const el = document.getElementById('badgePyzipperStatus');
    if (el) el.textContent = 'PYZIPPER: ' + (d.pyzipper ? 'READY' : 'NOT FOUND');
  } catch(e) {}
}
checkPyzipper();



// ══════════════════════════════════════════
// LOGIN PASSWORD CRACKER
// ══════════════════════════════════════════
let lcMode = 'dict', lcWlMode = 'system', lcMethod = 'POST';
let lcCharsets = { lower:true, upper:true, digits:true, special:false };
let lcJobId = null, lcPollTimer = null;

function openLoginCracker() {
  document.getElementById('lcOverlay').classList.add('open');
  lcUpdateEst();
}
function closeLoginCracker() {
  document.getElementById('lcOverlay').classList.remove('open');
}

function lcSwitchMode(m) {
  lcMode = m;
  document.querySelectorAll('.lc-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.lc-method-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('lctab-' + m).classList.add('active');
  document.getElementById('lcpanel-' + m).classList.add('active');
  document.getElementById('lcModeLabel').textContent  = m === 'dict' ? 'DICT' : 'BRUTE';
  document.getElementById('lcSsMode').textContent     = m === 'dict' ? 'DICTIONARY' : 'BRUTE FORCE';
  lcUpdateEst();
}

function lcSetMethod(m) {
  lcMethod = m;
  document.getElementById('lc-method-post').classList.toggle('active', m === 'POST');
  document.getElementById('lc-method-get').classList.toggle('active',  m === 'GET');
  document.getElementById('lcStripMethod').textContent = m;
}

function lcSelectWL(m) {
  lcWlMode = m;
  document.getElementById('lcri-sys').classList.toggle('sel', m === 'system');
  document.getElementById('lcri-imp').classList.toggle('sel', m === 'import');
  document.getElementById('lcSysWlGroup').style.display    = m === 'system' ? 'block' : 'none';
  document.getElementById('lcImportWlGroup').style.display = m === 'import' ? 'block' : 'none';
}

document.getElementById('lcSysWlSelect').addEventListener('change', function() {
  document.getElementById('lcSysCustomPath').style.display = this.value === 'custom' ? 'block' : 'none';
});

function lcToggleCS(k) {
  lcCharsets[k] = !lcCharsets[k];
  document.getElementById('lc-cs-' + k).classList.toggle('on', lcCharsets[k]);
  lcUpdateEst();
}

function lcUpdateEst() {
  let s = 0;
  if (lcCharsets.lower)   s += 26;
  if (lcCharsets.upper)   s += 26;
  if (lcCharsets.digits)  s += 10;
  if (lcCharsets.special) s += 32;
  s += (document.getElementById('lcCustomChars').value || '').length;
  const mn = parseInt(document.getElementById('lcMinLen').value) || 1;
  const mx = parseInt(document.getElementById('lcMaxLen').value) || 4;
  const el = document.getElementById('lcBfEst');
  if (!el) return;
  if (!s || mn > mx) { el.textContent = 'No charset selected.'; return; }
  let t = 0; for (let l = mn; l <= mx; l++) t += Math.pow(s, l);
  const f = t > 1e12 ? (t/1e12).toFixed(1)+'T' : t > 1e9 ? (t/1e9).toFixed(1)+'B' : t > 1e6 ? (t/1e6).toFixed(1)+'M' : t > 1e3 ? (t/1e3).toFixed(1)+'K' : t;
  el.textContent = `KEYSPACE: ~${f} combinations (charset: ${s}, len ${mn}–${mx})`;
}

// Bind length/charset inputs
document.getElementById('lcMinLen').addEventListener('input', lcUpdateEst);
document.getElementById('lcMaxLen').addEventListener('input', lcUpdateEst);
document.getElementById('lcCustomChars').addEventListener('input', lcUpdateEst);

// File input
document.getElementById('lcWlInput').addEventListener('change', function() {
  document.getElementById('lcWlChosen').textContent = '✓ ' + (this.files[0] ? this.files[0].name : 'No file selected');
});
const lcWlDrop = document.getElementById('lcWlDrop');
lcWlDrop.addEventListener('dragover', e => { e.preventDefault(); lcWlDrop.classList.add('over'); });
lcWlDrop.addEventListener('dragleave', () => lcWlDrop.classList.remove('over'));
lcWlDrop.addEventListener('drop', () => lcWlDrop.classList.remove('over'));

// ── PROBE ──
async function lcProbe() {
  const url = document.getElementById('lc-url').value.trim();
  const res  = document.getElementById('lcProbeResult');
  if (!url) { res.textContent = '⚠ Enter a URL first'; res.style.color = 'var(--yellow)'; return; }
  res.textContent = 'PROBING...'; res.style.color = 'var(--text-dim)';
  try {
    const r = await fetch('/api/probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const d = await r.json();
    if (d.reachable) {
      res.textContent = `✓ REACHABLE — HTTP ${d.status_code} | ${d.server || 'unknown server'} | ${d.response_time_ms}ms`;
      res.style.color = 'var(--accent3)';
    } else {
      res.textContent = `✕ UNREACHABLE — ${d.error || 'Connection failed'}`;
      res.style.color = 'var(--red)';
    }
  } catch(e) {
    res.textContent = '✕ Probe failed: ' + e.message;
    res.style.color = 'var(--red)';
  }
}

// ── START ──
async function lcStart() {
  const url       = document.getElementById('lc-url').value.trim();
  const userField = document.getElementById('lc-user-field').value.trim() || 'username';
  const userVal   = document.getElementById('lc-user-val').value.trim();
  const passField = document.getElementById('lc-pass-field').value.trim() || 'password';
  const failStr      = document.getElementById('lc-fail-str').value.trim();
  const successStr   = document.getElementById('lc-success-str')?.value?.trim() || '';
  const delay     = parseInt(document.getElementById('lc-delay').value) || 0;
  const extraRaw  = document.getElementById('lc-extra-fields').value.trim();

  if (!url)     { alert('Enter a login URL.'); return; }
  if (!userVal) { alert('Enter a username or email.'); return; }
  if (!failStr && !successStr) { alert('Enter at least one: Failure Indicator OR Success Indicator.'); return; }

  // Parse extra fields
  const extraFields = {};
  extraRaw.split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) extraFields[k.trim()] = v.join('=').trim();
  });

  // Update target strip
  document.getElementById('lcStripUrl').textContent  = url.length > 40 ? url.slice(0,40)+'...' : url;
  document.getElementById('lcStripUser').textContent = userVal;
  document.getElementById('lcStripFail').textContent = failStr;
  document.getElementById('lcSsTarget').textContent  = url.replace(/https?:\/\//, '').slice(0, 24);

  const fd = new FormData();
  fd.append('url',        url);
  fd.append('user_field', userField);
  fd.append('user_val',   userVal);
  fd.append('pass_field', passField);
  fd.append('fail_str',   failStr);
  fd.append('success_str', successStr);
  fd.append('csrf_field',   (document.getElementById('lc-csrf-field')?.value||'').trim());
  fd.append('method',     lcMethod);
  fd.append('delay_ms',   delay);
  fd.append('extra_fields', JSON.stringify(extraFields));
  fd.append('mode', lcMode);

  if (lcMode === 'dict') {
    if (lcWlMode === 'system') {
      const sel = document.getElementById('lcSysWlSelect').value;
      if (sel === 'custom') {
        const p = document.getElementById('lcSysCustomPath').value.trim();
        if (!p) { alert('Enter wordlist path.'); return; }
        fd.append('system_wordlist', p);
      } else {
        fd.append('system_wordlist', sel);
      }
    } else {
      const wf = document.getElementById('lcWlInput').files[0];
      if (!wf) { alert('Select a wordlist file.'); return; }
      fd.append('wordlist', wf);
    }
  } else {
    const cs = [];
    if (lcCharsets.lower)   cs.push('abcdefghijklmnopqrstuvwxyz');
    if (lcCharsets.upper)   cs.push('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    if (lcCharsets.digits)  cs.push('0123456789');
    if (lcCharsets.special) cs.push('!@#$%^&*()_+-=[]{}|;:,.<>?');
    const cu = document.getElementById('lcCustomChars').value;
    if (cu) cs.push(cu);
    const charset = [...new Set(cs.join('').split(''))].join('');
    if (!charset) { alert('Select at least one charset.'); return; }
    const mn = parseInt(document.getElementById('lcMinLen').value);
    const mx = parseInt(document.getElementById('lcMaxLen').value);
    if (mn > mx) { alert('Min > Max length.'); return; }
    fd.append('charset',  charset);
    fd.append('min_len',  mn);
    fd.append('max_len',  mx);
  }

  lcSetRunning();
  try {
    const r = await fetch('/login_crack', { method: 'POST', body: fd });
    const d = await r.json();
    if (d.error) { lcShowErr(d.error); return; }
    lcJobId = d.job_id;
    document.getElementById('lcSsJob').textContent = d.job_id;
    lcPoll();
  } catch(e) { lcShowErr('Failed to start: ' + e.message); }
}

// ── POLL ──
function lcPoll() {
  if (lcPollTimer) clearInterval(lcPollTimer);
  lcPollTimer = setInterval(lcDoPoll, 800);
}
async function lcDoPoll() {
  if (!lcJobId) return;
  try {
    const r = await fetch('/login_status/' + lcJobId);
    const d = await r.json();
    lcUpdateLog(d.log);
    document.getElementById('lcSsAttempts').textContent = d.attempts || 0;
    if (d.done) {
      clearInterval(lcPollTimer);
      document.getElementById('lcProgFill').className = 'lc-prog-fill';
      document.getElementById('lcProgFill').style.width = '100%';
      lcResetBtn();
      if (d.found) {
        lcSetBadge('CRACKED', 'found');
        lcShowResult(true, d.password, d.attempts, d.target, d.username);
      } else if (d.status === 'error') {
        lcSetBadge('ERROR', 'failed');
      } else {
        lcSetBadge('NOT FOUND', 'failed');
        lcShowResult(false, '', d.attempts, d.target, d.username);
      }
    }
  } catch(e) { console.error(e); }
}

function lcUpdateLog(lines) {
  const el = document.getElementById('lcLog'); el.innerHTML = '';
  (lines || []).forEach(line => {
    const d = document.createElement('div'); d.className = 'll';
    if (!line) d.className = 'll blank';
    else if (line.startsWith('[+]')) d.className = 'll hi';
    else if (line.startsWith('[!]')) d.className = 'll warn';
    else if (line.startsWith('[X]') || line.startsWith('[ERROR]')) d.className = 'll err';
    d.textContent = line; el.appendChild(d);
  });
  el.scrollTop = el.scrollHeight;
}

function lcShowResult(ok, pw, att, target, username) {
  const b = document.getElementById('lcResult'); b.style.display = 'block';
  b.className = 'lc-result ' + (ok ? 'found' : 'fail');
  const title = document.getElementById('lcResultTitle');
  title.className = 'lc-result-title ' + (ok ? 'ok' : 'bad');
  title.textContent = ok ? '// PASSWORD FOUND' : '// PASSWORD NOT FOUND';
  document.getElementById('lcResultPw').textContent       = ok ? pw : '—';
  document.getElementById('lcResultUser').textContent     = username || '—';
  document.getElementById('lcResultAttempts').textContent = att + ' attempts';
  document.getElementById('lcResultTarget').textContent   = target || '—';
}

function lcSetRunning() {
  document.getElementById('lcStartBtn').disabled = true;
  document.getElementById('lcStartBtn').textContent = 'ATTACKING...';
  document.getElementById('lcCancelBtn').style.display = 'block';
  document.getElementById('lcProgWrap').style.display = 'block';
  document.getElementById('lcResult').style.display   = 'none';
  document.getElementById('lcLog').innerHTML = '';
  document.getElementById('lcProgFill').className = 'lc-prog-fill running';
  lcSetBadge('RUNNING', 'running');
}

function lcResetBtn() {
  document.getElementById('lcStartBtn').disabled = false;
  document.getElementById('lcStartBtn').textContent = 'INITIATE LOGIN ATTACK';
  document.getElementById('lcCancelBtn').style.display = 'none';
}

function lcSetBadge(t, c) {
  const el = document.getElementById('lcOutStatus');
  el.textContent = t; el.className = 'lc-status-badge ' + c;
}

function lcShowErr(msg) {
  lcResetBtn(); lcSetBadge('ERROR', 'failed');
  const d = document.createElement('div'); d.className = 'll err';
  d.textContent = '[ERROR] ' + msg;
  document.getElementById('lcLog').appendChild(d);
}

async function lcCancel() {
  if (!lcJobId) return;
  await fetch('/login_cancel/' + lcJobId, { method: 'POST' });
  clearInterval(lcPollTimer);
  lcResetBtn(); lcSetBadge('ABORTED', 'failed');
}


// ── CSRF SCANNER ──
async function lcScanCsrf() {
  const url = document.getElementById('lc-url').value.trim();
  const res = document.getElementById('lcCsrfScanResult');
  if (!url) { res.textContent = '⚠ Enter URL first'; res.style.color = 'var(--yellow)'; return; }
  res.textContent = 'SCANNING...'; res.style.color = 'var(--text-dim)';
  try {
    const r = await fetch('/api/scan_csrf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const d = await r.json();
    if (d.error) { res.textContent = '✕ ' + d.error; res.style.color = 'var(--red)'; return; }
    if (d.tokens && Object.keys(d.tokens).length > 0) {
      const parts = Object.entries(d.tokens).map(([k,v]) => `${k} = ${v.slice(0,20)}${v.length>20?'...':''}`);
      res.style.color = 'var(--accent3)';
      res.textContent = '✓ Found: ' + parts.join('  |  ');
      // Auto-fill first token field name
      document.getElementById('lc-csrf-field').value = Object.keys(d.tokens)[0];
    } else {
      res.textContent = '— No CSRF tokens detected (may not be needed)';
      res.style.color = 'var(--text-dim)';
    }
  } catch(e) {
    res.textContent = '✕ Scan failed: ' + e.message;
    res.style.color = 'var(--red)';
  }
}


// ── DEBUG LOGIN TEST ──
async function lcDebug() {
  const url       = document.getElementById('lc-url').value.trim();
  const userField = document.getElementById('lc-user-field').value.trim() || 'username';
  const userVal   = document.getElementById('lc-user-val').value.trim();
  const passField = document.getElementById('lc-pass-field').value.trim() || 'password';
  const failStr   = document.getElementById('lc-fail-str').value.trim();
  const successStr= document.getElementById('lc-success-str')?.value?.trim() || '';
  const csrfField = document.getElementById('lc-csrf-field')?.value?.trim() || '';
  const method    = lcMethod;

  const panel   = document.getElementById('lcDebugPanel');
  const content = document.getElementById('lcDebugContent');

  if (!url)     { alert('Enter a URL first.'); return; }
  if (!userVal) { alert('Enter a username/email.'); return; }

  panel.style.display = 'block';
  content.innerHTML = '<span style="color:var(--yellow)">FIRING TEST ATTEMPT...</span>';

  // Parse extra fields
  const extraRaw = document.getElementById('lc-extra-fields').value.trim();
  const extra = {};
  extraRaw.split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) extra[k.trim()] = v.join('=').trim();
  });

  try {
    const r = await fetch('/api/debug_login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url, user_field: userField, user_val: userVal,
        pass_field: passField, test_password: 'DEBUG_TEST_PASSWORD_XYZ',
        method, csrf_field: csrfField, extra_fields: extra
      })
    });
    const d = await r.json();

    if (d.error) {
      content.innerHTML = `<span style="color:var(--red)">[ERROR] ${d.error}</span>`;
      return;
    }

    const failMatch   = failStr   ? d.visible_text.toLowerCase().includes(failStr.toLowerCase())   : null;
    const successMatch= successStr? d.visible_text.toLowerCase().includes(successStr.toLowerCase()): null;

    const lines = [
      `<span style="color:var(--accent)">HTTP STATUS  </span> ${d.response_code}`,
      `<span style="color:var(--accent)">FINAL URL    </span> ${d.final_url}`,
      `<span style="color:var(--accent)">REDIRECTED   </span> ${d.redirected ? '<span style="color:var(--accent3)">YES</span>' : 'NO'}`,
      `<span style="color:var(--accent)">BODY LENGTH  </span> ${d.body_length} chars`,
      `<span style="color:var(--accent)">CSRF FOUND   </span> ${Object.keys(d.csrf_found||{}).length ? '<span style="color:var(--accent3)">' + Object.keys(d.csrf_found).join(', ') + '</span>' : '<span style="color:var(--text-dim)">none</span>'}`,
      `<span style="color:var(--accent)">SENT FIELDS  </span> ${Object.keys(d.sent_fields||{}).join(', ')}`,
      '',
      failStr   ? `<span style="color:var(--accent)">FAIL STR     </span> "${failStr}" → ${failMatch   ? '<span style="color:var(--red)">FOUND in response ✓ (fail detection works)</span>'   : '<span style="color:var(--yellow)">NOT FOUND — check your fail string</span>'}` : '',
      successStr? `<span style="color:var(--accent)">SUCCESS STR  </span> "${successStr}" → ${successMatch? '<span style="color:var(--yellow)">FOUND even on wrong password — change it</span>' : '<span style="color:var(--accent3)">Not present ✓ (correct for wrong password)</span>'}` : '',
      '',
      `<span style="color:var(--accent)">VISIBLE TEXT </span>`,
      `<span style="color:var(--text)">${(d.visible_text||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>`,
      '',
      `<span style="color:var(--accent)">RAW PREVIEW  </span>`,
      `<span style="color:var(--text-dim);font-size:9px;">${(d.body_preview||'').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,' ')}</span>`,
    ];

    content.innerHTML = lines.filter(l => l !== null).join('<br>');

    // Diagnostic advice
    let advice = '';
    if (failStr && !failMatch) {
      advice += `<br><br><span style="color:var(--yellow)">⚠ Your fail string "${failStr}" was NOT found in the response above.</span>`;
      advice += `<br><span style="color:var(--text-dim)">→ Look at VISIBLE TEXT above and copy the exact error message the page shows.</span>`;
    }
    if (failStr && failMatch) {
      advice += `<br><br><span style="color:var(--accent3)">✓ Fail string is working correctly. The cracker should detect success when this string disappears.</span>`;
    }
    if (!failStr && !successStr) {
      advice += `<br><br><span style="color:var(--yellow)">⚠ No detection strings set. Add a Failure Indicator or Success Indicator.</span>`;
    }
    content.innerHTML += advice;

  } catch(e) {
    content.innerHTML = `<span style="color:var(--red)">[ERROR] ${e.message}</span>`;
  }
}


// ── MANUAL PASSWORD TEST ──
async function lcManualTest() {
  const url        = document.getElementById('lc-url').value.trim();
  const userField  = document.getElementById('lc-user-field').value.trim() || 'username';
  const userVal    = document.getElementById('lc-user-val').value.trim();
  const passField  = document.getElementById('lc-pass-field').value.trim() || 'password';
  const failStr    = document.getElementById('lc-fail-str').value.trim();
  const successStr = document.getElementById('lc-success-str')?.value?.trim() || '';
  const password   = document.getElementById('lc-manual-pw').value.trim();
  const method     = lcMethod;

  const panel   = document.getElementById('lcManualPanel');
  const content = document.getElementById('lcManualContent');

  if (!url)      { alert('Enter a URL first.'); return; }
  if (!userVal)  { alert('Enter a username.'); return; }
  if (!password) { alert('Enter a password to test.'); return; }

  panel.style.display   = 'block';
  content.innerHTML     = '<span style="color:var(--accent3)">TESTING PASSWORD...</span>';

  const extraRaw = document.getElementById('lc-extra-fields').value.trim();
  const extra = {};
  extraRaw.split('\n').forEach(line => {
    const [k,...v] = line.split('=');
    if (k && v.length) extra[k.trim()] = v.join('=').trim();
  });

  try {
    const r = await fetch('/api/manual_test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url, user_field: userField, user_val: userVal,
        pass_field: passField, password,
        method, extra_fields: extra,
        fail_str: failStr, success_str: successStr
      })
    });
    const d = await r.json();

    if (d.error) {
      content.innerHTML = `<span style="color:var(--red)">[ERROR] ${d.error}</span>`;
      return;
    }

    const verdictColor = d.verdict === 'WOULD_SUCCEED' ? 'var(--accent3)' : 'var(--red)';
    const verdictIcon  = d.verdict === 'WOULD_SUCCEED' ? '✓' : '✕';

    const sentFields = Object.entries(d.sent_data||{})
      .map(([k,v]) => `${k}=${k === passField ? '<b style="color:var(--accent)">' + v + '</b>' : v}`)
      .join(' | ');

    const formInputs = (d.all_form_inputs||[])
      .map(i => `name="${i.name}" type="${i.type}" value="${i.value}"`)
      .join('<br>   ');

    const lines = [
      `<span style="color:${verdictColor};font-size:12px;letter-spacing:2px;">${verdictIcon} VERDICT: ${d.verdict}</span>`,
      ``,
      `<span style="color:var(--accent)">PASSWORD TESTED </span> ${d.password_tested}`,
      `<span style="color:var(--accent)">HTTP STATUS     </span> ${d.response_code}`,
      `<span style="color:var(--accent)">FINAL URL       </span> ${d.final_url}`,
      `<span style="color:var(--accent)">REDIRECTED      </span> ${d.redirected ? '<span style="color:var(--accent3)">YES ← success signal</span>' : '<span style="color:var(--text-dim)">NO</span>'}`,
      `<span style="color:var(--accent)">BODY LENGTH     </span> ${d.body_length} chars`,
      ``,
      `<span style="color:var(--accent)">SENT FIELDS     </span> ${sentFields}`,
      `<span style="color:var(--accent)">CSRF INJECTED   </span> ${Object.keys(d.csrf_injected||{}).length ? Object.keys(d.csrf_injected).join(', ') : 'none'}`,
      ``,
      d.fail_str    ? `<span style="color:var(--accent)">FAIL STRING     </span> "${d.fail_str}" → ${d.fail_str_found    ? '<span style="color:var(--red)">PRESENT (login failed)</span>' : '<span style="color:var(--accent3)">ABSENT ✓ (login succeeded!)</span>'}` : '',
      d.success_str ? `<span style="color:var(--accent)">SUCCESS STRING  </span> "${d.success_str}" → ${d.success_str_found ? '<span style="color:var(--accent3)">PRESENT ✓ (login succeeded!)</span>' : '<span style="color:var(--red)">ABSENT (login failed)</span>'}` : '',
      ``,
      `<span style="color:var(--accent)">ALL FORM INPUTS </span>`,
      `   <span style="color:var(--text-dim);font-size:9px;">${formInputs || 'none found'}</span>`,
      ``,
      `<span style="color:var(--accent)">VISIBLE TEXT    </span>`,
      `<span style="color:var(--text);font-size:9px;">${(d.visible_text||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>`,
    ].filter(l => l !== null);

    content.innerHTML = lines.join('<br>');

    // Add advice based on verdict
    if (d.verdict === 'WOULD_FAIL') {
      let advice = '<br><br><span style="color:var(--yellow);font-size:10px;">⚠ DIAGNOSIS:</span><br>';
      if (d.fail_str_found) {
        advice += `<span style="color:var(--text-dim)">→ Fail string "${d.fail_str}" is STILL present even with the correct password.</span><br>`;
        advice += `<span style="color:var(--text-dim)">→ Look at VISIBLE TEXT above — find text that ONLY appears after success (e.g. "Welcome", "Dashboard", "Logout")</span><br>`;
        advice += `<span style="color:var(--text-dim)">→ Put that in the <b style="color:var(--accent)">Success Indicator</b> field instead.</span>`;
      } else if (!d.redirected) {
        advice += `<span style="color:var(--text-dim)">→ No redirect happened and fail string is absent. Check VISIBLE TEXT — what does the page show?</span>`;
      }
      content.innerHTML += advice;
    } else {
      content.innerHTML += '<br><br><span style="color:var(--accent3)">✓ This password WOULD be detected correctly by the cracker.<br>If the cracker still fails, check that this exact password is in your wordlist file.</span>';
    }

  } catch(e) {
    content.innerHTML = `<span style="color:var(--red)">[ERROR] ${e.message}</span>`;
  }
}


// ── MOBILE NAV ──
function toggleMobileNav() {
  const nav = document.getElementById('topbarNav');
  const btn = document.getElementById('navHamburger');
  nav.classList.toggle('open');
  btn.innerHTML = nav.classList.contains('open') ? '&#10005;' : '&#9776;';
}
// Close nav when a link is clicked on mobile
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.topbar-nav a').forEach(a => {
    a.addEventListener('click', () => {
      const nav = document.getElementById('topbarNav');
      const btn = document.getElementById('navHamburger');
      if (nav.classList.contains('open')) {
        nav.classList.remove('open');
        btn.innerHTML = '&#9776;';
      }
    });
  });
});

// ══════════════════════════════════════════
// DEFENSE PHASE
// ══════════════════════════════════════════

// ── Panel open/close ──
function openDefense() { document.getElementById('defenseOverlay').classList.add('open'); psCheck(); }
function closeDefense() { document.getElementById('defenseOverlay').classList.remove('open'); }

function dSwitchTab(t) {
  document.querySelectorAll('.def-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.def-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('dtab-' + t).classList.add('active');
  document.getElementById('dpanel-' + t).classList.add('active');
}

// ══════════════════════════════════════════
// MODULE 1 — PASSWORD STRENGTH CHECKER
// ══════════════════════════════════════════
const COMMON_PASSWORDS = ['123456','password','123456789','12345678','12345','1234567','1234567890','qwerty','abc123','111111','123123','admin','letmein','welcome','monkey','dragon','master','login','pass','test','1234','password1','iloveyou','sunshine','princess','admin123','qwerty123','password123','123321','654321','superman','batman','shadow','michael','jessica','charlie','donald','password2','qwertyuiop','baseball','football','soccer','hockey','hello','welcome1','secret','summer','winter','spring','flower','lovely','hottie','zxcvbn','trustno1','hunter','access','mustang','whatever','blahblah','starwars','matrix','696969','777777','888888','555555','666666','pass123','pass1234','asdf','qazwsx','zxcvbn','password!','pa$$word','p@ssword','p@$$word','passw0rd','p4ssword'];

const WORDS_LIST = ['correct','horse','battery','staple','apple','river','cloud','storm','eagle','stone','ocean','flame','silver','golden','crystal','shadow','thunder','forest','winter','summer','garden','castle','dragon','phoenix','falcon','tiger','wolf','bear','lion','hawk'];

function psToggleShow() {
  const inp = document.getElementById('ps-input');
  const btn = document.getElementById('ps-show-btn');
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? 'SHOW' : 'HIDE';
}

function psCheck() {
  const pw = document.getElementById('ps-input').value;
  if (!pw) { psReset(); return; }

  let score = 0;
  const issues = [];
  const suggestions = [];

  // Length scoring
  if (pw.length < 6)       { score -= 30; issues.push('✕ Too short — minimum 8 characters'); }
  else if (pw.length < 8)  { score += 5;  issues.push('✕ Short — aim for 12+ characters'); }
  else if (pw.length < 12) { score += 15; }
  else if (pw.length < 16) { score += 25; }
  else                     { score += 35; }

  // Charset checks
  const hasLower  = /[a-z]/.test(pw);
  const hasUpper  = /[A-Z]/.test(pw);
  const hasDigit  = /[0-9]/.test(pw);
  const hasSymbol = /[^a-zA-Z0-9]/.test(pw);

  if (hasLower)  score += 8;  else { issues.push('✕ No lowercase letters');  suggestions.push('→ Add lowercase letters (a–z)'); }
  if (hasUpper)  score += 8;  else { issues.push('✕ No uppercase letters');  suggestions.push('→ Add uppercase letters (A–Z)'); }
  if (hasDigit)  score += 8;  else { issues.push('✕ No digits');              suggestions.push('→ Add numbers (0–9)'); }
  if (hasSymbol) score += 12; else { issues.push('✕ No symbols');             suggestions.push('→ Add symbols (!@#$%^&*)'); }

  // All same character
  if (/^(.)\1+$/.test(pw)) { score -= 20; issues.push('✕ All same character (aaaaaaa)'); }

  // Sequential patterns
  const seqPatterns = ['0123','1234','2345','3456','4567','5678','6789','abcd','bcde','cdef','defg','efgh','fghi','ghij','qwer','wert','erty','rtyu','tyui','yuio','uiop','asdf','sdfg','dfgh','zxcv','xcvb','cvbn'];
  const pwLower = pw.toLowerCase();
  if (seqPatterns.some(p => pwLower.includes(p))) {
    score -= 12;
    issues.push('✕ Contains sequential pattern (1234, abcd, qwer...)');
    suggestions.push('→ Avoid keyboard sequences');
  }

  // Common password check
  if (COMMON_PASSWORDS.includes(pw.toLowerCase())) {
    score -= 50;
    issues.push('✕ FOUND IN COMMON PASSWORD LIST — extremely dangerous');
    suggestions.push('→ This password will be cracked instantly by any tool');
  }

  // Repeated patterns
  if (/(.{2,})\1/.test(pw)) {
    score -= 8;
    issues.push('✕ Contains repeated pattern (abcabc, 123123...)');
  }

  // Dictionary word check (simple)
  const dictWords = ['password','admin','login','user','welcome','hello','letmein','master','dragon','monkey','shadow','sunshine','princess','qwerty','baseball','football','soccer','iloveyou','abc','test'];
  if (dictWords.some(w => pw.toLowerCase().includes(w))) {
    score -= 15;
    issues.push('✕ Contains common dictionary word');
    suggestions.push('→ Replace word with random characters or use a passphrase');
  }

  // Entropy calculation
  let charsetSize = 0;
  if (hasLower)  charsetSize += 26;
  if (hasUpper)  charsetSize += 26;
  if (hasDigit)  charsetSize += 10;
  if (hasSymbol) charsetSize += 32;
  const entropy = charsetSize > 0 ? Math.floor(pw.length * Math.log2(charsetSize)) : 0;

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  // Unique chars
  const unique = new Set(pw).size;

  // Rating
  let rating, ratingColor, barColor;
  if      (score <= 20) { rating = 'CRITICAL';    ratingColor = '#ff3b3b'; barColor = '#ff3b3b'; }
  else if (score <= 40) { rating = 'WEAK';        ratingColor = '#ff7b3b'; barColor = '#ff7b3b'; }
  else if (score <= 60) { rating = 'FAIR';        ratingColor = '#ffc107'; barColor = '#ffc107'; }
  else if (score <= 80) { rating = 'STRONG';      ratingColor = '#00b4ff'; barColor = '#00b4ff'; }
  else                  { rating = 'VERY STRONG'; ratingColor = '#00ffcc'; barColor = '#00ffcc'; }

  // Crack time estimate
  const gpuSpeed = 10_000_000_000; // 10B/sec
  const combinations = charsetSize > 0 ? Math.pow(charsetSize, pw.length) : 1;
  const bruteSeconds = combinations / gpuSpeed;
  const dictCrack = COMMON_PASSWORDS.includes(pw.toLowerCase()) ? '< 1 second (in list)' : score < 30 ? '< 1 minute' : 'Not in common lists';

  function fmtTime(s) {
    if (s < 1)           return '< 1 second';
    if (s < 60)          return Math.round(s) + ' seconds';
    if (s < 3600)        return Math.round(s/60) + ' minutes';
    if (s < 86400)       return Math.round(s/3600) + ' hours';
    if (s < 2592000)     return Math.round(s/86400) + ' days';
    if (s < 31536000)    return Math.round(s/2592000) + ' months';
    if (s < 3153600000)  return Math.round(s/31536000) + ' years';
    return 'Centuries';
  }

  if (issues.length === 0) issues.push('✓ No major issues found');
  if (suggestions.length === 0) suggestions.push('✓ Password looks strong!');
  if (pw.length < 16) suggestions.push('→ Increasing to 16+ chars adds significant protection');

  // Show result cards
  const showMap={'ps-rating-card':'','ps-stats-grid':'grid','ps-crack-card':'','ps-feedback':'grid'};
  Object.entries(showMap).forEach(([id,disp])=>{
    const el=document.getElementById(id); if(el)el.style.display=disp;
  });

  // Update UI
  document.getElementById('ps-bar').style.width   = score + '%';
  document.getElementById('ps-bar').style.background = barColor;
  const scoreLbl=document.getElementById('ps-score-label'); if(scoreLbl){scoreLbl.textContent=score+' / 100';scoreLbl.style.color=ratingColor;}
  document.getElementById('ps-rating').textContent = rating;
  document.getElementById('ps-rating').style.color  = ratingColor;
  document.getElementById('ps-score-num').textContent = score + ' / 100';
  document.getElementById('psc-len').textContent     = pw.length;
  document.getElementById('psc-len').style.color     = pw.length >= 12 ? 'var(--accent3)' : pw.length >= 8 ? 'var(--yellow)' : 'var(--red)';
  document.getElementById('psc-lower').textContent   = hasLower  ? '✓' : '✕';
  document.getElementById('psc-lower').style.color   = hasLower  ? 'var(--accent3)' : 'var(--red)';
  document.getElementById('psc-upper').textContent   = hasUpper  ? '✓' : '✕';
  document.getElementById('psc-upper').style.color   = hasUpper  ? 'var(--accent3)' : 'var(--red)';
  document.getElementById('psc-digits').textContent  = hasDigit  ? '✓' : '✕';
  document.getElementById('psc-digits').style.color  = hasDigit  ? 'var(--accent3)' : 'var(--red)';
  document.getElementById('psc-symbols').textContent = hasSymbol ? '✓' : '✕';
  document.getElementById('psc-symbols').style.color = hasSymbol ? 'var(--accent3)' : 'var(--red)';
  document.getElementById('psc-unique').textContent  = unique;
  document.getElementById('psc-entropy').textContent = entropy + ' bits';
  document.getElementById('psc-charset').textContent = charsetSize;

  document.getElementById('ps-issues').innerHTML = issues.map(i =>
    `<span style="color:${i.startsWith('✓') ? 'var(--accent3)' : 'var(--red)'}">${i}</span>`
  ).join('<br>');
  document.getElementById('ps-suggestions').innerHTML = suggestions.join('<br>');
  document.getElementById('ps-crack-dict').textContent  = dictCrack;
  document.getElementById('ps-crack-brute').textContent = fmtTime(bruteSeconds);
}

function psReset() {
  const hide = ['ps-rating-card','ps-stats-grid','ps-crack-card','ps-feedback'];
  hide.forEach(id=>{ const el=document.getElementById(id); if(el)el.style.display='none'; });
  document.getElementById('ps-bar').style.width = '0%';
  ['psc-len','psc-lower','psc-upper','psc-digits','psc-symbols','psc-unique','psc-entropy','psc-charset'].forEach(id => {
    const el=document.getElementById(id); if(el){el.textContent='—';el.style.color='';}
  });
}

// ══════════════════════════════════════════
// MODULE 2 — LOGIN POLICY TESTER
// ══════════════════════════════════════════
async function lptRun() {
  const url    = document.getElementById('lpt-url').value.trim();
  const user   = document.getElementById('lpt-user').value.trim();
  const pass   = document.getElementById('lpt-pass').value.trim();
  const ufield = document.getElementById('lpt-ufield').value.trim();
  const pfield = document.getElementById('lpt-pfield').value.trim();
  if (!url) { alert('Enter a URL.'); return; }

  document.getElementById('lpt-loading').style.display = 'block';
  document.getElementById('lpt-results').innerHTML = '';
  document.getElementById('lptRunBtn').disabled = true;
  document.getElementById('lptRunBtn').textContent = 'AUDITING...';

  try {
    const r = await fetch('/api/policy_audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, username: user, password: pass, user_field: ufield, pass_field: pfield })
    });
    const d = await r.json();
    document.getElementById('lpt-loading').style.display = 'none';

    if (d.error) {
      document.getElementById('lpt-results').innerHTML = `<span style="color:var(--red);font-family:var(--mono);font-size:10px;">[ERROR] ${d.error}</span>`;
      return;
    }

    const checks = d.checks || [];
    let html = '';
    checks.forEach(c => {
      const color   = c.status === 'PASS' ? 'var(--accent3)' : c.status === 'FAIL' ? 'var(--red)' : 'var(--yellow)';
      const icon    = c.status === 'PASS' ? '✓' : c.status === 'FAIL' ? '✕' : '⚠';
      html += `<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:8px 10px;border-bottom:1px solid var(--border2);gap:10px;">
        <div>
          <div style="font-family:var(--mono);font-size:10px;color:var(--text);">${c.name}</div>
          <div style="font-size:9px;color:var(--text-dim);margin-top:2px;letter-spacing:.5px;">${c.detail}</div>
          ${c.recommendation ? `<div style="font-size:9px;color:var(--yellow);margin-top:2px;">→ ${c.recommendation}</div>` : ''}
        </div>
        <span style="font-family:var(--mono);font-size:11px;color:${color};white-space:nowrap;">${icon} ${c.status}</span>
      </div>`;
    });

    const passCount = checks.filter(c => c.status === 'PASS').length;
    const score = Math.round(passCount / checks.length * 100);
    html = `<div style="text-align:center;padding:10px;margin-bottom:10px;border:1px solid var(--border);border-radius:2px;">
      <div style="font-family:var(--hud);font-size:9px;letter-spacing:3px;color:var(--text-dim);margin-bottom:4px;">SECURITY SCORE</div>
      <div style="font-family:var(--hud);font-size:24px;color:${score>=70?'var(--accent3)':score>=40?'var(--yellow)':'var(--red)'};">${score}<span style="font-size:14px;">/100</span></div>
      <div style="font-size:9px;color:var(--text-dim);">${passCount} of ${checks.length} checks passed</div>
    </div>` + html;

    document.getElementById('lpt-results').innerHTML = html;
  } catch(e) {
    document.getElementById('lpt-loading').style.display = 'none';
    document.getElementById('lpt-results').innerHTML = `<span style="color:var(--red);font-family:var(--mono);font-size:10px;">[ERROR] ${e.message}</span>`;
  } finally {
    document.getElementById('lptRunBtn').disabled = false;
    document.getElementById('lptRunBtn').textContent = 'RUN POLICY AUDIT';
  }
}

// ══════════════════════════════════════════
// MODULE 3 — HASH CRACKER
// ══════════════════════════════════════════
let hcJobId=null, hcPollTimer=null, hcMode='dict';
let hcCharsets={lower:true,upper:true,digits:true,special:false};

function hcSwitchMode(m) {
  hcMode = m;
  document.querySelectorAll('.def-method-btn[id^="hctab-"]').forEach(b=>b.classList.remove('active'));
  document.getElementById('hctab-'+m).classList.add('active');
  document.getElementById('hcpanel-dict').style.display  = m==='dict'  ? 'block' : 'none';
  document.getElementById('hcpanel-brute').style.display = m==='brute' ? 'block' : 'none';
}
function hcToggleCS(k){
  hcCharsets[k]=!hcCharsets[k];
  document.getElementById('hc-cs-'+k).classList.toggle('on',hcCharsets[k]);
}

async function hcStart() {
  const hash = document.getElementById('hc-hash').value.trim();
  const type = document.getElementById('hc-type').value;
  if (!hash) { alert('Paste a hash first.'); return; }

  const fd = new FormData();
  fd.append('hash', hash);
  fd.append('hash_type', type);
  fd.append('mode', hcMode);
  if (hcMode === 'dict') {
    fd.append('wordlist', document.getElementById('hcWlSelect').value);
  } else {
    const cs = [];
    if(hcCharsets.lower)   cs.push('abcdefghijklmnopqrstuvwxyz');
    if(hcCharsets.upper)   cs.push('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    if(hcCharsets.digits)  cs.push('0123456789');
    if(hcCharsets.special) cs.push('!@#$%^&*()_+-=[]{}');
    fd.append('charset',  [...new Set(cs.join('').split(''))].join(''));
    fd.append('min_len',  document.getElementById('hcMinLen').value);
    fd.append('max_len',  document.getElementById('hcMaxLen').value);
  }

  document.getElementById('hcStartBtn').disabled = true;
  document.getElementById('hcStartBtn').textContent = 'CRACKING...';
  document.getElementById('hcCancelBtn').style.display = 'block';
  document.getElementById('hcProgWrap').style.display = 'block';
  document.getElementById('hcResult').style.display   = 'none';
  document.getElementById('hcLog').innerHTML = '';
  document.getElementById('hcProgFill').className = 'prog-fill running';
  document.getElementById('hcStatus').textContent  = 'RUNNING';
  document.getElementById('hcStatus').className    = 'out-status running';

  try {
    const r = await fetch('/hash_crack', {method:'POST',body:fd});
    const d = await r.json();
    if (d.error) { hcShowErr(d.error); return; }
    hcJobId = d.job_id;
    document.getElementById('hcSsJob').textContent = d.job_id;
    if (hcPollTimer) clearInterval(hcPollTimer);
    hcPollTimer = setInterval(hcDoPoll, 800);
  } catch(e) { hcShowErr(e.message); }
}

async function hcDoPoll() {
  if (!hcJobId) return;
  try {
    const r = await fetch('/hash_status/'+hcJobId);
    const d = await r.json();
    hcUpdateLog(d.log);
    document.getElementById('hcSsAttempts').textContent = d.attempts||0;
    if (d.done) {
      clearInterval(hcPollTimer);
      document.getElementById('hcProgFill').className = 'prog-fill';
      document.getElementById('hcProgFill').style.width = '100%';
      document.getElementById('hcStartBtn').disabled = false;
      document.getElementById('hcStartBtn').textContent = 'CRACK HASH';
      document.getElementById('hcCancelBtn').style.display = 'none';
      if (d.found) {
        document.getElementById('hcStatus').textContent = 'CRACKED';
        document.getElementById('hcStatus').className   = 'out-status found';
        const res = document.getElementById('hcResult');
        res.style.display = 'block';
        res.className = 'result-box found';
        document.getElementById('hcResultTitle').textContent = '// HASH CRACKED';
        document.getElementById('hcResultTitle').className   = 'rb-title ok';
        document.getElementById('hcResultPw').textContent    = d.plaintext;
        document.getElementById('hcResultType').textContent  = d.hash_type;
        document.getElementById('hcResultAtt').textContent   = d.attempts + ' tried';
      } else if (d.status === 'error') {
        document.getElementById('hcStatus').textContent = 'ERROR';
        document.getElementById('hcStatus').className   = 'out-status error';
      } else {
        document.getElementById('hcStatus').textContent = 'NOT FOUND';
        document.getElementById('hcStatus').className   = 'out-status failed';
      }
    }
  } catch(e) { console.error(e); }
}

function hcUpdateLog(lines) {
  const el = document.getElementById('hcLog'); el.innerHTML='';
  (lines||[]).forEach(line => {
    const d = document.createElement('div'); d.className='ll';
    if(!line)d.className='ll blank';
    else if(line.startsWith('[+]'))d.className='ll hi';
    else if(line.startsWith('[!]'))d.className='ll warn';
    else if(line.startsWith('[X]')||line.startsWith('[ERROR]'))d.className='ll err';
    d.textContent=line; el.appendChild(d);
  });
  el.scrollTop=el.scrollHeight;
}
function hcShowErr(msg){
  document.getElementById('hcStartBtn').disabled=false;
  document.getElementById('hcStartBtn').textContent='CRACK HASH';
  document.getElementById('hcCancelBtn').style.display='none';
  document.getElementById('hcStatus').textContent='ERROR';
  document.getElementById('hcStatus').className='out-status error';
  const d=document.createElement('div');d.className='ll err';
  d.textContent='[ERROR] '+msg;document.getElementById('hcLog').appendChild(d);
}
async function hcCancel(){
  if(!hcJobId)return;
  await fetch('/hash_cancel/'+hcJobId,{method:'POST'});
  clearInterval(hcPollTimer);
  document.getElementById('hcStartBtn').disabled=false;
  document.getElementById('hcStartBtn').textContent='CRACK HASH';
  document.getElementById('hcCancelBtn').style.display='none';
  document.getElementById('hcStatus').textContent='ABORTED';
  document.getElementById('hcStatus').className='out-status failed';
}

// ══════════════════════════════════════════
// MODULE 4 — PASSWORD GENERATOR
// ══════════════════════════════════════════
let pgMode='random', pgSep='-';
let pgCharsets={lower:true,upper:true,digits:true,special:true};

function pgSetMode(m){
  pgMode=m;
  document.querySelectorAll('.def-method-btn[id^="pg-mode-"]').forEach(b=>b.classList.remove('active'));
  document.getElementById('pg-mode-'+(m==='random'?'rand':'pass')).classList.add('active');
  document.getElementById('pg-random-opts').style.display     = m==='random'?'block':'none';
  document.getElementById('pg-passphrase-opts').style.display = m==='passphrase'?'block':'none';
  pgGenerate();
}
function pgSetSep(s){
  pgSep=s;
  document.querySelectorAll('[id^="pgsep-"]').forEach(b=>b.classList.remove('active'));
  const idMap = {'-':'pgsep--','_':'pgsep-_','.':'pgsep-.', ' ':'pgsep-space','#':'pgsep-hash'};
  const el = document.getElementById(idMap[s]);
  if(el) el.classList.add('active');
  pgGenerate();
}
function pgToggleCS(k){
  pgCharsets[k]=!pgCharsets[k];
  document.getElementById('pg-cs-'+k).classList.toggle('on',pgCharsets[k]);
  pgGenerate();
}

function pgGenerate(){
  let pw='';
  if(pgMode==='random'){
    let chars='';
    if(pgCharsets.lower)   chars+='abcdefghijklmnopqrstuvwxyz';
    if(pgCharsets.upper)   chars+='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if(pgCharsets.digits)  chars+='0123456789';
    if(pgCharsets.special) chars+='!@#$%^&*()_+-=[]{}|;:,.<>?';
    const noAmbig = document.getElementById('pg-no-ambig')?.checked;
    if(noAmbig) chars=chars.replace(/[0OlI1]/g,'');
    const noRepeat = document.getElementById('pg-no-repeat')?.checked;
    const len = parseInt(document.getElementById('pg-length')?.value)||16;
    if(!chars){pw='Select at least one charset';}
    else {
      const arr = new Uint32Array(len*2);
      crypto.getRandomValues(arr);
      let used=new Set(), i=0;
      while(pw.length<len && i<arr.length){
        const c=chars[arr[i]%chars.length]; i++;
        if(noRepeat && used.has(c)) continue;
        pw+=c; used.add(c);
      }
    }
  } else {
    const wc = parseInt(document.getElementById('pg-words')?.value)||4;
    const arr = new Uint32Array(wc);
    crypto.getRandomValues(arr);
    const words = Array.from(arr).map(n=>WORDS_LIST[n%WORDS_LIST.length]);
    if(document.getElementById('pg-pp-num')?.checked){
      const na=new Uint32Array(1); crypto.getRandomValues(na);
      words.push(String(na[0]%100));
    }
    pw = words.join(pgSep);
  }

  document.getElementById('pg-output').textContent = pw;

  // inline strength
  const score = psQuickScore(pw);
  const rating = score<=20?'CRITICAL':score<=40?'WEAK':score<=60?'FAIR':score<=80?'STRONG':'VERY STRONG';
  const color  = score<=20?'var(--red)':score<=40?'#ff7b3b':score<=60?'var(--yellow)':score<=80?'var(--accent)':'var(--accent3)';
  document.getElementById('pg-strength-inline').innerHTML = `Score: <span style="color:${color};font-family:var(--mono);">${score}/100 — ${rating}</span>`;
}

function pgQuickScore(pw){
  let s=0;
  if(pw.length>=16)s+=35; else if(pw.length>=12)s+=25; else if(pw.length>=8)s+=15; else s-=20;
  if(/[a-z]/.test(pw))s+=8; if(/[A-Z]/.test(pw))s+=8; if(/[0-9]/.test(pw))s+=8; if(/[^a-zA-Z0-9]/.test(pw))s+=12;
  if(COMMON_PASSWORDS.includes(pw.toLowerCase()))s-=50;
  return Math.max(0,Math.min(100,s));
}
// Alias so psCheck can also call it
function psQuickScore(pw){return pgQuickScore(pw);}

function pgCopy(){
  const text=document.getElementById('pg-output').textContent;
  navigator.clipboard.writeText(text).catch(()=>{
    const t=document.createElement('textarea');t.value=text;document.body.appendChild(t);t.select();document.execCommand('copy');document.body.removeChild(t);
  });
  const btn=document.getElementById('pg-copy-btn');
  btn.textContent='✓ COPIED'; setTimeout(()=>btn.textContent='⎘ COPY',1500);
}

function pgGenerateBatch(){
  let html='';
  for(let i=0;i<10;i++){
    pgGenerate();
    const pw=document.getElementById('pg-output').textContent;
    const score=pgQuickScore(pw);
    const color=score<=40?'var(--red)':score<=60?'var(--yellow)':'var(--accent3)';
    html+=`<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid var(--border2);">
      <span style="color:var(--text)">${pw}</span>
      <span style="font-size:9px;color:${color};margin-left:10px;white-space:nowrap;">${score}/100</span>
    </div>`;
  }
  document.getElementById('pg-batch').innerHTML=html;
  // restore last generated in main box
  pgGenerate();
}

// Init generator on load
document.addEventListener('DOMContentLoaded', ()=>{ pgGenerate(); });