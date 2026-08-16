
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



  function absoluteUrl(value){
    try{ return new URL(value || '', location.href).href; }catch(e){ return ''; }
  }

  function absoluteUrl(value){
    try{ return new URL(value || '', location.href).href; }catch(e){ return ''; }
  }

  function normalisePrice(value){
    const raw=String(value || '').replace(/\s+/g,' ').trim();
    if(!raw) return '';
    const number=(raw.match(/\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d{3,}(?:\.\d{1,2})?/)||[])[0];
    if(!number) return '';
    // Walton prices are Bangladeshi Taka. Always export a consistent
    // currency-labelled value, even when the webpage displays only digits.
    return `৳ ${number}`;
  }

  function extractPrice(text){
    const value = String(text || '').replace(/\s+/g, ' ').trim();
    const labelled = value.match(/(?:price|মূল্য)\s*[:\-]?\s*(?:৳|BDT|Tk\.?)?\s*[\d,]+(?:\.\d{1,2})?/i);
    if(labelled) return normalisePrice(labelled[0].replace(/^(?:price|মূল্য)\s*[:\-]?\s*/i,''));
    const currency = value.match(/(?:৳|BDT|Tk\.?|TK\.?|টাকা)\s*[\d,]+(?:\.\d{1,2})?|[\d,]+(?:\.\d{1,2})?\s*(?:৳|BDT|Tk\.?|TK\.?|টাকা)/i);
    if(currency) return normalisePrice(currency[0]);
    return '';
  }

  function textOf(el){ return String(el?.innerText || el?.textContent || '').replace(/\s+/g,' ').trim(); }

  function findProductName(card){
    const selectors = [
      '[itemprop="name"]','[data-product-name]','[class*="product-name"]','[class*="product-title"]',
      '[class*="item-name"]','[class*="item-title"]','.caption h4','.caption h3','h1','h2','h3','h4','a[title]','img[alt]'
    ];
    for(const selector of selectors){
      const el=card.querySelector(selector);
      const candidate=(el?.getAttribute?.('data-product-name') || el?.getAttribute?.('title') || el?.getAttribute?.('alt') || textOf(el)).trim();
      if(candidate && candidate.length>=3 && candidate.length<=180 && !/^add to cart|buy now|view details|quick view|compare$/i.test(candidate)) return candidate;
    }
    return '';
  }

  function findPrice(card){
    const selectors=['[itemprop="price"]','[data-price]','[class*="price"]','[id*="price"]','.caption .price'];
    for(const selector of selectors){
      const el=card.querySelector(selector);
      if(!el) continue;
      const raw=el.getAttribute('content') || el.getAttribute('data-price') || textOf(el);
      const found=extractPrice(raw) || normalisePrice(raw);
      if(found) return found;
    }
    const lines=(card.innerText || card.textContent || '').split(/\n+/).map(x=>x.trim()).filter(Boolean);
    for(const line of lines){
      if(/^(available|limited|out of stock|compare)$/i.test(line)) continue;
      const found=extractPrice(line) || (/^\s*\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?\s*$/.test(line) ? normalisePrice(line) : '');
      if(found) return found;
    }
    return '';
  }

  function findImage(card){
    const img=card.querySelector('img[src],img[data-src],img[data-lazy-src],img[data-original],source[srcset]');
    if(!img) return '';
    const src=img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-original') || (img.getAttribute('srcset')||'').split(',')[0].trim().split(' ')[0];
    return absoluteUrl(src);
  }

  function findProductUrl(card){
    const link=card.matches?.('a[href]') ? card : card.querySelector('a[href*="route=product/product"],a[href*="/products/"],a[href*="/product/"],a[href]');
    return absoluteUrl(link?.getAttribute('href') || '');
  }

  function waltonProducts(){
    if(!/waltonbd\.com$/i.test(location.hostname) && !/\.waltonbd\.com$/i.test(location.hostname)) return [];
    const output=[];
    const seen=new Set();
    const links=[...document.querySelectorAll('a[href*="route=product/product"], h1 a[href], h2 a[href], h3 a[href], h4 a[href], h5 a[href], h6 a[href], .caption a[href]')];
    for(const link of links){
      const name=(textOf(link) || link.getAttribute('title') || '').trim();
      if(!name || /^compare$/i.test(name)) continue;
      let card=link.closest('.product-thumb,.product-layout,.product-grid,.product-list,[class*="product-item"],[class*="product-card"],.col-lg-3,.col-md-3,.col-sm-6,.col-xs-12');
      if(!card){
        let node=link.parentElement;
        let best=null;
        for(let i=0;i<10 && node && node!==document.body;i++,node=node.parentElement){
          const txt=textOf(node);
          const hasImage=!!node.querySelector('img');
          const hasStatus=/AVAILABLE|LIMITED|OUT OF STOCK/i.test(txt);
          const hasPrice=/৳|BDT|TK\.?|\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?/i.test(txt);
          if(hasImage && txt.includes(name) && (hasStatus || hasPrice)) { best=node; break; }
          if(!best && hasImage && txt.includes(name)) best=node;
        }
        card=best;
      }
      if(!card) continue;
      const productUrl=absoluteUrl(link.getAttribute('href'));
      const productImage=findImage(card);
      const livePrice=findPrice(card);
      const key=(name+'|'+productUrl).toLowerCase();
      if(seen.has(key)) continue;
      seen.add(key);
      output.push({
        'product name': name,
        'live price': livePrice,
        'product image': productImage,
        'product url': productUrl,
        'availability': ((textOf(card).match(/AVAILABLE|LIMITED|OUT OF STOCK/i)||[])[0] || '')
      });
    }
    return output;
  }

  function jsonLdProducts(){
    const out=[];
    const seen=new Set();
    const walk=(node)=>{
      if(!node) return;
      if(Array.isArray(node)){ node.forEach(walk); return; }
      if(typeof node!=='object') return;
      const type=String(node['@type'] || '').toLowerCase();
      if(type==='product'){
        const offers=Array.isArray(node.offers) ? node.offers[0] : (node.offers || {});
        const name=String(node.name || '').trim();
        const url=absoluteUrl(node.url || '');
        const imageValue=Array.isArray(node.image) ? node.image[0] : (typeof node.image==='object' ? (node.image.url || node.image.contentUrl) : node.image);
        const image=absoluteUrl(imageValue || '');
        const rawPrice=offers.price || offers.lowPrice || offers.highPrice || '';
        const price=rawPrice!=='' ? normalisePrice(String(rawPrice)) : '';
        if(name){
          const key=(name+'|'+url).toLowerCase();
          if(!seen.has(key)){
            seen.add(key);
            out.push({'product name':name,'live price':price,'product image':image,'product url':url,'availability':String(offers.availability || '').split('/').pop().replace(/([a-z])([A-Z])/g,'$1 $2').toUpperCase()});
          }
        }
      }
      Object.values(node).forEach(walk);
    };
    document.querySelectorAll('script[type="application/ld+json"]').forEach(script=>{
      try{ walk(JSON.parse(script.textContent || 'null')); }catch(e){}
    });
    return out;
  }

  function darazProducts(){
    if(!/(^|\.)daraz\.com\.bd$/i.test(location.hostname)) return [];
    const output=[];
    const seen=new Set();
    const links=[...document.querySelectorAll(
      'a[href*="-i"][href*=".html"], a[href*="/products/"], [data-qa-locator="product-item"] a[href]'
    )];

    const findCard=(link)=>{
      const direct=link.closest('[data-qa-locator="product-item"],.Bm3ON,[class*="Bm3ON"],[class*="gridItem"],[class*="product-card"],[class*="product-item"]');
      if(direct) return direct;
      let node=link.parentElement, best=null;
      for(let i=0;i<10 && node && node!==document.body;i++,node=node.parentElement){
        const txt=textOf(node);
        const hasImage=!!node.querySelector('img');
        const hasPrice=/৳|BDT|Tk\.?|টাকা/i.test(txt);
        if(hasImage && hasPrice && txt.length<2500) return node;
        if(!best && hasImage && txt.length<2500) best=node;
      }
      return best;
    };

    for(const link of links){
      const href=absoluteUrl(link.getAttribute('href') || '');
      if(!href || !/(?:-i\d+.*\.html|\/products\/)/i.test(href)) continue;
      const card=findCard(link);
      if(!card) continue;
      const name=(link.getAttribute('title') || textOf(link) || findProductName(card) || '').replace(/\s+/g,' ').trim();
      const livePrice=findPrice(card);
      const productImage=findImage(card);
      if(!name || (!livePrice && !productImage)) continue;
      const key=(name+'|'+href).toLowerCase();
      if(seen.has(key)) continue;
      seen.add(key);
      const cardText=textOf(card);
      const stock=(cardText.match(/OUT OF STOCK|SOLD OUT|AVAILABLE|LIMITED/i)||[])[0] || '';
      output.push({
        'product name':name.slice(0,220),
        'live price':livePrice,
        'product image':productImage,
        'product url':href,
        'availability':stock.toUpperCase()
      });
      if(output.length>=100) break;
    }

    if(!output.length){
      // Daraz frequently changes generated CSS class names. This fallback starts
      // from visible images/links and climbs to the smallest container carrying
      // a Taka price, so extraction does not depend on one fragile class name.
      const allLinks=[...document.querySelectorAll('a[href]')];
      for(const link of allLinks){
        const href=absoluteUrl(link.getAttribute('href') || '');
        if(!/(?:-i\d+.*\.html|\/products\/)/i.test(href)) continue;
        let card=link, chosen=null;
        for(let i=0;i<10 && card && card!==document.body;i++,card=card.parentElement){
          const txt=textOf(card);
          if(card.querySelector('img') && /৳|BDT|Tk\.?|টাকা/i.test(txt) && txt.length<2500){ chosen=card; break; }
        }
        if(!chosen) continue;
        const name=(link.getAttribute('title') || textOf(link) || findProductName(chosen) || '').replace(/\s+/g,' ').trim();
        const price=findPrice(chosen), image=findImage(chosen);
        if(!name || (!price && !image)) continue;
        const key=(name+'|'+href).toLowerCase(); if(seen.has(key)) continue; seen.add(key);
        output.push({'product name':name.slice(0,220),'live price':price,'product image':image,'product url':href,'availability':''});
        if(output.length>=100) break;
      }
    }
    return output;
  }

  function extractProducts(){
    let results=darazProducts();
    if(!results.length) results=waltonProducts();
    if(!results.length) results=jsonLdProducts();

    if(!results.length){
      const selectors = [
        '[itemtype*="Product"]','[data-product-id]','[data-product]','[class*="product-card"]','[class*="product-item"]',
        '.product-layout','.product-thumb','.product-grid','.product-list','.grid__item','[class*="card-wrapper"]',
        '[class*="product-grid"] > *','[class*="products"] > *','[class*="listing"] > article','article'
      ];
      const cards=[];
      const seenNodes=new Set();
      for(const selector of selectors){
        document.querySelectorAll(selector).forEach(el=>{
          if(seenNodes.has(el)) return;
          const txt=textOf(el);
          if(txt.length<3 || txt.length>3000) return;
          if(!el.querySelector('img')) return;
          seenNodes.add(el); cards.push(el);
        });
      }
      const seen=new Set();
      results=[];
      for(const card of cards){
        const productName=findProductName(card);
        const livePrice=findPrice(card);
        const productImage=findImage(card);
        const productUrl=findProductUrl(card);
        if(!productName || (!livePrice && !productImage)) continue;
        const key=(productName+'|'+productUrl).toLowerCase();
        if(seen.has(key)) continue;
        seen.add(key);
        results.push({
          'product name': productName,
          'live price': livePrice,
          'product image': productImage,
          'product url': productUrl,
          'availability': ((textOf(card).match(/AVAILABLE|LIMITED|OUT OF STOCK/i)||[])[0] || '')
        });
        if(results.length>=100) break;
      }
    }

    return {
      query: new URLSearchParams(location.search).get('q') || new URLSearchParams(location.search).get('search') || '',
      sourceUrl: location.href,
      pageTitle: document.title || '',
      resultCount: results.length,
      results,
      extractedAt: new Date().toISOString()
    };
  }





  // ==================== AUTONOMOUS BROWSER AGENT (v1.8.0) ====================
  function agentVisible(el){
    if(!el) return false;
    const r=el.getBoundingClientRect();
    const st=getComputedStyle(el);
    return r.width>2 && r.height>2 && st.display!=='none' && st.visibility!=='hidden' && Number(st.opacity||1)>0;
  }
  function agentText(el){
    return String(el?.innerText || el?.textContent || el?.getAttribute?.('aria-label') || el?.getAttribute?.('title') || el?.getAttribute?.('placeholder') || '').replace(/\s+/g,' ').trim();
  }
  function agentCandidates(selector='button,a,[role="button"],input,div[tabindex],span[tabindex]'){
    return Array.from(document.querySelectorAll(selector)).filter(agentVisible);
  }
  function agentFindByText(words, selector){
    const wanted=(Array.isArray(words)?words:[words]).map(x=>norm(x)).filter(Boolean);
    let best=null,bestScore=0;
    for(const el of agentCandidates(selector)){
      const t=norm(agentText(el)); if(!t) continue;
      let score=0;
      for(const w of wanted){ if(t===w) score=Math.max(score,100); else if(t.startsWith(w)||t.endsWith(w)) score=Math.max(score,80); else if(t.includes(w)) score=Math.max(score,60); }
      if(score>bestScore){best=el;bestScore=score;}
    }
    return best;
  }
  function agentClick(el){
    if(!el) return false;
    try{ el.scrollIntoView({block:'center',inline:'center'}); }catch(e){}
    try{ el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true})); el.click(); return true; }catch(e){ return false; }
  }
  function nativeSet(el,value){
    try{
      el.focus();
      const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
      if(setter) setter.call(el,value); else el.value=value;
      el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
      return true;
    }catch(e){ try{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));return true;}catch(_){return false;} }
  }
  function fieldScore(el, terms){
    const txt=nearbyText(el); let score=0;
    for(const term of terms){ const t=norm(term); if(txt===t) score+=100; else if(txt.includes(t)) score+=30; }
    if(el.getAttribute('role')==='combobox') score+=8;
    if(el.type==='search') score+=5;
    return score;
  }
  function findSemanticInput(terms, exclude=[]){
    let best=null,bestScore=0;
    for(const el of Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="password"]),textarea,[contenteditable="true"]')).filter(agentVisible)){
      const txt=nearbyText(el);
      if(exclude.some(x=>txt.includes(norm(x)))) continue;
      const score=fieldScore(el,terms);
      if(score>bestScore){best=el;bestScore=score;}
    }
    return bestScore>=20?best:null;
  }
  function findSemanticControl(terms, exclude=[]){
    const wanted=terms.map(norm);
    let best=null,bestScore=0;
    const selector='input:not([type="hidden"]),textarea,[contenteditable="true"],button,[role="button"],[role="combobox"],[aria-haspopup="listbox"],label,div[tabindex]';
    for(const el of Array.from(document.querySelectorAll(selector)).filter(agentVisible)){
      const txt=nearbyText(el);
      if(exclude.some(x=>txt.includes(norm(x)))) continue;
      let score=0;
      for(const w of wanted){ if(txt===w)score=Math.max(score,100); else if(txt.includes(w))score=Math.max(score,45); }
      if(el.matches('input,textarea,[contenteditable="true"],[role="combobox"]')) score+=10;
      if(score>bestScore){best=el;bestScore=score;}
    }
    return bestScore>=25?best:null;
  }
  async function resolveSemanticInput(terms,exclude=[]){
    let input=findSemanticInput(terms,exclude);
    if(input)return input;
    const ctl=findSemanticControl(terms,exclude);
    if(!ctl)return null;
    agentClick(ctl); await new Promise(r=>setTimeout(r,250));
    input=findSemanticInput(terms,exclude);
    if(input)return input;
    if(ctl.matches('input,textarea,[contenteditable="true"]'))return ctl;
    const nested=ctl.querySelector?.('input:not([type="hidden"]),textarea,[contenteditable="true"]');
    return nested&&agentVisible(nested)?nested:null;
  }
  function searchSubmitButton(){
    return agentFindByText(['search flights','find flights','show flights','search','find'], 'button,a,[role="button"],input[type="submit"]') ||
      Array.from(document.querySelectorAll('button[type="submit"],input[type="submit"]')).find(agentVisible) || null;
  }

  async function fillAutocomplete(el,value){
    if(!el||!value) return {ok:false};
    try{ agentClick(el); if(el.select) el.select(); }catch(e){}
    nativeSet(el,value);
    await new Promise(r=>setTimeout(r,700));
    const v=norm(value);
    const options=Array.from(document.querySelectorAll('[role="option"],li,[class*="suggest"],[class*="autocomplete"],[class*="dropdown"] [role="button"],[class*="airport"]')).filter(agentVisible);
    let best=null,score=0;
    for(const opt of options){
      const t=norm(agentText(opt)); if(!t) continue;
      let sc=t===v?100:t.includes(v)?80:(v.split(' ').some(x=>x.length>2&&t.includes(x))?45:0);
      if(sc>score){best=opt;score=sc;}
    }
    if(best){agentClick(best);await new Promise(r=>setTimeout(r,450));return {ok:true,selected:agentText(best)};}
    el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true}));
    el.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter',bubbles:true}));
    await new Promise(r=>setTimeout(r,250));
    return {ok:true,selected:value};
  }
  function extractTravelResults(){
    const candidates=Array.from(document.querySelectorAll('article,li,[class*="flight"],[class*="result"],[class*="itinerary"],[class*="ticket"],[data-testid*="flight"]')).filter(agentVisible);
    const results=[]; const seen=new Set();
    for(const el of candidates){
      const txt=agentText(el); if(txt.length<35||txt.length>1800) continue;
      if(!/(flight|airline|nonstop|stop|duration|depart|arrival|am|pm|৳|bdt|usd|\$|sar|riyadh|jeddah|dhaka|dac)/i.test(txt)) continue;
      const price=(txt.match(/(?:৳|BDT|US\$|USD|SAR|\$)\s*[\d,.]+|[\d,.]+\s*(?:BDT|USD|SAR|taka|tk)/i)||[])[0]||'';
      const key=txt.slice(0,180).toLowerCase(); if(seen.has(key))continue;seen.add(key);
      const a=el.querySelector('a[href]');
      results.push({'result type':'flight','title':txt.slice(0,180),'live price':price,'details':txt.slice(0,900),'result url':a?new URL(a.href,location.href).href:location.href});
      if(results.length>=80)break;
    }
    return {ok:true,sourceUrl:location.href,pageTitle:document.title||'',resultCount:results.length,results,extractedAt:new Date().toISOString()};
  }
  async function autonomousAgent(intent){
    const log=[]; const goal=String(intent.transcript||intent.goal||'').trim();
    const travel=intent.travel||{};
    const clickTerms=async(terms,label)=>{const el=agentFindByText(terms);if(el){agentClick(el);log.push({action:'click',target:label||agentText(el),status:'done'});await new Promise(r=>setTimeout(r,450));return true;}return false;};
    await clickTerms(['accept all','accept cookies','agree','allow all'],'cookie consent');
    if(intent.agentType==='travel' || travel.origin || travel.destination || /\bflights?\b/i.test(goal)){
      // On a result/verification page, do not start the search over again.
      const already=extractTravelResults();
      if(intent.verificationPass && already.resultCount){
        return {...already,agent:{goal,steps:[{action:'verify',target:'flight result page',status:'done'}],status:'goal_reached',usedExistingDateDefault:!travel.departDate}};
      }
      // Many travel homepages require selecting the Flights product first.
      await clickTerms(['flights','flight','book a flight','book flight'],'Flights');
      const origin=travel.origin||''; const destination=travel.destination||'';
      let from=await resolveSemanticInput(['from','origin','departure airport','departure city','leaving from','flying from'],['date','time','return']);
      let to=await resolveSemanticInput(['to','destination','arrival airport','arrival city','going to','flying to'],['date','time','return']);
      if(origin){
        if(from){const r=await fillAutocomplete(from,origin);log.push({action:'fill',field:'origin',value:origin,status:r.ok?'done':'failed',selected:r.selected||''});}
        else log.push({action:'fill',field:'origin',value:origin,status:'not_found'});
      }
      if(destination){
        if(to){const r=await fillAutocomplete(to,destination);log.push({action:'fill',field:'destination',value:destination,status:r.ok?'done':'failed',selected:r.selected||''});}
        else log.push({action:'fill',field:'destination',value:destination,status:'not_found'});
      }
      if(travel.departDate){
        const d=await resolveSemanticInput(['depart','departure date','travel date','date'],['return']);
        if(d){nativeSet(d,travel.departDate);log.push({action:'fill',field:'departDate',value:travel.departDate,status:'done'});}
        else log.push({action:'fill',field:'departDate',value:travel.departDate,status:'not_found'});
      }
      const missing=[]; if(origin&&!from)missing.push('origin field'); if(destination&&!to)missing.push('destination field');
      if(missing.length){
        return {ok:true,sourceUrl:location.href,pageTitle:document.title||'',resultCount:0,results:[],agent:{goal,steps:log,status:'needs_user_action',reason:`Could not reliably locate ${missing.join(' and ')} on this page.`}};
      }
      const searchBtn=searchSubmitButton();
      if(searchBtn){
        agentClick(searchBtn);log.push({action:'click',target:'Search flights',status:'done'});
        // Return quickly enough that full-page navigation does not destroy the extension message channel.
        await new Promise(r=>setTimeout(r,700));
      }else{
        log.push({action:'click',target:'Search flights',status:'not_found'});
      }
      const extracted=extractTravelResults();
      const status=extracted.resultCount?'goal_reached':(searchBtn?'search_submitted':'needs_user_action');
      return {...extracted,agent:{goal,steps:log,status,usedExistingDateDefault:!travel.departDate,reason:searchBtn?'Search submitted; background verifier will inspect the final result page.':'Could not reliably locate the flight search button.'}};
    }
    return {ok:false,error:'The autonomous agent could not map this instruction to a supported action plan yet.',sourceUrl:location.href,pageTitle:document.title||'',resultCount:0,results:[],agent:{goal,steps:log,status:'needs_user_action'}};
  }


  // Website <-> extension bridge. This lets the APIGarden website use the same
  // real-tab automation engine as the popup whenever the extension is installed.
  document.addEventListener('APIGARDEN_WEB_RUN_VOICE', async (event)=>{
    try{
      let payload={};
      try{ payload=JSON.parse(document.documentElement.getAttribute('data-apigarden-web-voice-request') || '{}'); }
      catch(e){ payload=event.detail || {}; }
      const response=await chrome.runtime.sendMessage({
        type:'APIGARDEN_RUN_VOICE_API',
        intent:payload.intent || {},
        runKind:'web',
        runId:payload.runId || payload.intent?.id || ''
      });
      document.documentElement.setAttribute('data-apigarden-web-voice-result',JSON.stringify(response || {ok:false,error:'No response'}));
      document.dispatchEvent(new CustomEvent('APIGARDEN_WEB_RUN_VOICE_RESULT'));
    }catch(error){
      document.documentElement.setAttribute('data-apigarden-web-voice-result',JSON.stringify({ok:false,error:error.message || String(error)}));
      document.dispatchEvent(new CustomEvent('APIGARDEN_WEB_RUN_VOICE_RESULT'));
    }
  });

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
    if(msg && msg.type === 'APIGARDEN_AUTONOMOUS_AGENT'){
      autonomousAgent(msg.intent || {}).then(sendResponse).catch(error=>sendResponse({ok:false,error:error.message||String(error),sourceUrl:location.href,pageTitle:document.title||'',resultCount:0,results:[]}));
      return true;
    }
    if(msg && msg.type === 'APIGARDEN_VOICE_FILTER_PRODUCTS'){
      const query=String(msg.query || '').toLowerCase().trim();
      const minPrice=msg.minPrice==null ? null : Number(msg.minPrice);
      const maxPrice=msg.maxPrice==null ? null : Number(msg.maxPrice);
      const toNumber=(value)=>{
        const match=String(value||'').replace(/,/g,'').match(/\d+(?:\.\d+)?/);
        return match ? Number(match[0]) : null;
      };
      const matchesRange=(value)=>{
        const n=toNumber(value);
        if(n==null) return minPrice==null && maxPrice==null;
        if(minPrice!=null && n<minPrice) return false;
        if(maxPrice!=null && n>maxPrice) return false;
        return true;
      };

      // Apply the spoken price range visibly on common ecommerce product cards.
      const cardSelectors=[
        '[itemtype*="Product"]','[data-product-id]','[data-product]','[class*="product-card"]','[class*="product-item"]',
        '.product-layout','.product-thumb','.product-grid','.product-list','.grid__item','[class*="card-wrapper"]','article'
      ];
      const cards=[]; const seen=new Set();
      for(const selector of cardSelectors){
        document.querySelectorAll(selector).forEach(card=>{
          if(seen.has(card) || !card.querySelector('img')) return;
          seen.add(card); cards.push(card);
        });
      }
      let shown=0;
      for(const card of cards){
        const txt=textOf(card).toLowerCase();
        const price=findPrice(card) || extractPrice(txt);
        const priceOk=matchesRange(price);
        // The website's own search page already enforces the spoken product query.
        // Here we only enforce the spoken price range so model/product names that
        // do not literally repeat the query are not incorrectly hidden.
        const keep=priceOk;
        if(!card.dataset.apigardenOriginalDisplay) card.dataset.apigardenOriginalDisplay=card.style.display || '__EMPTY__';
        card.style.display=keep ? (card.dataset.apigardenOriginalDisplay==='__EMPTY__'?'':card.dataset.apigardenOriginalDisplay) : 'none';
        if(keep) shown++;
      }

      let data=extractProducts();
      data.results=(data.results||[]).filter(item=>{
        return matchesRange(item['live price']);
      });
      data.resultCount=data.results.length;
      data.query=query || data.query || '';

      // Small confirmation strip on the website so the user can visually verify the run.
      let banner=document.getElementById('apigarden-voice-banner');
      if(!banner){
        banner=document.createElement('div'); banner.id='apigarden-voice-banner';
        Object.assign(banner.style,{position:'fixed',top:'12px',left:'50%',transform:'translateX(-50%)',zIndex:'2147483647',background:'#1f2551',color:'#fff',padding:'10px 16px',borderRadius:'12px',fontFamily:'Arial,sans-serif',fontSize:'13px',fontWeight:'700',boxShadow:'0 12px 30px rgba(0,0,0,.25)',maxWidth:'90vw',textAlign:'center'});
        document.documentElement.appendChild(banner);
      }
      const rangeText=(minPrice!=null || maxPrice!=null) ? ` · Price ${minPrice!=null?'৳'+minPrice:'any'}–${maxPrice!=null?'৳'+maxPrice:'any'}` : '';
      banner.textContent=`APIGarden Voice API: ${query || 'products'}${rangeText} · ${data.resultCount} matching products`;
      sendResponse({ok:true,...data,visualFilterApplied:true,visibleCards:shown});
      return true;
    }
    if(msg && msg.type === 'APIGARDEN_EXTRACT_PRODUCTS'){
      const data = extractProducts();
      sendResponse({ok:true, ...data});
      return true;
    }
  });
})();
