window.initPurchaseModule=async function initPurchaseModule(){
const UI=window.MedvikaUI,$=id=>document.getElementById(id),notify=(m,t="success")=>UI.toast(m,t==="danger"?"error":t);
const form=$("purchaseForm"),itemsBody=document.querySelector("#purchaseItemsTable tbody"),recentBody=document.querySelector("#recentPurchasesTable tbody"),searchInput=$("purchaseMedicineSearch"),results=$("purchaseMedicineResults");
let medicines=[],items=[],suppliers=[],pharmacy=null,currentPurchaseGstContext=null,searchTimer=null,activePurchaseOrder=null;
let importRows=[],importHeaders=[],importMap={};
const pharmacyId=window.MedvikaAuth?.profile?.pharmacy_id||window.MedvikaAuth?.profile?.pharmacy?.id||null;
const num=v=>Number.isFinite(Number(v))?Number(v):0;
function nowInput(){const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16)}
const today=()=>new Date().toISOString().slice(0,10);
function parseExpiryInput(value){
 const s=String(value||"").trim();
 if(!s)return"";
 let d,m,y;
 let hit=s.match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})$/);
 if(hit){d=Number(hit[1]);m=Number(hit[2]);y=Number(hit[3])}
 else{hit=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(hit){y=Number(hit[1]);m=Number(hit[2]);d=Number(hit[3])}}
 if(!hit||y<2000||m<1||m>12||d<1||d>31)return"";
 const date=new Date(Date.UTC(y,m-1,d));
 if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)return"";
 return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`
}
function formatExpiryInput(value){
 const iso=parseExpiryInput(value);
 if(!iso)return String(value||"");
 const [y,m,d]=iso.split("-");
 return `${d}-${m}-${y}`
}
const supplierName=r=>r.supplier_name||r.name||r.company_name||r.full_name||r.trade_name||"Supplier";
function gstStateCode(gstin){const g=String(gstin||"").trim().toUpperCase();return /^\d{2}[A-Z0-9]{13}$/.test(g)?g.slice(0,2):""}
async function loadPharmacyGst(){const{data,error}=await supabaseClient.from("pharmacies").select("*").eq("id",pharmacyId).single();if(error)throw error;pharmacy=data||{}}
function refreshPurchaseGstContext(){
 const s=suppliers.find(x=>x.id===$("purchaseSupplierId").value)||null;
 const supplierGstin=String(s?.gstin||s?.gst_number||"").trim().toUpperCase();
 const supplierCode=String(s?.state_code||gstStateCode(supplierGstin)||"");
 const homeCode=String(pharmacy?.gst_state_code||gstStateCode(pharmacy?.gst_number)||"");
 const homeState=String(pharmacy?.registered_state||pharmacy?.state||"").trim().toLowerCase().replace(/[^a-z0-9]/g,"");
 const supplierState=String(s?.state||"").trim().toLowerCase().replace(/[^a-z0-9]/g,"");
 let taxType=null;
 if(homeCode&&supplierCode)taxType=homeCode===supplierCode?"CGST_SGST":"IGST";
 else if(homeState&&supplierState)taxType=homeState===supplierState?"CGST_SGST":"IGST";
 currentPurchaseGstContext={supplier_gstin:supplierGstin||null,place_of_supply:s?.state||null,place_of_supply_code:supplierCode||null,tax_type:taxType};
 if($("purchaseSupplierGstin"))$("purchaseSupplierGstin").value=supplierGstin||"Unregistered / Not set";
 if($("purchaseSupplierDl"))$("purchaseSupplierDl").value=s?.drug_license_number||"Not set";
 if($("purchaseSupplierContact"))$("purchaseSupplierContact").value=s?.mobile||"Not set";
 if($("purchaseSupplierPos"))$("purchaseSupplierPos").value=[s?.state,supplierCode?`(${supplierCode})`:""].filter(Boolean).join(" ");
 if($("purchaseTaxType"))$("purchaseTaxType").value=taxType==="IGST"?"IGST":taxType==="CGST_SGST"?"CGST + SGST":"Verify pharmacy/supplier state";
 totals();
 return currentPurchaseGstContext
}
async function snapshotPurchaseGst(data,purchaseNumber){const ctx=currentPurchaseGstContext||refreshPurchaseGstContext();let id=typeof data==="string"?data:(data?.id||data?.purchase_invoice_id||null);if(!id&&purchaseNumber){const{data:row,error}=await supabaseClient.from("purchase_invoices").select("id").eq("pharmacy_id",pharmacyId).eq("purchase_number",purchaseNumber).order("created_at",{ascending:false}).limit(1).maybeSingle();if(error)throw error;id=row?.id||null}if(!id)return;const{error}=await supabaseClient.from("purchase_invoices").update({supplier_gstin:ctx.supplier_gstin,place_of_supply:ctx.place_of_supply,place_of_supply_code:ctx.place_of_supply_code,tax_type:ctx.tax_type}).eq("id",id).eq("pharmacy_id",pharmacyId);if(error)throw error}
async function loadSuppliers(){const{data,error}=await supabaseClient.from("suppliers").select("*").eq("pharmacy_id",pharmacyId).order("name");if(error)throw error;suppliers=(data||[]).filter(x=>x.is_active!==false);$("purchaseSupplierId").innerHTML='<option value="">Select supplier</option>'+suppliers.map(x=>`<option value="${x.id}">${UI.safe(supplierName(x))}${x.mobile?" — "+UI.safe(x.mobile):""}</option>`).join("")}
async function loadMedicines(){const{data,error}=await supabaseClient.from("medicines").select(`id,brand_name,generic_name,composition,barcode,hsn_code,default_selling_rate,gst_percent,primary_pack_unit,medicine_batches(id,batch_number,expiry_date,purchase_rate,selling_rate,mrp,gst_percent)`).eq("pharmacy_id",pharmacyId).eq("is_active",true).order("brand_name");if(error)throw error;medicines=data||[]}
function localFound(q){return medicines.filter(m=>`${m.brand_name} ${m.generic_name||""} ${m.composition||""} ${m.barcode||""}`.toLowerCase().includes(q)).slice(0,12)}
async function searchMedicines(){const raw=searchInput.value.trim(),q=raw.toLowerCase();if(q.length<2){results.classList.remove("open");return}const local=localFound(q);results.innerHTML='<div class="search-result"><small>Searching Medvika catalogue…</small></div>';results.classList.add("open");let global=[];try{const{data,error}=await supabaseClient.rpc("search_global_medicine_catalogue",{p_search_text:raw,p_limit:20});if(error)throw error;global=data||[]}catch(e){console.warn("Global catalogue search failed",e)}const localHtml=local.map(m=>{const b=(m.medicine_batches||[])[0]||{};return `<div class="search-result" data-local-id="${m.id}"><b>${UI.safe(m.brand_name)}</b> <small>• This pharmacy</small><br><small>${UI.safe(m.generic_name||m.composition||"")}</small><br><small>HSN: ${UI.safe(m.hsn_code||"—")} | GST: ${num(m.gst_percent)}% | Last PTR: ${UI.money(b.purchase_rate||0)} | MRP: ${UI.money(b.mrp||0)}</small></div>`}).join("");const globalHtml=global.map(g=>`<div class="search-result" data-global-id="${g.id}"><b>${UI.safe(g.brand_name)}</b> <small>• Medvika catalogue</small><br><small>${UI.safe(g.manufacturer_name||"")} ${g.composition?"• "+UI.safe(g.composition):""}</small><br><small>${UI.safe(g.pack_size||"")} | HSN: ${UI.safe(g.hsn_code||"—")} | GST: ${num(g.gst_percent)}%</small></div>`).join("");const createHtml=`<div class="search-result" data-create-new="1"><b>+ Create "${UI.safe(raw)}"</b><br><small>Use only if the product is not available above.</small></div>`;results.innerHTML=(localHtml?`<div class="search-result"><small><b>LOCAL MEDICINES</b></small></div>${localHtml}`:"")+(globalHtml?`<div class="search-result"><small><b>MEDVIKA CATALOGUE</b></small></div>${globalHtml}`:"")+(!localHtml&&!globalHtml?'<div class="search-result"><small>No match found.</small></div>':"")+createHtml;results.querySelectorAll("[data-local-id]").forEach(r=>r.onclick=()=>{addItem(r.dataset.localId);searchInput.value="";results.classList.remove("open")});results.querySelectorAll("[data-global-id]").forEach(r=>r.onclick=()=>activateAndAddGlobal(r.dataset.globalId,r));const create=results.querySelector("[data-create-new]");if(create)create.onclick=()=>openInlineMedicine(raw)}
function scheduleSearch(){clearTimeout(searchTimer);searchTimer=setTimeout(searchMedicines,220)}
async function activateAndAddGlobal(globalId,rowEl){const old=rowEl.innerHTML;rowEl.innerHTML="<b>Adding to pharmacy…</b>";try{const{data,error}=await supabaseClient.rpc("activate_global_medicine_for_my_pharmacy",{p_global_medicine_id:globalId});if(error)throw error;await loadMedicines();addItem(data);searchInput.value="";results.classList.remove("open");notify("Medicine added from Medvika catalogue.")}catch(e){rowEl.innerHTML=old;notify(e.message,"danger")}}
function openInlineMedicine(seed=""){$("purchaseInlineBrand").value=seed||"";$("purchaseInlineManufacturer").value="";$("purchaseInlineComposition").value="";$("purchaseInlinePack").value="";$("purchaseInlineBarcode").value="";$("purchaseInlineHsn").value="";$("purchaseInlineGst").value="0";$("purchaseInlineMedicineCard").hidden=false;results.classList.remove("open");$("purchaseInlineMedicineCard").scrollIntoView({behavior:"smooth",block:"start"})}
async function createInlineMedicine(values=null){const payload=values||{p_brand_name:$("purchaseInlineBrand").value.trim(),p_manufacturer_name:$("purchaseInlineManufacturer").value.trim()||null,p_composition:$("purchaseInlineComposition").value.trim()||null,p_pack_size:$("purchaseInlinePack").value.trim()||null,p_hsn_code:$("purchaseInlineHsn").value.trim()||null,p_gst_percent:num($("purchaseInlineGst").value),p_barcode:$("purchaseInlineBarcode").value.trim()||null};if(!payload.p_brand_name)throw new Error("Brand name is required.");if(payload.p_hsn_code&&!/^\d{4,8}$/.test(String(payload.p_hsn_code)))throw new Error("HSN should contain 4 to 8 digits.");const{data,error}=await supabaseClient.rpc("create_purchase_medicine_inline_v2",payload);if(error)throw error;await loadMedicines();return data}
function addItem(id,defaults={}){const m=medicines.find(x=>x.id===id);if(!m)return;const b=(m.medicine_batches||[])[0]||{},barcode=String(defaults.barcode||m.barcode||"").trim(),conflict=barcode&&(medicines.find(x=>x.id!==id&&String(x.barcode||"").trim()===barcode)||items.find(x=>x.medicine_id!==id&&String(x.barcode||"").trim()===barcode));if(conflict)throw new Error(`Barcode ${barcode} is already assigned to ${conflict.brand_name}.`);items.push({purchase_order_item_id:defaults.purchase_order_item_id||null,medicine_id:m.id,brand_name:m.brand_name,generic_name:m.generic_name||m.composition||"",primary_pack_unit:m.primary_pack_unit||"pack",barcode,hsn_code:defaults.hsn_code??m.hsn_code??"",batch_number:defaults.batch_number||"",expiry_date:defaults.expiry_date||"",quantity:defaults.quantity??1,free_quantity:defaults.free_quantity??0,purchase_rate:defaults.purchase_rate??num(b.purchase_rate),mrp:defaults.mrp??num(b.mrp),selling_rate:defaults.selling_rate??num(b.selling_rate||m.default_selling_rate||b.mrp),discount_percent:defaults.discount_percent??0,gst_percent:defaults.gst_percent??num(b.gst_percent??m.gst_percent??0)});renderItems()}
function clearPurchaseOrderContext(){
 activePurchaseOrder=null;
 sessionStorage.removeItem("medvikaPurchaseOrderContext");
 items.forEach(i=>{i.purchase_order_item_id=null});
 if($("purchasePOContext"))$("purchasePOContext").hidden=true;
 renderItems();
 notify("PO link removed. This will save as a regular purchase.","warning");
}
function loadPurchaseOrderContext(){
 const raw=sessionStorage.getItem("medvikaPurchaseOrderContext");
 if(!raw)return;
 try{
  const context=JSON.parse(raw);
  if(!context?.purchase_order_id||!Array.isArray(context.items))throw new Error("Invalid PO context");
  activePurchaseOrder=context;
  $("purchasePOContext").hidden=false;
  $("purchasePOContextTitle").textContent=`Procuring against ${context.po_number}`;
  $("purchasePOContextText").textContent="Preferred supplier is preselected, but you may choose any supplier. The PO settles only after every ordered quantity is procured.";
  $("clearPurchasePOContext").onclick=clearPurchaseOrderContext;
  if(context.preferred_supplier_id&&suppliers.some(s=>s.id===context.preferred_supplier_id)){
   $("purchaseSupplierId").value=context.preferred_supplier_id;
   refreshPurchaseGstContext();
   applySupplierPaymentDefaults();
  }
  context.items.forEach(poItem=>{
   if(num(poItem.remaining_quantity)<=0)return;
   addItem(poItem.medicine_id,{
    purchase_order_item_id:poItem.purchase_order_item_id,
    quantity:num(poItem.remaining_quantity),
    purchase_rate:num(poItem.estimated_rate)
   });
  });
  notify(`${context.po_number} loaded. Select the actual supplier and enter invoice/batch details.`);
 }catch(error){
  sessionStorage.removeItem("medvikaPurchaseOrderContext");
  activePurchaseOrder=null;
  notify("Purchase Order context could not be loaded: "+error.message,"danger");
 }
}
function line(i){const gross=num(i.quantity)*num(i.purchase_rate),discount=gross*num(i.discount_percent)/100,taxable=gross-discount,gst=taxable*num(i.gst_percent)/100,total=taxable+gst,sell=num(i.quantity)*num(i.selling_rate),margin=sell-gross;return{gross,discount,taxable,gst,total,margin,marginPct:sell>0?margin/sell*100:0}}
function renderItems(){if(!items.length){itemsBody.innerHTML='<tr><td colspan="14" class="purchase-empty">Search and add medicines.</td></tr>';totals();return}itemsBody.innerHTML=items.map((i,n)=>{const v=line(i),cls=v.margin<0?"purchase-badge-danger":v.marginPct<5?"purchase-badge-warning":"purchase-badge-success";return `<tr><td><b>${UI.safe(i.brand_name)}</b><br><small>${UI.safe(i.generic_name)}${i.barcode?` • Barcode: ${UI.safe(i.barcode)}`:""}</small></td><td><input class="hsn" data-i="${n}" inputmode="numeric" value="${UI.safe(i.hsn_code||"")}"></td><td><input class="batch" data-i="${n}" value="${UI.safe(i.batch_number)}"></td><td><input class="expiry" data-i="${n}" type="text" inputmode="numeric" maxlength="10" placeholder="DD-MM-YYYY" value="${formatExpiryInput(i.expiry_date)}"></td><td><input class="qty" data-i="${n}" type="number" min=".001" step=".001" value="${i.quantity}"></td><td><input class="free" data-i="${n}" type="number" min="0" step=".001" value="${i.free_quantity}"></td><td><input class="ptr" data-i="${n}" type="number" min="0" step=".01" value="${i.purchase_rate}"></td><td><input class="mrp" data-i="${n}" type="number" min="0" step=".01" value="${i.mrp}"></td><td><input class="sell" data-i="${n}" type="number" min="0" step=".01" value="${i.selling_rate}"></td><td><input class="disc" data-i="${n}" type="number" min="0" max="100" step=".01" value="${i.discount_percent}"></td><td><input class="gst" data-i="${n}" type="number" min="0" step=".01" value="${i.gst_percent}"></td><td><span class="purchase-badge ${cls}">${v.marginPct.toFixed(1)}%</span></td><td>${UI.money(v.total)}</td><td><button type="button" class="purchase-remove" data-i="${n}">Remove</button></td></tr>`}).join("");[[".hsn","hsn_code",false],[".batch","batch_number",false],[".qty","quantity",true],[".free","free_quantity",true],[".ptr","purchase_rate",true],[".mrp","mrp",true],[".sell","selling_rate",true],[".disc","discount_percent",true],[".gst","gst_percent",true]].forEach(([s,f,isNum])=>document.querySelectorAll(s).forEach(el=>el.onchange=()=>{items[num(el.dataset.i)][f]=isNum?num(el.value):el.value.trim();renderItems()}));
document.querySelectorAll(".expiry").forEach(el=>el.onchange=()=>{
 const index=num(el.dataset.i),iso=parseExpiryInput(el.value);
 if(!iso){notify(`Use DD-MM-YYYY for ${items[index].brand_name} expiry.`,"warning");el.value=formatExpiryInput(items[index].expiry_date);return}
 items[index].expiry_date=iso;renderItems()
});
document.querySelectorAll(".purchase-remove").forEach(b=>b.onclick=()=>{items.splice(num(b.dataset.i),1);renderItems()});totals()}
function totals(){
 let gross=0,disc=0,tax=0,gst=0;
 items.forEach(i=>{const v=line(i);gross+=v.gross;disc+=v.discount;tax+=v.taxable;gst+=v.gst});
 const taxType=currentPurchaseGstContext?.tax_type;
 const cgst=taxType==="CGST_SGST"?Math.round(gst*50)/100:0;
 const sgst=taxType==="CGST_SGST"?gst-cgst:0;
 const igst=taxType==="IGST"?gst:0;
 const grand=tax+gst-num($("purchaseInvoiceDiscount").value)+num($("transportCharges").value)+num($("otherCharges").value)+num($("purchaseRoundOff").value);
 $("purchaseGrossText").textContent=UI.money(gross);
 $("purchaseItemDiscountText").textContent=UI.money(disc);
 $("purchaseTaxableText").textContent=UI.money(tax);
 $("purchaseGstText").textContent=UI.money(gst);
 if($("purchaseCgstText"))$("purchaseCgstText").textContent=UI.money(cgst);
 if($("purchaseSgstText"))$("purchaseSgstText").textContent=UI.money(sgst);
 if($("purchaseIgstText"))$("purchaseIgstText").textContent=UI.money(igst);
 if($("purchaseCgstCard"))$("purchaseCgstCard").hidden=taxType==="IGST";
 if($("purchaseSgstCard"))$("purchaseSgstCard").hidden=taxType==="IGST";
 if($("purchaseIgstCard"))$("purchaseIgstCard").hidden=taxType!=="IGST";
 $("purchaseGrandTotalText").textContent=UI.money(grand);
 const terms=$("paymentTerms").value;
 if(terms==="cash")$("purchaseAmountPaid").value=grand.toFixed(2);
 else if(terms==="credit")$("purchaseAmountPaid").value="0";
 if($("purchasePaymentMethod")){
  if(terms==="credit"){$("purchasePaymentMethod").value="credit";$("purchasePaymentMethod").disabled=true}
  else{$("purchasePaymentMethod").disabled=false;if($("purchasePaymentMethod").value==="credit")$("purchasePaymentMethod").value="cash"}
 }
 return{grand,gst,cgst,sgst,igst}
}
function updatePurchaseDueDate(){
 const terms=$("paymentTerms").value,base=$("supplierInvoiceDate").value,days=Math.max(0,Math.trunc(num($("creditDays").value)));
 if(terms==="cash"||!base){$("dueDate").value="";return}
 const date=new Date(base+"T00:00:00");date.setDate(date.getDate()+days);
 $("dueDate").value=new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,10)
}
function applySupplierPaymentDefaults(){
 const supplier=suppliers.find(x=>x.id===$("purchaseSupplierId").value),terms=String(supplier?.payment_terms||"").toLowerCase();
 if(["cash","credit","partial"].includes(terms))$("paymentTerms").value=terms;
 if(supplier?.credit_days!==undefined&&supplier?.credit_days!==null)$("creditDays").value=Math.max(0,Math.trunc(num(supplier.credit_days)));
 updatePurchaseDueDate();totals()
}
function validate(){if(!pharmacyId)throw new Error("Pharmacy ID is missing from the logged-in profile.");if(!$("purchaseSupplierId").value)throw new Error("Select a supplier.");if(!$("supplierInvoiceNumber").value.trim())throw new Error("Supplier invoice number is required.");if(!$("supplierInvoiceDate").value)throw new Error("Supplier invoice date is required.");if(!$("purchaseDate").value)throw new Error("Purchase date is required.");if(!currentPurchaseGstContext?.tax_type)throw new Error("Set pharmacy and supplier state before posting this purchase.");if(!items.length)throw new Error("Add at least one medicine.");items.forEach(i=>{if(i.hsn_code&&!/^\d{4,8}$/.test(String(i.hsn_code)))throw new Error(`Invalid HSN for ${i.brand_name}.`);if(!i.batch_number)throw new Error(`Batch number required for ${i.brand_name}.`);if(!i.expiry_date||i.expiry_date<=today())throw new Error(`Valid future expiry required for ${i.brand_name}.`);if(num(i.quantity)<=0||num(i.purchase_rate)<=0||num(i.mrp)<=0)throw new Error(`Quantity, PTR and MRP must be greater than zero for ${i.brand_name}.`);if(num(i.purchase_rate)>num(i.mrp))throw new Error(`PTR cannot exceed MRP for ${i.brand_name}.`)})}
let viewedPurchaseMarkup="";
function purchaseInvoiceMarkup(invoice,lines){const supplier=invoice.suppliers||{},date=v=>v?new Date(v).toLocaleDateString("en-IN"):"—",lineRows=lines.map((x,n)=>`<tr><td>${n+1}</td><td><b>${UI.safe(x.medicines?.brand_name||"Medicine")}</b><br><small>${UI.safe(x.medicines?.generic_name||"")}</small></td><td>${UI.safe(x.batch_number)}</td><td>${date(x.expiry_date+"T00:00:00")}</td><td>${num(x.quantity)}</td><td>${num(x.free_quantity)}</td><td>${UI.money(x.purchase_rate)}</td><td>${UI.money(x.mrp)}</td><td>${num(x.gst_percent)}%</td><td>${UI.money(x.line_total)}</td></tr>`).join("");return `<article class="purchase-invoice-document"><header><div><h2>${UI.safe(pharmacy?.name||pharmacy?.pharmacy_name||"Pharmacy")}</h2><p>${UI.safe(pharmacy?.address||pharmacy?.registered_address||"")}</p><small>GSTIN: ${UI.safe(pharmacy?.gst_number||"—")}</small></div><div><h2>PURCHASE INVOICE</h2><p><b>${UI.safe(invoice.purchase_number||"—")}</b></p></div></header><section class="purchase-invoice-meta"><div><b>Supplier</b><br>${UI.safe(supplier.name||"Supplier")}<br><small>${UI.safe(supplier.mobile||"")} ${UI.safe(supplier.gstin||supplier.gst_number||"")}</small></div><div><b>Supplier Invoice</b><br>${UI.safe(invoice.supplier_invoice_number||invoice.invoice_number||"—")}<br><small>Date: ${date(invoice.supplier_invoice_date||invoice.invoice_date)}</small></div><div><b>Purchase Date</b><br>${date(invoice.purchase_date||invoice.created_at)}<br><small>${UI.safe(invoice.tax_type==="IGST"?"IGST":"CGST + SGST")}</small></div></section><div class="table"><table><thead><tr><th>#</th><th>Medicine</th><th>Batch</th><th>Expiry</th><th>Paid Qty</th><th>Free</th><th>PTR</th><th>MRP</th><th>GST</th><th>Total</th></tr></thead><tbody>${lineRows}</tbody></table></div><section class="purchase-invoice-totals"><div>Taxable <b>${UI.money(invoice.taxable_amount)}</b></div><div>CGST <b>${UI.money(invoice.cgst_amount)}</b></div><div>SGST <b>${UI.money(invoice.sgst_amount)}</b></div><div>IGST <b>${UI.money(invoice.igst_amount)}</b></div><div>Grand Total <b>${UI.money(invoice.grand_total)}</b></div><div>Paid <b>${UI.money(invoice.amount_paid)}</b></div><div>Outstanding <b>${UI.money(invoice.outstanding_amount)}</b></div></section></article>`}
async function viewPurchaseInvoice(id){const [a,b]=await Promise.all([supabaseClient.from("purchase_invoices").select("*,suppliers(*)").eq("id",id).eq("pharmacy_id",pharmacyId).single(),supabaseClient.from("purchase_items").select("*,medicines(brand_name,generic_name,hsn_code)").eq("purchase_invoice_id",id).eq("pharmacy_id",pharmacyId).order("created_at")]);if(a.error)throw a.error;if(b.error)throw b.error;viewedPurchaseMarkup=purchaseInvoiceMarkup(a.data,b.data||[]);$("purchaseInvoiceViewContent").innerHTML=viewedPurchaseMarkup;$("purchaseInvoiceViewPanel").hidden=false;$("purchaseInvoiceViewPanel").scrollIntoView({behavior:"smooth",block:"start"})}
function printViewedPurchase(){if(!viewedPurchaseMarkup)return notify("Open a purchase invoice first.","warning");const win=window.open("","_blank");if(!win)return notify("Allow pop-ups to print the purchase invoice.","warning");win.document.write(`<!doctype html><html><head><title>Purchase Invoice</title><style>body{font-family:Arial,sans-serif;color:#17212b;padding:20px}header,.purchase-invoice-meta,.purchase-invoice-totals{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px}.purchase-invoice-meta>div{border:1px solid #ccd6dd;padding:10px;flex:1}table{width:100%;border-collapse:collapse}th,td{border:1px solid #aebfca;padding:7px;text-align:left;font-size:12px}.purchase-invoice-totals{justify-content:flex-end}.purchase-invoice-totals div{min-width:130px;padding:7px;border-bottom:1px solid #ccd6dd}@page{size:A4;margin:12mm}</style></head><body>${viewedPurchaseMarkup}</body></html>`);win.document.close();win.focus();setTimeout(()=>win.print(),200)}

async function loadRecent(){const{data,error}=await supabaseClient.from("purchase_invoices").select(`id,purchase_number,supplier_invoice_number,purchase_date,grand_total,amount_paid,outstanding_amount,payment_status,purchase_status,suppliers(*)`).eq("pharmacy_id",pharmacyId).order("purchase_date",{ascending:false}).limit(20);if(error){recentBody.innerHTML=`<tr><td colspan="9">${UI.safe(error.message)}</td></tr>`;return}recentBody.innerHTML=(data||[]).map(x=>`<tr><td><b>${UI.safe(x.purchase_number)}</b></td><td>${UI.safe(x.supplier_invoice_number)}</td><td>${new Date(x.purchase_date).toLocaleString()}</td><td>${UI.safe(supplierName(x.suppliers||{}))}</td><td>${UI.money(x.grand_total)}</td><td>${UI.money(x.amount_paid)}</td><td>${UI.money(x.outstanding_amount)}</td><td>${UI.safe(String(x.payment_status||"unpaid").replaceAll("_"," ").toUpperCase())}</td><td><button type="button" class="purchase-view-button" data-id="${x.id}">View</button></td></tr>`).join("")||'<tr><td colspan="9">No purchases found.</td></tr>';document.querySelectorAll(".purchase-view-button").forEach(button=>button.onclick=()=>viewPurchaseInvoice(button.dataset.id).catch(e=>notify(e.message,"danger")))}

const importFields=[["brand_name","Brand / Medicine",true],["manufacturer_name","Manufacturer",false],["composition","Composition",false],["pack_size","Pack Size",false],["barcode","Barcode",false],["hsn_code","HSN",false],["gst_percent","GST %",false],["batch_number","Batch",true],["expiry_date","Expiry",true],["quantity","Quantity",true],["free_quantity","Free Qty",false],["purchase_rate","PTR / Purchase Rate",true],["mrp","MRP",true],["selling_rate","Selling Rate",false],["discount_percent","Discount %",false]];
const aliases={brand_name:["brand","brand name","medicine","medicine name","item","item name","product","product name"],manufacturer_name:["manufacturer","manufacturer name","company","company name","mfr"],composition:["composition","salt","generic","generic name"],pack_size:["pack","pack size","packing"],barcode:["barcode","bar code","ean","gtin","upc"],hsn_code:["hsn","hsn code"],gst_percent:["gst","gst %","gst percent","tax","tax %"],batch_number:["batch","batch no","batch number","batchno"],expiry_date:["expiry","expiry date","exp","exp date"],quantity:["qty","quantity","purchase qty"],free_quantity:["free","free qty","scheme qty"],purchase_rate:["ptr","purchase rate","rate","purchase price"],mrp:["mrp","m.r.p"],selling_rate:["selling rate","sale rate","sell rate"],discount_percent:["discount","discount %","disc","disc %"]};
function normHeader(v){return String(v||"").trim().toLowerCase().replace(/[_\-]+/g," ").replace(/\s+/g," ")}
function guessMap(){importMap={};const nh=importHeaders.map(h=>[h,normHeader(h)]);importFields.forEach(([key])=>{const opts=aliases[key]||[];const hit=nh.find(([h,n])=>opts.includes(n))||nh.find(([h,n])=>opts.some(a=>n.includes(a)));importMap[key]=hit?hit[0]:""})}
function downloadPurchaseTemplate(){
 const headers=["brand_name","manufacturer_name","composition","pack_size","barcode","hsn_code","gst_percent","batch_number","expiry_date","quantity","free_quantity","purchase_rate","mrp","selling_rate","discount_percent"];
 const csv="\uFEFF"+headers.join(",")+"\n";
 const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
 const a=document.createElement("a");
 a.href=url;
 a.download="medvika-purchase-import-template.csv";
 document.body.appendChild(a);
 a.click();
 a.remove();
 URL.revokeObjectURL(url)
}
function parseCsv(text){const out=[];let row=[],cell="",q=false;for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(c==='"'){if(q&&n==='"'){cell+='"';i++}else q=!q}else if(c===","&&!q){row.push(cell);cell=""}else if((c==="\n"||c==="\r")&&!q){if(c==="\r"&&n==="\n")i++;row.push(cell);cell="";if(row.some(x=>String(x).trim()!==""))out.push(row);row=[]}else cell+=c}if(cell||row.length){row.push(cell);if(row.some(x=>String(x).trim()!==""))out.push(row)}if(!out.length)return[];const heads=out[0].map(x=>String(x).trim());return out.slice(1).map(r=>Object.fromEntries(heads.map((h,i)=>[h,r[i]??""])))}
async function readImportFile(file){const ext=file.name.split(".").pop().toLowerCase();if(ext!=="csv")throw new Error("Purchase import currently accepts CSV files only. Download and use the provided template.");return parseCsv(await file.text())}
function renderMapping(){$("purchaseImportMapping").innerHTML=importFields.map(([key,label,required])=>`<label class="erp-field">${UI.safe(label)}${required?" *":""}<select data-map-key="${key}"><option value="">Not mapped</option>${importHeaders.map(h=>`<option value="${UI.safe(h)}" ${importMap[key]===h?"selected":""}>${UI.safe(h)}</option>`).join("")}</select></label>`).join("");document.querySelectorAll("[data-map-key]").forEach(s=>s.onchange=()=>{importMap[s.dataset.mapKey]=s.value;renderImportPreview()})}
function mappedValue(row,key){const h=importMap[key];return h?row[h]:""}
function normalizeDate(v){
 if(v===null||v===undefined||v==="")return"";
 if(typeof v==="number"&&window.XLSX?.SSF){
  const p=XLSX.SSF.parse_date_code(v);
  if(p)return `${p.y}-${String(p.m).padStart(2,"0")}-${String(p.d).padStart(2,"0")}`
 }
 const parsed=parseExpiryInput(String(v).trim());
 if(parsed)return parsed;
 const d=new Date(String(v).trim());
 return Number.isNaN(d.getTime())?"":d.toISOString().slice(0,10)
}
function rowToImport(r){const rawGst=mappedValue(r,"gst_percent");return{brand_name:String(mappedValue(r,"brand_name")||"").trim(),manufacturer_name:String(mappedValue(r,"manufacturer_name")||"").trim(),composition:String(mappedValue(r,"composition")||"").trim(),pack_size:String(mappedValue(r,"pack_size")||"").trim(),barcode:String(mappedValue(r,"barcode")||"").replace(/\.0$/,"").trim(),hsn_code:String(mappedValue(r,"hsn_code")||"").replace(/\.0$/,"").trim(),gst_percent:rawGst===null||rawGst===undefined||String(rawGst).trim()===""?null:num(rawGst),batch_number:String(mappedValue(r,"batch_number")||"").trim(),expiry_date:normalizeDate(mappedValue(r,"expiry_date")),quantity:num(mappedValue(r,"quantity")),free_quantity:num(mappedValue(r,"free_quantity")),purchase_rate:num(mappedValue(r,"purchase_rate")),mrp:num(mappedValue(r,"mrp")),selling_rate:num(mappedValue(r,"selling_rate")),discount_percent:num(mappedValue(r,"discount_percent"))}}
function importRowValid(x){return!!x.brand_name&&!!x.batch_number&&!!x.expiry_date&&x.quantity>0&&x.purchase_rate>0&&x.mrp>0}
function renderImportPreview(){const preview=importRows.slice(0,20).map(rowToImport),cols=["brand_name","manufacturer_name","barcode","batch_number","expiry_date","quantity","purchase_rate","mrp","gst_percent","hsn_code"];$("purchaseImportPreviewHead").innerHTML="<tr>"+cols.map(c=>`<th>${UI.safe(c.replaceAll("_"," "))}</th>`).join("")+"<th>Status</th></tr>";$("purchaseImportPreviewBody").innerHTML=preview.length?preview.map(x=>"<tr>"+cols.map(c=>`<td>${UI.safe(x[c]??"")}</td>`).join("")+`<td>${importRowValid(x)?"Ready":"Check mapping/data"}</td></tr>`).join(""):'<tr><td class="purchase-empty">No rows.</td></tr>';const valid=importRows.map(rowToImport).filter(importRowValid).length;$("purchaseImportStatus").textContent=`${importRows.length} rows loaded • ${valid} currently valid`;$("purchaseImportApply").disabled=!valid}
async function resolveImportedMedicine(x){const q=x.brand_name.toLowerCase();let local=medicines.find(m=>m.brand_name?.trim().toLowerCase()===q);if(!local)local=medicines.find(m=>m.brand_name?.toLowerCase().includes(q)||q.includes((m.brand_name||"").toLowerCase()));if(local)return local.id;try{const{data,error}=await supabaseClient.rpc("search_global_medicine_catalogue",{p_search_text:x.brand_name,p_limit:20});if(error)throw error;const g=(data||[]).find(v=>v.brand_name?.trim().toLowerCase()===q)||(data||[])[0];if(g){const a=await supabaseClient.rpc("activate_global_medicine_for_my_pharmacy",{p_global_medicine_id:g.id});if(a.error)throw a.error;await loadMedicines();return a.data}}catch(e){console.warn("Global resolve failed",x.brand_name,e)}return await createInlineMedicine({p_brand_name:x.brand_name,p_manufacturer_name:x.manufacturer_name||null,p_composition:x.composition||null,p_pack_size:x.pack_size||null,p_hsn_code:x.hsn_code||null,p_gst_percent:num(x.gst_percent),p_barcode:x.barcode||null})}


/* ===== Medvika scan helpers: pack + invoice ===== */
let purchaseScanObjectUrl=null,purchaseInvoiceScanObjectUrl=null;

function setImagePreview(file,imgId,wrapId,kind="pack"){
  const img=$(imgId),wrap=$(wrapId);
  if(kind==="pack"&&purchaseScanObjectUrl)URL.revokeObjectURL(purchaseScanObjectUrl);
  if(kind==="invoice"&&purchaseInvoiceScanObjectUrl)URL.revokeObjectURL(purchaseInvoiceScanObjectUrl);
  const url=URL.createObjectURL(file);
  if(kind==="pack")purchaseScanObjectUrl=url;else purchaseInvoiceScanObjectUrl=url;
  img.src=url;wrap.hidden=false;
}

async function ensureTesseract(){
  if(window.Tesseract)return window.Tesseract;
  await new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-medvika-tesseract="1"]');
    if(existing){
      existing.addEventListener("load",resolve,{once:true});
      existing.addEventListener("error",()=>reject(new Error("OCR library could not load.")),{once:true});
      return;
    }
    const s=document.createElement("script");
    s.src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    s.async=true;s.dataset.medvikaTesseract="1";
    s.onload=resolve;s.onerror=()=>reject(new Error("OCR library could not load. Check internet connection."));
    document.head.appendChild(s);
  });
  if(!window.Tesseract)throw new Error("OCR library did not initialize.");
  return window.Tesseract;
}

async function detectBarcodeFromFile(file){
  if(!("BarcodeDetector" in window))return "";
  try{
    const formats=await BarcodeDetector.getSupportedFormats();
    const detector=new BarcodeDetector({formats});
    const bitmap=await createImageBitmap(file);
    const codes=await detector.detect(bitmap);
    bitmap.close?.();
    return codes?.[0]?.rawValue||"";
  }catch(e){console.warn("Barcode detection skipped",e);return ""}
}


function normalizeMedText(v){
  return String(v||"").toLowerCase()
    .replace(/[®™©]/g," ")
    .replace(/[^a-z0-9]+/g," ")
    .replace(/\s+/g," ")
    .trim();
}
function similarityScore(a,b){
  a=normalizeMedText(a); b=normalizeMedText(b);
  if(!a||!b)return 0;
  if(a===b)return 100;
  if(a.includes(b)||b.includes(a))return 90;
  const A=new Set(a.split(" ").filter(x=>x.length>1));
  const B=new Set(b.split(" ").filter(x=>x.length>1));
  if(!A.size||!B.size)return 0;
  let hit=0; A.forEach(x=>{if(B.has(x))hit++});
  return Math.round((2*hit/(A.size+B.size))*100);
}
function ocrBrandCandidates(text){
  const stop=/\b(mrp|maximum retail|batch|b\.?\s*no|exp|expiry|mfg|manufactured|marketed|composition|warning|schedule|lic|net\s*(qty|content)|each\s|keep\s|store\s|for\s+sale|price|inclusive|tablet|capsule|syrup|injection|dosage|prescription|gst|hsn)\b/i;
  return String(text||"").split(/\n+/)
    .map(x=>x.replace(/[|©®™]/g," ").replace(/\s+/g," ").trim())
    .filter(x=>x.length>=3&&x.length<=55&&/[A-Za-z]/.test(x)&&!stop.test(x))
    .slice(0,12);
}
async function matchMedicineFromOcr(text,barcode=""){
  const normalizedOcr=normalizeMedText(text);

  // 1) Prefer an exact/local brand already present in the pharmacy.
  let bestLocal=null,bestLocalScore=0;
  for(const m of medicines){
    if(barcode && String(m.barcode||"").trim()===barcode)return {brand:m.brand_name,source:"local-barcode",score:100};
    const brand=normalizeMedText(m.brand_name);
    if(!brand)continue;
    let score=normalizedOcr.includes(brand)?98:0;
    if(!score){
      for(const c of ocrBrandCandidates(text))score=Math.max(score,similarityScore(c,m.brand_name));
    }
    if(score>bestLocalScore){bestLocalScore=score;bestLocal=m}
  }
  if(bestLocal&&bestLocalScore>=82)return {brand:bestLocal.brand_name,source:"local-ocr",score:bestLocalScore};

  // 2) Ask the Medvika catalogue using several OCR candidate lines, then score
  // returned brands against the full OCR text. We do not blindly accept result #1.
  const candidates=ocrBrandCandidates(text).slice(0,6);
  let bestGlobal=null,bestGlobalScore=0;
  for(const c of candidates){
    try{
      const {data,error}=await supabaseClient.rpc("search_global_medicine_catalogue",{p_search_text:c,p_limit:8});
      if(error)continue;
      for(const g of (data||[])){
        const brand=g.brand_name||"";
        let score=normalizedOcr.includes(normalizeMedText(brand))?97:similarityScore(c,brand);
        // Product names are often "Brand Strength"; give a small preference
        // when multiple significant words from the catalogue brand are visible.
        const words=normalizeMedText(brand).split(" ").filter(x=>x.length>2);
        const visible=words.filter(w=>normalizedOcr.includes(w)).length;
        if(words.length&&visible>=Math.min(2,words.length))score=Math.max(score,88);
        if(score>bestGlobalScore){bestGlobalScore=score;bestGlobal=g}
      }
    }catch(_){}
    if(bestGlobalScore>=97)break;
  }
  if(bestGlobal&&bestGlobalScore>=78)return {brand:bestGlobal.brand_name,source:"catalogue-ocr",score:bestGlobalScore};

  // 3) No confident match. Do NOT invent a medicine name.
  return null;
}

function parsePackOcr(text){
  const clean=String(text||"").replace(/\r/g,"\n");
  const lines=clean.split(/\n+/).map(x=>x.trim()).filter(Boolean);
  const mrpMatch=clean.match(/\b(?:M\.?\s*R\.?\s*P\.?|MRP|MAX(?:IMUM)?\s+RETAIL\s+PRICE)\s*[:\-₹Rs.\s]*([0-9]+(?:\.[0-9]{1,2})?)/i);
  const batchMatch=clean.match(/\b(?:BATCH|B\.?\s*NO\.?|BATCH\s*NO\.?)\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-\/]{1,20})/i);
  let expiry="";
  const exp=clean.match(/\b(?:EXP(?:IRY)?|USE\s*BEFORE)\s*[:\-]?\s*(\d{1,2})[\/\-.](\d{2,4})/i)
      ||clean.match(/\b(\d{1,2})[\/\-.](\d{2,4})\b/);
  if(exp){
    let mm=String(exp[1]).padStart(2,"0"),yy=String(exp[2]);
    if(yy.length===2)yy="20"+yy;
    if(Number(mm)>=1&&Number(mm)<=12)expiry=`${yy}-${mm}-01`;
  }
  const ignored=/^(mrp|batch|b\.?\s*no|exp|expiry|mfg|manufactured|marketed|composition|warning|schedule|lic|net\s*(qty|content)|each\s|keep\s|store\s|for\s)/i;
  const brand=(lines.find(x=>x.length>=3&&x.length<=60&&!ignored.test(x)&&/[A-Za-z]/.test(x))||"").replace(/[|©®™]/g,"").trim();
  return{brand,batch_number:batchMatch?.[1]||"",expiry_date:expiry,mrp:mrpMatch?.[1]||""};
}

async function scanImage(file){
  if(!file||!String(file.type||"").startsWith("image/"))throw new Error("Please capture or choose an image.");
  $("purchaseScanStatus").textContent=`Photo selected: ${file.name||"camera image"} • ${(file.size/1024/1024).toFixed(1)} MB`;
  setImagePreview(file,"purchaseScanPreview","purchaseScanPreviewWrap","pack");
  $("purchaseScanResolve").disabled=true;
  $("purchaseScanText").value="";
  $("purchaseScanBarcode").value="";
  $("purchaseScanBrand").value="";
  $("purchaseScanBatch").value="";
  $("purchaseScanExpiry").value="";
  $("purchaseScanMrp").value="";
  const barcode=await detectBarcodeFromFile(file);
  if(barcode)$("purchaseScanBarcode").value=barcode;
  $("purchaseScanStatus").textContent=barcode?"Barcode found. Reading pack text…":"Photo received. Reading pack text…";
  const T=await ensureTesseract();
  const result=await T.recognize(file,"eng",{logger:m=>{
    if(m?.status==="recognizing text"&&Number.isFinite(m.progress))
      $("purchaseScanStatus").textContent=`Reading pack text… ${Math.round(m.progress*100)}%`;
  }});
  const ocr=result?.data?.text||"";
  $("purchaseScanText").value=ocr;
  const parsed=parsePackOcr(ocr);
  if(parsed.batch_number)$("purchaseScanBatch").value=parsed.batch_number;
  if(parsed.expiry_date)$("purchaseScanExpiry").value=formatExpiryInput(parsed.expiry_date);
  if(parsed.mrp)$("purchaseScanMrp").value=parsed.mrp;

  $("purchaseScanStatus").textContent="Matching medicine with pharmacy / Medvika catalogue…";
  const matched=await matchMedicineFromOcr(ocr,barcode);
  if(matched){
    $("purchaseScanBrand").value=matched.brand;
    $("purchaseScanStatus").textContent=`Medicine matched: ${matched.brand}. Verify all detected details before adding.`;
  }else{
    // OCR text is still shown, but we deliberately leave brand blank rather than
    // filling a random manufacturer/heading as the medicine name.
    $("purchaseScanBrand").value="";
    $("purchaseScanStatus").textContent="Pack read, but medicine name was not matched confidently. Enter/search the brand manually; batch/MRP/expiry may still be usable.";
  }
  $("purchaseScanResolve").disabled=!($("purchaseScanBrand").value.trim()||$("purchaseScanBarcode").value.trim());
}

async function resolveScannedMedicine(){
  const barcode=$("purchaseScanBarcode").value.trim(),brand=$("purchaseScanBrand").value.trim();
  if(!barcode&&!brand)throw new Error("No brand or barcode detected. Enter the brand manually.");
  let local=null;
  if(barcode)local=medicines.find(m=>String(m.barcode||"").trim()===barcode);
  if(!local&&brand){
    const q=brand.toLowerCase();
    local=medicines.find(m=>String(m.brand_name||"").trim().toLowerCase()===q)
      ||medicines.find(m=>String(m.brand_name||"").toLowerCase().includes(q)||q.includes(String(m.brand_name||"").toLowerCase()));
  }
  let id=local?.id||null;
  if(!id){
    const query=brand||barcode;
    const {data,error}=await supabaseClient.rpc("search_global_medicine_catalogue",{p_search_text:query,p_limit:20});
    if(error)throw error;
    const q=brand.toLowerCase();
    const g=(data||[]).find(v=>String(v.brand_name||"").trim().toLowerCase()===q)||(data||[])[0];
    if(g){
      const a=await supabaseClient.rpc("activate_global_medicine_for_my_pharmacy",{p_global_medicine_id:g.id});
      if(a.error)throw a.error;
      await loadMedicines();id=a.data;
    }
  }
  if(!id){
    if(!brand)throw new Error("Barcode was not found. Enter the brand name, then try again.");
    id=await createInlineMedicine({
      p_brand_name:brand,p_manufacturer_name:null,p_composition:null,p_pack_size:null,
      p_hsn_code:null,p_gst_percent:num($("purchaseScanGst").value),p_barcode:barcode||null
    });
  }
  addItem(id,{
    barcode,
    batch_number:$("purchaseScanBatch").value.trim(),
    expiry_date:parseExpiryInput($("purchaseScanExpiry").value),
    mrp:num($("purchaseScanMrp").value),
    gst_percent:num($("purchaseScanGst").value)
  });
  $("purchaseScanCard").hidden=true;
  notify("Scanned medicine added. Verify batch, expiry, PTR, MRP and GST before saving.");
}

function parseInvoiceHeader(text){
  const s=String(text||"");
  const no=s.match(/\b(?:INVOICE\s*(?:NO|NUMBER|#)?|INV\.?\s*NO\.?|BILL\s*NO\.?)\s*[:#\-]?\s*([A-Z0-9\-\/]+)/i);
  const gst=s.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]\b/i);
  const dm=s.match(/\b(?:INVOICE\s*DATE|DATE)\s*[:\-]?\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/i);
  let date="";
  if(dm){let y=dm[3];if(y.length===2)y="20"+y;date=`${y}-${String(dm[2]).padStart(2,"0")}-${String(dm[1]).padStart(2,"0")}`}
  return{number:no?.[1]||"",gstin:gst?.[0]?.toUpperCase()||"",date};
}

async function scanInvoiceImage(file){
  if(!file||!String(file.type||"").startsWith("image/"))throw new Error("Please capture or choose an invoice image.");
  $("purchaseInvoiceScanStatus").textContent=`Invoice selected: ${file.name||"camera image"} • ${(file.size/1024/1024).toFixed(1)} MB`;
  setImagePreview(file,"purchaseInvoiceScanPreview","purchaseInvoicePreviewWrap","invoice");
  $("purchaseInvoiceBuildDraft").disabled=true;
  const T=await ensureTesseract();
  const result=await T.recognize(file,"eng",{logger:m=>{
    if(m?.status==="recognizing text"&&Number.isFinite(m.progress))
      $("purchaseInvoiceScanStatus").textContent=`Reading invoice… ${Math.round(m.progress*100)}%`;
  }});
  const ocr=result?.data?.text||"";
  $("purchaseInvoiceScanText").value=ocr;
  const h=parseInvoiceHeader(ocr);
  $("purchaseInvoiceScanNumber").value=h.number;
  $("purchaseInvoiceScanDate").value=h.date;
  $("purchaseInvoiceScanGstin").value=h.gstin;
  $("purchaseInvoiceScanStatus").textContent="Invoice OCR complete. Verify header fields; draft extraction is assistive.";
  $("purchaseInvoiceBuildDraft").disabled=false;
}

function invoiceDraftsToImport(){
  const text=$("purchaseInvoiceScanText").value.trim();
  if(!text)throw new Error("No OCR text is available.");
  if($("purchaseInvoiceScanNumber").value.trim())$("supplierInvoiceNumber").value=$("purchaseInvoiceScanNumber").value.trim();
  if($("purchaseInvoiceScanDate").value)$("supplierInvoiceDate").value=$("purchaseInvoiceScanDate").value;
  // Invoice layouts differ too much for safe automatic posting. Put OCR lines in a single-column import preview
  // so the operator can verify/map rather than silently creating wrong purchase lines.
  const lines=text.split(/\n+/).map(x=>x.trim()).filter(x=>x.length>2);
  importRows=lines.map(x=>({"OCR Line":x}));
  importHeaders=["OCR Line"];importMap={brand_name:"OCR Line"};
  $("purchaseImportCard").hidden=false;
  renderMapping();renderImportPreview();
  $("purchaseImportStatus").textContent=`${lines.length} OCR lines loaded. Map only rows/columns that represent actual invoice items.`;
  $("purchaseImportCard").scrollIntoView({behavior:"smooth",block:"start"});
}

form.onsubmit=async e=>{
 e.preventDefault();
 const b=$("savePurchaseButton");
 b.disabled=true;
 b.textContent="Saving Purchase...";
 try{
  validate();
  refreshPurchaseGstContext();
  const t=totals(),paid=num($("purchaseAmountPaid").value);
  if(paid>t.grand)throw new Error("Amount paid cannot exceed grand total.");
  const terms=$("paymentTerms").value;
  if(terms==="cash"&&Math.abs(paid-t.grand)>.009)throw new Error("Cash purchase must be paid in full.");
  if(terms==="credit"&&paid!==0)throw new Error("Credit purchase must have zero amount paid.");
  if(terms==="partial"&&(paid<=0||paid>=t.grand))throw new Error("Partial payment must be greater than zero and less than grand total.");
  if((terms==="credit"||terms==="partial")&&!$("dueDate").value)throw new Error("Due date is required for credit or partial purchase.");

  const purchaseItems=items.map(i=>({
   medicine_id:i.medicine_id,hsn_code:i.hsn_code||null,barcode:i.barcode||null,
   batch_number:i.batch_number,expiry_date:i.expiry_date,quantity:num(i.quantity),
   free_quantity:num(i.free_quantity),purchase_rate:num(i.purchase_rate),mrp:num(i.mrp),
   selling_rate:num(i.selling_rate),discount_percent:num(i.discount_percent),gst_percent:num(i.gst_percent)
  }));
  const payload={
   supplier_id:$("purchaseSupplierId").value,
   supplier_invoice_number:$("supplierInvoiceNumber").value.trim(),
   supplier_invoice_date:$("supplierInvoiceDate").value,
   purchase_date:new Date($("purchaseDate").value).toISOString(),
   grn_number:$("grnNumber").value.trim()||null,
   purchase_type:$("purchaseType").value,payment_terms:terms,
   credit_days:num($("creditDays").value),due_date:$("dueDate").value||null,
   invoice_discount_amount:num($("purchaseInvoiceDiscount").value),
   transport_charges:num($("transportCharges").value),other_charges:num($("otherCharges").value),
   round_off:num($("purchaseRoundOff").value),amount_paid:paid,
   payment_method:$("purchasePaymentMethod").value,
   transaction_reference:$("purchaseTransactionReference").value.trim()||null,
   notes:$("purchaseNotes").value.trim()||null,items:purchaseItems
  };

  let response;
  if(activePurchaseOrder){
   const allocations=items
    .filter(i=>i.purchase_order_item_id)
    .map(i=>({purchase_order_item_id:i.purchase_order_item_id,received_quantity:num(i.quantity)}));
   if(!allocations.length)throw new Error("Add at least one item linked to the Purchase Order.");
   response=await supabaseClient.rpc("create_purchase_invoice_from_po_v1",{
    p_purchase_order_id:activePurchaseOrder.purchase_order_id,
    p_payload:payload,
    p_allocations:allocations
   });
  }else{
   response=await supabaseClient.rpc("create_purchase_invoice_v4",{
    p_pharmacy_id:pharmacyId,p_supplier_id:payload.supplier_id,
    p_supplier_invoice_number:payload.supplier_invoice_number,
    p_supplier_invoice_date:payload.supplier_invoice_date,p_purchase_date:payload.purchase_date,
    p_grn_number:payload.grn_number,p_purchase_type:payload.purchase_type,
    p_payment_terms:payload.payment_terms,p_credit_days:payload.credit_days,p_due_date:payload.due_date,
    p_invoice_discount_amount:payload.invoice_discount_amount,p_transport_charges:payload.transport_charges,
    p_other_charges:payload.other_charges,p_round_off:payload.round_off,p_amount_paid:payload.amount_paid,
    p_payment_method:payload.payment_method,p_transaction_reference:payload.transaction_reference,
    p_notes:payload.notes,p_items:payload.items
   });
  }
  const {data,error}=response;
  if(error)throw error;
  const poMessage=data.purchase_order_status?` PO ${data.purchase_order_status}.`:"";
  notify(`Purchase saved successfully: ${data.purchase_number}.${poMessage}`);
  activePurchaseOrder=null;
  sessionStorage.removeItem("medvikaPurchaseOrderContext");
  if($("purchasePOContext"))$("purchasePOContext").hidden=true;
  items=[];form.reset();
  $("purchaseDate").value=nowInput();$("supplierInvoiceDate").value=today();
  renderItems();
  await Promise.all([loadMedicines(),loadRecent()]);
 }catch(err){notify(err.message,"danger")}
 finally{b.disabled=false;b.textContent="Save Purchase"}
};
searchInput.oninput=scheduleSearch;
searchInput.addEventListener("keydown",event=>{
 if(event.key!=="Enter")return;
 event.preventDefault();
 const barcode=searchInput.value.trim();
 const medicine=medicines.find(m=>String(m.barcode||"").trim()===barcode);
 if(medicine){
  addItem(medicine.id);
  searchInput.value="";
  results.classList.remove("open");
  notify(`${medicine.brand_name} added by barcode.`);
 }else{
  searchMedicines();
  notify(`Barcode ${barcode} is not saved locally. Select a catalogue match or create the medicine.`,"warning");
 }
});$("purchaseSupplierId").onchange=()=>{refreshPurchaseGstContext();applySupplierPaymentDefaults()};$("paymentTerms").onchange=()=>{updatePurchaseDueDate();totals()};$("creditDays").oninput=updatePurchaseDueDate;$("supplierInvoiceDate").onchange=updatePurchaseDueDate;["purchaseInvoiceDiscount","transportCharges","otherCharges","purchaseRoundOff"].forEach(id=>$(id).oninput=totals);$("refreshPurchasesButton").onclick=loadRecent;$("purchaseInvoiceViewClose").onclick=()=>{$("purchaseInvoiceViewPanel").hidden=true};$("purchaseInvoiceViewPrint").onclick=printViewedPurchase;$("purchaseDate").value=nowInput();$("supplierInvoiceDate").value=today();
$("purchaseInlineMedicineClose").onclick=()=>{$("purchaseInlineMedicineCard").hidden=true};$("purchaseInlineMedicineSave").onclick=async()=>{const b=$("purchaseInlineMedicineSave"),old=b.textContent;b.disabled=true;b.textContent="Creating...";try{const id=await createInlineMedicine();addItem(id,{barcode:$("purchaseInlineBarcode").value.trim(),hsn_code:$("purchaseInlineHsn").value.trim(),gst_percent:num($("purchaseInlineGst").value)});$("purchaseInlineMedicineCard").hidden=true;notify("Medicine created and added to purchase.")}catch(e){notify(e.message,"danger")}finally{b.disabled=false;b.textContent=old}};
$("purchaseImportTemplate").onclick=downloadPurchaseTemplate;
$("purchaseImportOpen").onclick=()=>{$("purchaseImportCard").hidden=false;$("purchaseImportCard").scrollIntoView({behavior:"smooth",block:"start"})};$("purchaseImportClose").onclick=()=>{$("purchaseImportCard").hidden=true};$("purchaseImportFile").onchange=async e=>{try{const file=e.target.files?.[0];if(!file)return;$("purchaseImportStatus").textContent="Reading file…";importRows=await readImportFile(file);importHeaders=importRows.length?Object.keys(importRows[0]):[];guessMap();renderMapping();renderImportPreview()}catch(err){notify(err.message,"danger");$("purchaseImportStatus").textContent=err.message}};$("purchaseImportApply").onclick=async()=>{const b=$("purchaseImportApply"),old=b.textContent;b.disabled=true;try{const parsed=importRows.map(rowToImport).filter(importRowValid);if(!parsed.length)throw new Error("No valid rows to import.");let done=0;const importedProfiles=new Map();for(const x of parsed){b.textContent=`Resolving ${done+1}/${parsed.length}…`;const id=await resolveImportedMedicine(x),medicine=medicines.find(m=>m.id===id),batch=(medicine?.medicine_batches||[])[0]||{},previous=importedProfiles.get(id)||{};const barcode=x.barcode||previous.barcode||medicine?.barcode||"",hsnCode=x.hsn_code||previous.hsn_code||medicine?.hsn_code||"";const gstPercent=x.gst_percent===null?(previous.gst_percent??num(medicine?.gst_percent??batch.gst_percent??0)):num(x.gst_percent);importedProfiles.set(id,{barcode,hsn_code:hsnCode,gst_percent:gstPercent});addItem(id,{...x,barcode,hsn_code:hsnCode,gst_percent:gstPercent});done++}notify(`${done} purchase rows added. Existing HSN/GST values were reused where the file was blank. Review before saving.`);$("purchaseImportCard").hidden=true}catch(e){notify(e.message,"danger")}finally{b.disabled=false;b.textContent=old}};

$("purchaseScanOpen").onclick=()=>{$("purchaseScanCard").hidden=false;$("purchaseScanFile").value="";$("purchaseScanStatus").textContent="No image selected.";$("purchaseScanCard").scrollIntoView({behavior:"smooth",block:"start"})};
$("purchaseScanClose").onclick=()=>{$("purchaseScanCard").hidden=true};
$("purchaseScanFile").onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{await scanImage(file)}catch(err){notify(err.message,"danger")}};
$("purchaseScanResolve").onclick=async()=>{const b=$("purchaseScanResolve"),old=b.textContent;b.disabled=true;b.textContent="Finding…";try{await resolveScannedMedicine()}catch(err){notify(err.message,"danger")}finally{b.disabled=false;b.textContent=old}};


$("purchaseInvoiceScanOpen").onclick=()=>{$("purchaseInvoiceScanCard").hidden=false;$("purchaseInvoiceScanFile").value="";$("purchaseInvoiceScanStatus").textContent="No invoice selected.";$("purchaseInvoiceScanCard").scrollIntoView({behavior:"smooth",block:"start"})};
$("purchaseInvoiceScanClose").onclick=()=>{$("purchaseInvoiceScanCard").hidden=true};
$("purchaseInvoiceScanFile").onchange=async e=>{
  const file=e.target.files?.[0]; if(!file)return;
  try{await scanInvoiceImage(file)}catch(err){notify(err.message,"danger");$("purchaseInvoiceScanStatus").textContent=err.message}
};
$("purchaseInvoiceBuildDraft").onclick=()=>{try{invoiceDraftsToImport()}catch(err){notify(err.message,"danger")}};

try{await Promise.all([loadSuppliers(),loadMedicines(),loadRecent(),loadPharmacyGst()]);refreshPurchaseGstContext();updatePurchaseDueDate();totals();loadPurchaseOrderContext()}catch(err){notify("Purchase page could not load: "+err.message,"danger")}
};
