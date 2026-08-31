window.initReceiptsModule=async function(){
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
  const customerName=c=>c?.full_name||c?.name||c?.customer_name||"";

  function dates(){
    const d=new Date(), first=new Date(d.getFullYear(),d.getMonth(),1);
    const local=x=>new Date(x.getTime()-x.getTimezoneOffset()*60000).toISOString().slice(0,10);
    $("receiptsFrom").value=local(first);$("receiptsTo").value=local(d);
  }

  async function load(){
    const [sp,si,c]=await Promise.all([
      supabaseClient.from("sales_payments").select("*").eq("pharmacy_id",pid).order("payment_date",{ascending:false}).limit(20000),
      supabaseClient.from("sales_invoices").select("id,customer_id,invoice_number,patient_name,invoice_status").eq("pharmacy_id",pid).limit(20000),
      supabaseClient.from("customers").select("*").eq("pharmacy_id",pid).limit(10000)
    ]);
    const err=[sp,si,c].find(x=>x.error)?.error;if(err)throw err;
    const invoices=new Map((si.data||[]).map(x=>[x.id,x]));
    const customers=new Map((c.data||[]).map(x=>[x.id,x]));
    rows=(sp.data||[]).map(x=>{
      const inv=invoices.get(x.sales_invoice_id);
      const paymentMode=mode(x.payment_method),amount=num(x.amount);
      if(!inv||String(inv.invoice_status||"").toLowerCase()==="cancelled"||amount<=0||paymentMode==="CREDIT")return null;
      const cust=customers.get(inv.customer_id);
      return {
        date:x.payment_date||x.created_at,
        invoice:inv.invoice_number||String(x.sales_invoice_id||"").slice(0,8)||"—",
        customer:customerName(cust)||inv.patient_name||"Walk-in Customer",
        mode:paymentMode,txn:x.transaction_reference||"",amount
      };
    }).filter(Boolean).sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));
    apply();
  }

  function apply(){
    const from=$("receiptsFrom").value,to=$("receiptsTo").value,m=$("receiptsMode").value,q=$("receiptsSearch").value.trim().toLowerCase();
    visible=rows.filter(x=>{
      const d=dateKey(x.date),text=[x.invoice,x.customer,x.txn,label(x.mode)].join(" ").toLowerCase();
      return (!from||d>=from)&&(!to||d<=to)&&(!m||x.mode===m)&&(!q||text.includes(q));
    });
    const total=visible.reduce((a,x)=>a+x.amount,0),cash=visible.filter(x=>x.mode==="CASH").reduce((a,x)=>a+x.amount,0);
    $("receiptsTotal").textContent=money(total);$("receiptsCount").textContent=visible.length;$("receiptsCash").textContent=money(cash);$("receiptsDigital").textContent=money(total-cash);
    $("receiptsResultCount").textContent=`${visible.length} row${visible.length===1?"":"s"}`;
    $("receiptsTable").innerHTML=visible.length?visible.map(x=>`<tr><td>${displayDateTime(x.date)}</td><td><b>${safe(x.invoice)}</b></td><td>${safe(x.customer)}</td><td>${safe(label(x.mode))}</td><td>${safe(x.txn||"—")}</td><td><b>${money(x.amount)}</b></td></tr>`).join(""):'<tr><td colspan="6" class="empty">No receipts found.</td></tr>';
  }

  function exportCsv(){
    if(!visible.length){toast("No receipts to export.","warning");return;}
    const esc=v=>`"${String(v??"").replaceAll('"','""')}"`;
    const lines=[["Date","Invoice","Customer / Patient","Mode","Transaction Reference","Amount"].map(esc).join(","),...visible.map(x=>[displayDateTime(x.date),x.invoice,x.customer,label(x.mode),x.txn,x.amount.toFixed(2)].map(esc).join(","))];
    const blob=new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8"}),a=document.createElement("a"),url=URL.createObjectURL(blob);a.href=url;a.download=`medvika-receipts-${$("receiptsFrom").value}-to-${$("receiptsTo").value}.csv`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  }

  dates();
  $("receiptsApplyButton").onclick=apply;$("receiptsMode").onchange=apply;$("receiptsFrom").onchange=apply;$("receiptsTo").onchange=apply;$("receiptsSearch").oninput=apply;$("receiptsExportButton").onclick=exportCsv;
  $("receiptsRefreshButton").onclick=async()=>{try{await load();toast("Receipts refreshed.");}catch(e){toast(e.message,"danger");}};
  try{await load();}catch(e){toast("Receipts could not load: "+e.message,"danger");}
};