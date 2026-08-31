(function(){
 const num=v=>Math.max(0,Number(v)||0),money=v=>`₹${num(v).toFixed(2)}`;
 let summary=null,requestSeq=0;
 const $=id=>document.getElementById(id);
 function balance(){return num(String($('splitBalanceText')?.textContent||'0').replace(/[^0-9.-]/g,''));}
 function ensureCard(){
  if($('salesCreditControl'))return;
  const customer=$('customerId');if(!customer)return;
  const card=document.createElement('div');card.id='salesCreditControl';card.style.cssText='margin-top:10px;padding:12px;border:1px solid #dbe7e3;border-radius:12px;background:#f8fbfa;display:none';
  card.innerHTML='<small style="font-weight:700">Customer Credit</small><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px"><div><small>Outstanding</small><strong id="salesCreditOutstanding" style="display:block">₹0.00</strong></div><div><small>Credit Limit</small><strong id="salesCreditLimit" style="display:block">₹0.00</strong></div><div><small>Available Credit</small><strong id="salesCreditAvailable" style="display:block">₹0.00</strong></div></div><div id="salesCreditMessage" style="margin-top:8px;font-size:12px"></div>';
  customer.closest('.erp-field')?.insertAdjacentElement('afterend',card);
 }
 function render(){
  ensureCard();const card=$('salesCreditControl'),id=$('customerId')?.value;if(!card)return;
  if(!id){card.style.display='none';return;}card.style.display='';
  $('salesCreditOutstanding').textContent=money(summary?.total_outstanding);$('salesCreditLimit').textContent=money(summary?.credit_limit);$('salesCreditAvailable').textContent=money(summary?.available_credit);
  const b=balance(),msg=$('salesCreditMessage');
  if(!summary){msg.textContent='Credit details loading…';msg.style.color='#64748b';return;}
  if(b<=0){msg.textContent='Fully paid sale — customer credit is not used.';msg.style.color='#08775a';return;}
  if(b>num(summary.available_credit)){msg.textContent=`Credit blocked: ${money(b)} balance exceeds available credit ${money(summary.available_credit)}.`;msg.style.color='#b42318';}
  else{msg.textContent=`After this sale, available credit will be ${money(num(summary.available_credit)-b)}.`;msg.style.color='#08775a';}
 }
 async function load(){
  ensureCard();const id=$('customerId')?.value;summary=null;render();if(!id||!window.supabaseClient)return;
  const seq=++requestSeq;const {data,error}=await supabaseClient.from('customer_receivables_summary').select('*').eq('customer_id',id).maybeSingle();if(seq!==requestSeq)return;if(error){console.warn('Credit summary unavailable',error);return;}summary=data||{customer_id:id,total_outstanding:0,credit_limit:0,available_credit:0};render();
 }
 function validate(){
  const b=balance(),id=$('customerId')?.value;if(b<=0)return true;if(!id)throw new Error('Select a customer before saving a credit or partial-payment sale.');if(!summary)throw new Error('Customer credit details are still loading. Please try again.');if(b>num(summary.available_credit)+.009)throw new Error(`Credit limit exceeded. Available credit is ${money(summary.available_credit)}; this sale needs ${money(b)} credit.`);return true;
 }
 document.addEventListener('change',e=>{if(e.target?.id==='customerId')load();});
 document.addEventListener('input',e=>{if(e.target?.closest?.('#splitPaymentPanel'))setTimeout(render,0);});
 document.addEventListener('change',e=>{if(e.target?.closest?.('#splitPaymentPanel'))setTimeout(render,0);});
 document.addEventListener('click',e=>{if(e.target?.closest?.('a[href="#sales"], [data-route="sales"]'))setTimeout(()=>{ensureCard();load();},300);});
 document.addEventListener('submit',e=>{if(e.target?.id!=='salesForm')return;try{validate();}catch(err){e.preventDefault();e.stopImmediatePropagation();window.MedvikaUI?.toast(err.message,'error');}},true);
 window.MedvikaSalesCreditControl={load,render,validate,getSummary:()=>summary};
})();