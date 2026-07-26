
(function(){
  if(window.__APIGARDEN_CONTENT_READY__) return;
  window.__APIGARDEN_CONTENT_READY__ = true;

  function norm(s){ return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
  function firstName(full){ return String(full || '').trim().split(/\s+/)[0] || ''; }
  function lastName(full){ const parts = String(full || '').trim().split(/\s+/); return parts.length > 1 ? parts.slice(1).join(' ') : ''; }

  function nearbyText(el){
    let parts = [
      el.name,
      el.id,
      el.placeholder,
      el.getAttribute('aria-label'),
      el.getAttribute('autocomplete'),
      el.getAttribute('title')
    ];
    if(el.labels) parts.push(...Array.from(el.labels).map(l=>l.innerText));
    const parent = el.closest('label, div, p, section, fieldset, form, tr, td');
    if(parent) parts.push(parent.innerText.slice(0, 220));
    return norm(parts.filter(Boolean).join(' '));
  }

  function setValue(el, value){
    if(!value) return false;
    const tag = el.tagName.toLowerCase();
    const type = (el.type || '').toLowerCase();
    if(['hidden','password','submit','button','checkbox','radio','file'].includes(type)) return false;

    if(tag === 'select'){
      const v = norm(value);
      const opt = Array.from(el.options).find(o => {
        const ov = norm(o.value);
        const ot = norm(o.text);
        return ov === v || ot === v || ov.includes(v) || ot.includes(v) || v.includes(ot);
      });
      if(opt){
        el.value = opt.value;
        el.dispatchEvent(new Event('input', {bubbles:true}));
        el.dispatchEvent(new Event('change', {bubbles:true}));
        return true;
      }
      return false;
    }

    el.focus();
    el.value = value;
    el.dispatchEvent(new Event('input', {bubbles:true}));
    el.dispatchEvent(new Event('change', {bubbles:true}));
    el.blur();
    return true;
  }

  function matchValue(label, data){
    if(/\b(first name|given name)\b/.test(label)) return firstName(data.name);
    if(/\b(last name|surname|family name)\b/.test(label)) return lastName(data.name);
    if(/\b(full name|guest name|customer name|your name|name)\b/.test(label) && !/\buser\s?name|company name|hotel name|property name\b/.test(label)) return data.name;
    if(/\b(email|e mail|mail address)\b/.test(label)) return data.email;
    if(/\b(phone|mobile|contact number|telephone|cell|whatsapp)\b/.test(label)) return data.phone;
    if(/\b(gender|sex)\b/.test(label)) return data.gender;
    if(/\bcountry\b/.test(label)) return data.country;
    if(/\b(city|town|district)\b/.test(label)) return data.city;
    if(/\b(location|address|area|street|road|state|province)\b/.test(label)) return data.location || data.address || data.city;
    if(/\b(date of birth|dob|birth date|birthday)\b/.test(label)) return data.dob;
    for(const field of (data.customFields || [])){
      const customLabel = norm(field.label);
      if(customLabel && (label.includes(customLabel) || customLabel.includes(label))) return field.value;
    }
    return '';
  }

  function fillForm(data){
    let filled = 0;
    document.querySelectorAll('input, textarea, select').forEach(el=>{
      const label = nearbyText(el);
      const value = matchValue(label, data || {});
      if(value && setValue(el, value)) filled++;
    });
    return filled;
  }

  function getPageContext(){
    const title = document.title || '';
    const url = location.href;

    const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
    const headings = Array.from(document.querySelectorAll('h1,h2,h3'))
      .map(h=>h.innerText.trim())
      .filter(Boolean)
      .slice(0, 50);

    const seen = new Set();
    const items = [];

    function addItem(text, source='page'){
      text = String(text || '').replace(/\s+/g,' ').trim();
      if(!text) return;
      if(text.length < 3 || text.length > 260) return;
      const bad = /^(add|buy|cart|login|sign in|menu|search|home|next|previous|view|read more|show more|filter|sort)$/i;
      if(bad.test(text)) return;
      const key = text.toLowerCase();
      if(seen.has(key)) return;
      seen.add(key);
      items.push({text, source});
    }

    // Product/card style blocks.
    document.querySelectorAll('[class*="product"],[class*="item"],[class*="card"],[class*="grid"],[class*="listing"],li,article').forEach(el=>{
      const block = (el.innerText || '').replace(/\s+/g,' ').trim();
      if(block && block.length >= 8 && block.length <= 500){
        addItem(block.slice(0,260), 'card');
      }
    });

    // Links, headings, buttons, image alt labels.
    document.querySelectorAll('h1,h2,h3,h4,a,button,[aria-label],img[alt]').forEach(el=>{
      addItem(el.innerText || el.getAttribute('aria-label') || el.getAttribute('alt') || el.getAttribute('title') || '', 'label');
    });

    // Common structured data names.
    document.querySelectorAll('[itemprop="name"],[data-product-name],[data-name],[title]').forEach(el=>{
      addItem(el.getAttribute('data-product-name') || el.getAttribute('data-name') || el.getAttribute('title') || el.innerText, 'structured');
    });

    const bodyText = (document.body?.innerText || '')
      .replace(/\s+/g,' ')
      .trim()
      .slice(0, 16000);

    const itemText = items.map((x,i)=>`${i+1}. ${x.text}`).slice(0, 260).join('\n');

    return {
      title,
      url,
      items: items.slice(0,260),
      text: `Title: ${title}
URL: ${url}
Meta description: ${metaDesc}
Headings: ${headings.join(' | ')}

Detected page items / products / options:
${itemText}

Full page text:
${bodyText}`
    };
  }


  function cssEscape(value){
    if(window.CSS && CSS.escape) return CSS.escape(String(value));
    return String(value).replace(/[^a-zA-Z0-9_-]/g, ch => `\\${ch}`);
  }
  function selectorFor(el){
    if(!el || el.nodeType !== 1) return '';
    if(el.id) return `#${cssEscape(el.id)}`;
    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-qa');
    if(testId) return `[data-testid="${String(testId).replace(/"/g,'\\"')}"]`;
    const parts=[];
    let node=el;
    while(node && node.nodeType===1 && node!==document.body && parts.length<5){
      let part=node.tagName.toLowerCase();
      const name=node.getAttribute('name');
      if(name) part += `[name="${String(name).replace(/"/g,'\\"')}"]`;
      else {
        const siblings=node.parentElement ? Array.from(node.parentElement.children).filter(x=>x.tagName===node.tagName) : [];
        if(siblings.length>1) part += `:nth-of-type(${siblings.indexOf(node)+1})`;
      }
      parts.unshift(part);
      node=node.parentElement;
    }
    return parts.join(' > ');
  }
  function sendRecordedAction(action){
    try{ chrome.runtime.sendMessage({type:'APIGARDEN_RECORDED_ACTION', action, url:location.href}); }catch(e){}
  }
  document.addEventListener('click', event=>{
    const el=event.target.closest('a,button,input,[role="button"],[onclick]');
    if(!el) return;
    sendRecordedAction({
      type:'click', selector:selectorFor(el), text:(el.innerText || el.value || el.getAttribute('aria-label') || '').trim().slice(0,160),
      href:el.href || '', tag:el.tagName.toLowerCase()
    });
  }, true);
  document.addEventListener('change', event=>{
    const el=event.target;
    if(!el?.matches?.('input,textarea,select')) return;
    if((el.type || '').toLowerCase()==='password') return;
    sendRecordedAction({type:'input',selector:selectorFor(el),value:String(el.value || '').slice(0,500),tag:el.tagName.toLowerCase(),inputType:el.type || ''});
  }, true);
  document.addEventListener('keydown', event=>{
    const el=event.target;
    if(event.key !== 'Enter' || !el?.matches?.('input,textarea')) return;
    if((el.type || '').toLowerCase()==='password') return;
    sendRecordedAction({type:'keypress',key:'Enter',selector:selectorFor(el),value:String(el.value || '').slice(0,500)});
  }, true);
  document.addEventListener('submit', event=>{
    sendRecordedAction({type:'submit',selector:selectorFor(event.target),action:event.target.action || ''});
  }, true);

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse)=>{
    if(msg && msg.type === 'APIGARDEN_PING'){
      sendResponse({ok:true});
      return true;
    }
    if(msg && msg.type === 'APIGARDEN_FILL_FORM'){
      const filled = fillForm(msg.data || {});
      sendResponse({ok:true, filled});
      return true;
    }
    if(msg && msg.type === 'APIGARDEN_GET_PAGE_CONTEXT'){
      const ctx = getPageContext();
      sendResponse({ok:true, text:ctx.text, url:ctx.url, title:ctx.title, items:ctx.items});
      return true;
    }
  });
})();
