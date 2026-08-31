(function(){
  const money=n=>`₹${(Number(n)||0).toFixed(2)}`;
  const num=v=>Math.max(0,Number(v)||0);
  const grand=()=>num(String(document.getElementById('grandTotalText')?.textContent||'0').replace(/[^0-9.-]/g,''));
  const rows=()=>Array.from(document.querySelectorAll('#paymentRows .split-payment-row'));
  let initTimer=null;

  function rowHtml(method='cash',amount=''){
    return `<div class="split-payment-row" style="border:1px solid #dbe7e3;border-radius:12px;padding:12px;margin-top:10px;background:#fff">
      <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end">
        <label class="erp-field">Method<select class="split-method"><option value="cash" ${method==='cash'?'selected':''}>Cash</option><option value="upi" ${method==='upi'?'selected':''}>UPI</option><option value="card" ${method==='card'?'selected':''}>Card</option><option value="bank_transfer" ${method==='bank_transfer'?'selected':''}>Bank Transfer</option></select></label>
        <label class="erp-field"><span class="split-amount-label">Amount</span><input class="split-amount" type="number" min="0" step="0.01" value="${amount}"></label>
        <button type="button" class="erp-btn-danger split-remove">×</button>
      </div>
      <label class="erp-field split-reference-wrap" style="margin-top:8px">Reference<input class="split-reference" placeholder="Optional transaction reference"></label>
      <div class="split-cash-wrap" style="margin-top:8px;display:none"><label class="erp-field">Cash Received<input class="split-cash-received" type="number" min="0" step="0.01" placeholder="Cash given by customer"></label><small>Return: <strong class="split-change">₹0.00</strong></small></div>
    </div>`;
  }

  function ensure(){
    const host=document.getElementById('paymentRows');
    if(!host||host.children.length) return false;
    host.insertAdjacentHTML('beforeend',rowHtml('cash',''));
    sync();
    return true;
  }

  function ensureWhenReady(){
    if(initTimer) clearInterval(initTimer);
    let tries=0;
    const attempt=()=>{
      tries++;
      if(document.getElementById('splitPaymentPanel')){
        ensure();
        wireRpc();
        if(initTimer){clearInterval(initTimer);initTimer=null;}
        return;
      }
      if(tries>=20&&initTimer){clearInterval(initTimer);initTimer=null;}
    };
    attempt();
    if(!document.getElementById('splitPaymentPanel')) initTimer=setInterval(attempt,100);
  }

  function sync(){
    const due=grand();
    const rs=rows();
    if(!rs.length){ensure();return;}
    let nonCashTotal=0;
    rs.forEach(r=>{const method=r.querySelector('.split-method').value;if(method!=='cash') nonCashTotal+=num(r.querySelector('.split-amount').value);});
    let cashRemaining=Math.max(0,due-nonCashTotal),paid=nonCashTotal;
    rs.forEach(r=>{
      const method=r.querySelector('.split-method').value,amountInput=r.querySelector('.split-amount'),label=r.querySelector('.split-amount-label'),referenceWrap=r.querySelector('.split-reference-wrap'),cashWrap=r.querySelector('.split-cash-wrap');
      if(method==='cash'){
        const received=num(r.querySelector('.split-cash-received').value),applied=Math.min(received,cashRemaining);
        amountInput.value=applied.toFixed(2);amountInput.readOnly=true;amountInput.title='Automatically applied from Cash Received';if(label)label.textContent='Applied to Bill';referenceWrap.style.display='none';cashWrap.style.display='';r.querySelector('.split-change').textContent=money(Math.max(0,received-applied));paid+=applied;cashRemaining=Math.max(0,cashRemaining-applied);
      }else{
        amountInput.readOnly=false;amountInput.title='';if(label)label.textContent='Amount';referenceWrap.style.display='';cashWrap.style.display='none';
      }
    });
    const balance=Math.max(0,due-paid),totalEl=document.getElementById('splitTotalPaidText'),balEl=document.getElementById('splitBalanceText');
    if(totalEl)totalEl.textContent=money(paid);if(balEl)balEl.textContent=money(balance);
    const legacyPaid=document.getElementById('amountPaid');if(legacyPaid)legacyPaid.value=paid.toFixed(2);
    const notice=document.getElementById('creditPaymentNotice'),noticeText=document.getElementById('creditPaymentNoticeText');
    if(notice){notice.style.display=balance>0?'':'none';if(noticeText)noticeText.textContent=balance>0?`Outstanding ${money(balance)} — customer selection required for credit.`:'';}
  }

  function getPayments(){
    sync();
    return rows().map(r=>({payment_method:r.querySelector('.split-method').value,amount:num(r.querySelector('.split-amount').value),transaction_reference:r.querySelector('.split-reference').value.trim()})).filter(p=>p.amount>0);
  }

  function validate(){
    const due=grand(),payments=getPayments(),paid=payments.reduce((s,p)=>s+p.amount,0),balance=Math.max(0,due-paid);
    if(paid>due+0.009)throw new Error('Total payment cannot exceed bill amount.');
    if(balance>0&&!document.getElementById('customerId')?.value)throw new Error('Select a customer before saving a credit or partial-payment sale.');
    return{payments,paid,balance};
  }

  function wireRpc(){
    if(!window.supabaseClient||window.supabaseClient.__medvikaSplitPaymentWired)return;
    const originalRpc=window.supabaseClient.rpc.bind(window.supabaseClient);
    window.supabaseClient.rpc=async function(name,params,options){
      if((name==='create_sales_invoice_v2'||name==='update_sales_invoice_v2')&&document.getElementById('splitPaymentPanel')){
        const split=validate();params={...(params||{}),p_payments:split.payments};const saleType=document.getElementById('saleType');if(split.balance>0&&saleType&&saleType.value!=='credit')saleType.value='credit';if(params&&split.balance>0)params.p_sale_type='credit';
      }
      return originalRpc(name,params,options);
    };
    window.supabaseClient.__medvikaSplitPaymentWired=true;
  }

  document.addEventListener('click',e=>{
    if(e.target?.id==='addPaymentRow'){e.preventDefault();document.getElementById('paymentRows')?.insertAdjacentHTML('beforeend',rowHtml('upi',''));sync();}
    if(e.target?.classList?.contains('split-remove')){e.preventDefault();e.target.closest('.split-payment-row')?.remove();ensure();sync();}
    if(e.target?.closest?.('a[href="#sales"], [data-route="sales"]'))setTimeout(ensureWhenReady,0);
  });
  document.addEventListener('input',e=>{if(e.target?.closest?.('#splitPaymentPanel'))sync();});
  document.addEventListener('change',e=>{if(e.target?.closest?.('#splitPaymentPanel'))sync();});
  document.addEventListener('submit',e=>{if(e.target?.id==='salesForm'){sync();wireRpc();}},true);
  window.addEventListener('hashchange',()=>{if(location.hash.replace(/^#/,'').split('?')[0]==='sales')ensureWhenReady();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureWhenReady,{once:true});else ensureWhenReady();
  window.MedvikaSplitPayment={ensure,ensureWhenReady,sync,getPayments,validate,wireRpc};
})();