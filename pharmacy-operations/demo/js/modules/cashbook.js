window.initCashbookModule=async function(){
  const UI=window.MedvikaUI;
  const $=id=>document.getElementById(id);
  const toast=(m,t="success")=>UI.toast(m,t==="danger"?"error":t);
  const pid=window.MedvikaAuth?.profile?.pharmacy_id||window.MedvikaAuth?.profile?.pharmacies?.id||null;
  const num=v=>Number.isFinite(Number(v))?Number(v):0;
  const money=v=>UI.money(num(v));
  const safe=v=>UI.safe(v??"");
  let allRows=[],visibleRows=[];

  if(!pid){toast("Pharmacy profile not available.","danger");return;}

  function dateOnly(value){
    if(!value)return "";
    const raw=String(value);
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
    const d=value instanceof Date?value:new Date(value);
    if(Number.isNaN(d.getTime()))return "";
    const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  }
  function normMode(v){
    const x=String(v||"OTHER").trim().toUpperCase().replace(/[\s-]+/g,"_");
    if(x==="BANK"||x==="NEFT"||x==="RTGS"||x==="IMPS") return "BANK_TRANSFER";
    if(x==="CASH") return "CASH";
    if(x==="UPI") return "UPI";
    if(x==="CARD"||x==="DEBIT_CARD"||x==="CREDIT_CARD") return "CARD";
    if(x==="CHEQUE"||x==="CHECK") return "CHEQUE";
    if(x==="CREDIT"||x==="CREDIT_NOTE"||x==="STORE_CREDIT") return "CREDIT";
    return x||"OTHER";
  }
  function modeLabel(v){return normMode(v).replaceAll("_"," ");}

  function defaultDates(){
    const now=new Date();
    const first=new Date(now.getFullYear(),now.getMonth(),1);
    const local=x=>new Date(x.getTime()-x.getTimezoneOffset()*60000).toISOString().slice(0,10);
    $("cashbookFrom").value=local(first);
    $("cashbookTo").value=local(now);
  }

  async function load(){
    const [sales,purchasePays,supplierPays,expenses,returns,fundTransfers]=await Promise.all([
      supabaseClient.from("sales_payments").select("*,sales_invoices(invoice_status)").eq("pharmacy_id",pid).order("payment_date",{ascending:false}).limit(20000),
      supabaseClient.from("purchase_payments").select("*,purchase_invoices(purchase_number,supplier_invoice_number,suppliers(name))").eq("pharmacy_id",pid).order("payment_date",{ascending:false}).limit(20000),
      supabaseClient.from("supplier_payments").select("*,suppliers(name)").eq("pharmacy_id",pid).order("payment_date",{ascending:false}).limit(20000),
      supabaseClient.from("expenses").select("*").eq("pharmacy_id",pid).order("expense_date",{ascending:false}).limit(20000),
      supabaseClient.from("sales_returns").select("*").eq("pharmacy_id",pid).order("return_date",{ascending:false}).limit(20000),
      supabaseClient.from("cash_bank_transfers").select("*").eq("pharmacy_id",pid).eq("status","posted").order("transfer_date",{ascending:false}).limit(20000)
    ]);

    const err=[sales,purchasePays,supplierPays,expenses,returns,fundTransfers].find(x=>x.error)?.error;
    if(err)throw err;

    const rows=[];

    (sales.data||[]).forEach(x=>{
      if(String(x.sales_invoices?.invoice_status||"").toLowerCase()==="cancelled")return;
      if(num(x.amount)<=0)return;
      const paymentMode=normMode(x.payment_method);
      if(paymentMode==="CREDIT")return;
      rows.push({
        id:`sale-${x.id}`,
        date:x.payment_date||x.created_at,
        type:"SALE RECEIPT",
        reference:x.transaction_reference||String(x.sales_invoice_id||"").slice(0,8)||"—",
        description:"Sales receipt",
        mode:paymentMode,
        inflow:num(x.amount),
        outflow:0
      });
    });

    (purchasePays.data||[]).forEach(x=>{
      if(num(x.amount)<=0)return;
      const paymentMode=normMode(x.payment_method);
      if(paymentMode==="CREDIT")return;
      rows.push({
        id:`purchase-${x.id}`,
        date:x.payment_date||x.created_at,
        type:"PURCHASE PAYMENT",
        reference:x.purchase_invoices?.purchase_number||x.purchase_invoices?.supplier_invoice_number||x.transaction_reference||String(x.purchase_invoice_id||"").slice(0,8)||"—",
        description:[x.purchase_invoices?.suppliers?.name,"Purchase invoice payment"].filter(Boolean).join(" — "),
        mode:paymentMode,
        inflow:0,
        outflow:num(x.amount)
      });
    });

    (supplierPays.data||[]).forEach(x=>{
      if(num(x.amount)<=0)return;
      const paymentMode=normMode(x.payment_mode);
      if(paymentMode==="CREDIT")return;
      rows.push({
        id:`supplier-${x.id}`,
        date:x.payment_date||x.created_at,
        type:"SUPPLIER PAYMENT",
        reference:x.payment_number||x.reference_number||String(x.supplier_id||"").slice(0,8)||"—",
        description:[x.suppliers?.name,x.notes||"Supplier payment"].filter(Boolean).join(" — "),
        mode:paymentMode,
        inflow:0,
        outflow:num(x.amount)
      });
    });

    (expenses.data||[]).forEach(x=>{
      if(String(x.expense_status||"posted").toLowerCase()!=="posted"||num(x.amount)<=0)return;
      const paymentMode=normMode(x.payment_method);
      if(paymentMode==="CREDIT")return;
      rows.push({
        id:`expense-${x.id}`,
        date:x.expense_date||x.created_at,
        type:"EXPENSE",
        reference:x.expense_number||x.transaction_reference||"—",
        description:[x.payee_name,x.description].filter(Boolean).join(" — ")||"Operating expense",
        mode:paymentMode,
        inflow:0,
        outflow:num(x.amount)
      });
    });

    (returns.data||[]).forEach(x=>{
      const status=String(x.return_status||"").toLowerCase();
      if(status==="cancelled")return;
      const amount=num(x.refund_amount);
      if(amount<=0)return;
      const paymentMode=normMode(x.refund_method||x.refund_mode);
      if(paymentMode==="CREDIT")return;
      rows.push({
        id:`refund-${x.id}`,
        date:x.return_date||x.created_at,
        type:"SALES REFUND",
        reference:x.return_number||"—",
        description:x.return_reason||x.reason||"Customer refund",
        mode:paymentMode,
        inflow:0,
        outflow:amount
      });
    });

    (fundTransfers.data||[]).forEach(x=>{
      const amount=num(x.amount);
      if(amount<=0)return;
      const deposit=x.direction==="CASH_TO_BANK";
      rows.push({
        id:`cash-bank-${x.id}`,
        transfer_id:x.id,
        date:x.transfer_date||x.created_at,
        type:deposit?"CASH DEPOSIT TO BANK":"BANK WITHDRAWAL TO CASH",
        reference:x.transfer_number||x.reference_number||"—",
        description:[x.bank_account_name,x.reference_number,x.notes].filter(Boolean).join(" — "),
        mode:"INTERNAL_TRANSFER",
        inflow:deposit?0:amount,
        outflow:deposit?amount:0,
        internal:true,
        bank_movement:deposit?amount:-amount
      });
    });

    allRows=rows.sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));
    apply();
  }

  function apply(){
    const from=$("cashbookFrom").value;
    const to=$("cashbookTo").value;
    const mode=$("cashbookMode").value;
    const type=$("cashbookType").value;
    const search=$("cashbookSearch").value.trim().toLowerCase();

    visibleRows=allRows.filter(x=>{
      const d=dateOnly(x.date);
      const text=[x.type,x.reference,x.description,modeLabel(x.mode)].join(" ").toLowerCase();
      return (!from||d>=from)&&(!to||d<=to)&&(!mode||x.mode===mode)&&(!type||x.type===type)&&(!search||text.includes(search));
    });

    renderSummary();
    renderDaily();
    renderTransactions();
  }

  function renderSummary(){
    const external=visibleRows.filter(x=>!x.internal);
    const inflow=external.reduce((s,x)=>s+x.inflow,0);
    const outflow=external.reduce((s,x)=>s+x.outflow,0);
    const cash=visibleRows.filter(x=>x.mode==="CASH"||x.internal);
    const cashIn=cash.reduce((s,x)=>s+x.inflow,0);
    const cashOut=cash.reduce((s,x)=>s+x.outflow,0);
    const digitalNet=visibleRows.reduce((s,x)=>{
      if(x.internal)return s+num(x.bank_movement);
      if(x.mode==="CASH")return s;
      return s+x.inflow-x.outflow;
    },0);

    $("cashbookTotalInflow").textContent=money(inflow);
    $("cashbookTotalOutflow").textContent=money(outflow);
    $("cashbookNetMovement").textContent=money(inflow-outflow);
    $("cashbookCashIn").textContent=money(cashIn);
    $("cashbookCashOut").textContent=money(cashOut);
    $("cashbookDigitalNet").textContent=money(digitalNet);
  }

  function renderDaily(){
    const map=new Map();
    visibleRows.forEach(x=>{
      const d=dateOnly(x.date);
      if(!map.has(d))map.set(d,{date:d,count:0,inflow:0,outflow:0});
      const r=map.get(d);
      r.count++;
      r.inflow+=x.inflow;
      r.outflow+=x.outflow;
    });
    const rows=[...map.values()].sort((a,b)=>b.date.localeCompare(a.date));
    $("cashbookDailyCount").textContent=`${rows.length} day${rows.length===1?"":"s"}`;
    $("cashbookDailyTable").innerHTML=rows.length?rows.map(r=>`
      <tr>
        <td><b>${new Date(r.date+"T00:00:00").toLocaleDateString("en-IN")}</b></td>
        <td>${r.count}</td>
        <td class="positive-text">${money(r.inflow)}</td>
        <td class="negative-text">${money(r.outflow)}</td>
        <td><b>${money(r.inflow-r.outflow)}</b></td>
      </tr>`).join("")
      :'<tr><td colspan="5" class="empty">No transactions in the selected period.</td></tr>';
  }

  function renderTransactions(){
    $("cashbookTransactionCount").textContent=`${visibleRows.length} transaction${visibleRows.length===1?"":"s"}`;
    $("cashbookTransactionTable").innerHTML=visibleRows.length?visibleRows.map(x=>`
      <tr>
        <td>${x.date?new Date(x.date).toLocaleString("en-IN"):"—"}</td>
        <td><span class="type-badge">${safe(x.type)}</span></td>
        <td><b>${safe(x.reference||"—")}</b></td>
        <td>${safe(x.description||"—")}</td>
        <td>${safe(modeLabel(x.mode))}</td>
        <td class="positive-text">${x.inflow?money(x.inflow):"—"}</td>
        <td class="negative-text">${x.outflow?money(x.outflow):"—"}</td>
        <td><b>${money(x.inflow-x.outflow)}</b></td>
        <td>${x.internal?`<button class="cashbook-cancel-transfer" data-id="${x.transfer_id}" type="button">Cancel</button>`:"—"}</td>
      </tr>`).join("")
      :'<tr><td colspan="9" class="empty">No transactions found.</td></tr>';
    document.querySelectorAll(".cashbook-cancel-transfer").forEach(b=>b.onclick=()=>cancelTransfer(b.dataset.id));
  }

  function exportCsv(){
    if(!visibleRows.length){toast("No transactions to export.","warning");return;}
    const esc=v=>`"${String(v??"").replaceAll('"','""')}"`;
    const lines=[
      ["Date","Type","Reference","Description","Payment Mode","Inflow","Outflow","Net"].map(esc).join(","),
      ...visibleRows.map(x=>[
        x.date?new Date(x.date).toISOString():"",
        x.type,x.reference,x.description,modeLabel(x.mode),
        x.inflow.toFixed(2),x.outflow.toFixed(2),(x.inflow-x.outflow).toFixed(2)
      ].map(esc).join(","))
    ];
    const blob=new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8"});
    const a=document.createElement("a");
    const url=URL.createObjectURL(blob);
    a.href=url;
    a.download=`medvika-cashbook-${$("cashbookFrom").value||"all"}-to-${$("cashbookTo").value||"today"}.csv`;
    document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  }

  function localInput(value){
    const d=value?new Date(value):new Date();
    return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
  }

  function openTransferForm(){
    $("cashBankTransferDate").value=localInput();
    $("cashBankTransferDirection").value="CASH_TO_BANK";
    $("cashBankTransferAccount").value="";
    $("cashBankTransferAmount").value="";
    $("cashBankTransferReference").value="";
    $("cashBankTransferNotes").value="";
    $("cashBankTransferPanel").hidden=false;
    $("cashBankTransferPanel").scrollIntoView({behavior:"smooth",block:"start"});
  }

  async function saveTransfer(){
    const account=$("cashBankTransferAccount").value.trim();
    const amount=Number($("cashBankTransferAmount").value);
    const transferDate=$("cashBankTransferDate").value;
    if(!transferDate){toast("Transfer date and time are required.","warning");return;}
    if(!account){toast("Bank / account label is required.","warning");return;}
    if(!Number.isFinite(amount)||amount<=0){toast("Enter a valid transfer amount.","warning");return;}
    const button=$("saveCashBankTransferButton");
    button.disabled=true;button.textContent="Saving...";
    try{
      const {error}=await supabaseClient.rpc("record_cash_bank_transfer",{
        p_direction:$("cashBankTransferDirection").value,
        p_bank_account_name:account,
        p_amount:amount,
        p_transfer_date:new Date(transferDate).toISOString(),
        p_reference_number:$("cashBankTransferReference").value.trim()||null,
        p_notes:$("cashBankTransferNotes").value.trim()||null
      });
      if(error)throw error;
      toast("Cash / bank transfer recorded.");
      $("cashBankTransferPanel").hidden=true;
      await load();
    }catch(error){toast(error.message||"Transfer could not be recorded.","danger");}
    finally{button.disabled=false;button.textContent="Save Transfer";}
  }

  async function cancelTransfer(id){
    const reason=prompt("Reason for cancelling this cash / bank transfer:");
    if(!reason?.trim())return;
    const {error}=await supabaseClient.rpc("cancel_cash_bank_transfer",{p_transfer_id:id,p_reason:reason.trim()});
    if(error){toast(error.message,"danger");return;}
    toast("Cash / bank transfer cancelled.");
    await load();
  }

  $("cashbookApplyButton").onclick=apply;
  $("cashbookMode").onchange=apply;
  $("cashbookType").onchange=apply;
  $("cashbookFrom").onchange=apply;
  $("cashbookTo").onchange=apply;
  $("cashbookSearch").oninput=apply;
  $("cashbookExportButton").onclick=exportCsv;
  $("newCashBankTransferButton").onclick=openTransferForm;
  $("closeCashBankTransferButton").onclick=()=>{$("cashBankTransferPanel").hidden=true;};
  $("saveCashBankTransferButton").onclick=saveTransfer;
  $("cashbookRefreshButton").onclick=async()=>{
    try{await load();toast("Cash Book refreshed.");}
    catch(e){toast(e.message||"Cash Book could not refresh.","danger");}
  };

  defaultDates();
  try{await load();}
  catch(e){toast("Cash Book could not load: "+e.message,"danger");}
};