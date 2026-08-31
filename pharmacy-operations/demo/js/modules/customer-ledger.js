window.initCustomerLedgerModule=async function(){
 const UI=window.MedvikaUI,$=id=>document.getElementById(id),pid=window.MedvikaAuth?.profile?.pharmacy_id;
 const num=v=>Number.isFinite(Number(v))?Number(v):0,money=v=>UI.money(num(v)),safe=v=>UI.safe(v??"");
 const toast=(m,t="success")=>UI.toast(m,t==="danger"?"error":t);
 let customers=[],invoices=[],payments=[],returns=[],summaries=[],ledger=[],shown=[];
 if(!pid){toast("Pharmacy profile not available.","danger");return;}
 const dk=value=>{if(!value)return "";const raw=String(value);if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;const d=value instanceof Date?value:new Date(value);if(Number.isNaN(d.getTime()))return "";const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");return `${y}-${m}-${day}`;};
 const displayDate=value=>{const key=dk(value);if(!key)return "—";const [y,m,d]=key.split("-");return `${d}/${m}/${y}`;};
 const displayDateTime=value=>value?new Date(value).toLocaleString("en-IN"):"—";
 function dates(){const d=new Date(),f=new Date(d.getFullYear(),d.getMonth(),1),local=x=>new Date(x.getTime()-x.getTimezoneOffset()*60000).toISOString().slice(0,10);$("clFrom").value=local(f);$("clTo").value=local(d);}
 async function load(){
  const [c,i,p,r,s]=await Promise.all([
   supabaseClient.from("customers").select("*").eq("pharmacy_id",pid).eq("is_active",true).order("full_name").limit(10000),
   supabaseClient.from("sales_invoices").select("*").eq("pharmacy_id",pid).order("invoice_date").limit(30000),
   supabaseClient.from("sales_payments").select("*").eq("pharmacy_id",pid).order("payment_date").limit(30000),
   supabaseClient.from("sales_returns").select("*").eq("pharmacy_id",pid).order("return_date").limit(30000),
   supabaseClient.from("customer_receivables_summary").select("*").eq("pharmacy_id",pid).limit(10000)
  ]);
  const err=[c,i,p,r,s].find(x=>x.error)?.error;if(err)throw err;
  customers=c.data||[];invoices=i.data||[];payments=p.data||[];returns=r.data||[];summaries=s.data||[];
  const current=$("clCustomer").value;
  $("clCustomer").innerHTML='<option value="">Select customer</option>'+customers.map(x=>`<option value="${x.id}">${safe(x.full_name)}${x.mobile?` — ${safe(x.mobile)}`:""}</option>`).join("");
  if(current&&customers.some(x=>x.id===current))$("clCustomer").value=current;
  render();
 }
 function build(customer){
  const inv=invoices.filter(x=>x.customer_id===customer.id&&String(x.invoice_status||"").toLowerCase()!=="cancelled"),invMap=new Map(inv.map(x=>[x.id,x])),rows=[];
  inv.forEach(x=>rows.push({date:x.invoice_date||x.created_at,type:"SALE",ref:x.invoice_number||"—",desc:"Sales invoice",debit:num(x.grand_total),credit:0,sort:1}));
  payments.filter(x=>invMap.has(x.sales_invoice_id)&&num(x.amount)>0).forEach(x=>{const iv=invMap.get(x.sales_invoice_id);rows.push({date:x.payment_date||x.created_at,type:"RECEIPT",ref:x.transaction_reference||iv?.invoice_number||"—",desc:`Receipt against ${iv?.invoice_number||"invoice"} · ${String(x.payment_method||"").replaceAll("_"," ")}`,debit:0,credit:num(x.amount),sort:2});});
  returns.filter(x=>invMap.has(x.sales_invoice_id)&&String(x.return_status||"").toLowerCase()!=="cancelled"&&num(x.refund_amount)>0).forEach(x=>{const iv=invMap.get(x.sales_invoice_id);rows.push({date:x.return_date||x.created_at,type:"SALES RETURN",ref:x.return_number||"—",desc:`Return against ${iv?.invoice_number||"invoice"}`,debit:0,credit:num(x.refund_amount),sort:3});});
  rows.sort((a,b)=>new Date(a.date||0)-new Date(b.date||0)||a.sort-b.sort);let bal=num(customer.opening_balance);rows.forEach(x=>{bal=Math.max(0,bal+x.debit-x.credit);x.balance=bal;});return {rows,balance:bal,inv};
 }
 function render(){
  const id=$("clCustomer").value,c=customers.find(x=>x.id===id),summary=summaries.find(x=>x.customer_id===id);
  if(!c){$("clName").textContent="Select a customer";$("clMeta").textContent="—";["clOpening","clLimit","clReceivable","clAvailableCredit","clSales","clReceipts","clReturns","clNet"].forEach(x=>$(x).textContent=money(0));$("clReceiveHint").textContent="Select a customer with an outstanding balance.";$("clReceivePayment").disabled=true;$("clTable").innerHTML='<tr><td colspan="7" class="empty">Select a customer.</td></tr>';$("clOutstanding").innerHTML='<tr><td colspan="6" class="empty">Select a customer.</td></tr>';return;}
  const built=build(c);ledger=built.rows;const outstanding=num(summary?.total_outstanding??built.balance);
  $("clName").textContent=c.full_name;$("clMeta").textContent=[c.customer_code,c.mobile,c.customer_type].filter(Boolean).join(" · ")||"Customer";
  $("clOpening").textContent=money(summary?.opening_balance_due??c.opening_balance);$("clLimit").textContent=money(summary?.credit_limit??c.credit_limit);$("clReceivable").textContent=money(outstanding);$("clAvailableCredit").textContent=money(summary?.available_credit);
  $("clReceivePayment").disabled=outstanding<=0;$("clReceiveHint").textContent=outstanding>0?`Outstanding ${money(outstanding)} · payment will be allocated oldest invoice first.`:"No outstanding balance for this customer.";
  const from=$("clFrom").value,to=$("clTo").value,q=$("clSearch").value.trim().toLowerCase();shown=ledger.filter(x=>{const d=dk(x.date),txt=[x.type,x.ref,x.desc].join(" ").toLowerCase();return(!from||d>=from)&&(!to||d<=to)&&(!q||txt.includes(q));});
  const s=shown.reduce((a,x)=>a+x.debit,0),cr=shown.filter(x=>x.type==="RECEIPT").reduce((a,x)=>a+x.credit,0),rt=shown.filter(x=>x.type==="SALES RETURN").reduce((a,x)=>a+x.credit,0);$("clSales").textContent=money(s);$("clReceipts").textContent=money(cr);$("clReturns").textContent=money(rt);$("clNet").textContent=money(s-cr-rt);$("clTxnCount").textContent=`${shown.length} transaction${shown.length===1?"":"s"}`;
  $("clTable").innerHTML=shown.length?shown.map(x=>`<tr><td>${displayDateTime(x.date)}</td><td>${safe(x.type)}</td><td><b>${safe(x.ref)}</b></td><td>${safe(x.desc)}</td><td>${x.debit?money(x.debit):"—"}</td><td>${x.credit?money(x.credit):"—"}</td><td><b>${money(x.balance)}</b></td></tr>`).join(""):'<tr><td colspan="7" class="empty">No ledger transactions in this period.</td></tr>';
  const outs=built.inv.filter(x=>num(x.balance_amount)>0);$("clOutstandingCount").textContent=`${outs.length} invoice${outs.length===1?"":"s"}`;$("clOutstanding").innerHTML=outs.length?outs.sort((a,b)=>dk(a.invoice_date).localeCompare(dk(b.invoice_date))).map(x=>`<tr><td>${displayDate(x.invoice_date)}</td><td><b>${safe(x.invoice_number)}</b></td><td>${money(x.grand_total)}</td><td>${money(x.amount_paid)}</td><td><b>${money(x.balance_amount)}</b></td><td>${safe(x.payment_status||"unpaid")}</td></tr>`).join(""):'<tr><td colspan="6" class="empty">No outstanding invoices.</td></tr>';
 }
 async function receivePayment(){
  const customerId=$("clCustomer").value,amount=num($("clReceiveAmount").value),method=$("clReceiveMethod").value,reference=$("clReceiveReference").value.trim(),notes=$("clReceiveNotes").value.trim();
  if(!customerId){toast("Select a customer first.","warning");return;}if(amount<=0){toast("Enter the amount received.","warning");return;}
  const summary=summaries.find(x=>x.customer_id===customerId),outstanding=num(summary?.total_outstanding);if(amount>outstanding+.009){toast(`Amount cannot exceed outstanding ${money(outstanding)}.`,"warning");return;}
  const btn=$("clReceivePayment");btn.disabled=true;btn.textContent="Receiving...";
  try{const {error}=await supabaseClient.rpc("receive_customer_payment_v1",{p_customer_id:customerId,p_amount:amount,p_payment_method:method,p_transaction_reference:reference||null,p_notes:notes||null});if(error)throw error;$("clReceiveAmount").value="";$("clReceiveReference").value="";$("clReceiveNotes").value="";await load();toast("Customer payment received and outstanding updated.");}catch(e){toast(e.message||"Payment could not be received.","danger");}finally{btn.textContent="Receive Payment";render();}
 }
 function exportCsv(){if(!shown.length){toast("No ledger transactions to export.","warning");return;}const esc=v=>`"${String(v??"").replaceAll('"','""')}"`;const lines=[["Date","Type","Reference","Description","Debit","Credit","Running Balance"].map(esc).join(","),...shown.map(x=>[displayDateTime(x.date),x.type,x.ref,x.desc,x.debit.toFixed(2),x.credit.toFixed(2),x.balance.toFixed(2)].map(esc).join(","))];const blob=new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8"}),a=document.createElement("a"),url=URL.createObjectURL(blob);a.href=url;a.download="medvika-customer-ledger.csv";document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);}
 dates();$("clCustomer").onchange=render;$("clApply").onclick=render;$("clFrom").onchange=render;$("clTo").onchange=render;$("clSearch").oninput=render;$("clExport").onclick=exportCsv;$("clReceivePayment").onclick=receivePayment;$("clRefresh").onclick=async()=>{try{await load();toast("Customer Ledger refreshed.");}catch(e){toast(e.message,"danger");}};
 try{await load();}catch(e){toast("Customer Ledger could not load: "+e.message,"danger");}
};