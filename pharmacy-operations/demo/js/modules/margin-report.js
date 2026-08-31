window.initMarginReportModule=async function(){
const UI=window.MedvikaUI,$=id=>document.getElementById(id),pid=window.MedvikaAuth?.profile?.pharmacy_id;
const toast=(m,t="success")=>UI.toast(m,t==="danger"?"error":t),num=v=>Number.isFinite(Number(v))?Number(v):0,money=v=>UI.money(num(v)),safe=v=>UI.safe(v??"");
const first=(row,names,def=null)=>{for(const name of names){if(row&&row[name]!==undefined&&row[name]!==null&&row[name]!=="")return row[name];}return def;};

function correctedInclusiveLine(item){
  const qty=num(first(item,["quantity","sold_quantity"],0));
  const rate=num(first(item,["selling_rate","sale_rate","rate"],0));
  const discountPercent=num(first(item,["discount_percent"],0));

  const rateBasedGross=qty*rate;
  const rateBasedNet=rateBasedGross*(1-(discountPercent/100));

  const storedLine=num(first(item,["line_total","net_amount","total_amount","amount"],0));

  /*
   * line_total is the saved GST-inclusive transaction value. Some older
   * sales rows store a taxable selling_rate, so quantity × rate can be
   * lower than the posted billed value.
   */
  if(storedLine>0){
    return Math.max(0,storedLine);
  }

  return Math.max(0,rateBasedNet);
}

let medicines=[],manufacturers=[],batches=[],sales=[],salesItems=[],salesReturns=[],salesReturnItems=[],baseRows=[],visibleRows=[];
if(!pid){toast("Pharmacy profile not available.","danger");return;}

function dateKey(value){
 const raw=String(value??"");if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
 const d=value instanceof Date?value:new Date(value);if(Number.isNaN(d.getTime()))return "";
 const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");
 return `${y}-${m}-${day}`;
}
function displayDate(value){const key=dateKey(value);if(!key)return "";const [y,m,d]=key.split("-");return `${d}/${m}/${y}`;}
function localDate(d){return dateKey(d);}
function defaultDates(){const now=new Date(),f=new Date(now.getFullYear(),now.getMonth(),1);$("marginFrom").value=localDate(f);$("marginTo").value=localDate(now);}
async function safeLoad(table,filter=true){let q=supabaseClient.from(table).select("*").limit(50000);if(filter)q=q.eq("pharmacy_id",pid);const r=await q;if(r.error){console.warn(table,r.error);return [];}return r.data||[];}
function med(id){return medicines.find(x=>x.id===id)||{};} function batch(id){return batches.find(x=>x.id===id)||{};} function mfr(id){return manufacturers.find(x=>x.id===id)||{};}

async function load(){
 [medicines,manufacturers,batches,sales,salesItems,salesReturns,salesReturnItems]=await Promise.all([
  safeLoad("medicines",false),safeLoad("manufacturers",false),safeLoad("medicine_batches"),safeLoad("sales_invoices"),safeLoad("sales_items"),safeLoad("sales_returns"),safeLoad("sales_return_items")
 ]);
 buildBase();apply();
}

function buildBase(){
 const invMap=new Map(sales.map(x=>[x.id,x])), itemMap=new Map(salesItems.map(x=>[x.id,x])), retMap=new Map(salesReturns.map(x=>[x.id,x])), invLineTotal=new Map();
 salesItems.forEach(item=>{const iid=first(item,["sales_invoice_id","invoice_id"]);const q=num(first(item,["quantity"],0));const line=correctedInclusiveLine(item);invLineTotal.set(iid,num(invLineTotal.get(iid))+line);});
 baseRows=[];
 salesItems.forEach(item=>{
  const iid=first(item,["sales_invoice_id","invoice_id"]), inv=invMap.get(iid); if(!inv||String(first(inv,["invoice_status","status"],"")).toLowerCase()==="cancelled")return;
  const md=med(first(item,["medicine_id"])), bt=batch(first(item,["medicine_batch_id"])), mf=mfr(md.manufacturer_id), q=num(first(item,["quantity","sold_quantity"],0));
  const gross=correctedInclusiveLine(item);
  const invDisc=num(first(inv,["invoice_discount_amount"],0)), denom=num(invLineTotal.get(iid)), alloc=denom>0?invDisc*(gross/denom):0;
  const inclusiveNet=Math.max(0,gross-alloc);
  const gstRate=num(first(item,["gst_percent"],first(bt,["gst_percent"],first(md,["gst_percent"],0))));
  const taxableNet=gstRate>0 ? inclusiveNet/(1+(gstRate/100)) : inclusiveNet;
  const unitCost=num(first(item,["purchase_rate","cost_rate"],first(bt,["purchase_rate"],0))), cost=q*unitCost;
  baseRows.push({date:first(inv,["invoice_date","sale_date","created_at"]),invoice_id:iid,invoice_number:first(inv,["invoice_number","sale_number"],"Sale"),medicine_id:first(item,["medicine_id"]),medicine_name:first(md,["brand_name","name","medicine_name"],"Medicine"),generic_name:first(md,["generic_name"],""),category:first(md,["category"],"Uncategorised"),manufacturer_id:md.manufacturer_id||null,manufacturer_name:first(mf,["name"],"Unassigned"),quantity:q,sales_value:taxableNet,cost_value:cost,gross_profit:taxableNet-cost,discount_value:num(first(item,["discount_amount"],0))+alloc});
 });
 salesReturnItems.forEach(ri=>{
  const ret=retMap.get(first(ri,["sales_return_id","return_id"])); if(!ret||String(first(ret,["return_status","status"],"")).toLowerCase()==="cancelled")return;
  const oi=itemMap.get(first(ri,["sales_item_id"])); if(!oi)return;
  const iid=first(oi,["sales_invoice_id","invoice_id"]), inv=invMap.get(iid)||{}, md=med(first(oi,["medicine_id"])), bt=batch(first(oi,["medicine_batch_id"])), mf=mfr(md.manufacturer_id);
  const sold=num(first(oi,["quantity","sold_quantity"],0)), rq=num(first(ri,["return_quantity","quantity"],0)); if(sold<=0||rq<=0)return;
  const originalLine=correctedInclusiveLine(oi);
  const invDisc=num(first(inv,["invoice_discount_amount"],0)), denom=num(invLineTotal.get(iid)), itemDisc=denom>0?invDisc*(originalLine/denom):0, originalInclusiveNet=Math.max(0,originalLine-itemDisc);
  const gstRate=num(first(oi,["gst_percent"],first(bt,["gst_percent"],first(md,["gst_percent"],0))));
  const originalTaxableNet=gstRate>0 ? originalInclusiveNet/(1+(gstRate/100)) : originalInclusiveNet;
  const reversedSales=originalTaxableNet*Math.min(1,rq/sold), unitCost=num(first(oi,["purchase_rate","cost_rate"],first(bt,["purchase_rate"],0))), reversedCost=rq*unitCost;
  baseRows.push({date:first(ret,["return_date","created_at"]),invoice_id:iid,invoice_number:first(inv,["invoice_number"],first(ret,["return_number"],"Return")),medicine_id:first(oi,["medicine_id"]),medicine_name:first(md,["brand_name","name","medicine_name"],"Medicine"),generic_name:first(md,["generic_name"],""),category:first(md,["category"],"Uncategorised"),manufacturer_id:md.manufacturer_id||null,manufacturer_name:first(mf,["name"],"Unassigned"),quantity:-rq,sales_value:-reversedSales,cost_value:-reversedCost,gross_profit:-(reversedSales-reversedCost),discount_value:0});
 });
 baseRows=baseRows.filter(x=>x.date);
}

function grouped(periodRows){
 const view=$("marginView").value,map=new Map();
 periodRows.forEach(row=>{
  let key,label,sub="";
  if(view==="invoice"){key=row.invoice_id||row.invoice_number;label=row.invoice_number;sub=displayDate(row.date);}
  else if(view==="category"){key=row.category||"Uncategorised";label=key;}
  else if(view==="manufacturer"){key=row.manufacturer_id||row.manufacturer_name||"Unassigned";label=row.manufacturer_name||"Unassigned";}
  else{key=row.medicine_id||row.medicine_name;label=row.medicine_name;sub=row.generic_name||"";}
  if(!map.has(key))map.set(key,{label,sub,quantity:0,sales_value:0,cost_value:0,gross_profit:0,discount_value:0,transactions:0});
  const g=map.get(key);g.quantity+=row.quantity;g.sales_value+=row.sales_value;g.cost_value+=row.cost_value;g.gross_profit+=row.gross_profit;g.discount_value+=row.discount_value;g.transactions++;
 });
 return [...map.values()].map(x=>({...x,margin_percent:x.sales_value!==0?x.gross_profit/x.sales_value*100:0,markup_percent:x.cost_value!==0?x.gross_profit/x.cost_value*100:0}));
}

function pass(row,f){if(!f)return true;if(f==="loss")return row.gross_profit<0;if(f==="low")return row.gross_profit>=0&&row.margin_percent<5;if(f==="medium")return row.margin_percent>=5&&row.margin_percent<=15;if(f==="healthy")return row.margin_percent>15;return true;}

function apply(){
 const from=$("marginFrom").value,to=$("marginTo").value,q=$("marginSearch").value.trim().toLowerCase(),filter=$("marginFilter").value;
 const period=baseRows.filter(r=>{const d=dateKey(r.date);return d&&(!from||d>=from)&&(!to||d<=to);});
 visibleRows=grouped(period).filter(r=>pass(r,filter)&&(!q||[r.label,r.sub].join(" ").toLowerCase().includes(q)));
 const sales=visibleRows.reduce((a,x)=>a+x.sales_value,0),cost=visibleRows.reduce((a,x)=>a+x.cost_value,0),profit=visibleRows.reduce((a,x)=>a+x.gross_profit,0);
 $("marginSales").textContent=money(sales);$("marginCost").textContent=money(cost);$("marginProfit").textContent=money(profit);$("marginPercent").textContent=`${(sales?profit/sales*100:0).toFixed(2)}%`;$("markupPercent").textContent=`${(cost?profit/cost*100:0).toFixed(2)}%`;$("marginLossCount").textContent=visibleRows.filter(x=>x.gross_profit<0).length;$("marginCount").textContent=`${visibleRows.length} row${visibleRows.length===1?"":"s"}`;
 renderTable();renderWatch(period);
}

function renderTable(){
 const view=$("marginView").value,heading=view==="invoice"?"Invoice":view==="category"?"Category":view==="manufacturer"?"Manufacturer":"Medicine";
 $("marginDetailTitle").textContent=`${heading}-wise Margin`;
 $("marginHead").innerHTML=`<tr><th>${safe(heading)}</th><th>Qty / Movement</th><th>Transactions</th><th>Net Sales</th><th>Discount</th><th>Cost</th><th>Gross Profit</th><th>Margin %</th><th>Markup %</th></tr>`;
 const sorted=[...visibleRows].sort((a,b)=>b.sales_value-a.sales_value);
 $("marginBody").innerHTML=sorted.length?sorted.map(r=>`<tr><td><b>${safe(r.label)}</b>${r.sub?`<br><small>${safe(r.sub)}</small>`:""}</td><td>${num(r.quantity).toFixed(3).replace(/\.?0+$/,"")}</td><td>${r.transactions}</td><td>${money(r.sales_value)}</td><td>${money(r.discount_value)}</td><td>${money(r.cost_value)}</td><td class="${r.gross_profit<0?"negative-text":"positive-text"}"><b>${money(r.gross_profit)}</b></td><td><b>${r.margin_percent.toFixed(2)}%</b></td><td>${r.markup_percent.toFixed(2)}%</td></tr>`).join(""):'<tr><td colspan="9" class="empty">No margin records found.</td></tr>';
}

function renderWatch(period){
 const map=new Map(); period.forEach(r=>{const key=r.medicine_id||r.medicine_name;if(!map.has(key))map.set(key,{label:r.medicine_name,sales_value:0,cost_value:0,gross_profit:0});const g=map.get(key);g.sales_value+=r.sales_value;g.cost_value+=r.cost_value;g.gross_profit+=r.gross_profit;});
 const watch=[...map.values()].map(x=>({...x,margin_percent:x.sales_value?x.gross_profit/x.sales_value*100:0,markup_percent:x.cost_value?x.gross_profit/x.cost_value*100:0})).filter(x=>x.gross_profit<0||x.margin_percent<5).sort((a,b)=>a.margin_percent-b.margin_percent);
 $("marginWatchCount").textContent=`${watch.length} item${watch.length===1?"":"s"}`;
 $("marginWatchBody").innerHTML=watch.length?watch.map(x=>`<tr><td><b>${safe(x.label)}</b></td><td>${money(x.sales_value)}</td><td>${money(x.cost_value)}</td><td class="${x.gross_profit<0?"negative-text":"positive-text"}"><b>${money(x.gross_profit)}</b></td><td><b>${x.margin_percent.toFixed(2)}%</b></td><td>${x.markup_percent.toFixed(2)}%</td></tr>`).join(""):'<tr><td colspan="6" class="empty">No loss-making or sub-5% margin medicines in this period.</td></tr>';
}

function exportCsv(){
 if(!visibleRows.length){toast("No margin data to export.","warning");return;}
 const esc=v=>`"${String(v??"").replaceAll('"','""')}"`,view=$("marginView").value;
 const lines=[["View","Name","Detail","Quantity / Movement","Transactions","Net Sales","Discount","Cost","Gross Profit","Margin %","Markup %"].map(esc).join(","),...visibleRows.map(r=>[view,r.label,r.sub,r.quantity.toFixed(3),r.transactions,r.sales_value.toFixed(2),r.discount_value.toFixed(2),r.cost_value.toFixed(2),r.gross_profit.toFixed(2),r.margin_percent.toFixed(2),r.markup_percent.toFixed(2)].map(esc).join(","))];
 const blob=new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8"}),a=document.createElement("a"),url=URL.createObjectURL(blob);a.href=url;a.download=`medvika-margin-report-${$("marginFrom").value}-to-${$("marginTo").value}.csv`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}

defaultDates();$("marginApply").onclick=apply;$("marginFrom").onchange=apply;$("marginTo").onchange=apply;$("marginView").onchange=apply;$("marginFilter").onchange=apply;$("marginSearch").oninput=apply;$("marginExport").onclick=exportCsv;$("marginRefresh").onclick=async()=>{try{await load();toast("Margin Report refreshed.");}catch(e){toast(e.message,"danger");}};
try{await load();}catch(e){toast("Margin Report could not load: "+e.message,"danger");}
};