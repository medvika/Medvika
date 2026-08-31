window.initReportsHubModule=async function(){
 const UI=window.MedvikaUI,$=id=>document.getElementById(id),pid=window.MedvikaAuth?.profile?.pharmacy_id;
 const toast=(m,t="success")=>UI.toast(m,t==="danger"?"error":t);
 const n=v=>Number.isFinite(Number(v))?Number(v):0,money=v=>UI.money(n(v));
 const first=(o,ks,d=null)=>{for(const k of ks){if(o&&o[k]!==undefined&&o[k]!==null&&o[k]!=="")return o[k];}return d;};

 let data={sales:[],salesItems:[],batches:[],expenses:[],purchases:[],payments:[],receipts:[],bounces:[]};
 if(!pid){toast("Pharmacy profile not available.","danger");return;}

 function localDate(d){return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);}
 function fyStart(){const d=new Date(),y=d.getMonth()>=3?d.getFullYear():d.getFullYear()-1;return `${y}-04-01`;}
 function setDefault(){const d=new Date(),f=new Date(d.getFullYear(),d.getMonth(),1);$("reportsHubFrom").value=localDate(f);$("reportsHubTo").value=localDate(d);}
 function inRange(v){const d=String(v||"").slice(0,10),f=$("reportsHubFrom").value,t=$("reportsHubTo").value;return d&&(!f||d>=f)&&(!t||d<=t);}

 async function safe(table,select="*"){
   const r=await supabaseClient.from(table).select(select).eq("pharmacy_id",pid).limit(50000);
   if(r.error){console.warn(table,r.error);return [];}
   return r.data||[];
 }

 async function load(){
   [data.sales,data.salesItems,data.batches,data.expenses,data.purchases,data.payments,data.receipts,data.bounces]=await Promise.all([
     safe("sales_invoices"),
     safe("sales_items"),
     safe("medicine_batches"),
     safe("expenses"),
     safe("purchase_invoices"),
     safe("supplier_payments"),
     safe("sales_payments"),
     safe("sales_bounces")
   ]);
   render();
 }

 function render(){
   const sales=data.sales.filter(x=>inRange(first(x,["invoice_date","created_at"]))&&String(first(x,["invoice_status"],"")).toLowerCase()!=="cancelled");
   const salesMap=new Map(sales.map(x=>[x.id,x]));
   const batchMap=new Map(data.batches.map(x=>[x.id,x]));
   const invoiceLineTotal=new Map();

   data.salesItems.forEach(i=>{
     const iid=first(i,["sales_invoice_id","invoice_id"]);
     const q=n(first(i,["quantity"],0));
     const line=n(first(i,["line_total"],0))||q*n(first(i,["selling_rate"],0));
     invoiceLineTotal.set(iid,n(invoiceLineTotal.get(iid))+line);
   });

   let taxableSales=0,cogs=0;
   data.salesItems.forEach(i=>{
     const iid=first(i,["sales_invoice_id","invoice_id"]);
     const inv=salesMap.get(iid);if(!inv)return;
     const q=n(first(i,["quantity"],0));
     const billed=n(first(i,["line_total"],0))||q*n(first(i,["selling_rate"],0));
     const disc=n(first(inv,["invoice_discount_amount"],0));
     const denom=n(invoiceLineTotal.get(iid));
     const alloc=denom>0?disc*(billed/denom):0;
     const inclusive=Math.max(0,billed-alloc);
     const bt=batchMap.get(first(i,["medicine_batch_id"]))||{};
     const gst=n(first(i,["gst_percent"],first(bt,["gst_percent"],0)));
     const taxable=gst>0?inclusive/(1+gst/100):inclusive;
     const cost=q*n(first(i,["purchase_rate"],first(bt,["purchase_rate"],0)));
     taxableSales+=taxable;cogs+=cost;
   });

   const grossProfit=taxableSales-cogs;
   const grossMargin=taxableSales?grossProfit/taxableSales*100:0;

   const expenses=data.expenses.filter(x=>inRange(first(x,["expense_date","created_at"]))&&String(first(x,["expense_status"],"posted")).toLowerCase()==="posted");
   const expenseTotal=expenses.reduce((a,x)=>a+n(x.amount),0);

   const purchases=data.purchases.filter(x=>inRange(first(x,["purchase_date","invoice_date","created_at"]))&&String(first(x,["purchase_status","status"],"")).toLowerCase()!=="cancelled");
   const purchaseTotal=purchases.reduce((a,x)=>a+n(first(x,["grand_total","net_amount","total_amount"],0)),0);

   const bounces=data.bounces.filter(x=>inRange(first(x,["created_at"])));
   const bounceQty=bounces.reduce((a,x)=>a+n(x.requested_quantity),0);

   $("hubSales").textContent=money(taxableSales);
   $("hubInvoices").textContent=`${sales.length} invoice${sales.length===1?"":"s"}`;
   $("hubPurchases").textContent=money(purchaseTotal);
   $("hubPurchaseInvoices").textContent=`${purchases.length} invoice${purchases.length===1?"":"s"}`;
   $("hubGrossProfit").textContent=money(grossProfit);
   $("hubGrossMargin").textContent=`${grossMargin.toFixed(2)}% margin`;
   $("hubExpenses").textContent=money(expenseTotal);
   $("hubOperatingProfit").textContent=money(grossProfit-expenseTotal);
   $("hubBounces").textContent=bounces.length;
   $("hubBounceQty").textContent=`${bounceQty.toFixed(2).replace(/\.00$/,"")} qty requested`;
 }

 function csv(rows,headers,mapper,filename){
   if(!rows.length){toast("No data available for this export.","warning");return;}
   const esc=v=>`"${String(v??"").replaceAll('"','""')}"`;
   const lines=[headers.map(esc).join(","),...rows.map(r=>mapper(r).map(esc).join(","))];
   const blob=new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8"});
   const a=document.createElement("a"),url=URL.createObjectURL(blob);
   a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
 }

 function exportType(type){
   const f=$("reportsHubFrom").value,t=$("reportsHubTo").value;

   if(type==="sales"){
     const rows=data.sales.filter(x=>inRange(first(x,["invoice_date","created_at"])));
     csv(rows,["Date","Invoice","Grand Total","Paid","Balance","Payment Status","Invoice Status"],x=>[first(x,["invoice_date","created_at"]),x.invoice_number,x.grand_total,x.amount_paid,x.balance_amount,x.payment_status,x.invoice_status],`medvika-sales-${f}-to-${t}.csv`);
   }else if(type==="purchases"){
     const rows=data.purchases.filter(x=>inRange(first(x,["purchase_date","invoice_date","created_at"])));
     csv(rows,["Date","Purchase","Supplier Invoice","Total","Paid","Outstanding","Status"],x=>[first(x,["purchase_date","invoice_date","created_at"]),first(x,["purchase_number","invoice_number"]),first(x,["supplier_invoice_number","invoice_number"]),first(x,["grand_total","net_amount","total_amount"],0),x.amount_paid,first(x,["outstanding_amount","balance_amount"],0),first(x,["payment_status","purchase_status","status"])],`medvika-purchases-${f}-to-${t}.csv`);
   }else if(type==="payments"){
     const rows=data.payments.filter(x=>inRange(first(x,["payment_date","created_at"])));
     csv(rows,["Date","Payment No","Supplier","Mode","Reference","Amount"],x=>[first(x,["payment_date","created_at"]),x.payment_number,x.supplier_id,x.payment_mode,x.reference_number,x.amount],`medvika-payments-${f}-to-${t}.csv`);
   }else if(type==="receipts"){
     const rows=data.receipts.filter(x=>inRange(first(x,["payment_date","created_at"])));
     csv(rows,["Date","Sales Invoice","Method","Reference","Amount"],x=>[first(x,["payment_date","created_at"]),x.sales_invoice_id,x.payment_method,x.transaction_reference,x.amount],`medvika-receipts-${f}-to-${t}.csv`);
   }else if(type==="expenses"){
     const rows=data.expenses.filter(x=>inRange(first(x,["expense_date","created_at"])));
     csv(rows,["Date","Expense No","Category","Payee","Method","Amount","Status"],x=>[first(x,["expense_date","created_at"]),x.expense_number,x.expense_category_id,x.payee_name,x.payment_method,x.amount,x.expense_status],`medvika-expenses-${f}-to-${t}.csv`);
   }else if(type==="bounces"){
     const rows=data.bounces.filter(x=>inRange(x.created_at));
     csv(rows,["Date","Search Text","Medicine","Customer","Requested Qty","Available Qty","Reason","Status"],x=>[x.created_at,x.search_text,x.medicine_id,x.customer_id,x.requested_quantity,x.available_quantity,x.reason,x.status],`medvika-bounces-${f}-to-${t}.csv`);
   }
 }

 document.querySelectorAll(".report-card").forEach(b=>b.onclick=()=>window.MedvikaRouter.navigate(b.dataset.route,false));
 document.querySelectorAll("[data-export]").forEach(b=>b.onclick=()=>exportType(b.dataset.export));
 document.querySelectorAll("[data-period]").forEach(b=>b.onclick=()=>{
   const now=new Date(),p=b.dataset.period;
   if(p==="today")$("reportsHubFrom").value=$("reportsHubTo").value=localDate(now);
   if(p==="month"){$("reportsHubFrom").value=localDate(new Date(now.getFullYear(),now.getMonth(),1));$("reportsHubTo").value=localDate(now);}
   if(p==="fy"){$("reportsHubFrom").value=fyStart();$("reportsHubTo").value=localDate(now);}
   render();
 });
 $("reportsHubFrom").onchange=render;$("reportsHubTo").onchange=render;
 $("reportsHubRefresh").onclick=()=>load().then(()=>toast("Reports dashboard refreshed.")).catch(e=>toast(e.message,"danger"));
 setDefault();try{await load();}catch(e){toast("Reports dashboard could not load: "+e.message,"danger");}
};