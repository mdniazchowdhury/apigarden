const RECORDING_KEY = 'apigarden_recorder_v1';
const VOICE_RESULT_KEY = 'apigarden_voice_run_v1';

function waitForTabComplete(tabId, timeoutMs=9000){
  return new Promise(resolve=>{
    let done=false;
    const finish=(value)=>{ if(done) return; done=true; clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); resolve(value); };
    const listener=(id,info)=>{ if(id===tabId && info.status==='complete') finish(true); };
    const timer=setTimeout(()=>finish(false), timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then(tab=>{ if(tab.status==='complete') finish(true); }).catch(()=>{});
  });
}

async function ensureContentScript(tabId){
  try{ const pong=await chrome.tabs.sendMessage(tabId,{type:'APIGARDEN_PING'}); if(pong?.ok) return true; }catch(e){}
  try{
    await chrome.scripting.executeScript({target:{tabId},files:['content.js']});
    await new Promise(r=>setTimeout(r,350));
    const pong=await chrome.tabs.sendMessage(tabId,{type:'APIGARDEN_PING'});
    return !!pong?.ok;
  }catch(e){ return false; }
}
async function sendWithRetry(tabId,message,{tries=4,delay=350}={}){
  let lastError;
  for(let i=0;i<tries;i++){
    try{
      await ensureContentScript(tabId);
      return await chrome.tabs.sendMessage(tabId,message);
    }catch(e){ lastError=e; await new Promise(r=>setTimeout(r,delay)); }
  }
  throw lastError || new Error('Could not communicate with the website tab.');
}

async function extractProductsFromTab(tabId){
  await waitForTabComplete(tabId, 9000);
  await new Promise(r=>setTimeout(r,500));
  try{
    return await sendWithRetry(tabId,{type:'APIGARDEN_EXTRACT_PRODUCTS'},{tries:4,delay:350});
  }catch(error){
    return {ok:false,error:error.message || String(error),results:[]};
  }
}


const emptyRecording = () => ({
  isRecording: false,
  startedAt: null,
  stoppedAt: null,
  steps: [],
  finalUrl: '',
  title: '',
  startTabId: null
});

async function getRecording(){
  const data = await chrome.storage.local.get(RECORDING_KEY);
  return data[RECORDING_KEY] || emptyRecording();
}
async function setRecording(recording){
  await chrome.storage.local.set({[RECORDING_KEY]: recording});
  await updateBadge(recording.isRecording);
  return recording;
}
async function updateBadge(active){
  await chrome.action.setBadgeText({text: active ? 'REC' : ''});
  if(active) await chrome.action.setBadgeBackgroundColor({color:'#b23b3b'});
}
function isRecordableUrl(url){
  return /^https?:\/\//i.test(String(url || ''));
}
function trimSteps(steps){
  return steps.slice(-500);
}

chrome.runtime.onInstalled.addListener(async()=>{
  const rec = await getRecording();
  await updateBadge(rec.isRecording);
});
chrome.runtime.onStartup.addListener(async()=>{
  const rec = await getRecording();
  await updateBadge(rec.isRecording);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse)=>{
  (async()=>{
    if(message?.type === 'APIGARDEN_RECORDING_STATUS'){
      sendResponse({ok:true, recording:await getRecording()});
      return;
    }
    if(message?.type === 'APIGARDEN_START_RECORDING'){
      const tabs = await chrome.tabs.query({active:true,currentWindow:true});
      const tab = tabs[0];
      const rec = emptyRecording();
      rec.isRecording = true;
      rec.startedAt = new Date().toISOString();
      rec.startTabId = tab?.id || null;
      if(isRecordableUrl(tab?.url)){
        rec.finalUrl = tab.url;
        rec.title = tab.title || '';
        rec.steps.push({type:'navigate', url:tab.url, title:tab.title || '', at:Date.now()});
      }
      await setRecording(rec);
      sendResponse({ok:true, recording:rec});
      return;
    }
    if(message?.type === 'APIGARDEN_STOP_RECORDING'){
      const rec = await getRecording();
      rec.isRecording = false;
      rec.stoppedAt = new Date().toISOString();
      await setRecording(rec);

      // Extract the live results immediately from the page that the user
      // stopped on. This allows Download JSON to work without requiring a
      // separate Run API click first.
      let extraction = {ok:false, results:[], resultCount:0};
      try{
        const tabs = await chrome.tabs.query({active:true, currentWindow:true});
        let tab = tabs[0];
        if((!tab || !isRecordableUrl(tab.url)) && rec.finalUrl){
          const matches = await chrome.tabs.query({url: rec.finalUrl});
          tab = matches[0];
        }
        if(tab?.id && isRecordableUrl(tab.url)){
          extraction = await extractProductsFromTab(tab.id);
        }
      }catch(error){
        extraction = {ok:false,error:error.message || String(error),results:[],resultCount:0};
      }
      sendResponse({ok:true, recording:rec, extraction});
      return;
    }
    if(message?.type === 'APIGARDEN_CLEAR_RECORDING'){
      const rec = emptyRecording();
      await setRecording(rec);
      sendResponse({ok:true, recording:rec});
      return;
    }
    if(message?.type === 'APIGARDEN_RECORDED_ACTION'){
      const rec = await getRecording();
      if(!rec.isRecording){ sendResponse({ok:false, ignored:true}); return; }
      const url = sender.tab?.url || message.url || '';
      if(!isRecordableUrl(url)){ sendResponse({ok:false, ignored:true}); return; }
      const action = {...message.action, url, tabId:sender.tab?.id, at:Date.now()};
      const previous = rec.steps[rec.steps.length - 1];
      if(action.type === 'input' && previous?.type === 'input' && previous.selector === action.selector && previous.tabId === action.tabId){
        rec.steps[rec.steps.length - 1] = action;
      }else{
        rec.steps.push(action);
      }
      rec.steps = trimSteps(rec.steps);
      rec.finalUrl = url;
      rec.title = sender.tab?.title || rec.title;
      await setRecording(rec);
      sendResponse({ok:true});
      return;
    }
    if(message?.type === 'APIGARDEN_RUN_VOICE_API'){
      const intent = message.intent || {};
      const autonomous = intent.mode === 'agent' || intent.agentType;
      const targetUrl = String((autonomous ? (intent.baseUrl || intent.targetUrl) : intent.targetUrl) || intent.finalUrl || intent.baseUrl || '').trim();
      if(!isRecordableUrl(targetUrl)) throw new Error('No valid website URL was detected from the voice command.');
      const tab = await chrome.tabs.create({url:targetUrl, active:true});
      await waitForTabComplete(tab.id, 9000);
      await new Promise(r=>setTimeout(r,350));
      let extraction;
      if(autonomous){
        let first;
        try{ first = await sendWithRetry(tab.id,{type:'APIGARDEN_AUTONOMOUS_AGENT',intent},{tries:5,delay:250}); }
        catch(error){ first={ok:false,error:error.message||String(error),results:[],resultCount:0}; }
        // The first pass may trigger a SPA/full-page navigation. Re-read the destination page
        // and run one verification pass so the final JSON comes from the result page.
        await new Promise(r=>setTimeout(r,1200));
        await waitForTabComplete(tab.id, 7000);
        let second;
        try{ second = await sendWithRetry(tab.id,{type:'APIGARDEN_AUTONOMOUS_AGENT',intent:{...intent,verificationPass:true}},{tries:4,delay:250}); }
        catch(error){ second=null; }
        extraction = (second?.resultCount || 0) >= (first?.resultCount || 0) ? (second || first) : first;
        if(!extraction?.resultCount){
          try{
            const generic = await sendWithRetry(tab.id,{type:'APIGARDEN_GET_PAGE_CONTEXT'},{tries:2,delay:200});
            extraction = {...(extraction||{}), sourceUrl:extraction?.sourceUrl || generic?.url || targetUrl, pageTitle:extraction?.pageTitle || generic?.title || '', pageContextCaptured:!!generic?.ok};
          }catch(e){}
        }
      }else{
        try{
          extraction = await sendWithRetry(tab.id,{
            type:'APIGARDEN_VOICE_FILTER_PRODUCTS',
            query:intent.query || '',
            minPrice:intent.minPrice ?? null,
            maxPrice:intent.maxPrice ?? null,
            siteLabel:intent.siteLabel || intent.domain || ''
          },{tries:4,delay:300});
        }catch(error){
          extraction = await extractProductsFromTab(tab.id);
        }
      }
      const lastOutcome={
        apiName:intent.name || 'Voice Website API', description:intent.description || '', query:intent.query || '', status:(extraction?.agent?.status==='needs_user_action'?'needs_user_action':'success'),
        sourceUrl:extraction?.sourceUrl || targetUrl, pageTitle:extraction?.pageTitle || '', resultCount:extraction?.resultCount || 0,
        results:extraction?.results || [], filters:{minPrice:intent.minPrice ?? null,maxPrice:intent.maxPrice ?? null,currency:'BDT'},
        voice:{transcript:intent.transcript || '',website:intent.siteLabel || intent.domain || ''}, agent:extraction?.agent || null, travel:intent.travel || null, generatedAt:new Date().toISOString(),
        note:extraction?.resultCount ? (autonomous?'Autonomous browser agent reached a live result page and extracted visible results.':'Live visible product data extracted after the voice search and price filter were applied.') : (autonomous?'The autonomous browser agent attempted the requested workflow but could not verify visible final results.':'The website opened and the filter ran, but no matching visible product cards were detected.')
      };
      await chrome.storage.local.set({[VOICE_RESULT_KEY]:{kind:message.runKind || 'draft',id:message.runId || intent.id || '',lastOutcome,finishedAt:new Date().toISOString()}});
      sendResponse({ok:true,tabId:tab.id,url:targetUrl,extraction});
      return;
    }
    if(message?.type === 'APIGARDEN_REPLAY_RECORDING'){
      const recording = message.recording || await getRecording();
      const targetUrl = recording.finalUrl || recording.steps?.filter(s=>s.type==='navigate').at(-1)?.url;
      if(!isRecordableUrl(targetUrl)) throw new Error('No replayable website URL was captured.');
      const tab = await chrome.tabs.create({url:targetUrl, active:true});
      const extraction = await extractProductsFromTab(tab.id);
      sendResponse({ok:true, tabId:tab.id, url:targetUrl, extraction});
      return;
    }
  })().catch(error=>sendResponse({ok:false,error:error.message || String(error)}));
  return true;
});

chrome.webNavigation.onCommitted.addListener(async details=>{
  if(details.frameId !== 0 || !isRecordableUrl(details.url)) return;
  const rec = await getRecording();
  if(!rec.isRecording) return;
  let title = '';
  try{ title = (await chrome.tabs.get(details.tabId)).title || ''; }catch(e){}
  const last = rec.steps[rec.steps.length - 1];
  if(last?.type !== 'navigate' || last.url !== details.url){
    rec.steps.push({type:'navigate',url:details.url,title,tabId:details.tabId,transitionType:details.transitionType,at:Date.now()});
  }
  rec.steps = trimSteps(rec.steps);
  rec.finalUrl = details.url;
  rec.title = title || rec.title;
  await setRecording(rec);
});
