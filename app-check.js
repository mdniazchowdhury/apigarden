
/* APIGarden frontend.
   IMPORTANT: The OpenRouter API key is NOT stored here. This browser code calls
   your local backend server at http://localhost:3000. The backend reads the
   secret key from .env and securely calls the AI model. */

/* ==================== STATE ==================== */
/* Per-email profile store. Every email that logs in (free or pro) gets its
   own isolated record — so "My APIs", credits, saved info, etc. are tied to
   the account that created them, never mixed up with any other email. */
let userStore = {};
const SEEDED_EMAIL = 'ishita.chowdhury@northsouth.edu';
function freshProfile(role, email){
  const base = {
    email,
    savedInfo: {name:'', email, phone:'', gender:'', country:'', city:'', location:'', dob:'', address:''},
    apis: [], pdfText: '', pdfName: '',
    chatlog: { grammar: [], pdf: [] },
    seeded: email.toLowerCase() === SEEDED_EMAIL
  };
  if(role==='free'){
    base.credits = { used:0, max:6 };
    base.payments = [{plan:'Free Trial', validity:'Ongoing', info:'No payment required'}];
    base.messages = [];
    base.upgradeEligible = false;
  } else if(role==='pro'){
    base.password = '';
    base.transactions = [];
    base.purchases = [];
    base.messages = [];
    base.upgradedFrom = '';
  }
  return base;
}
function getProfile(role, email){
  const key = role+':'+email.toLowerCase();
  if(!userStore[key]) userStore[key] = freshProfile(role, email);
  return userStore[key];
}

let state = {
  free: freshProfile('free', ''),
  pro: freshProfile('pro', ''),
  admin: {
    pending: [
      {id:'TXN-2291', user:'free_user_88@gmail.com', plan:'Pro Monthly', amount:'৳1200', method:'bKash Send Money', date:'2026-07-05'},
    ],
    approved: [],
    market: [
      {id:'mkt-calc', seller:'APIGarden Studio', api:'Smart Calculator API', description:'Handles arithmetic, percentages, and quick financial calculations with clean final answers.', price:4, sold:2},
      {id:'mkt-poem', seller:'APIGarden Studio', api:'Short Poem Generator API', description:'Creates short, polished poems for themes like love, study, friendship, or celebration.', price:5, sold:1}
    ]
  },
  wizard: { free: freshWizard(), pro: freshWizard() }
};

function freshWizard(){ return { step:1, name:'', description:'', exampleInput:'', testOutput:null }; }

function todayISO(){ return new Date().toISOString().slice(0,10); }
function currentEmail(role){ return String(state[role]?.email || '').toLowerCase(); }
function canDeleteApi(role, api){
  const owner = String(api.owner || state[role]?.email || '').toLowerCase();
  return !api.owner || owner === currentEmail(role);
}
function ensureSellerTransactions(email){
  const sellerKey = 'pro:' + String(email || '').toLowerCase();
  const sellerProfile = userStore[sellerKey] || freshProfile('pro', email || '');
  sellerProfile.transactions = sellerProfile.transactions || [];
  userStore[sellerKey] = sellerProfile;
  return sellerProfile.transactions;
}
function upsertSellerTransaction(email, tx){
  const list = ensureSellerTransactions(email);
  const idx = list.findIndex(t => (tx.txnId && t.txnId === tx.txnId) || (tx.listingId && t.listingId === tx.listingId && t.status === tx.status));
  if(idx >= 0) list[idx] = {...list[idx], ...tx};
  else list.unshift(tx);
}
function sellerTransactionsHTML(role){
  const rows = state[role].transactions || [];
  if(!rows.length) return `<div class="card" style="padding:14px;"><p class="hint" style="margin:0;">No marketplace transaction yet.</p></div>`;
  return `<div class="card" style="padding:14px;overflow-x:auto;"><table>
    <tr><th>API</th><th>Buyer</th><th>Price</th><th>Method</th><th>Date</th><th>Status</th></tr>
    ${rows.map(t=>`<tr>
      <td>${escapeHtml(t.api || '—')}</td>
      <td>${escapeHtml(t.buyer || '—')}</td>
      <td>${t.price ? '$'+t.price : '—'}</td>
      <td>${escapeHtml(t.method || '—')}</td>
      <td>${escapeHtml(t.date || '—')}</td>
      <td><span class="status-chip ${/sold|approved/i.test(t.status || '') ? 'status-approved' : ''}">${escapeHtml(t.status || 'On shelf')}</span></td>
    </tr>`).join('')}
  </table></div>`;
}


const STORAGE_KEY = 'apigarden_demo_state_v3';

function saveAppData(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ admin: state.admin, userStore }));
  }catch(e){}
}
function loadAppData(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return false;
    const data = JSON.parse(raw);
    if(data.admin) state.admin = data.admin;
    if(data.userStore) userStore = data.userStore;
    return true;
  }catch(e){ return false; }
}

async function pullAdminFromBackend(){
  try{
    const res = await fetch('/api/demo-state');
    if(!res.ok) return false;
    const data = await res.json();
    if(Array.isArray(data.pending)) state.admin.pending = data.pending;
    if(Array.isArray(data.approved)) state.admin.approved = data.approved;
    saveAppData();
    return true;
  }catch(e){ return false; }
}
async function syncAdminToBackend(){
  try{
    await fetch('/api/demo-state/sync-admin', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({pending:state.admin.pending, approved:state.admin.approved})
    });
    return true;
  }catch(e){ return false; }
}

async function pushUserMessageToBackend(role, email, message){
  try{
    await fetch('/api/demo-state/messages', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({role, email, message})
    });
    return true;
  }catch(e){ return false; }
}

async function pushPendingToBackend(txn){
  try{
    await fetch('/api/demo-state/pending', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(txn)
    });
    return true;
  }catch(e){ return false; }
}

async function adminRefresh(){
  loadAppData();
  const synced = await pullAdminFromBackend();
  renderPending();
  renderApproved();
  renderAdminMarket();
  showToast(synced ? 'Website + extension requests refreshed' : 'Admin requests refreshed');
}
function notifyUser(email, role, message){
  const key = `${role}:${String(email).toLowerCase()}`;
  const profile = userStore[key] || freshProfile(role, email);
  profile.messages = profile.messages || [];
  profile.messages.unshift(message);
  userStore[key] = profile;
}


loadAppData();

/* ==================== NAV ==================== */
function go(view, push=true){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  const target = document.getElementById('view-'+view);
  if(target) target.classList.add('active');
  if(push){ history.pushState({view}, '', '#'+view); }
  window.scrollTo({top:0, behavior:'smooth'});
}
window.addEventListener('popstate', (event)=>{
  const view = event.state?.view || (location.hash ? location.hash.slice(1) : 'landing');
  go(view || 'landing', false);
});
history.replaceState({view:'landing'}, '', location.hash || '#landing');
function loginFree(){
  loadAppData();
  const email = (document.getElementById('free-email').value.trim() || 'you@example.com').toLowerCase();
  state.free = getProfile('free', email);
  go('free-app');
  renderWizard('free'); renderMyApis('free'); renderMarket('free'); updateCreditChip(); checkAIBackend('free');
}
function loginPro(){
  loadAppData();
  const email = (document.getElementById('pro-email').value.trim() || 'pro.user@example.com').toLowerCase();
  state.pro = getProfile('pro', email);
  go('pro-app');
  renderWizard('pro'); renderMyApis('pro'); renderMarket('pro'); checkAIBackend('pro');
}
function loginAdmin(){
  loadAppData();
  const email = document.getElementById('admin-email').value.trim();
  const pass = document.getElementById('admin-pass').value.trim();
  const hint = document.getElementById('admin-hint');
  if(email !== 'admin@northsouth.edu' || pass !== '123'){
    hint.textContent = "Incorrect credentials — try admin@northsouth.edu / 123";
    hint.style.color = '#b23b3b';
    return;
  }
  go('admin-app');
  renderPending(); renderApproved(); renderAdminMarket();
}
function switchTab(role, btn, name){
  document.querySelectorAll(`#view-${role}-app .tab-btn`).forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll(`#view-${role}-app .panel`).forEach(p=>p.classList.remove('active'));
  document.getElementById(`${role}-panel-${name}`).classList.add('active');
}
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2800);
}

/* ==================== CREDITS ==================== */
function updateCreditChip(){
  const c = state.free.credits;
  const el = document.getElementById('credit-chip-free');
  if(el) el.textContent = `${c.max - c.used}/${c.max} free runs left`;
}
function tryUseCredit(role){
  if(role !== 'free') return true; // pro/admin unlimited
  const c = state.free.credits;
  if(c.used >= c.max){
    showToast('Out of free runs — upgrade to Pro for unlimited runs');
    return false;
  }
  c.used++;
  updateCreditChip();
  return true;
}

/* ==================== DRAWER (account menu) ==================== */
function openDrawer(role){
  document.getElementById('drawer-overlay').classList.add('open');
  document.getElementById('drawer').classList.add('open');
  renderDrawer(role);
}
function closeDrawer(){
  document.getElementById('drawer-overlay').classList.remove('open');
  document.getElementById('drawer').classList.remove('open');
}
function renderDrawer(role){
  const el = document.getElementById('drawer-content');
  if(role === 'free'){
    el.innerHTML = `
      <h3 style="margin:6px 0 2px;">Menu</h3>
      <p class="muted" style="font-size:13px;margin:0;">${state.free.email}</p>
      <h4>Account</h4>
      <div class="drawer-item" onclick="drawerPanel('free-usage')">📊 Free runs remaining</div>
      <div class="drawer-item" onclick="drawerPanel('free-analyzer')">🔎 Analyzer</div>
      <h4>Transactions</h4>
      <div class="drawer-item" onclick="drawerPanel('free-payments')">💳 My Payments</div>
      <div class="drawer-item" onclick="drawerPanel('free-plans')">🌿 Our Plans</div>
      <h4>Support</h4>
      <div class="drawer-item" onclick="drawerPanel('free-inbox')">✉️ Admin Messages ${state.free.messages.length?`<span class="badge">${state.free.messages.length} new</span>`:''}</div>
      <div class="drawer-item" onclick="reloadUserMessages('free')">↻ Reload admin messages</div>
      <div class="drawer-item" onclick="drawerPanel('free-form')">📝 Saved info (autofill)</div>
      <h4>Session</h4>
      <div class="drawer-item" onclick="logout()">🚪 Log out / switch role</div>
      <div id="drawer-sub" style="margin-top:12px;"></div>`;
  } else if(role === 'pro'){
    el.innerHTML = `
      <h3 style="margin:6px 0 2px;">Menu</h3>
      <p class="muted" style="font-size:13px;margin:0;">${state.pro.email}</p>
      <h4>Account</h4>
      <div class="drawer-item" onclick="drawerPanel('pro-form')">📝 Saved info (autofill)</div>
      <div class="drawer-item" onclick="drawerPanel('pro-transactions')">📈 Marketplace Transactions</div>
      <div class="drawer-item" onclick="drawerPanel('pro-analyzer')">🔎 Analyzer</div>
      <h4>Support</h4>
      <div class="drawer-item" onclick="drawerPanel('pro-inbox')">✉️ Admin Messages ${state.pro.messages.length?`<span class="badge">${state.pro.messages.length} new</span>`:''}</div>
      <div class="drawer-item" onclick="reloadUserMessages('pro')">↻ Reload admin messages</div>
      <h4>Session</h4>
      <div class="drawer-item" onclick="logout()">🚪 Log out / switch role</div>
      <div id="drawer-sub" style="margin-top:12px;"></div>`;
  } else if(role === 'admin'){
    el.innerHTML = `
      <h3 style="margin:6px 0 2px;">Menu</h3>
      <p class="muted" style="font-size:13px;margin:0;">admin@northsouth.edu</p>
      <div class="drawer-item" onclick="adminRefresh()">↻ Reload requests</div>
      <div class="drawer-item" onclick="logout()">🚪 Log out / switch role</div>
      <div id="drawer-sub" style="margin-top:12px;"></div>`;
  }
}
function logout(){
  closeDrawer();
  go('landing');
}
function drawerPanel(name){
  const sub = document.getElementById('drawer-sub');
  if(name==='free-usage'){
    const c = state.free.credits;
    sub.innerHTML = `<div class="card" style="padding:14px;">
      <div class="flex-between"><span style="font-size:13px;font-weight:600;">Free runs</span><span class="mono" style="font-size:13px;">${c.max-c.used}/${c.max} left</span></div>
      <p class="hint" style="margin-top:10px;">Every AI run — a ready-made API, a custom API test, anything — uses one credit. Upgrade for unlimited.</p>
    </div>`;
  } else if(name==='free-payments'){
    sub.innerHTML = `<div class="card" style="padding:14px;">` + state.free.payments.map(p=>`
      <div style="padding:8px 0;border-bottom:1px solid var(--line);">
        <div style="font-weight:700;font-size:13.5px;">${p.plan}</div>
        <div class="muted" style="font-size:12px;">Validity: ${p.validity} · ${p.info}</div>
      </div>`).join('') + `</div>`;
  } else if(name==='free-plans'){
    sub.innerHTML = plansHTML();
  } else if(name==='free-inbox'){
    reloadUserMessages('free', false);
    sub.innerHTML = `<button class="btn btn-soft small-btn" style="margin-bottom:10px;" onclick="reloadUserMessages('free')">↻ Reload messages</button>` + messagesHTML(state.free.messages);
  } else if(name==='free-form'){
    sub.innerHTML = formInfoHTML('free');
  } else if(name==='free-analyzer'){
    sub.innerHTML = analyzerHTML('free');
    loadAnalyzerUrl('free');
  } else if(name==='pro-form'){
    sub.innerHTML = formInfoHTML('pro');
  } else if(name==='pro-transactions'){
    sub.innerHTML = sellerTransactionsHTML('pro');
  } else if(name==='pro-inbox'){
    reloadUserMessages('pro', false);
    sub.innerHTML = `<button class="btn btn-soft small-btn" style="margin-bottom:10px;" onclick="reloadUserMessages('pro')">↻ Reload messages</button>` + messagesHTML(state.pro.messages);
  } else if(name==='pro-analyzer'){
    sub.innerHTML = analyzerHTML('pro');
    loadAnalyzerUrl('pro');
  }
}

function reloadUserMessages(role, show=true){
  loadAppData();
  const key = `${role}:${state[role].email.toLowerCase()}`;
  const latest = userStore[key];
  if(latest){
    state[role].messages = latest.messages || [];
    state[role].payments = latest.payments || state[role].payments;
    state[role].transactions = latest.transactions || state[role].transactions;
    state[role].apis = latest.apis || state[role].apis;
  }
  renderDrawer(role);
  if(document.getElementById('drawer-sub')){
    const sub = document.getElementById('drawer-sub');
    sub.innerHTML = `<button class="btn btn-soft small-btn" style="margin-bottom:10px;" onclick="reloadUserMessages('${role}')">↻ Reload messages</button>` + messagesHTML(state[role].messages || []);
  }
  if(show) showToast('Messages reloaded');
}
function analyzerHTML(role){
  return `<div class="card" style="padding:16px;">
    <h4 class="h-inline">Current Page Analyzer</h4>
    <p class="hint" style="margin-top:0;">Open APIGarden as a Chrome extension on any webpage, then ask what you want to know about that page.</p>
    <div class="field"><label>Current page URL</label><input type="text" id="${role}-an-url" readonly placeholder="Open as extension to detect URL"></div>
    <div class="field"><label>Your question</label><textarea id="${role}-an-q" rows="4" placeholder="Example: Which hotel option is best for me and why?"></textarea></div>
    <button class="btn btn-primary small-btn" onclick="runAnalyzer('${role}')">Analyze this page</button>
    <div id="${role}-an-result"></div>
  </div>`;
}
async function loadAnalyzerUrl(role){
  try{
    const response = await sendToActiveTab({type:'APIGARDEN_GET_PAGE_CONTEXT'});
    const urlMatch = String(response?.text || '').match(/URL:\s*(.+)/);
    const input = document.getElementById(`${role}-an-url`);
    if(input) input.value = urlMatch ? urlMatch[1].trim() : 'Current page detected';
  }catch(err){
    const input = document.getElementById(`${role}-an-url`);
    if(input) input.value = 'Open APIGarden from the Chrome extension on a webpage';
  }
}
async function runAnalyzer(role){
  const q = document.getElementById(`${role}-an-q`)?.value.trim();
  const targetId = `${role}-an-result`;
  if(!q){ showToast('Write a question first'); return; }
  if(!tryUseCredit(role)) return;
  document.getElementById(targetId).innerHTML = `<div class="loading-box"><span class="spinner"></span>Reading current page and analyzing...</div>`;
  try{
    const pageText = await getCurrentPageContext();
    const input = `Question: ${q}

Current webpage:
${pageText.slice(0, 8500)}

Answer clearly. Start with the best answer or best option, then give short reasons. Do not use markdown bold stars.`;
    const output = await runGeneratedApi('Analyze the current webpage and answer the user question using the page content.', input);
    document.getElementById(targetId).innerHTML = `<div class="result-box">${formatAIOutput(output)}</div>`;
  }catch(err){
    setError(targetId, err);
  }
}

function plansHTML(){
  return `<div class="plan-grid">
    <div class="card plan-card"><span class="badge tag">Current</span><h4 class="h-inline">Free Trial</h4><div class="plan-price">৳0</div><ul><li>5 ready-made APIs</li><li>6 free AI runs</li></ul></div>
    <div class="card plan-card highlight"><span class="badge tag" style="background:var(--clay);color:#3a2408;">Popular</span><h4 class="h-inline">Pro Monthly</h4><div class="plan-price">৳1200<span>/mo</span></div><ul><li>Unlimited runs</li><li>Sell on marketplace</li><li>Saved autofill</li></ul><button class="btn btn-primary small-btn" style="width:100%" onclick="startUpgrade('Pro Monthly','৳1200')">Choose plan</button></div>
    <div class="card plan-card"><h4 class="h-inline">Pro Yearly</h4><div class="plan-price">৳9000<span>/yr</span></div><ul><li>Everything in monthly</li><li>2 months free</li></ul><button class="btn btn-ghost small-btn" style="width:100%" onclick="startUpgrade('Pro Yearly','৳9000')">Choose plan</button></div>
  </div>`;
}
function startUpgrade(plan, amount){
  const proceed = confirm(`Send ${amount} via bKash "Send Money" to 017XX-XXXXXX, then tap OK to notify admin for approval.`);
  if(proceed){
    const txn = {id:'TXN-'+Math.floor(2000+Math.random()*900), user:state.free.email, buyer:state.free.email, plan, amount, method:'bKash Send Money', date:new Date().toISOString().slice(0,10)};
    state.admin.pending.push(txn);
    saveAppData();
    pushPendingToBackend(txn);
    renderPending();
    showToast('Payment submitted — waiting for admin approval');
    closeDrawer();
  }
}
function messagesHTML(list){
  if(!list.length) return `<div class="card" style="padding:16px;text-align:center;color:rgba(18,36,28,.5);font-size:13.5px;">No messages yet.</div>`;
  return list.map(m=>`<div class="card msg-item"><div class="from">From ${escapeHtml(m.from || 'Admin')}</div><div class="body">${escapeHtml(cleanAIText(m.body || ''))}</div>${m.password? `<span class="pw">${escapeHtml(m.password)}</span>`:''}</div>`).join('');
}
function formInfoHTML(role){
  const info = state[role].savedInfo;
  return `<div class="card" style="padding:18px;">
    <p class="hint" style="margin-top:0;">Saved once, reused everywhere. In the Chrome extension, use this to fill matching fields on the current page.</p>
    <div class="grid2">
      <div class="field"><label>Full name</label><input type="text" id="${role}-si-name" value="${escapeHtml(info.name || '')}"></div>
      <div class="field"><label>Email</label><input type="text" id="${role}-si-email" value="${escapeHtml(info.email || '')}"></div>
      <div class="field"><label>Phone</label><input type="text" id="${role}-si-phone" value="${escapeHtml(info.phone || '')}"></div>
      <div class="field"><label>Gender</label><input type="text" id="${role}-si-gender" value="${escapeHtml(info.gender || '')}" placeholder="e.g. Female"></div>
      <div class="field"><label>Country</label><input type="text" id="${role}-si-country" value="${escapeHtml(info.country || '')}" placeholder="e.g. Bangladesh"></div>
      <div class="field"><label>City</label><input type="text" id="${role}-si-city" value="${escapeHtml(info.city || '')}" placeholder="e.g. Dhaka"></div>
      <div class="field"><label>Location / Address</label><input type="text" id="${role}-si-location" value="${escapeHtml(info.location || info.address || '')}" placeholder="e.g. Bashundhara R/A, Dhaka"></div>
      <div class="field"><label>Date of birth</label><input type="text" id="${role}-si-dob" value="${escapeHtml(info.dob || '')}" placeholder="YYYY-MM-DD"></div>
    </div>
    <button class="btn btn-soft small-btn" onclick="saveInfo('${role}')">Save info</button>
    <button class="btn btn-primary small-btn" onclick="fillCurrentPageForm('${role}')">Fill current page form</button>
  </div>`;
}
function saveInfo(role){
  state[role].savedInfo = {
    name: document.getElementById(`${role}-si-name`).value,
    email: document.getElementById(`${role}-si-email`).value,
    phone: document.getElementById(`${role}-si-phone`).value,
    gender: document.getElementById(`${role}-si-gender`).value,
    country: document.getElementById(`${role}-si-country`).value,
    city: document.getElementById(`${role}-si-city`).value,
    location: document.getElementById(`${role}-si-location`).value,
    dob: document.getElementById(`${role}-si-dob`).value,
    address: document.getElementById(`${role}-si-location`).value
  };
  const key = `${role}:${state[role].email.toLowerCase()}`;
  userStore[key] = state[role];
  saveAppData();
  showToast('Saved. Matching forms can now be filled from the extension.');
}
function extensionReady(){
  return typeof chrome !== 'undefined' && chrome.tabs && chrome.runtime;
}
function sendToActiveTab(message){
  return new Promise((resolve, reject)=>{
    if(!extensionReady()) return reject(new Error('This works when APIGarden is opened as a Chrome extension popup.'));
    chrome.tabs.query({active:true, currentWindow:true}, (tabs)=>{
      const tab = tabs && tabs[0];
      if(!tab || !tab.id) return reject(new Error('No active tab found.'));
      chrome.tabs.sendMessage(tab.id, message, (response)=>{
        if(chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        resolve(response);
      });
    });
  });
}
async function fillCurrentPageForm(role){
  try{
    saveInfo(role);
    const response = await sendToActiveTab({type:'APIGARDEN_FILL_FORM', data: state[role].savedInfo});
    showToast(`Filled ${response?.filled || 0} matching field${response?.filled===1?'':'s'} on this page`);
  }catch(err){
    showToast(err.message || 'Could not fill this page');
  }
}
async function getCurrentPageContext(){
  const response = await sendToActiveTab({type:'APIGARDEN_GET_PAGE_CONTEXT'});
  return response?.text || '';
}

/* ==================== SEEDED APIS (only shown for the one email that "created" them) ==================== */
function seededApisHTML(role){
  if(!state[role].seeded) return '';
  return `
    <h3 class="section-title" style="font-size:16px;margin-top:6px;">Preloaded APIs in your account</h3><p class="section-sub" style="margin-top:-2px;">These 5 APIs belong to ${escapeHtml(state[role].email)} and are only visible in this account.</p>
    <div class="card api-card">
      <div class="head"><span class="emoji">💱</span><h3>Currency Converter</h3></div>
      <p class="desc">Live exchange rates — real data, no AI needed.</p>
      <div class="body">
        <div class="grid2">
          <div class="field"><label>Amount</label><input type="number" id="cur-amount-${role}" value="100"></div>
          <div class="field"><label>From</label><select id="cur-from-${role}">${CURRENCY_OPTIONS('USD')}</select></div>
        </div>
        <div class="field"><label>To</label><select id="cur-to-${role}">${CURRENCY_OPTIONS('BDT')}</select></div>
        <button class="btn btn-primary small-btn" onclick="runCurrency('${role}')">Convert</button>
        <div id="cur-result-${role}"></div>
      </div>
    </div>

    <div class="card api-card">
      <div class="head"><span class="emoji">🌤</span><h3>Weather Lookup</h3></div>
      <p class="desc">Live current conditions for any city — real data, no AI needed.</p>
      <div class="body">
        <div class="field"><label>City</label><input type="text" id="wx-city-${role}" placeholder="e.g. Dhaka"></div>
        <button class="btn btn-primary small-btn" onclick="runWeather('${role}')">Get weather</button>
        <div id="wx-result-${role}"></div>
      </div>
    </div>

    <div class="card api-card">
      <div class="head"><span class="emoji">✨</span><h3>Motivational Quote</h3></div>
      <p class="desc">One fresh quote per click — optionally themed to a topic.</p>
      <div class="body">
        <div class="field"><label>Topic (optional)</label><input type="text" id="quote-topic-${role}" placeholder="e.g. education, exams, life, work"></div>
        <button class="btn btn-clay small-btn" onclick="runQuote('${role}')">Give me a quote</button>
        <div id="quote-result-${role}"></div>
      </div>
    </div>

    <div class="card api-card">
      <div class="head"><span class="emoji">📝</span><h3>Grammar Correction</h3></div>
      <p class="desc">Paste text and get one clean final version with grammar, spelling, capitalization, and punctuation corrected.</p>
      <div class="body">
        <div class="field"><label>Your text</label><textarea id="gram-input-${role}" rows="3" placeholder="Paste text to correct..."></textarea></div>
        <button class="btn btn-primary small-btn" onclick="runGrammar('${role}')">Fix it</button>
        <div id="gram-result-${role}"></div>
      </div>
    </div>

    <div class="card api-card">
      <div class="head"><span class="emoji">📄</span><h3>PDF Question &amp; Answer</h3></div>
      <p class="desc">Upload a PDF, then ask anything about it. Best with short PDFs (1–5 pages).</p>
      <div class="body">
        <div class="dropzone" id="pdf-drop-${role}" onclick="document.getElementById('pdf-file-${role}').click()">
          📎 Click to upload a PDF<br><span class="hint" id="pdf-status-${role}">${state[role].pdfName ? 'Loaded: '+state[role].pdfName : 'No file uploaded yet'}</span>
        </div>
        <input type="file" id="pdf-file-${role}" accept="application/pdf" class="hidden" onchange="handlePdfUpload('${role}', this.files[0])">
        <div style="margin-top:12px;">
          <div class="chat-log" id="pdf-chat-${role}"></div>
          <div class="chat-input-row">
            <input type="text" id="pdf-question-${role}" placeholder="Ask a question about the PDF..." onkeydown="if(event.key==='Enter')runPdfQuestion('${role}')">
            <button class="btn btn-primary small-btn" onclick="runPdfQuestion('${role}')">Ask</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function setLoading(targetId){ document.getElementById(targetId).innerHTML = `<div class="loading-box"><span class="spinner"></span>Working...</div>`; }
function setError(targetId, err){ document.getElementById(targetId).innerHTML = `<div class="error-box">⚠ ${escapeHtml(err.message || String(err))}</div>`; }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function stripStars(value){ return String(value || '').replace(/\*\*/g,'').replace(/__([^_]+)__/g,'$1').replace(/\*([^*\n]+)\*/g,'$1'); }
function cleanAIText(value){ return String(value || '').replace(/\*\*/g,'').replace(/__([^_]+)__/g,'$1').replace(/\*([^*\n]+)\*/g,'$1'); }

function nl2p(line){ return `<p>${escapeHtml(line)}</p>`; }
function parseMarkdownTable(lines, startIndex){
  const rows = [];
  let i = startIndex;
  while(i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])){
    rows.push(lines[i].trim());
    i++;
  }
  if(rows.length < 2) return null;
  const normalize = row => row.replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
  const headers = normalize(rows[0]);
  const sep = normalize(rows[1]);
  if(!sep.every(c=>/^:?-{3,}:?$/.test(c))) return null;
  const body = rows.slice(2).map(normalize);
  let html = `<table><tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr>`;
  html += body.map(r=>`<tr>${headers.map((_,idx)=>`<td>${escapeHtml(r[idx]||'')}</td>`).join('')}</tr>`).join('');
  html += `</table>`;
  return { html, nextIndex: i };
}
function formatAIOutput(text){
  const raw = cleanAIText(text).replace(/\r/g,'').trim();
  if(!raw) return '<p>No answer returned.</p>';
  const bestMatch = raw.match(/Best Match:\s*(.+)$/im);
  let working = raw;
  let bestHtml = '';
  if(bestMatch){
    bestHtml = `<div class="best-match">Best Match: ${escapeHtml(bestMatch[1].trim())}</div>`;
    working = raw.replace(/\n?Best Match:\s*.+$/im,'').trim();
  }
  const lines = working.split('\n');
  let html = '';
  for(let i=0;i<lines.length;){
    const line = lines[i].trim();
    if(!line){ i++; continue; }
    const table = parseMarkdownTable(lines, i);
    if(table){ html += table.html; i = table.nextIndex; continue; }
    if(/^#{1,4}\s+/.test(line)){ html += `<h4>${escapeHtml(line.replace(/^#{1,4}\s+/,''))}</h4>`; i++; continue; }
    if(/^[-*]\s+/.test(line)){
      let items = [];
      while(i < lines.length && /^[-*]\s+/.test(lines[i].trim())){ items.push(lines[i].trim().replace(/^[-*]\s+/,'')); i++; }
      html += `<ul>${items.map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
      continue;
    }
    if(/^\d+[.)]\s+/.test(line)){
      let items=[];
      while(i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())){ items.push(lines[i].trim().replace(/^\d+[.)]\s+/,'')); i++; }
      html += `<ol>${items.map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ol>`;
      continue;
    }
    html += nl2p(line.replace(/\*\*(.*?)\*\*/g,'$1'));
    i++;
  }
  return `<div class="formatted-output">${html}${bestHtml}</div>`;
}

/* ==================== SECURE AI BACKEND CONNECTION ==================== */
const AI_BACKEND_URL = (window.location.protocol === 'http:' || window.location.protocol === 'https:') ? window.location.origin : 'http://localhost:3000'; // works on Render and localhost
let aiBackendReady = false;

function setAIStatus(role, ok, label){
  const el = document.getElementById(`ai-status-${role}`);
  if(!el) return;
  el.classList.remove('key-set','key-unset');
  el.classList.add(ok ? 'key-set' : 'key-unset');
  el.textContent = label;
}

async function checkAIBackend(role){
  setAIStatus(role, false, 'AI server: checking');
  try{
    const res = await fetch(`${AI_BACKEND_URL}/api/health`);
    const data = await res.json();
    aiBackendReady = Boolean(data.ok);
    setAIStatus(role, aiBackendReady, aiBackendReady ? `OpenRouter ready: ${data.model || 'model set'}` : 'OpenRouter key missing');
  }catch(err){
    aiBackendReady = false;
    setAIStatus(role, false, 'AI server: offline');
  }
}

async function askRealAI({description, input, context=''}){
  const res = await fetch(`${AI_BACKEND_URL}/api/run-api`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ description, input, context })
  });
  let data = {};
  try{ data = await res.json(); }catch(e){}
  if(!res.ok){
    throw new Error(data.error || 'AI backend failed. Start the backend with npm start and check your .env key.');
  }
  return data.answer || 'No answer returned.';
}

async function runGeneratedApi(description, input, context=''){
  return await askRealAI({description, input, context});
}

/* --- Currency (real data via backend proxy, no extra key needed) --- */
const CURRENCY_LIST = ['USD','EUR','GBP','BDT','INR','JPY','CNY','AUD','CAD','CHF','SGD','AED','SAR','MYR','THB','KRW','NZD','ZAR','SEK','NOK'];
function CURRENCY_OPTIONS(selected){
  return CURRENCY_LIST.map(c=>`<option value="${c}" ${c===selected?'selected':''}>${c}</option>`).join('');
}
async function runCurrency(role){
  const targetId = `cur-result-${role}`;
  if(!tryUseCredit(role)) return;
  const amount = parseFloat(document.getElementById(`cur-amount-${role}`).value) || 1;
  const from = document.getElementById(`cur-from-${role}`).value;
  const to = document.getElementById(`cur-to-${role}`).value;
  setLoading(targetId);
  try{
    const res = await fetch(`${AI_BACKEND_URL}/api/currency?amount=${encodeURIComponent(amount)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    let data = {};
    try{ data = await res.json(); }catch(e){}
    if(!res.ok) throw new Error(data.error || 'Currency service failed. Check your deployed backend link.');
    document.getElementById(targetId).innerHTML = `<div class="result-box"><b>${amount} ${from} = ${Number(data.converted).toFixed(2)} ${to}</b><br><span class="muted">Rate: 1 ${from} = ${Number(data.rate).toFixed(4)} ${to}${data.date ? ` · ${data.date}` : ''}</span></div>`;
  }catch(err){ setError(targetId, err); }
}

/* --- Weather (real data via open-meteo, no key needed) --- */
const WEATHER_CODES = {0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Depositing rime fog',51:'Light drizzle',53:'Drizzle',55:'Dense drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',71:'Light snow',73:'Snow',75:'Heavy snow',80:'Light rain showers',81:'Rain showers',82:'Violent rain showers',95:'Thunderstorm'};
async function runWeather(role){
  const targetId = `wx-result-${role}`;
  if(!tryUseCredit(role)) return;
  const city = document.getElementById(`wx-city-${role}`).value.trim();
  if(!city){ document.getElementById(targetId).innerHTML = `<div class="error-box">⚠ Type a city name first.</div>`; return; }
  setLoading(targetId);
  try{
    const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`).then(r=>r.json());
    const place = geo.results?.[0];
    if(!place) throw new Error(`Couldn't find a place called "${city}".`);
    const wx = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code,wind_speed_10m`).then(r=>r.json());
    const c = wx.current;
    const desc = WEATHER_CODES[c.weather_code] || 'Unknown conditions';
    document.getElementById(targetId).innerHTML = `<div class="result-box"><b>${place.name}, ${place.country}</b><br>${desc} · ${c.temperature_2m}°C · wind ${c.wind_speed_10m} km/h</div>`;
  }catch(err){ setError(targetId, err); }
}

/* --- Motivational quote (local bank — zero network calls, always works) --- */
const QUOTE_BANK = {
  general: [
    "Small steps, taken daily, outrun big plans taken never.",
    "The work you avoid today is the weight you carry tomorrow.",
    "Discipline is just choosing between what you want now and what you want most.",
    "Progress hides inside the boring, repeated effort.",
    "Comfort and progress rarely sit at the same table.",
    "Momentum is earned one honest attempt at a time.",
    "The best time to start was earlier — the second best time is now.",
    "Consistency turns average ideas into remarkable results."
  ],
  education: [
    "Every expert was once a beginner who refused to quit.",
    "What you practice in private shows up as skill in public.",
    "The student who asks 'why' outlearns the one who only memorizes.",
    "Understanding is built one honest question at a time.",
    "Grades fade, but the habit of learning stays with you for life."
  ],
  exam: [
    "You don't need more time — you need a clearer next step.",
    "Confidence is built in the moments you almost gave up but didn't.",
    "A slow start beats a brilliant idea that never leaves the notebook.",
    "The exam only tests what you practiced — so practice like it matters.",
    "Calm minds recall more than anxious ones — breathe, then begin."
  ],
  life: [
    "The obstacle in front of you is also the shape of your growth.",
    "You are not behind — you are exactly where your effort has placed you.",
    "Doubt kills more dreams than failure ever will.",
    "Fear fades the moment you take the first real step.",
    "Every season of life is teaching you something the next one will need."
  ],
  work: [
    "Done is the engine that makes perfect possible.",
    "Great work is just ordinary work, repeated without excuses.",
    "Focus is choosing what to ignore, on purpose.",
    "The best resume is a track record of finished things.",
    "Careers are built in the unglamorous middle, not the highlight reel."
  ]
};
let lastQuote = '';
async function runQuote(role){
  const targetId = `quote-result-${role}`;
  const topicField = document.getElementById(`quote-topic-${role}`);
  const topicRaw = topicField ? topicField.value.trim().toLowerCase() : '';
  if(!tryUseCredit(role)) return;
  setLoading(targetId);
  await new Promise(r=>setTimeout(r, 250)); // brief pause so it still feels like a "call"
  const matchedKey = Object.keys(QUOTE_BANK).find(k=>k===topicRaw || (topicRaw && (k.includes(topicRaw) || topicRaw.includes(k))));
  const pool = matchedKey ? QUOTE_BANK[matchedKey] : QUOTE_BANK.general;
  let pick = pool[Math.floor(Math.random()*pool.length)];
  if(pick === lastQuote && pool.length>1){
    pick = pool[(pool.indexOf(pick)+1) % pool.length];
  }
  lastQuote = pick;
  const label = matchedKey ? `Topic: ${matchedKey}` : (topicRaw ? `No exact match for "${topicRaw}" — showing a general quote` : '');
  document.getElementById(targetId).innerHTML = `<div class="result-box">“${escapeHtml(pick)}”${label ? `<br><span class="muted" style="font-size:12px;">${escapeHtml(label)}</span>` : ''}</div>`;
}

/* --- Grammar correction (local rule-based — zero network calls, always works) --- */
function localGrammarFix(input){
  let text = input;
  const fixes = [];

  if(/  +/.test(text)){ text = text.replace(/ {2,}/g, ' '); fixes.push('Removed extra spaces'); }

  const contractions = {
    "dont":"don't", "cant":"can't", "wont":"won't", "im":"I'm", "ive":"I've",
    "id":"I'd", "ill":"I'll", "isnt":"isn't", "arent":"aren't", "didnt":"didn't",
    "doesnt":"doesn't", "youre":"you're", "theyre":"they're", "whats":"what's",
    "alot":"a lot", "recieve":"receive", "definately":"definitely", "seperate":"separate",
    "occured":"occurred", "thier":"their", "wich":"which"
  };
  let contractionsFixed = false;
  text = text.replace(/\b[a-zA-Z']+\b/g, word=>{
    const lower = word.toLowerCase();
    if(contractions[lower]){
      contractionsFixed = true;
      const rep = contractions[lower];
      return word[0]===word[0].toUpperCase() ? rep[0].toUpperCase()+rep.slice(1) : rep;
    }
    return word;
  });
  if(contractionsFixed) fixes.push('Fixed common contractions/typos');

  // capitalize standalone "i"
  const beforeI = text;
  text = text.replace(/\bi\b/g, 'I');
  if(text !== beforeI) fixes.push('Capitalized "I"');

  // capitalize the first letter of each sentence
  const beforeCap = text;
  text = text.replace(/(^\s*\w|[.!?]\s+\w)/g, m => m.toUpperCase());
  if(text !== beforeCap) fixes.push('Capitalized sentence starts');

  text = text.trim();
  if(text && !/[.!?]$/.test(text)){ text += '.'; fixes.push('Added missing end punctuation'); }

  return { corrected: text, fixes };
}
async function runGrammar(role){
  const targetId = `gram-result-${role}`;
  const input = document.getElementById(`gram-input-${role}`).value.trim();
  if(!input){ document.getElementById(targetId).innerHTML = `<div class="error-box">⚠ Paste some text first.</div>`; return; }
  if(!tryUseCredit(role)) return;
  setLoading(targetId);
  try{
    const answer = await runGeneratedApi('You are a writing improver. Correct grammar, spelling, punctuation, capitalization, and awkward wording. Return only the final corrected text in one clean line. Do not add labels, bullets, explanations, or quotation marks.', input);
    document.getElementById(targetId).innerHTML = `<div class="result-box"><div class="formatted-output"><p>${escapeHtml(String(answer).replace(/\s+/g,' ').trim())}</p></div></div>`;
  }catch(err){
    const { corrected } = localGrammarFix(input);
    document.getElementById(targetId).innerHTML = `<div class="result-box"><div class="formatted-output"><p>${escapeHtml(corrected)}</p></div><p class="hint" style="margin:10px 0 0;">AI backend is offline, so this browser fallback returned the corrected final line.</p></div>`;
  }
}

const STOPWORDS = new Set(['the','a','an','is','are','was','were','be','been','of','in','on','at','to','for','and','or','but','with','as','by','it','this','that','what','who','when','where','why','how','does','do','did','has','have','had','i','you','he','she','they','we','me','my','your']);
function answerFromText(question, fullText){
  const sentences = fullText.split(/(?<=[.!?])\s+/).map(s=>s.trim()).filter(s=>s.length>3);
  const qWords = question.toLowerCase().replace(/[^a-z0-9\s]/g,'').split(/\s+/).filter(w=>w && !STOPWORDS.has(w));
  if(!qWords.length || !sentences.length) return "I couldn't find anything relevant to that question in the PDF.";
  const scored = sentences.map(s=>{
    const lower = s.toLowerCase();
    let score = 0;
    for(const w of qWords){ if(lower.includes(w)) score++; }
    return {s, score};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  if(!scored.length) return "I couldn't find anything relevant to that question in the PDF — try rephrasing, or ask about a topic that's actually mentioned in the document.";
  return scored.slice(0,3).map(x=>x.s).join(' ');
}

/* --- PDF Q&A (real extraction via pdf.js, answered with local keyword search — zero network calls after upload) --- */
if(window.pdfjsLib){ pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; }

async function handlePdfUpload(role, file){
  if(!file) return;
  const statusEl = document.getElementById(`pdf-status-${role}`);
  statusEl.textContent = 'Reading PDF...';
  try{
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({data: buf}).promise;
    let fullText = '';
    for(let i=1;i<=pdf.numPages;i++){
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(it=>it.str).join(' ') + '\n\n';
    }
    state[role].pdfText = fullText.slice(0, 15000); // keep it sane
    state[role].pdfName = file.name;
    statusEl.textContent = `Loaded: ${file.name} (${pdf.numPages} page${pdf.numPages>1?'s':''}, ready for questions)`;
    state[role].chatlog.pdf = [];
    renderPdfChat(role);
    showToast('PDF loaded — ask a question below');
  }catch(err){
    statusEl.textContent = 'Could not read that PDF — try another file.';
  }
}

function renderPdfChat(role){
  const log = document.getElementById(`pdf-chat-${role}`);
  if(!log) return;
  log.innerHTML = state[role].chatlog.pdf.map(m=>`<div class="msg ${m.who}">${escapeHtml(m.text)}</div>`).join('');
  log.scrollTop = log.scrollHeight;
}

async function runPdfQuestion(role){
  const input = document.getElementById(`pdf-question-${role}`);
  const q = input.value.trim();
  if(!q) return;
  if(!state[role].pdfText){ showToast('Upload a PDF first'); return; }
  if(!tryUseCredit(role)) return;
  state[role].chatlog.pdf.push({who:'user', text:q});
  input.value = '';
  renderPdfChat(role);
  state[role].chatlog.pdf.push({who:'bot', text:'Thinking with AI...'});
  renderPdfChat(role);
  try{
    const answer = await runGeneratedApi('Answer the user question using only the PDF text provided in context. If the answer is not in the PDF, say that clearly.', q, state[role].pdfText);
    state[role].chatlog.pdf[state[role].chatlog.pdf.length-1] = {who:'bot', text:answer};
  }catch(err){
    const answer = answerFromText(q, state[role].pdfText);
    state[role].chatlog.pdf[state[role].chatlog.pdf.length-1] = {who:'bot', text:answer + '\n\n(Local fallback used because AI backend is offline.)'};
  }
  renderPdfChat(role);
}

/* --- Local movie dataset + matcher, used when a custom API's description is about
   movie recommendations. Purely local keyword matching against a small curated
   list — not a real recommendation engine, but it gives concrete, query-relevant
   results instead of the generic template below. --- */
const MOVIE_DB = [
  {title:'The Wild Robot', year:2024, genre:'animated family sci-fi', blurb:'A shipwrecked robot learns to survive and raise a gosling on a remote island.'},
  {title:'Flow', year:2024, genre:'animated adventure', blurb:'A dialogue-free journey following a cat and other animals surviving a great flood.'},
  {title:'Inside Out 2', year:2024, genre:'animated family comedy', blurb:'Riley\'s emotions gain new members as she navigates the anxiety of adolescence.'},
  {title:'Spider-Man: Across the Spider-Verse', year:2023, genre:'animated superhero action', blurb:'Miles Morales journeys across realities and confronts what it means to be a hero.'},
  {title:'The Boy and the Heron', year:2023, genre:'animated fantasy drama', blurb:'A grieving boy follows a mysterious heron into a surreal, ancestral world.'},
  {title:'Dune: Part Two', year:2024, genre:'sci-fi epic', blurb:'Paul Atreides unites the Fremen to take revenge against the conspirators who destroyed his family.'},
  {title:'Oppenheimer', year:2023, genre:'historical drama', blurb:'The story of the physicist who helped build the atomic bomb, and the toll it took on him.'},
  {title:'Poor Things', year:2023, genre:'dark comedy fantasy', blurb:'A young woman brought back to life explores the world with unfiltered curiosity.'},
  {title:'Everything Everywhere All at Once', year:2022, genre:'sci-fi comedy action', blurb:'An overwhelmed laundromat owner discovers she must save the multiverse.'},
  {title:'Parasite', year:2019, genre:'thriller dark comedy', blurb:'A poor family schemes to become employed by a wealthy household, with dark consequences.'},
  {title:'Interstellar', year:2014, genre:'sci-fi drama', blurb:'A team of explorers travel through a wormhole to save humanity.'},
  {title:'Coco', year:2017, genre:'animated family fantasy', blurb:'A boy is transported to the Land of the Dead and uncovers his family\'s hidden history.'},
  {title:'Spirited Away', year:2001, genre:'animated fantasy adventure', blurb:'A girl becomes trapped in a spirit world and must work to free her parents.'},
  {title:'The Grand Budapest Hotel', year:2014, genre:'comedy adventure', blurb:'A legendary concierge and his protégé get caught up in a whimsical caper.'}
];
function recommendMovies(query){
  const q = (query||'').toLowerCase();
  const qWords = q.replace(/[^a-z0-9\s]/g,'').split(/\s+/).filter(Boolean);
  const scored = MOVIE_DB.map(m=>{
    const hay = `${m.title} ${m.genre} ${m.year}`.toLowerCase();
    let score = 0;
    for(const w of qWords){ if(w.length>1 && hay.includes(w)) score++; }
    return {m, score};
  }).sort((a,b)=>b.score-a.score);
  const top = scored[0].score>0 ? scored.filter(x=>x.score>0).slice(0,3) : scored.slice(0,3);
  const usedFallback = scored[0].score===0;
  const lines = top.map(x=>`• ${x.m.title} (${x.m.year}) — ${x.m.blurb}`).join('\n');
  return (usedFallback
    ? `Nothing matched "${query}" directly, so here are a few well-regarded picks instead:\n`
    : `Top matches for "${query}":\n`) + lines;
}
function looksLikeMovieApi(description){
  const d = (description||'').toLowerCase();
  return /movie|film|cinema/.test(d) && /recommend|suggest|watch/.test(d);
}

/* --- Local demo helper kept only as a fallback/reference. Create-New-API and
   My APIs now call the secure backend instead of this simulator. --*/
function simulateEndpoint(description, input){
  const cleanInput = (input || '').trim() || '(no input provided)';
  const desc = (description || '').trim().replace(/\.$/,'');
  if(looksLikeMovieApi(desc)){
    return recommendMovies(cleanInput) + `\n\n(This is matched against a small local list of ~14 movies — not a real recommendation model. Wire this up to a real movie database or language model on the backend for genuinely open-ended suggestions.)`;
  }
  return `Simulated result for input "${cleanInput}":\nBased on the endpoint's job — "${desc}" — here is the kind of response it would return for that input.\n(This is a local simulation. Connect a real language model on the backend to generate genuinely dynamic answers instead of this template.)`;
}

/* ==================== CREATE NEW API (locally simulated demo — no AI key needed) ==================== */
function renderWizard(role){
  const w = state.wizard[role];
  const wrap = document.getElementById('wizard-area-'+role);
  wrap.innerHTML = `
    <div class="card" style="padding:24px;">
      <h2 class="section-title">Create a new API</h2>
      <p class="section-sub">Describe it, generate it, and test it with the secure AI backend. Your key stays in the server, not the browser.</p>
      <div class="wizard-steps">
        ${['Describe','Generate & Test','Save'].map((label,i)=>{
          const n=i+1; const cls = n<w.step?'done':n===w.step?'active':'';
          return `<div class="wstep ${cls}"><div class="circ">${n<w.step?'✓':n}</div>${label}</div>`;
        }).join('')}
      </div>
      <div id="wizard-step-body-${role}"></div>
    </div>`;
  renderWizardStep(role);
}
function renderWizardStep(role){
  const w = state.wizard[role];
  const body = document.getElementById('wizard-step-body-'+role);
  if(w.step===1){
    body.innerHTML = `
      <div class="field"><label>API name</label><input type="text" id="wiz-name-${role}" value="${w.name}" placeholder="e.g. Movie Recommender"></div>
      <div class="field"><label>What should it do? (one or two sentences)</label><textarea id="wiz-desc-${role}" rows="2" placeholder="e.g. Given a genre, suggest 3 movies with a one-line reason each.">${w.description}</textarea></div>
      <div class="field"><label>Example input someone would send</label><input type="text" id="wiz-example-${role}" value="${w.exampleInput}" placeholder="e.g. genre: sci-fi"></div>
      <button class="btn btn-primary" onclick="wizardGenerate('${role}')">Generate &amp; test</button>
    `;
  } else if(w.step===2){
    body.innerHTML = `
      <p style="font-size:14.5px;"><b>${escapeHtml(w.name)}</b> — ${escapeHtml(w.description)}</p>
      <div class="field"><label>Example input</label><input type="text" id="wiz-example2-${role}" value="${w.exampleInput}"></div>
      <button class="btn btn-clay small-btn" onclick="wizardRunTest('${role}')">Run test</button>
      <div id="wiz-test-result-${role}"></div>
      <div class="row" style="gap:10px;margin-top:16px;">
        <button class="btn btn-ghost" onclick="wizardBack('${role}')">← edit description</button>
        <button class="btn btn-primary" onclick="wizardSave('${role}')" ${w.testOutput ? '' : 'disabled'}>Looks good — save this API</button>
      </div>
    `;
    if(w.testOutput){
      document.getElementById(`wiz-test-result-${role}`).innerHTML = `<div class="result-box"><b>Test output:</b>${formatAIOutput(w.testOutput)}</div>`;
    }
  } else if(w.step===3){
    const ep = '/api/v1/run/' + slug(w.name);
    body.innerHTML = `
      <div style="text-align:center;padding:10px 0 4px;">
        <h3 style="margin:0 0 4px;">Your API is saved</h3>
        <p class="muted" style="margin:0 0 14px;">Find it any time under "My APIs" and run it with new input.</p>
        <div class="endpoint-box mono"><span>POST ${ep}</span><button onclick="navigator.clipboard && navigator.clipboard.writeText('${ep}'); showToast('Endpoint copied')">Copy</button></div>
        <button class="btn btn-ghost" onclick="resetWizard('${role}')">Create another</button>
      </div>`;
  }
}
async function wizardGenerate(role){
  const w = state.wizard[role];
  w.name = document.getElementById(`wiz-name-${role}`).value.trim() || 'My API';
  w.description = document.getElementById(`wiz-desc-${role}`).value.trim();
  w.exampleInput = document.getElementById(`wiz-example-${role}`).value.trim();
  if(!w.description){ showToast('Describe what the API should do first'); return; }
  w.step = 2; w.testOutput = null;
  renderWizard(role);
  await wizardRunTest(role);
}
async function wizardRunTest(role){
  const w = state.wizard[role];
  const exField = document.getElementById(`wiz-example2-${role}`);
  if(exField) w.exampleInput = exField.value.trim();
  const targetId = `wiz-test-result-${role}`;
  if(!tryUseCredit(role)) return;
  document.getElementById(targetId).innerHTML = `<div class="loading-box"><span class="spinner"></span>Running your API with OpenRouter AI...</div>`;
  try{
    w.testOutput = await runGeneratedApi(w.description, w.exampleInput);
    renderWizardStep(role);
  }catch(err){
    w.testOutput = null;
    setError(targetId, err);
  }
}
function wizardBack(role){ state.wizard[role].step = 1; renderWizard(role); }
function wizardSave(role){
  const w = state.wizard[role];
  state[role].apis.unshift({name:w.name, description:w.description, endpoint:'/api/v1/run/'+slug(w.name), runs:0, owner: state[role].email, ownershipStatus:'Owned'});
  userStore[`${role}:${state[role].email.toLowerCase()}`] = state[role];
  saveAppData();
  w.step = 3;
  renderWizard(role);
  renderMyApis(role);
  showToast('API saved — find it under "My APIs"');
}
function resetWizard(role){ state.wizard[role] = freshWizard(); renderWizard(role); }
function slug(s){ return (s||'api').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || 'api-'+Math.floor(Math.random()*999); }

/* ==================== MY APIS ==================== */
function renderMyApis(role){
  const wrap = document.getElementById('myapis-area-'+role);
  const apis = state[role].apis;
  wrap.innerHTML = `
    <h2 class="section-title" style="margin-bottom:2px;">My APIs</h2>
    <p class="section-sub">Manage your ready-made tools and every custom API you own inside APIGarden.</p>
    ${seededApisHTML(role)}
    ${!state[role].seeded && apis.length===0 ? `<div class="card" style="padding:20px;text-align:center;color:rgba(18,36,28,.55);">No custom APIs yet. Use <b>Create API</b> to make your first one.</div>` : ''}
    ${apis.map((a,i)=>`
      <div class="card api-card">
        <div class="head"><span class="emoji">🔌</span><h3>${escapeHtml(a.name)}</h3></div>
        <p class="desc mono">${a.endpoint} · ${a.runs} run${a.runs!==1?'s':''}</p>
        <p class="desc">${escapeHtml(a.description)}</p>
        <p class="desc"><span class="badge">${canDeleteApi(role,a) ? 'Owner: You' : 'Owner: '+escapeHtml(a.owner || 'Another user')}</span> ${a.ownershipStatus ? `<span class="badge">${escapeHtml(a.ownershipStatus)}</span>` : ''}</p>
        <div class="body">
          <div class="field"><label>Input</label><input type="text" id="myapi-input-${role}-${i}" placeholder="Type an input to run this API with"></div>
          <button class="btn btn-primary small-btn" onclick="runMyApi('${role}', ${i})">Run</button>
          <button class="btn btn-soft small-btn" onclick="runMyApiWithPage('${role}', ${i})">Analyze current page</button>
          ${role==='pro' && canDeleteApi(role,a) ? `<button class="btn btn-soft small-btn" onclick="listOnMarket('${role}', ${i})">Sell in marketplace</button>` : role==='pro' ? `<span class="upgrade-note">Only the current owner can sell this API.</span>` : `<span class="upgrade-note">Upgrade to Pro to sell this API.</span>`}
          ${canDeleteApi(role,a) ? `<button class="btn btn-ghost small-btn" onclick="deleteMyApi('${role}', ${i})">Delete API</button>` : `<span class="upgrade-note">Delete locked: ownership transferred.</span>`}
          <div id="myapi-result-${role}-${i}"></div>
        </div>
      </div>
    `).join('')}
  `;
  renderPdfChat(role);
}

function deleteMyApi(role, i){
  const api = state[role].apis[i];
  if(!api) return;
  if(!canDeleteApi(role, api)){
    showToast('Only the current owner can delete this API.');
    return;
  }
  const ok = confirm(`Delete "${api.name}" from My APIs? Your used run count will not be restored.`);
  if(!ok) return;
  state[role].apis.splice(i,1);
  if(role === 'pro'){
    state.admin.market = state.admin.market.filter(m => !(m.seller === state[role].email && m.api === api.name && m.status !== 'Sold'));
  }
  userStore[`${role}:${state[role].email.toLowerCase()}`] = state[role];
  saveAppData();
  renderMyApis(role);
  renderMarket('free'); renderMarket('pro'); renderAdminMarket();
  showToast(`Deleted "${api.name}"`);
}

async function runMyApi(role, i){
  const api = state[role].apis[i];
  const input = document.getElementById(`myapi-input-${role}-${i}`).value.trim();
  const targetId = `myapi-result-${role}-${i}`;
  if(!tryUseCredit(role)) return;
  document.getElementById(targetId).innerHTML = `<div class="loading-box"><span class="spinner"></span>Running with OpenRouter AI...</div>`;
  try{
    const output = await runGeneratedApi(api.description, input);
    api.runs++;
    document.getElementById(targetId).innerHTML = `<div class="result-box">${formatAIOutput(output)}</div>`;
  }catch(err){
    setError(targetId, err);
  }
}

async function runMyApiWithPage(role, i){
  const api = state[role].apis[i];
  const userNeed = document.getElementById(`myapi-input-${role}-${i}`).value.trim();
  const targetId = `myapi-result-${role}-${i}`;
  if(!tryUseCredit(role)) return;
  document.getElementById(targetId).innerHTML = `<div class="loading-box"><span class="spinner"></span>Reading current page and asking your API...</div>`;
  try{
    const pageText = await getCurrentPageContext();
    const input = `You are helping me decide on the current webpage.

My requirement:
${userNeed || 'Suggest the best option for me from this page.'}

Current page content:
${pageText.slice(0, 7000)}

Give a clear recommendation with the best option first, short reasons, and anything I should avoid.`;
    const output = await runGeneratedApi(api.description, input);
    api.runs++;
    saveAppData();
    document.getElementById(targetId).innerHTML = `<div class="result-box">${formatAIOutput(output)}</div>`;
  }catch(err){
    setError(targetId, err);
  }
}
function listOnMarket(role, i){
  if(role !== 'pro'){ showToast('Only Pro users can sell created APIs in the marketplace.'); return; }
  const api = state[role].apis[i];
  if(!canDeleteApi(role, api)){ showToast('Only the current owner can sell this API.'); return; }
  if(state.admin.market.some(item => item.api === api.name && item.seller === state[role].email && item.status !== 'Sold')){
    showToast('This API is already listed in the marketplace.');
    return;
  }
  const price = prompt(`Set a resale price in USD for "${api.name}":`, 10);
  if(price===null) return;
  const p = parseFloat(price);
  if(isNaN(p) || p<=0){ showToast('Enter a valid price'); return; }
  const listing = {id:'mkt-'+slug(api.name)+'-'+Math.floor(Math.random()*999), seller: state[role].email, owner:state[role].email, api: api.name, description: api.description, price:p, sold:0, status:'On shelf', date:todayISO()};
  state.admin.market.push(listing);
  api.ownershipStatus = 'On shelf';
  upsertSellerTransaction(state[role].email, {api:api.name, buyer:'—', price:p, method:'—', date:todayISO(), status:'On shelf', listingId:listing.id});
  state[role].transactions = userStore['pro:'+state[role].email.toLowerCase()].transactions;
  saveAppData();
  renderMyApis(role); renderMarket('free'); renderMarket('pro'); renderAdminMarket();
  showToast(`Listed "${api.name}" for $${p} on the marketplace`);
}

/* ==================== MARKETPLACE (free + pro can buy; only pro can sell) ==================== */
function renderMarket(role){
  const wrap = document.getElementById('market-area-'+role);
  if(!wrap) return;
  const live = state.admin.market.filter(m => m.status !== 'Sold');
  wrap.innerHTML = `
    <div class="market-hero"><div><h2 class="section-title">Marketplace</h2><p class="section-sub">Discover polished APIs, send purchase requests, and expand your toolkit with just a few clicks.</p></div><span class="market-badge">${live.length} live listing${live.length!==1?'s':''}</span></div>
    ${role==='free' ? `<div class="card" style="padding:14px 16px;margin-bottom:14px;"><b>Free user notice:</b> You can buy listed APIs, but only Pro users can sell their own created APIs.</div>` : `<div class="card" style="padding:14px 16px;margin-bottom:14px;"><b>Pro seller mode:</b> Create an API in "My APIs" and list it here using the sell button.</div>`}
    ${live.length===0 ? `<div class="card" style="padding:20px;text-align:center;color:rgba(18,36,28,.5);">No listings yet.</div>` : live.map(m=>`
      <div class="card api-row">
        <div style="flex:1;min-width:160px;">
          <div class="name">${escapeHtml(m.api)}</div>
          <div class="meta">sold by ${escapeHtml(m.seller)} · ${m.sold || 0} sales · ${escapeHtml(m.status || 'On shelf')}</div>
          <div class="market-meta">${escapeHtml(m.description || '')}</div>
          <div class="market-seller-chip">Seller email: ${escapeHtml(m.seller)}</div>
        </div>
        <div class="mono" style="font-weight:700;">$${m.price}</div>
        ${m.status === 'Pending approval'
          ? `<button class="btn btn-soft small-btn" disabled>Pending approval</button>`
          : `<button class="btn btn-clay small-btn" onclick="buyApi('${role}', '${m.id}')">Send buy request</button>`}
      </div>
    `).join('')}
  `;
}
function buyApi(role, listingId){
  const item = state.admin.market.find(m => m.id === listingId);
  if(!item) return;
  const buyerEmail = state[role].email;
  if(String(item.seller).toLowerCase() === buyerEmail.toLowerCase()){
    showToast('You already own this API.');
    return;
  }
  if(item.status === 'Sold'){
    showToast('This API has already been sold.');
    return;
  }
  const ok = confirm(`Send $${item.price} equivalent via bKash "Send Money", then tap OK to notify admin for approval.`);
  if(ok){
    const txn = {id:'TXN-'+Math.floor(3000+Math.random()*900), user: buyerEmail, buyer: buyerEmail, buyerRole:role, seller: item.seller, apiName: item.api, listingId: item.id, plan:'API Purchase — '+item.api, amount:'$'+item.price, method:'bKash Send Money', date:todayISO(), requestType:'Marketplace API Purchase'};
    state.admin.pending.push(txn);
    item.status = 'Pending approval';
    item.pendingBuyer = buyerEmail;
    item.pendingTxnId = txn.id;
    upsertSellerTransaction(item.seller, {api:item.api, buyer:buyerEmail, price:item.price, method:'bKash Send Money', date:todayISO(), status:'Pending admin approval', listingId:item.id, txnId:txn.id});
    const sellerProfile = userStore['pro:'+item.seller.toLowerCase()];
    if(sellerProfile){
      sellerProfile.messages = sellerProfile.messages || [];
      sellerProfile.messages.unshift({from:'Marketplace', body:`${buyerEmail} has requested to buy your API "${item.api}". The request is now waiting for admin approval.`});
    }
    saveAppData();
    pushPendingToBackend(txn);
    renderPending(); renderAdminMarket(); renderMarket('free'); renderMarket('pro');
    showToast('Buy request submitted — pending admin approval');
  }
}

/* ==================== ADMIN ==================== */
function renderPending(){
  const wrap = document.getElementById('pending-area');
  const list = state.admin.pending;
  wrap.innerHTML = `<div class="flex-between" style="margin-bottom:12px;">
    <div><h2 class="section-title" style="margin:0;">Pending Approval</h2><p class="section-sub" style="margin:2px 0 0;">Refresh to pull the latest saved demo requests.</p></div>
    <button class="btn btn-soft small-btn" onclick="adminRefresh()">↻ Reload requests</button>
  </div>
  <div class="card" style="padding:6px 0;overflow-x:auto;"><table>
    <tr><th>Txn ID</th><th>Buyer / User</th><th>Seller</th><th>Requesting</th><th>Amount</th><th>Method</th><th>Date</th><th>Action</th></tr>
    ${list.length? list.map((t,i)=>`
      <tr><td class="mono">${t.id}</td><td>${t.buyer || t.user}</td><td>${t.seller || '—'}</td><td>${t.plan}</td><td>${t.amount}</td><td>${t.method}</td><td>${t.date}</td>
      <td><button class="btn btn-primary small-btn" onclick="approveTxn(${i})">Approve</button> <button class="btn btn-ghost small-btn" onclick="rejectTxn(${i})">Reject</button></td></tr>`).join('')
      : `<tr><td colspan="8" style="text-align:center;color:rgba(18,36,28,.5);padding:22px;">Nothing pending — you're all caught up.</td></tr>`}
  </table></div>`;
}
function ensureProProfileFromFree(email, password){
  const freeKey = 'free:'+email.toLowerCase();
  const proKey = 'pro:'+email.toLowerCase();
  const freeProfile = userStore[freeKey] || freshProfile('free', email);
  const proProfile = userStore[proKey] || freshProfile('pro', email);
  proProfile.password = password;
  proProfile.savedInfo = {...freeProfile.savedInfo, email};
  proProfile.apis = [...(freeProfile.apis || []), ...(proProfile.apis || [])];
  proProfile.upgradedFrom = email;
  userStore[proKey] = proProfile;
}
function deliverPurchasedApi(buyerEmail, apiName, txn={}){
  const item = state.admin.market.find(m=>m.id === txn.listingId) || state.admin.market.find(m=>m.api === apiName);
  if(!item) return;
  const buyerRole = txn.buyerRole || 'free';
  const buyerKey = buyerRole + ':' + buyerEmail.toLowerCase();
  const buyer = userStore[buyerKey] || freshProfile(buyerRole, buyerEmail);
  const newApi = {name:item.api, description:item.description, endpoint:'/api/v1/run/'+slug(item.api), runs:0, owner:buyerEmail, ownershipStatus:'Owned', purchasedFrom:item.seller, purchaseDate:todayISO()};
  if(!buyer.apis.some(a=>a.name === item.api)){
    buyer.apis.unshift(newApi);
  }else{
    buyer.apis = buyer.apis.map(a => a.name === item.api ? {...a, owner:buyerEmail, ownershipStatus:'Owned', purchasedFrom:item.seller, purchaseDate:todayISO()} : a);
  }
  buyer.payments = buyer.payments || [];
  buyer.payments.unshift({plan:'Marketplace API — '+item.api, validity:'Ownership transferred', info:'Approved by admin'});
  userStore[buyerKey] = buyer;

  item.sold = (item.sold || 0) + 1;
  item.status = 'Sold';
  item.owner = buyerEmail;
  item.soldTo = buyerEmail;
  item.soldDate = todayISO();

  const sellerProfile = userStore['pro:' + String(item.seller).toLowerCase()];
  if(sellerProfile){
    sellerProfile.transactions = sellerProfile.transactions || [];
    sellerProfile.messages = sellerProfile.messages || [];
    const txIndex = sellerProfile.transactions.findIndex(t => t.txnId === txn.id || t.listingId === item.id);
    const soldTx = {api:item.api, buyer:buyerEmail, price:item.price, method:txn.method || 'bKash Send Money', date:todayISO(), status:'Sold / Ownership transferred', listingId:item.id, txnId:txn.id};
    if(txIndex >= 0) sellerProfile.transactions[txIndex] = {...sellerProfile.transactions[txIndex], ...soldTx};
    else sellerProfile.transactions.unshift(soldTx);
    sellerProfile.messages.unshift({from:'Admin', body:`Your API "${item.api}" has been sold to ${buyerEmail}. Ownership has been transferred.`});
    if(String(item.seller).toLowerCase() !== 'apigarden studio'){
      sellerProfile.apis = (sellerProfile.apis || []).filter(a => a.name !== item.api);
    }
    userStore['pro:' + String(item.seller).toLowerCase()] = sellerProfile;
  }
  if(String(item.seller).toLowerCase() !== 'apigarden studio'){
    state.admin.market = state.admin.market.filter(m => m.id !== item.id);
  }
}

function rejectTxn(i){
  const t = state.admin.pending[i];
  if(!t) return;
  state.admin.pending.splice(i,1);
  state.admin.approved.unshift({...t, status:'Rejected'});
  const buyerEmail = t.buyer || t.user;
  const msg = {from:'Admin', body:`Your request "${t.plan}" (${t.amount}) was rejected. Please check the transaction information and send again if needed.`};
  notifyUser(buyerEmail, 'free', msg);
  pushUserMessageToBackend('free', buyerEmail, msg);
  if(t.listingId){
    const item = state.admin.market.find(m => m.id === t.listingId);
    if(item){
      item.status = 'On shelf';
      delete item.pendingBuyer;
      delete item.pendingTxnId;
    }
    const sellerProfile = userStore['pro:'+String(t.seller || '').toLowerCase()];
    if(sellerProfile){
      sellerProfile.transactions = sellerProfile.transactions || [];
      const idx = sellerProfile.transactions.findIndex(x => x.txnId === t.id || x.listingId === t.listingId);
      const rejectedTx = {api:t.apiName, buyer:buyerEmail, price:String(t.amount || '').replace('$',''), method:t.method, date:todayISO(), status:'Rejected by admin', listingId:t.listingId, txnId:t.id};
      if(idx >= 0) sellerProfile.transactions[idx] = {...sellerProfile.transactions[idx], ...rejectedTx};
      else sellerProfile.transactions.unshift(rejectedTx);
    }
  }
  if(t.seller){
    const sellerMsg = {from:'Admin', body:`The purchase request for your API "${t.apiName || t.plan}" from ${buyerEmail} was rejected by admin.`};
    notifyUser(t.seller, 'pro', sellerMsg);
    pushUserMessageToBackend('pro', t.seller, sellerMsg);
  }
  saveAppData();
  syncAdminToBackend();
  renderPending(); renderApproved(); renderAdminMarket(); renderMarket('free'); renderMarket('pro');
  showToast(`Rejected ${t.id}`);
}


function approveTxn(i){
  const t = state.admin.pending[i];
  if(!t) return;
  const buyerEmail = t.buyer || t.user;
  const pass = 'ap-' + Math.random().toString(36).slice(2,8);
  state.admin.pending.splice(i,1);
  state.admin.approved.unshift({...t, password: pass, status:'Approved'});
  const profile = userStore['free:'+buyerEmail.toLowerCase()] || freshProfile('free', buyerEmail);
  userStore['free:'+buyerEmail.toLowerCase()] = profile;

  if(/^Pro /.test(t.plan)){
    ensureProProfileFromFree(buyerEmail, pass);
    const proProfile = userStore['pro:'+buyerEmail.toLowerCase()];
    const msg = {from:'Admin', body:`Your ${t.plan} request (${t.amount}) has been approved. Pro login email: ${buyerEmail}. Temporary password: ${pass}`, password: pass};
    profile.messages = profile.messages || [];
    profile.messages.unshift(msg);
    pushUserMessageToBackend('free', buyerEmail, msg);
    if(proProfile){
      proProfile.messages = proProfile.messages || [];
      const proMsg = {from:'Admin', body:`Your Pro account is active. Login email: ${buyerEmail}. Temporary password: ${pass}`, password: pass};
      proProfile.messages.unshift(proMsg);
      pushUserMessageToBackend('pro', buyerEmail, proMsg);
    }
  } else if(/^API Purchase — /.test(t.plan)){
    const apiName = t.plan.replace('API Purchase — ','');
    deliverPurchasedApi(buyerEmail, apiName, t);
    profile.messages = profile.messages || [];
    const msg = {from:'Admin', body:`Your purchase request for "${apiName}" from seller ${t.seller || 'Marketplace seller'} has been approved. The API is now available in your account.`};
    profile.messages.unshift(msg);
    pushUserMessageToBackend('free', buyerEmail, msg);
  } else {
    profile.messages = profile.messages || [];
    const msg = {from:'Admin', body:`Your request "${t.plan}" (${t.amount}) has been approved. Temporary password: ${pass}`, password: pass};
    profile.messages.unshift(msg);
    pushUserMessageToBackend('free', buyerEmail, msg);
  }

  saveAppData();
  syncAdminToBackend();
  renderPending(); renderApproved(); renderAdminMarket(); renderMarket('free'); renderMarket('pro');
  showToast(`Approved ${t.id} — update sent to ${buyerEmail}`);
}
function renderApproved(){
  const wrap = document.getElementById('approved-area');
  const list = state.admin.approved;
  wrap.innerHTML = `<div class="card" style="padding:6px 0;overflow-x:auto;"><table>
    <tr><th>Txn ID</th><th>Buyer / User</th><th>Seller</th><th>Plan</th><th>Amount</th><th>Date</th><th>Status</th></tr>
    ${list.length? list.map(t=>`<tr><td class="mono">${t.id}</td><td>${t.buyer || t.user}</td><td>${t.seller || '—'}</td><td>${t.plan}</td><td>${t.amount}</td><td>${t.date}</td><td><span class="status-chip ${t.status==='Rejected'?'':'status-approved'}">${t.status || 'Approved'}</span></td></tr>`).join('')
      : `<tr><td colspan="7" style="text-align:center;color:rgba(18,36,28,.5);padding:22px;">No approvals yet.</td></tr>`}
  </table></div>`;
}
function renderAdminMarket(){
  const wrap = document.getElementById('admin-market-area');
  const purchaseRequests = state.admin.pending
    .map((t,i)=>({...t, index:i}))
    .filter(t => /^API Purchase — /.test(t.plan || '') || t.requestType === 'Marketplace API Purchase');

  wrap.innerHTML = `
  <h2 class="section-title" style="margin-bottom:2px;">Marketplace Buying Request Approvals</h2>
  <p class="section-sub">Approve or reject marketplace ownership transfer requests.</p>
  <div class="card" style="padding:6px 0;overflow-x:auto;margin-bottom:18px;"><table>
    <tr><th>Txn ID</th><th>Requester</th><th>Buyer mail</th><th>Seller</th><th>API</th><th>Amount</th><th>Method</th><th>Date</th><th>Status</th><th>Action</th></tr>
    ${purchaseRequests.length ? purchaseRequests.map(t=>`<tr>
      <td class="mono">${t.id}</td>
      <td>${escapeHtml(t.buyer || t.user)}</td>
      <td>${escapeHtml(t.buyer || t.user)}</td>
      <td>${escapeHtml(t.seller || '—')}</td>
      <td>${escapeHtml(t.apiName || (t.plan || '').replace('API Purchase — ',''))}</td>
      <td>${escapeHtml(t.amount || '—')}</td>
      <td>${escapeHtml(t.method || '—')}</td>
      <td>${escapeHtml(t.date || '—')}</td>
      <td><span class="status-chip">Pending admin approval</span></td>
      <td><button class="btn btn-primary small-btn" onclick="approveTxn(${t.index})">Approve</button> <button class="btn btn-ghost small-btn" onclick="rejectTxn(${t.index})">Reject</button></td>
    </tr>`).join('') : `<tr><td colspan="10" style="text-align:center;color:rgba(18,36,28,.5);padding:22px;">No marketplace buying requests right now.</td></tr>`}
  </table></div>

  <h2 class="section-title" style="margin-bottom:2px;">Marketplace Listings</h2>
  <p class="section-sub">Live shelf items, pending items, and platform fees.</p>
  <div class="card" style="padding:6px 0;overflow-x:auto;"><table>
    <tr><th>Seller</th><th>Current owner</th><th>API</th><th>Price</th><th>Status</th><th>Pending buyer / Sold to</th><th>Units sold</th><th>Platform fee (10%)</th></tr>
    ${state.admin.market.length ? state.admin.market.map(m=>`<tr>
      <td>${escapeHtml(m.seller)}</td>
      <td>${escapeHtml(m.owner || m.seller)}</td>
      <td>${escapeHtml(m.api)}</td>
      <td>$${m.price}</td>
      <td><span class="status-chip ${m.status==='Sold'?'status-approved':''}">${escapeHtml(m.status || 'On shelf')}</span></td>
      <td>${escapeHtml(m.pendingBuyer || m.soldTo || '—')}</td>
      <td>${m.sold || 0}</td>
      <td>$${(m.price*0.1).toFixed(2)}</td>
    </tr>`).join('')
      : `<tr><td colspan="8" style="text-align:center;color:rgba(18,36,28,.5);padding:22px;">No listings yet.</td></tr>`}
  </table></div>`;
}

function parseInlineArgs(argText, clickedEl){
  if(!argText.trim()) return [];
  const args = [];
  let current = '', quote = null;
  for(let i=0;i<argText.length;i++){
    const ch = argText[i];
    if(quote){
      if(ch === quote){ quote = null; }
      else { current += ch; }
    }else if(ch === "'" || ch === '"'){
      quote = ch;
    }else if(ch === ','){
      args.push(current.trim());
      current = '';
    }else{
      current += ch;
    }
  }
  if(current.length || argText.endsWith(',')) args.push(current.trim());
  return args.map(a=>{
    if(a === 'this') return clickedEl;
    if(a === 'true') return true;
    if(a === 'false') return false;
    if(/^[-]?\d+(\.\d+)?$/.test(a)) return Number(a);
    return a;
  });
}
function runInlineAction(code, clickedEl){
  code = String(code || '').trim().replace(/;$/,'');
  const docClick = code.match(/^document\.getElementById\(['"]([^'"]+)['"]\)\.click\(\)$/);
  if(docClick){ const target = document.getElementById(docClick[1]); if(target) target.click(); return true; }
  const match = code.match(/^([A-Za-z_$][\w$]*)\((.*)\)$/);
  if(!match) return false;
  const fnName = match[1];
  const allowed = {go,loginFree,loginPro,loginAdmin,switchTab,openDrawer,closeDrawer,logout,drawerPanel,reloadUserMessages,adminRefresh,startUpgrade,sendUpgradeRequest,saveInfo,fillCurrentPageForm,runAnalyzer,runCurrency,runWeather,runQuote,runGrammar,runPdfQuestion,resetWizard,nextStep,testWizard,saveWizard,runMyApi,runMyApiWithPage,deleteMyApi,listOnMarket,buyApi,approveTxn,rejectTxn};
  if(!allowed[fnName]) return false;
  allowed[fnName](...parseInlineArgs(match[2], clickedEl));
  return true;
}
document.addEventListener('click', (event)=>{
  const el = event.target.closest('[onclick]');
  if(!el) return;
  if(runInlineAction(el.getAttribute('onclick'), el)){
    event.preventDefault();
    event.stopPropagation();
  }
}, true);
document.addEventListener('change', (event)=>{
  const el = event.target;
  if(el && /^pdf-file-/.test(el.id || '') && el.files && el.files[0]){
    handlePdfUpload(el.id.replace('pdf-file-',''), el.files[0]);
  }
}, true);
document.addEventListener('keydown', (event)=>{
  if(event.key === 'Enter' && event.target && /^pdf-question-/.test(event.target.id || '')){
    event.preventDefault();
    runPdfQuestion(event.target.id.replace('pdf-question-',''));
  }
}, true);

window.addEventListener('load', ()=>{ try{ renderMarket('free'); renderMarket('pro'); }catch(e){} });
