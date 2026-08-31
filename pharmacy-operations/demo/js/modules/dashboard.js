window.initDashboardModule=async function initDashboardModule(){
const UI=window.MedvikaUI,Auth=window.MedvikaAuth,$=id=>document.getElementById(id);
const profile=Auth?.profile||{},pid=profile.pharmacy_id||profile.pharmacy?.id||profile.pharmacies?.id||null;
const money=v=>UI?.money?UI.money(Number(v||0)):`₹${Number(v||0).toFixed(2)}`,safe=v=>UI?.safe?UI.safe(v??""):String(v??"");
let range="7d",pharmacyName="Linked Pharmacy",branchCode="—";

function go(route,filter){
  if(filter)sessionStorage.setItem("medvikaDashboardFilter:"+route,filter);
  if(window.MedvikaRouter?.navigate)return MedvikaRouter.navigate(route);
  location.hash=route
}
document.querySelectorAll("[data-dashboard-route]").forEach(b=>b.onclick=()=>go(b.dataset.dashboardRoute,b.dataset.dashboardFilter));

function greet(){const h=new Date().getHours();return h<12?"Good morning":h<17?"Good afternoon":"Good evening"}
$("dashboardGreeting").textContent=greet();
$("dashboardUserName").textContent=Auth?.getDisplayName?.()||profile.full_name||profile.username||"Medvika User";
$("dashboardTodayLabel").textContent=new Date().toLocaleDateString(undefined,{weekday:"short",day:"numeric",month:"short"});

function rangeDates(){
  const now=new Date(),end=new Date(now);
  let start=new Date(now);
  if(range==="today"){start.setHours(0,0,0,0)}
  else if(range==="7d"){start.setDate(start.getDate()-6);start.setHours(0,0,0,0)}
  else if(range==="30d"){start.setDate(start.getDate()-29);start.setHours(0,0,0,0)}
  else {start=new Date(now.getFullYear(),now.getMonth(),1)}
  return{start,end}
}
$("dashboardRangeSwitch").querySelectorAll("button").forEach(b=>b.onclick=async()=>{range=b.dataset.range;$("dashboardRangeSwitch").querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===b));await loadDashboard()});

function dayKey(d){return new Date(d).toLocaleDateString(undefined,{day:"2-digit",month:"short"})}
function isoDay(d){const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`}

function renderLineChart(points){
  const svg=$("salesPurchaseChart"),empty=$("salesPurchaseEmpty");
  if(!points.length||!points.some(x=>x.sales||x.purchases)){svg.innerHTML="";empty.hidden=false;return}
  empty.hidden=true;
  const W=760,H=280,L=42,R=14,T=16,B=34,max=Math.max(1,...points.flatMap(x=>[x.sales,x.purchases]));
  const x=i=>L+(W-L-R)*(points.length===1?.5:i/(points.length-1));
  const y=v=>T+(H-T-B)*(1-v/max);
  const grid=[0,.25,.5,.75,1].map(p=>`<line x1="${L}" y1="${y(max*p)}" x2="${W-R}" y2="${y(max*p)}" stroke="rgba(111,135,155,.14)" stroke-width="1"/><text x="${L-7}" y="${y(max*p)+3}" text-anchor="end" font-size="8" fill="#94a3b8">${max*p>=1000?(max*p/1000).toFixed(max*p>=10000?0:1)+"k":Math.round(max*p)}</text>`).join("");
  const path=k=>points.map((p,i)=>(i?"L":"M")+x(i)+" "+y(p[k])).join(" ");
  const labels=points.map((p,i)=>`<text x="${x(i)}" y="${H-10}" text-anchor="middle" font-size="8" fill="#94a3b8">${p.label}</text>`).join("");
  const area=k=>`${path(k)} L ${x(points.length-1)} ${H-B} L ${x(0)} ${H-B} Z`;
  svg.innerHTML=`<defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14b8a6" stop-opacity=".22"/><stop offset="1" stop-color="#14b8a6" stop-opacity="0"/></linearGradient><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#818cf8" stop-opacity=".18"/><stop offset="1" stop-color="#818cf8" stop-opacity="0"/></linearGradient></defs>${grid}<path d="${area("sales")}" fill="url(#sg)"/><path d="${area("purchases")}" fill="url(#pg)"/><path d="${path("sales")}" fill="none" stroke="#14b8a6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="${path("purchases")}" fill="none" stroke="#818cf8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${points.map((p,i)=>`<circle cx="${x(i)}" cy="${y(p.sales)}" r="3" fill="#fff" stroke="#14b8a6" stroke-width="2"/><circle cx="${x(i)}" cy="${y(p.purchases)}" r="3" fill="#fff" stroke="#818cf8" stroke-width="2"/>`).join("")}${labels}`;
}

async function loadDashboard(){
  if(!pid){UI?.toast?.("Operational pharmacy not found.","warning");return}
  const{start,end}=rangeDates(),s=start.toISOString(),e=end.toISOString();

  try{
    const ph=await supabaseClient.from("pharmacies").select("name,legal_name,store_code").eq("id",pid).maybeSingle();
    if(!ph.error&&ph.data){pharmacyName=ph.data.legal_name||ph.data.name||pharmacyName;branchCode=ph.data.store_code||"—";$("dashboardPharmacyHero").textContent=pharmacyName;$("dashboardBranchContext").textContent=`${pharmacyName} · ${branchCode}`}
  }catch(_){}

  try{
    const [salesR,purchR,batchR,suppR,custR,sretR,pretR,recentSalesR,recentPurchR,expiryCaseR,followupR]=await Promise.all([
      supabaseClient.from("sales_invoices").select("id,invoice_number,invoice_date,patient_name,grand_total,balance_amount,invoice_status,invoice_discount_amount").eq("pharmacy_id",pid).gte("invoice_date",s).lte("invoice_date",e).eq("invoice_status","posted").order("invoice_date"),
      supabaseClient.from("purchase_invoices").select("id,purchase_number,supplier_invoice_number,purchase_date,grand_total,outstanding_amount,purchase_status,supplier_id").eq("pharmacy_id",pid).gte("purchase_date",s).lte("purchase_date",e).eq("purchase_status","posted").order("purchase_date"),
      supabaseClient.from("medicine_batches").select("id,medicine_id,quantity_available,purchase_rate,cost_rate,mrp,expiry_date,is_blocked,gst_percent").eq("pharmacy_id",pid),
      supabaseClient.from("purchase_invoices").select("outstanding_amount").eq("pharmacy_id",pid).gt("outstanding_amount",0),
      supabaseClient.from("sales_invoices").select("balance_amount").eq("pharmacy_id",pid).gt("balance_amount",0).eq("invoice_status","posted"),
      supabaseClient.from("sales_returns").select("id,refund_amount,return_date,return_status").eq("pharmacy_id",pid).gte("return_date",isoDay(start)).lte("return_date",isoDay(end)).eq("return_status","posted"),
      supabaseClient.from("purchase_returns").select("return_amount,return_date,return_status").eq("pharmacy_id",pid).gte("return_date",isoDay(start)).lte("return_date",isoDay(end)).eq("return_status","posted"),
      supabaseClient.from("sales_invoices").select("invoice_number,invoice_date,patient_name,grand_total").eq("pharmacy_id",pid).eq("invoice_status","posted").order("invoice_date",{ascending:false}).limit(6),
      supabaseClient.from("purchase_invoices").select("purchase_number,supplier_invoice_number,purchase_date,grand_total,supplier_id").eq("pharmacy_id",pid).eq("purchase_status","posted").order("purchase_date",{ascending:false}).limit(6),
      supabaseClient.from("damage_expiry_register").select("id,status").eq("pharmacy_id",pid),
      supabaseClient.from("damage_expiry_followups").select("damage_expiry_case_id,next_followup_date,followup_date").eq("pharmacy_id",pid).order("followup_date",{ascending:false})
    ]);
    [salesR,purchR,batchR,suppR,custR,sretR,pretR,recentSalesR,recentPurchR,expiryCaseR,followupR].forEach(r=>{if(r.error)throw r.error});
    const sales=salesR.data||[],purchases=purchR.data||[],allBatches=batchR.data||[],batches=allBatches.filter(b=>!b.is_blocked);
    const costOf=b=>Number(b.cost_rate??b.purchase_rate??0);
    const salesTotal=sales.reduce((a,x)=>a+Number(x.grand_total||0),0),purchaseTotal=purchases.reduce((a,x)=>a+Number(x.grand_total||0),0);
    const supplierDue=(suppR.data||[]).reduce((a,x)=>a+Number(x.outstanding_amount||0),0),customerDue=(custR.data||[]).reduce((a,x)=>a+Number(x.balance_amount||0),0);
    const stockValue=batches.reduce((a,x)=>a+Math.max(0,Number(x.quantity_available||0))*costOf(x),0),mrpValue=batches.reduce((a,x)=>a+Math.max(0,Number(x.quantity_available||0))*Number(x.mrp||0),0);
    const todayKey=isoDay(new Date()),cutoffDate=new Date();cutoffDate.setDate(cutoffDate.getDate()+90);const cutoffKey=isoDay(cutoffDate);
    const near=allBatches.filter(b=>b.expiry_date&&b.expiry_date>=todayKey&&b.expiry_date<=cutoffKey&&Number(b.quantity_available)>0);
    const expired=allBatches.filter(b=>b.expiry_date&&b.expiry_date<todayKey&&Number(b.quantity_available)>0);
    const cutoff30Date=new Date();cutoff30Date.setDate(cutoff30Date.getDate()+30);const cutoff30Key=isoDay(cutoff30Date);
    const criticalExpiry=near.filter(b=>b.expiry_date<=cutoff30Key),laterExpiry=near.filter(b=>b.expiry_date>cutoff30Key);
    const nearVal=near.reduce((a,x)=>a+Number(x.quantity_available||0)*costOf(x),0),expiredVal=expired.reduce((a,x)=>a+Number(x.quantity_available||0)*costOf(x),0);
    const criticalExpiryVal=criticalExpiry.reduce((a,x)=>a+Number(x.quantity_available||0)*costOf(x),0),laterExpiryVal=laterExpiry.reduce((a,x)=>a+Number(x.quantity_available||0)*costOf(x),0);

    // Low stock uses medicine reorder/minimum levels, not medicine_batches.
    const medR=await supabaseClient.from("medicines").select("id,brand_name,minimum_stock,reorder_level,gst_percent").eq("pharmacy_id",pid).eq("is_active",true);
    if(medR.error)throw medR.error;
    const medMap=new Map((medR.data||[]).map(m=>[m.id,m]));

const qtyByMed={};
const stockedMedicineIds=new Set();

batches.forEach(b=>{
  if(!b.medicine_id) return;

  stockedMedicineIds.add(b.medicine_id);

  qtyByMed[b.medicine_id]=
    (qtyByMed[b.medicine_id]||0)
    +Number(b.quantity_available||0);
});

const lowStock=(medR.data||[]).filter(m=>{

  // Ignore medicines that only exist in Medicine Master
  // and have never been stocked in this branch.
  if(!stockedMedicineIds.has(m.id)) return false;

  const threshold=
    Number(m.reorder_level ?? m.minimum_stock ?? 0);

  // No configured reorder level = don't classify as low stock.
  if(threshold<=0) return false;

  return Number(qtyByMed[m.id]||0)<=threshold;

}).length;

    // Sales items for COGS + Top medicines.
    let salesItems=[];
    const invoiceIds=sales.map(x=>x.id);
    if(invoiceIds.length){
      for(let i=0;i<invoiceIds.length;i+=200){
        const ir=await supabaseClient.from("sales_items").select("id,sales_invoice_id,medicine_id,medicine_batch_id,quantity,line_total,selling_rate,discount_percent,gst_percent,purchase_cost_rate").in("sales_invoice_id",invoiceIds.slice(i,i+200));
        if(ir.error)throw ir.error;salesItems.push(...(ir.data||[]));
      }
    }
    const batchMap=new Map(allBatches.map(b=>[b.id,b]));
    const invoiceMap=new Map(sales.map(x=>[x.id,x]));
    const itemMap=new Map(salesItems.map(x=>[x.id,x]));
    const lineTotals=new Map();
    salesItems.forEach(x=>lineTotals.set(x.sales_invoice_id,(lineTotals.get(x.sales_invoice_id)||0)+Number(x.line_total||0)));
    const accounting=x=>{
      const invoice=invoiceMap.get(x.sales_invoice_id)||{};
      const billed=Math.max(0,Number(x.line_total||0)||Number(x.quantity||0)*Number(x.selling_rate||0)*(1-Number(x.discount_percent||0)/100));
      const invoiceLines=Number(lineTotals.get(x.sales_invoice_id)||0);
      const allocatedDiscount=invoiceLines>0?Number(invoice.invoice_discount_amount||0)*(billed/invoiceLines):0;
      const inclusive=Math.max(0,billed-allocatedDiscount);
      const batch=batchMap.get(x.medicine_batch_id)||{},medicine=medMap.get(x.medicine_id)||{};
      const gst=Number(x.gst_percent??batch.gst_percent??medicine.gst_percent??0);
      const taxable=gst>0?inclusive/(1+gst/100):inclusive;
      const unitCost=Number(x.purchase_cost_rate??batch.cost_rate??batch.purchase_rate??0);
      return{taxable,cost:Number(x.quantity||0)*unitCost,unitCost}
    };
    let netTaxableSales=0,netCogs=0;
    salesItems.forEach(x=>{const a=accounting(x);netTaxableSales+=a.taxable;netCogs+=a.cost});
    const returnIds=(sretR.data||[]).map(x=>x.id).filter(Boolean);
    if(returnIds.length){
      const rr=await supabaseClient.from("sales_return_items").select("sales_return_id,sales_item_id,return_quantity").in("sales_return_id",returnIds);
      if(rr.error)throw rr.error;
      (rr.data||[]).forEach(x=>{const original=itemMap.get(x.sales_item_id);if(!original)return;const sold=Number(original.quantity||0),returned=Number(x.return_quantity??x.quantity??0);if(sold<=0||returned<=0)return;const a=accounting(original),ratio=Math.min(1,returned/sold);netTaxableSales-=a.taxable*ratio;netCogs-=a.unitCost*returned})
    }
    const profit=netTaxableSales-netCogs,margin=netTaxableSales>0?profit/netTaxableSales*100:0;
    const top={};salesItems.forEach(x=>{const m=medMap.get(x.medicine_id);if(!m)return;const k=x.medicine_id;if(!top[k])top[k]={name:m.brand_name,value:0,qty:0};top[k].value+=Number(x.line_total||0);top[k].qty+=Number(x.quantity||0)});
    const topRows=Object.values(top).sort((a,b)=>b.value-a.value).slice(0,5),maxTop=Math.max(1,...topRows.map(x=>x.value));

    $("kpiSales").textContent=money(salesTotal);$("kpiSalesMeta").textContent=`${sales.length} bill${sales.length===1?"":"s"}`;
    $("kpiPurchases").textContent=money(purchaseTotal);$("kpiPurchaseMeta").textContent=`${purchases.length} invoice${purchases.length===1?"":"s"}`;
    $("kpiProfit").textContent=money(profit);$("kpiMargin").textContent=`${margin.toFixed(1)}% margin`;
    $("kpiStock").textContent=money(stockValue);$("kpiStockMeta").textContent=`${batches.filter(x=>Number(x.quantity_available)>0).length} active batches`;
    $("kpiExpiry").textContent=money(nearVal);$("kpiExpiryMeta").textContent=`${near.length} near-expiry batches`;
    $("kpiSupplierDue").textContent=money(supplierDue);
    $("pulseLowStock").textContent=lowStock;$("pulseNearExpiry").textContent=near.length;$("pulseCustomerDue").textContent=money(customerDue);$("pulseAvgBill").textContent=money(sales.length?salesTotal/sales.length:0);
    $("inventoryLowStock").textContent=lowStock;$("inventoryNearExpiry").textContent=money(nearVal);$("inventoryExpired").textContent=money(expiredVal);$("inventoryMrpValue").textContent=money(mrpValue);
    const openExpiryCases=(expiryCaseR.data||[]).filter(row=>!["SETTLED","CLOSED","CANCELLED"].includes(row.status));
    const latestFollowup=new Map();
    (followupR.data||[]).forEach(row=>{if(!latestFollowup.has(row.damage_expiry_case_id))latestFollowup.set(row.damage_expiry_case_id,row)});
    const dueExpiryCases=openExpiryCases.filter(row=>{
      const latest=latestFollowup.get(row.id);
      return !latest||!latest.next_followup_date||latest.next_followup_date<=todayKey;
    });
    const newExpiryCases=dueExpiryCases.filter(row=>!latestFollowup.has(row.id)).length;
    const action=(id,count)=>{const button=$(id);button?.classList.toggle("resolved",count===0)};
    $("actionExpiredCount").textContent=expired.length;$("actionExpiredValue").textContent=money(expiredVal)+" exposure";action("actionExpired",expired.length);
    $("actionCriticalExpiryCount").textContent=criticalExpiry.length;$("actionCriticalExpiryValue").textContent=money(criticalExpiryVal)+" exposure";action("actionCriticalExpiry",criticalExpiry.length);
    $("actionNearExpiryCount").textContent=laterExpiry.length;$("actionNearExpiryValue").textContent=money(laterExpiryVal)+" exposure";action("actionNearExpiry",laterExpiry.length);
    $("actionLowStockCount").textContent=lowStock;action("actionLowStock",lowStock);
    $("actionSupplierDueCount").textContent=(suppR.data||[]).length;$("actionSupplierDueValue").textContent=money(supplierDue)+" payable";action("actionSupplierDue",(suppR.data||[]).length);
    $("actionCustomerDueCount").textContent=(custR.data||[]).length;$("actionCustomerDueValue").textContent=money(customerDue)+" receivable";action("actionCustomerDue",(custR.data||[]).length);
    $("actionExpiryFollowupCount").textContent=dueExpiryCases.length;
    $("actionExpiryFollowupValue").textContent=newExpiryCases ? newExpiryCases+" new case"+(newExpiryCases===1?"":"s") : "Scheduled follow-ups";
    action("actionExpiryFollowup",dueExpiryCases.length);
    const priorityCategories=[expired.length,criticalExpiry.length,laterExpiry.length,lowStock,(suppR.data||[]).length,(custR.data||[]).length,dueExpiryCases.length].filter(Boolean).length;
    $("actionPriorityCount").textContent=priorityCategories?priorityCategories+" areas need attention":"All clear";
    $("actionPriorityCount").classList.toggle("clear",priorityCategories===0);
    const notificationCount=document.getElementById("notificationCount");
    const notificationButton=document.getElementById("notificationButton");
    if(notificationCount)notificationCount.textContent=String(Math.min(99,dueExpiryCases.length));
    if(notificationButton){
      notificationButton.title=dueExpiryCases.length ? dueExpiryCases.length+" expiry case follow-up(s) due" : "No expiry follow-ups due";
      notificationButton.onclick=()=>go("damage-expiry","followup-due");
    }
    $("cashSupplier").textContent=money(supplierDue);$("cashCustomer").textContent=money(customerDue);
    $("cashSalesReturns").textContent=money((sretR.data||[]).reduce((a,x)=>a+Number(x.refund_amount||0),0));
    $("cashPurchaseReturns").textContent=money((pretR.data||[]).reduce((a,x)=>a+Number(x.return_amount||0),0));
    const maxDue=Math.max(1,supplierDue,customerDue);$("supplierBar").style.width=`${supplierDue/maxDue*100}%`;$("customerBar").style.width=`${customerDue/maxDue*100}%`;

    const health=Math.max(0,Math.round(100-Math.min(35,lowStock*2)-Math.min(25,near.length*2)-Math.min(20,expired.length*5)-Math.min(20,customerDue>0?8:0)));
    $("healthScore").textContent=health;document.querySelector(".pulse-ring").style.setProperty("--health",health+"%");

    $("topMedicines").innerHTML=topRows.length?topRows.map((x,i)=>`<div class="rank-row"><span class="rank-num">${i+1}</span><div class="rank-main"><b>${safe(x.name)}</b><small>${x.qty.toFixed(2)} units</small></div><span class="rank-value">${money(x.value)}</span><div class="rank-track"><i style="width:${x.value/maxTop*100}%"></i></div></div>`).join(""):'<div class="empty-state">No sales in this period.</div>';

    // chart buckets
    const days=[];const d=new Date(start);d.setHours(0,0,0,0);const last=new Date(end);last.setHours(0,0,0,0);
    while(d<=last){days.push({key:isoDay(d),label:dayKey(d),sales:0,purchases:0});d.setDate(d.getDate()+1)}
    const map=new Map(days.map(x=>[x.key,x]));
    sales.forEach(x=>{const k=isoDay(x.invoice_date);if(map.has(k))map.get(k).sales+=Number(x.grand_total||0)});
    purchases.forEach(x=>{const k=isoDay(x.purchase_date);if(map.has(k))map.get(k).purchases+=Number(x.grand_total||0)});
    renderLineChart(days);

    // supplier names for recent purchase
    const supplierIds=[...new Set((recentPurchR.data||[]).map(x=>x.supplier_id).filter(Boolean))],supplierMap=new Map();
    if(supplierIds.length){const sr=await supabaseClient.from("suppliers").select("id,name").in("id",supplierIds);if(!sr.error)(sr.data||[]).forEach(x=>supplierMap.set(x.id,x.name))}
    $("recentSalesBody").innerHTML=(recentSalesR.data||[]).length?(recentSalesR.data||[]).map(x=>`<tr><td><b>${safe(x.invoice_number)}</b></td><td>${safe(x.patient_name||"Walk-in")}</td><td>${new Date(x.invoice_date).toLocaleDateString()}</td><td>${money(x.grand_total)}</td></tr>`).join(""):'<tr><td colspan="4" class="empty-cell">No posted sales yet.</td></tr>';
    $("recentPurchasesBody").innerHTML=(recentPurchR.data||[]).length?(recentPurchR.data||[]).map(x=>`<tr><td><b>${safe(x.purchase_number||x.supplier_invoice_number)}</b></td><td>${safe(supplierMap.get(x.supplier_id)||"Supplier")}</td><td>${new Date(x.purchase_date).toLocaleDateString()}</td><td>${money(x.grand_total)}</td></tr>`).join(""):'<tr><td colspan="4" class="empty-cell">No posted purchases yet.</td></tr>';
  }catch(err){console.error(err);UI?.toast?.("Advanced dashboard could not load: "+err.message,"warning")}
}
loadDashboard();
};
