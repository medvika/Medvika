(function(){
  const $=id=>document.getElementById(id);
  const safe=s=>String(s||'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  let customers=[];
  let observedSelect=null;

  function customerSelect(){return $('customerId');}

  function ensurePicker(){
    const select=customerSelect();
    if(!select||$('salesCustomerSearchWrap')) return;
    const wrap=document.createElement('div');
    wrap.id='salesCustomerSearchWrap';
    wrap.className='sales-customer-search-wrap';
    wrap.innerHTML=`<button type="button" id="salesCustomerPickerButton" class="sales-customer-picker-button"><span id="salesCustomerPickerText">Walk-in Customer</span><span>⌄</span></button><div id="salesCustomerPickerPanel" class="sales-customer-picker-panel" hidden><input id="salesCustomerSearchInput" type="search" placeholder="Search customer name or mobile..." autocomplete="off" inputmode="search"><div id="salesCustomerSearchResults" class="sales-customer-search-results"></div></div>`;
    select.style.display='none';
    select.insertAdjacentElement('afterend',wrap);
    $('salesCustomerPickerButton').addEventListener('click',togglePicker);
    $('salesCustomerSearchInput').addEventListener('input',renderResults);
    document.addEventListener('click',e=>{if(!e.target.closest('#salesCustomerSearchWrap'))closePicker();});
    select.addEventListener('change',syncLabel);
    observeSelect(select);
    syncFromSelect();
  }

  function observeSelect(select){
    if(observedSelect===select)return;
    observedSelect=select;
    new MutationObserver(()=>syncFromSelect()).observe(select,{childList:true});
  }

  function syncFromSelect(){
    const select=customerSelect();
    if(!select)return;
    customers=[...select.options].map(o=>({id:o.value,text:o.textContent.trim(),name:(o.textContent.split('—')[0]||o.textContent).trim(),mobile:(o.textContent.split('—')[1]||'').trim()}));
    syncLabel();
  }

  function syncLabel(){
    const select=customerSelect(),label=$('salesCustomerPickerText');
    if(!select||!label)return;
    const text=select.options[select.selectedIndex]?.textContent?.trim()||'Walk-in Customer';
    if(label.textContent!==text)label.textContent=text;
  }

  function togglePicker(){const panel=$('salesCustomerPickerPanel');if(panel){panel.hidden?openPicker():closePicker();}}
  function openPicker(){syncFromSelect();const panel=$('salesCustomerPickerPanel'),input=$('salesCustomerSearchInput');if(!panel||!input)return;panel.hidden=false;input.value='';renderResults();setTimeout(()=>input.focus(),30);}
  function closePicker(){const panel=$('salesCustomerPickerPanel');if(panel)panel.hidden=true;}

  function renderResults(){
    const box=$('salesCustomerSearchResults'),input=$('salesCustomerSearchInput');if(!box||!input)return;
    const q=input.value.trim().toLowerCase();
    const list=customers.filter(c=>!q||`${c.name} ${c.mobile} ${c.text}`.toLowerCase().includes(q)).slice(0,40);
    box.innerHTML=list.length?list.map(c=>`<button type="button" class="sales-customer-result" data-id="${safe(c.id)}"><strong>${safe(c.name||'Walk-in Customer')}</strong>${c.mobile?`<small>${safe(c.mobile)}</small>`:''}</button>`).join(''):'<div class="sales-customer-empty">No customer found</div>';
    box.querySelectorAll('.sales-customer-result').forEach(btn=>{btn.onclick=()=>selectCustomer(btn.dataset.id);});
  }

  function selectCustomer(id){const select=customerSelect();if(!select)return;select.value=id||'';select.dispatchEvent(new Event('change',{bubbles:true}));syncLabel();closePicker();}

  const pageObserver=new MutationObserver(()=>{
    const select=customerSelect();
    if(select&&!$('salesCustomerSearchWrap'))ensurePicker();
    if(!select)observedSelect=null;
  });

  document.addEventListener('DOMContentLoaded',()=>{
    pageObserver.observe(document.getElementById('pageContainer')||document.body,{childList:true,subtree:true});
    ensurePicker();
  });
})();