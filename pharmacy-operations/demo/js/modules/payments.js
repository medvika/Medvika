window.initPaymentsModule=async function(){
  const UI=window.MedvikaUI,$=id=>document.getElementById(id);
  const toast=(m,t="success")=>UI.toast(m,t==="danger"?"error":t);
  const pid=window.MedvikaAuth?.profile?.pharmacy_id;
  const num=v=>Number.isFinite(Number(v))?Number(v):0;
  const safe=v=>UI.safe(v??"");
  const money=v=>UI.money(num(v));
  let rows=[],visible=[];

  if(!pid){toast("Pharmacy profile not available.","danger");return;}

  const mode=v=>{
    const x=String(v||"OTHER").trim().toUpperCase().replace(/[\s-]+/g,"_");
    if(["NEFT","RTGS","IMPS","BANK"].includes(x))return "BANK_TRANSFER";
    if(["CREDIT_NOTE","STORE_CREDIT"].includes(x))return "CREDIT";
    return x||"OTHER";
  };
  const label=v=>mode(v).replaceAll("_"," ");
  const dateKey=value=>{
    if(!value)return "";
    const raw=String(value);if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
    const d=value instanceof Date?value:new Date(value);if(Number.isNaN(d.getTime()))return "";
    const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  };
  const displayDateTime=value=>value?new Date(value).toLocaleString("en-IN"):"—";

  function dates(){
    const d=new Date(), first=new Date(d.getFullYear(),d.getMonth(),1);
    const local=x=>new Date(x.getTime()-x.getTimezoneOffset()*60000).toISOString().slice(0,10);
    $("paymentsFrom").value=local(first);$("paymentsTo").value=local(d);
  }

  async function load(){
    const [sp,pp,s,pi]=await Promise.all([
      supabaseClient.from("supplier_payments").select("*").eq("pharmacy_id",pid).order("payment_date",{ascending:false}).limit(20000),
      supabaseClient.from("purchase_payments").select("*").eq("pharmacy_id",pid).order("payment_date",{ascending:false}).limit(20000),
      supabaseClient.from("suppliers").select("*").eq("pharmacy_id",pid).limit(5000),
      supabaseClient.from("purchase_invoices").select("id,supplier_id,invoice_number,purchase_number,supplier_invoice_number").eq("pharmacy_id",pid).limit(20000)
    ]);
    const err=[sp,pp,s,pi].find(x=>x.error)?.error;if(err)throw err;
    const suppliers=new Map((s.data||[]).map(x=>[x.id,x]));
    const invoices=new Map((pi.data||[]).map(x=>[x.id,x]));
    rows=[];

    (sp.data||[]).forEach(x=>{
      const paymentMode=mode(x.payment_mode),amount=num(x.amount);
      if(amount<=0||paymentMode==="CREDIT")return;
      const sup=suppliers.get(x.supplier_id);
      rows.push({
        date:x.payment_date||x.created_at,source:"SUPPLIER PAYMENT",
        supplier:sup?.name||"Supplier",reference:x.payment_number||"—",
        invoice:"FIFO / Multiple",mode:paymentMode,
        txn:x.reference_number||"",amount
      });
    });

    (pp.data||[]).forEach(x=>{
      const paymentMode=mode(x.payment_method),amount=num(x.amount);
      if(amount<=0||paymentMode==="CREDIT")return;
      const inv=invoices.get(x.purchase_invoice_id),sup=suppliers.get(inv?.supplier_id);
      rows.push({
        date:x.payment_date||x.created_at,source:"PURCHASE PAYMENT",
        supplier:sup?.name||"Supplier",reference:x.transaction_reference||"—",
        invoice:inv?.supplier_invoice_number||inv?.purchase_number||inv?.invoice_number||"—",
        mode:paymentMode,txn:x.transaction_reference||"",amount
      });
    });

    rows.sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));apply();
  }

  function apply(){
    const from=$("paymentsFrom").value,to=$("paymentsTo").value,m=$("paymentsMode").value,src=$("paymentsSource").value,q=$("paymentsSearch").value.trim().toLowerCase();
    visible=rows.filter(x=>{
      const d=dateKey(x.date),text=[x.source,x.supplier,x.reference,x.invoice,x.txn,label(x.mode)].join(" ").toLowerCase();
      return (!from||d>=from)&&(!to||d<=to)&&(!m||x.mode===m)&&(!src||x.source===src)&&(!q||text.includes(q));
    });
    const total=visible.reduce((a,x)=>a+x.amount,0),cash=visible.filter(x=>x.mode==="CASH").reduce((a,x)=>a+x.amount,0);
    $("paymentsTotal").textContent=money(total);$("paymentsCount").textContent=visible.length;$("paymentsCash").textContent=money(cash);$("paymentsDigital").textContent=money(total-cash);
    $("paymentsResultCount").textContent=`${visible.length} row${visible.length===1?"":"s"}`;
    $("paymentsTable").innerHTML=visible.length?visible.map(x=>`<tr><td>${displayDateTime(x.date)}</td><td>${safe(x.source)}</td><td><b>${safe(x.supplier)}</b></td><td>${safe(x.reference)}</td><td>${safe(x.invoice)}</td><td>${safe(label(x.mode))}</td><td>${safe(x.txn||"—")}</td><td><b>${money(x.amount)}</b></td></tr>`).join(""):'<tr><td colspan="8" class="empty">No payments found.</td></tr>';
  }

  function exportCsv(){
    if(!visible.length){toast("No payments to export.","warning");return;}
    const esc=v=>`"${String(v??"").replaceAll('"','""')}"`;
    const lines=[["Date","Source","Supplier","Reference","Invoice","Mode","Transaction Reference","Amount"].map(esc).join(","),...visible.map(x=>[displayDateTime(x.date),x.source,x.supplier,x.reference,x.invoice,label(x.mode),x.txn,x.amount.toFixed(2)].map(esc).join(","))];
    const blob=new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8"}),a=document.createElement("a"),url=URL.createObjectURL(blob);a.href=url;a.download=`medvika-payments-${$("paymentsFrom").value}-to-${$("paymentsTo").value}.csv`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  }

  dates();
  $("paymentsApplyButton").onclick=apply;$("paymentsMode").onchange=apply;$("paymentsSource").onchange=apply;$("paymentsFrom").onchange=apply;$("paymentsTo").onchange=apply;$("paymentsSearch").oninput=apply;$("paymentsExportButton").onclick=exportCsv;
  $("paymentsRefreshButton").onclick=async()=>{try{await load();toast("Payments refreshed.");}catch(e){toast(e.message,"danger");}};
  try{await load();}catch(e){toast("Payments could not load: "+e.message,"danger");}
};