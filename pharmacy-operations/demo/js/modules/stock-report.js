window.initStockReportModule=async function(){
 const UI=window.MedvikaUI,$=id=>document.getElementById(id);
 const pid=window.MedvikaAuth?.profile?.pharmacy_id;
 const n=v=>Number.isFinite(Number(v))?Number(v):0;
 const money=v=>UI.money(n(v));
 let medicines=[],movementRows=[],displayHeaders=[],displayRows=[];

 function dateKey(value){
   if(!value)return "";
   const raw=String(value);
   if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
   const d=value instanceof Date?value:new Date(value);
   if(Number.isNaN(d.getTime()))return "";
   const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");
   return `${y}-${m}-${day}`;
 }
 function displayDate(value){
   const key=dateKey(value);if(!key)return "—";
   const [y,m,d]=key.split("-");return `${d}/${m}/${y}`;
 }
 function today(){return dateKey(new Date())}
 function fmtQty(v){return n(v).toFixed(3).replace(/\.?0+$/,"")}
 function isSaleableBatch(b){return n(b.quantity_available)>0 && (!b.expiry_date || b.expiry_date>=today()) && !b.is_blocked}
 function batches(m){return Array.isArray(m.medicine_batches)?m.medicine_batches:[]}
 function medName(m){return m.brand_name||m.name||"Medicine"}
 function generic(m){return m.generic_name||""}
 function saleableBatches(m){return batches(m).filter(isSaleableBatch)}
 function saleableQty(m){return saleableBatches(m).reduce((s,b)=>s+n(b.quantity_available),0)}
 function totalQty(m){return batches(m).reduce((s,b)=>s+n(b.quantity_available),0)}
 function effectiveCost(b){return n(b.cost_rate??b.purchase_rate)}
 function costValue(m){return saleableBatches(m).reduce((s,b)=>s+n(b.quantity_available)*effectiveCost(b),0)}
 function mrpValue(m){return saleableBatches(m).reduce((s,b)=>s+n(b.quantity_available)*n(b.mrp||b.selling_rate),0)}
 function nearestExpiry(m){
   const ex=saleableBatches(m).map(b=>b.expiry_date).filter(Boolean).sort();
   return ex[0]||"—";
 }
 function qtext(m){
   return [
    medName(m),generic(m),m.barcode,
    ...batches(m).map(b=>b.batch_number)
   ].filter(Boolean).join(" ").toLowerCase();
 }
 function lowThreshold(){return Math.max(0,n($("srLowThreshold").value))}
 function slowDays(){return Math.max(1,Math.round(n($("srSlowDays").value)||60))}
 function nonMovingDays(){return Math.max(slowDays()+1,Math.round(n($("srNonMovingDays").value)||180))}
 function movementClass(r){
   if(r.dump_reason)return "DUMP";
   const idle=n(r.inactivity_days);
   if(idle>=nonMovingDays())return "NON_MOVING";
   if(idle>=slowDays())return "SLOW_MOVING";
   return "ACTIVE";
 }
 function filteredMeds(){
   const q=$("srSearch").value.trim().toLowerCase();
   return medicines.filter(m=>!q||qtext(m).includes(q));
 }

 function setTable(title,note,headers,data){
   $("srTitle").textContent=title;
   $("srNote").textContent=note;
   displayHeaders=headers;displayRows=data;
   $("srHead").innerHTML="<tr>"+headers.map(h=>`<th>${UI.safe(h)}</th>`).join("")+"</tr>";
   $("srBody").innerHTML=data.length
    ? data.map(r=>"<tr>"+r.map(v=>`<td>${UI.safe(String(v??"—"))}</td>`).join("")+"</tr>").join("")
    : `<tr><td colspan="${headers.length}" class="empty">No records.</td></tr>`;
   $("srCount").textContent=`${data.length} rows`;
 }

 function updateSummary(){
   const active=medicines.length;
   const saleable=medicines.reduce((s,m)=>s+saleableQty(m),0);
   const zero=medicines.filter(m=>saleableQty(m)<=0).length;
   const low=medicines.filter(m=>saleableQty(m)>0&&saleableQty(m)<=lowThreshold()).length;
   const cost=medicines.reduce((s,m)=>s+costValue(m),0);
   const mrp=medicines.reduce((s,m)=>s+mrpValue(m),0);
   $("srMedicines").textContent=String(active);
   $("srSaleableQty").textContent=fmtQty(saleable);
   $("srZeroCount").textContent=String(zero);
   $("srLowCount").textContent=String(low);
   $("srCostValue").textContent=money(cost);
   $("srMrpValue").textContent=money(mrp);
   const available=movementRows.filter(r=>n(r.quantity_available)>0);
   $("srSlowCount").textContent=String(available.filter(r=>movementClass(r)==="SLOW_MOVING").length);
   $("srNonMovingCount").textContent=String(available.filter(r=>movementClass(r)==="NON_MOVING").length);
   $("srDumpCount").textContent=String(available.filter(r=>movementClass(r)==="DUMP").length);
 }

 function renderCurrent(list){
   setTable(
    "Current Stock",
    "Medicine-wise saleable stock. Expired and blocked batches are excluded.",
    ["Medicine","Generic","Saleable Packs","Batches","Nearest Expiry","Avg Cost","MRP Value","Cost Value"],
    list.map(m=>{
      const sb=saleableBatches(m);
      const qty=saleableQty(m);
      const avgCost=qty>0?sb.reduce((s,b)=>s+n(b.quantity_available)*effectiveCost(b),0)/qty:0;
      return [
       medName(m),generic(m)||"—",fmtQty(qty),sb.length,nearestExpiry(m),
       money(avgCost),money(mrpValue(m)),money(costValue(m))
      ];
    })
   );
 }

 function renderBatch(list){
   const data=[];
   list.forEach(m=>batches(m).forEach(b=>{
     const qty=n(b.quantity_available);
     const expired=!!b.expiry_date && b.expiry_date<today();
     const status=qty<=0?"ZERO":b.is_blocked?"BLOCKED":expired?"EXPIRED":isSaleableBatch(b)?"SALEABLE":"REVIEW";
     data.push([
      medName(m),generic(m)||"—",b.batch_number||"—",b.expiry_date||"—",
      fmtQty(qty),m.primary_pack_unit||"pack",money(b.purchase_rate),
      money(b.selling_rate),money(b.mrp),n(b.gst_percent??m.gst_percent)+"%",
      money(qty*effectiveCost(b)),status
     ]);
   }));
   setTable(
    "Batch-wise Stock",
    "Every recorded batch, including zero, expired and blocked batches.",
    ["Medicine","Generic","Batch","Expiry","Qty","Unit","PTR","Sell Rate","MRP","GST","Cost Value","Status"],
    data
   );
 }

 function renderZero(list){
   const data=list.filter(m=>saleableQty(m)<=0).map(m=>[
    medName(m),generic(m)||"—",m.barcode||"—",fmtQty(totalQty(m)),
    batches(m).filter(b=>n(b.quantity_available)>0 && b.expiry_date<today()).length,
    batches(m).filter(b=>n(b.quantity_available)>0 && b.is_blocked).length
   ]);
   setTable(
    "Zero Stock",
    "Medicines with no saleable stock. Positive quantity may still exist only in expired/blocked batches.",
    ["Medicine","Generic","Barcode","Total Recorded Qty","Expired Batches with Qty","Blocked Batches with Qty"],
    data
   );
 }

 function renderLow(list){
   const th=lowThreshold();
   const data=list.filter(m=>saleableQty(m)>0&&saleableQty(m)<=th)
    .sort((a,b)=>saleableQty(a)-saleableQty(b))
    .map(m=>[
     medName(m),generic(m)||"—",fmtQty(saleableQty(m)),m.primary_pack_unit||"pack",
     nearestExpiry(m),money(costValue(m)),money(mrpValue(m))
    ]);
   setTable(
    "Low Stock",
    `Saleable stock greater than zero and at or below ${fmtQty(th)} packs.`,
    ["Medicine","Generic","Saleable Qty","Unit","Nearest Expiry","Cost Value","MRP Value"],
    data
   );
 }

 function renderValuation(list){
   const data=list.filter(m=>saleableQty(m)>0).map(m=>{
     const qty=saleableQty(m),cost=costValue(m),mrp=mrpValue(m);
     return [
      medName(m),generic(m)||"—",fmtQty(qty),
      money(cost),money(mrp),money(mrp-cost),
      mrp>0?((mrp-cost)/mrp*100).toFixed(1)+"%":"0.0%"
     ];
   }).sort((a,b)=>{
     const av=Number(String(a[3]).replace(/[^\d.-]/g,""))||0;
     const bv=Number(String(b[3]).replace(/[^\d.-]/g,""))||0;
     return bv-av;
   });
   setTable(
    "Stock Valuation",
    "Saleable inventory valued at effective batch cost (ex GST) and MRP.",
    ["Medicine","Generic","Saleable Qty","Cost Value (Ex GST)","MRP Value","MRP-Cost Spread","Spread % of MRP"],
    data
   );
 }

 function renderMovement(category){
   const q=$("srSearch").value.trim().toLowerCase();
   const labels={SLOW_MOVING:"Slow-Moving Stock",NON_MOVING:"Non-Moving Stock",DUMP:"Dump / Non-Saleable Stock"};
   const list=movementRows.filter(r=>{
     if(n(r.quantity_available)<=0||movementClass(r)!==category)return false;
     const text=[r.brand_name,r.generic_name,r.batch_number,r.supplier_name,r.purchase_number,r.supplier_invoice_number].filter(Boolean).join(" ").toLowerCase();
     return !q||text.includes(q);
   });
   displayHeaders=["Medicine","Generic","Batch","Supplier","Purchase No.","First Stocked","Last Sale","Inactive Days","Available Qty","Cost Value","Classification","Reason"];
   displayRows=list.map(r=>[
     r.brand_name||"Medicine",r.generic_name||"—",r.batch_number||"—",r.supplier_name||"—",
     r.purchase_number||"—",r.first_purchase_at?displayDate(r.first_purchase_at):"—",
     r.last_sale_at?displayDate(r.last_sale_at):"Never sold",
     n(r.inactivity_days),fmtQty(r.quantity_available),money(r.stock_value),
     category.replace("_"," "),r.dump_reason||"—"
   ]);
   $("srTitle").textContent=labels[category];
   $("srNote").textContent=category==="DUMP"
     ?"Expired, damaged or blocked stock requiring operational action."
     : `Thresholds: slow after ${slowDays()} days; non-moving after ${nonMovingDays()} days. Unsold stock is measured from its first purchase date.`;
   $("srHead").innerHTML="<tr>"+[...displayHeaders,"Action"].map(h=>`<th>${UI.safe(h)}</th>`).join("")+"</tr>";
   $("srBody").innerHTML=list.length?list.map((r,i)=>`<tr>${displayRows[i].map(v=>`<td>${UI.safe(String(v??"—"))}</td>`).join("")}<td><button type="button" class="sr-trace" data-medicine="${UI.safe(r.medicine_id)}" data-item="${UI.safe(r.purchase_item_id||"")}">Open Traceability</button></td></tr>`).join(""):`<tr><td colspan="${displayHeaders.length+1}" class="empty">No records.</td></tr>`;
   $("srCount").textContent=`${list.length} rows`;
   document.querySelectorAll(".sr-trace").forEach(button=>button.onclick=()=>{
     sessionStorage.setItem("medvika_inventory_trace",JSON.stringify({medicine_id:button.dataset.medicine,purchase_item_id:button.dataset.item}));
     window.MedvikaRouter.navigate("inventory");
   });
 }

 function render(){
   updateSummary();
   const list=filteredMeds();
   const v=$("srView").value;
   if(v==="current")renderCurrent(list);
   else if(v==="batch")renderBatch(list);
   else if(v==="zero")renderZero(list);
   else if(v==="low")renderLow(list);
   else if(v==="valuation")renderValuation(list);
   else if(v==="slow")renderMovement("SLOW_MOVING");
   else if(v==="nonmoving")renderMovement("NON_MOVING");
   else renderMovement("DUMP");
 }

 async function load(){
   const {data,error}=await supabaseClient
    .from("medicines")
    .select(`
      id,
      brand_name,
      generic_name,
      barcode,
      primary_pack_unit,
      loose_unit,
      units_per_pack,
      gst_percent,
      is_active,
      medicine_batches(
        id,
        batch_number,
        expiry_date,
        quantity_available,
        purchase_rate,
        cost_rate,
        selling_rate,
        mrp,
        gst_percent,
        is_blocked
      )
    `)
    .eq("pharmacy_id",pid)
    .eq("is_active",true)
    .order("brand_name");

   if(error)throw error;
   medicines=data||[];
   const movementResult=await supabaseClient.from("stock_movement_traceability_v1").select("*").eq("pharmacy_id",pid).order("inactivity_days",{ascending:false}).limit(50000);
   if(movementResult.error)throw movementResult.error;
   movementRows=movementResult.data||[];
   render();
 }

 function csv(){
   if(!displayRows.length)return UI.toast("No rows to export.","warning");
   const esc=v=>`"${String(v??"").replaceAll('"','""')}"`;
   const text=[displayHeaders,...displayRows].map(r=>r.map(esc).join(",")).join("\n");
   const a=document.createElement("a");
   const u=URL.createObjectURL(new Blob([text],{type:"text/csv;charset=utf-8"}));
   a.href=u;
   a.download=`Medvika_Stock_${$("srView").value}_${today()}.csv`;
   document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(u);
 }

 $("srView").onchange=render;
 $("srSearch").oninput=render;
 $("srLowThreshold").oninput=render;
 $("srSlowDays").oninput=render;
 $("srNonMovingDays").oninput=render;
 $("srRefresh").onclick=load;
 $("srPrint").onclick=()=>window.print();
 $("srCsv").onclick=csv;

 try{await load()}catch(e){UI.toast("Stock Report could not load: "+e.message,"error")}
};