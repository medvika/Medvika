window.initSalesModule = async function initSalesModule() {
console.log("Sales module started");
console.log("supabaseClient =", typeof supabaseClient);
  const UI=window.MedvikaUI,$=id=>document.getElementById(id);
const notify=(message,type="success")=>UI.toast(message,type==="danger"?"error":type);
const salesForm=$("salesForm");
const itemsBody=document.querySelector("#salesItemsTable tbody");
const results=$("medicineSearchResults");
const recentBody=document.querySelector("#recentSalesTable tbody");
let medicines = [];
let items = [];
let editingInvoiceId = null;
let currentGstContext = null;

function gstStateCodeFromGstin(gstin){
  const g=String(gstin||"").trim().toUpperCase();
  return /^\d{2}[A-Z0-9]{13}$/.test(g) ? g.slice(0,2) : "";
}

async function resolveSalesGstContext(customerId){
  const pid=window.MedvikaAuth?.profile?.pharmacy_id;

  const {data:pharmacy,error:pErr}=await supabaseClient
    .from("pharmacies")
    .select("gst_number,registered_state,gst_state_code,state")
    .eq("id",pid)
    .single();
  if(pErr)throw pErr;

  let customer=null;
  if(customerId){
    const {data,error}=await supabaseClient
      .from("customers")
      .select("gstin,gst_number,customer_tax_type,state,state_code")
      .eq("id",customerId)
      .maybeSingle();
    if(error)throw error;
    customer=data;
  }

  const pharmacyCode=pharmacy?.gst_state_code||gstStateCodeFromGstin(pharmacy?.gst_number);
  const customerGstin=String(customer?.gstin||customer?.gst_number||"").trim().toUpperCase();
  const customerCode=customer?.state_code||gstStateCodeFromGstin(customerGstin);
  const posCode=customerCode||pharmacyCode||"";
  const pos=customer?.state||pharmacy?.registered_state||pharmacy?.state||"";

  return {
    customer_gstin:customerGstin||null,
    customer_tax_type:customerGstin?"B2B":"B2C",
    place_of_supply:pos||null,
    place_of_supply_code:posCode||null,
    tax_type:pharmacyCode&&posCode&&pharmacyCode!==posCode?"IGST":"CGST_SGST"
  };
}

async function refreshGstContext(){
  currentGstContext=await resolveSalesGstContext($("customerId").value||null);
  const pos=$("placeOfSupplyDisplay"),
        tax=$("taxTypeDisplay"),
        status=$("customerTaxStatusDisplay");

  if(pos){
    pos.value=[
      currentGstContext.place_of_supply,
      currentGstContext.place_of_supply_code
        ? `(${currentGstContext.place_of_supply_code})`
        : ""
    ].filter(Boolean).join(" ");
  }

  if(tax){
    tax.value=currentGstContext.tax_type==="IGST"
      ? "IGST"
      : "CGST + SGST";
  }

  if(status){
    status.value=currentGstContext.customer_gstin
      ? `B2B / GST Registered — ${currentGstContext.customer_gstin}`
      : "B2C / Unregistered";
  }

  return currentGstContext;
}

async function snapshotInvoiceGst(invoiceId,invoiceNumber){
  const ctx=currentGstContext||await refreshGstContext();

  let id=typeof invoiceId==="string"?invoiceId:(invoiceId?.id||invoiceId?.invoice_id||null);

  if(!id && invoiceNumber){
    const {data,error}=await supabaseClient
      .from("sales_invoices")
      .select("id")
      .eq("pharmacy_id",window.MedvikaAuth?.profile?.pharmacy_id)
      .eq("invoice_number",invoiceNumber)
      .order("created_at",{ascending:false})
      .limit(1)
      .maybeSingle();
    if(error)throw error;
    id=data?.id||null;
  }

  if(!id)return;

  const {error}=await supabaseClient
    .from("sales_invoices")
    .update({
      customer_gstin:ctx.customer_gstin,
      place_of_supply:ctx.place_of_supply,
      place_of_supply_code:ctx.place_of_supply_code,
      tax_type:ctx.tax_type
    })
    .eq("id",id);

  if(error)throw error;
}

function nowInput(){
  const n=new Date();
  n.setMinutes(n.getMinutes()-n.getTimezoneOffset());
  return n.toISOString().slice(0,16);
}

function invoiceNo(){
  const n=new Date();
  const d=[
    n.getFullYear(),
    String(n.getMonth()+1).padStart(2,"0"),
    String(n.getDate()).padStart(2,"0")
  ].join("");
  return `SAL-${d}-${Date.now().toString().slice(-6)}`;
}

async function loadCustomers() {
  const { data, error } = await supabaseClient
    .from("customers")
    .select("*")
    .eq("pharmacy_id",window.MedvikaAuth?.profile?.pharmacy_id)
    .eq("is_active",true)
    .order("full_name");

  if(error) throw error;

  customers=data||[];

  $("customerId").innerHTML=
    '<option value="">Walk-in Customer</option>'+
    customers.map(x=>
      `<option value="${x.id}">${UI.safe(x.full_name)}${x.mobile?" — "+UI.safe(x.mobile):""}</option>`
    ).join("");
}

async function loadDoctors(){
  const {data,error}=await supabaseClient
    .from("doctors")
    .select("*")
    .eq("is_active",true)
    .order("full_name");

  if(error) throw error;

  doctors=data||[];

  $("doctorId").innerHTML=
    '<option value="">Select doctor</option>'+
    doctors.map(x=>
      `<option value="${x.id}">${UI.safe(x.full_name)}</option>`
    ).join("");
}

async function loadMedicines(){
  const {data,error}=await supabaseClient
    .from("medicines")
    .select(`
      id,
      brand_name,
      generic_name,
      composition,
      schedule,
      regulatory_schedule,
      barcode,
      default_selling_rate,
      gst_percent,
      prescription_required,
      requires_register,
      register_type,
      primary_pack_unit,
      loose_unit,
      units_per_pack,
      loose_sale_allowed,
      medicine_batches(
        id,
        batch_number,
        quantity_available,
        purchase_rate,
        selling_rate,
        mrp,
        gst_percent,
        expiry_date,
        is_blocked
      )
    `)
    .eq("is_active",true)
    .order("brand_name");

  if(error) throw error;

  const today=localTodayKey();

  medicines=(data||[]).map(m=>{
    const batches=(m.medicine_batches||[])
      .filter(x=>
        Number(x.quantity_available)>0 &&
        x.expiry_date>=today &&
        !x.is_blocked
      )
      .sort((a,b)=>a.expiry_date.localeCompare(b.expiry_date));

    return {
      ...m,
      batches,
      availablePacks:batches.reduce(
        (sum,x)=>sum+Number(x.quantity_available||0),
        0
      )
    };
  });
}


/* ==========================================================
   GENERIC / SALT DRIVEN COMPLIANCE ENGINE
   Rules live in generic_compliance_rules, never in Sales code.
   ========================================================== */

function normalizeComplianceText(value){
  return String(value||"")
    .toUpperCase()
    .replace(/\b(IP|BP|USP|PH\.?EUR\.?)\b/g," ")
    .replace(/\b\d+(\.\d+)?\s*(MG|MCG|G|GM|ML|%|IU|I\.U\.)\b/g," ")
    .replace(/[^A-Z0-9]+/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function ruleKeyText(rule){
  return normalizeComplianceText(
    String(rule?.generic_key||"").replaceAll("_"," ") ||
    rule?.display_name ||
    ""
  );
}

function ruleIsEffective(rule){
  if(rule?.is_active===false) return false;
  const today=localTodayKey();
  if(rule?.effective_from && rule.effective_from>today) return false;
  if(rule?.effective_to && rule.effective_to<today) return false;
  return true;
}

async function loadComplianceRules(){
  const pid=window.MedvikaAuth?.profile?.pharmacy_id;
  const {data,error}=await supabaseClient
    .from("generic_compliance_rules")
    .select("*")
    .or(`pharmacy_id.is.null,pharmacy_id.eq.${pid}`)
    .eq("is_active",true)
    .order("display_name");

  if(error) throw error;
  complianceRules=(data||[]).filter(ruleIsEffective);
}

function complianceMatchesForMedicine(item){
  const source=medicines.find(x=>x.id===item.medicine_id)||item;
  const haystack=normalizeComplianceText([
    source.generic_name,
    source.composition,
    item.generic_name,
    item.composition
  ].filter(Boolean).join(" + "));

  const matches=complianceRules.filter(rule=>{
    const needle=ruleKeyText(rule);
    if(!needle) return false;

    // Boundary-safe phrase match after normalization.
    return (` ${haystack} `).includes(` ${needle} `);
  });

  /*
   * Preserve any legacy medicine-level register classification as a fallback.
   * The generic rule table remains the preferred authority.
   */
  if(!matches.length && item.requires_register){
    const rt=normalizeComplianceText(item.register_type||"");
    return [{
      id:null,
      generic_key:normalizeComplianceText(item.generic_name||item.brand_name).replaceAll(" ","_"),
      display_name:item.generic_name||item.brand_name,
      schedule_h1:rt.includes("H1"),
      nrx:rt.includes("NRX") || rt.includes("N RX"),
      schedule_x:rt.includes("SCHEDULE X") || rt==="X",
      controlled_drug:rt.includes("CONTROL")
    }];
  }

  return matches;
}

function complianceTypesForRule(rule){
  const types=[];
  if(rule.schedule_h1) types.push("SCHEDULE_H1");
  if(rule.nrx) types.push("NRX");
  if(rule.schedule_x) types.push("SCHEDULE_X");
  if(rule.controlled_drug) types.push("CONTROLLED");
  return types;
}

function regulatedSaleItems(){
  return items.map(item=>({
    item,
    rules:complianceMatchesForMedicine(item)
  })).filter(x=>x.rules.some(rule=>complianceTypesForRule(rule).length));
}

function requiredComplianceFields(){
  const regulated=regulatedSaleItems();
  if(!regulated.length) return {regulated,missing:[]};

  const missing=[];
  if(!$("patientName").value.trim()) missing.push("Patient Name");
  if($("patientAge").value==="") missing.push("Patient Age");
  if(!$("doctorId").value) missing.push("Doctor");
  if(!$("prescriptionNumber").value.trim()) missing.push("Prescription Number");

  return {regulated,missing};
}

function renderComplianceSaleAlert(){
  const box=$("complianceSaleAlert");
  if(!box) return;

  const {regulated,missing}=requiredComplianceFields();

  if(!regulated.length){
    box.innerHTML="";
    return;
  }

  const labels=[...new Set(
    regulated.flatMap(x=>x.rules.flatMap(complianceTypesForRule))
  )].join(", ");

  box.innerHTML=missing.length
    ? `<div class="erp-alert erp-alert-danger">
         <b>Regulated medicine detected: ${UI.safe(labels)}</b><br>
         Sale cannot be saved until: ${UI.safe(missing.join(", "))}.
       </div>`
    : `<div class="erp-alert erp-alert-success">
         <b>Compliance details complete.</b> ${UI.safe(labels)}
       </div>`;
}

function validateComplianceBeforeSave(){
  const {regulated,missing}=requiredComplianceFields();
  if(!regulated.length) return regulated;

  if(missing.length){
    throw new Error(
      "Cannot save regulated medicine sale. Complete: "+missing.join(", ")+"."
    );
  }

  return regulated;
}

async function resolveSavedSalesInvoiceId(data,invoiceNumber){
  const direct=typeof data==="string"
    ? data
    : (data?.id||data?.invoice_id||data?.sales_invoice_id||null);

  if(direct) return direct;

  const {data:row,error}=await supabaseClient
    .from("sales_invoices")
    .select("id")
    .eq("pharmacy_id",window.MedvikaAuth?.profile?.pharmacy_id)
    .eq("invoice_number",invoiceNumber)
    .order("created_at",{ascending:false})
    .limit(1)
    .maybeSingle();

  if(error) throw error;
  return row?.id||null;
}

function selectedDoctorRecord(){
  return doctors.find(x=>x.id===$("doctorId").value)||null;
}

function selectedCustomerRecord(){
  return customers.find(x=>x.id===$("customerId").value)||null;
}

function doctorAddress(doctor){
  return [
    doctor?.address,
    doctor?.clinic_address,
    doctor?.address_line_1,
    doctor?.address_line_2,
    doctor?.city,
    doctor?.state,
    doctor?.postal_code
  ].filter(Boolean).join(", ") || null;
}

function patientAddress(customer){
  return [
    customer?.address,
    customer?.address_line_1,
    customer?.address_line_2,
    customer?.city,
    customer?.state,
    customer?.postal_code
  ].filter(Boolean).join(", ") || null;
}

async function captureComplianceAfterSuccessfulSale(data,invoiceNumber,regulated){
  if(!regulated?.length) return;

  const invoiceId=await resolveSavedSalesInvoiceId(data,invoiceNumber);
  if(!invoiceId) throw new Error("Sale saved but compliance invoice reference could not be resolved.");

  const doctor=selectedDoctorRecord();
  const customer=selectedCustomerRecord();
  const patientName=$("patientName").value.trim();
  const patientAge=$("patientAge").value===""?null:Number($("patientAge").value);
  const patientGender=$("patientGender").value||null;
  const rx=$("prescriptionNumber").value.trim()||null;
  const rxDate=$("prescriptionDate").value||null;

  /*
   * Editing a posted invoice should refresh its compliance snapshot rather than
   * duplicate register lines.
   */
  if(editingInvoiceId){
    const {error:deleteError}=await supabaseClient
      .from("compliance_sale_records")
      .delete()
      .eq("pharmacy_id",window.MedvikaAuth?.profile?.pharmacy_id)
      .eq("sales_invoice_id",invoiceId);

    if(deleteError) throw deleteError;
  }

  const records=[];

  regulated.forEach(({item,rules})=>{
    const batch=selectedBatch(item);

    rules.forEach(rule=>{
      complianceTypesForRule(rule).forEach(type=>{
        records.push({
          pharmacy_id:window.MedvikaAuth?.profile?.pharmacy_id,
          sales_invoice_id:invoiceId,
          invoice_number:invoiceNumber,
          sales_item_id:null,
          medicine_id:item.medicine_id,
          compliance_rule_id:rule.id||null,
          compliance_type:type,
          generic_key:rule.generic_key || normalizeComplianceText(item.generic_name||"").replaceAll(" ","_"),
          drug_name:item.brand_name,
          quantity:Number(packEquivalent(item).toFixed(6)),
          patient_name:patientName,
          patient_age:patientAge,
          patient_gender:patientGender,
          patient_address:patientAddress(customer),
          doctor_id:doctor?.id||null,
          prescriber_name:doctor?.full_name||null,
          prescriber_address:doctorAddress(doctor),
          prescription_reference:rx,
          prescription_date:rxDate,
          batch_number:batch?.batch_number||null,
          expiry_date:batch?.expiry_date||null,
          created_by:window.MedvikaAuth?.profile?.user_id||window.MedvikaAuth?.user?.id||null
        });
      });
    });
  });

  if(!records.length) return;

  const {error}=await supabaseClient
    .from("compliance_sale_records")
    .insert(records);

  if(error) throw error;

  await supabaseClient.from("compliance_audit_log").insert({
    pharmacy_id:window.MedvikaAuth?.profile?.pharmacy_id,
    event_type:editingInvoiceId?"COMPLIANCE_SALE_UPDATED":"COMPLIANCE_SALE_CAPTURED",
    entity_type:"sales_invoice",
    entity_id:String(invoiceId),
    description:`${records.length} compliance register record(s) captured for invoice ${invoiceNumber}.`,
    metadata:{
      invoice_number:invoiceNumber,
      compliance_types:[...new Set(records.map(x=>x.compliance_type))]
    },
    actor_id:window.MedvikaAuth?.profile?.user_id||window.MedvikaAuth?.user?.id||null
  });
}


async function recordBounceRequest({medicine=null, searchText="", reason="OUT_OF_STOCK"}={}){
  try{
    const requested = prompt(
      medicine
        ? `Requested quantity for ${medicine.brand_name}:`
        : `Requested quantity for "${searchText}":`,
      "1"
    );

    if(requested===null) return;

    const qty=Number(requested||0);
    if(!Number.isFinite(qty) || qty<=0){
      notify("Requested quantity must be greater than zero.","danger");
      return;
    }

    const customerId=$("customerId")?.value || null;

    const {data,error}=await supabaseClient.rpc(
      "record_sales_bounce_v1",
      {
        p_search_text:(searchText || medicine?.brand_name || "").trim(),
        p_medicine_id:medicine?.id || null,
        p_customer_id:customerId,
        p_requested_quantity:qty,
        p_available_quantity:medicine ? Number(medicine.availablePacks||0) : null,
        p_reason:reason,
        p_notes:null
      }
    );

    if(error) throw error;

    notify("Unavailable request recorded in Bounce Report.");
    return data;
  }catch(error){
    notify("Bounce could not be recorded: "+error.message,"danger");
  }
}

function addScannedSaleBarcode(rawBarcode){
  const barcode=String(rawBarcode||"").trim();
  if(!barcode)return false;
  const medicine=medicines.find(m=>String(m.barcode||"").trim()===barcode);
  if(!medicine){
    notify(`Barcode ${barcode} is not assigned to an active medicine in this pharmacy.`,"warning");
    return false;
  }
  if(Number(medicine.availablePacks||0)<=0){
    notify(`${medicine.brand_name} was recognised, but no saleable stock is available.`,"danger");
    return false;
  }
  addItem(medicine.id);
  $("medicineSearch").value="";
  results.classList.remove("open");
  notify(`${medicine.brand_name} added by barcode.`);
  return true;
}

async function detectSalesBarcodeFromFile(file){
  if(!("BarcodeDetector" in window))throw new Error("Camera barcode scanning is not supported by this browser. Use a Bluetooth/USB scanner in the search box.");
  const formats=typeof BarcodeDetector.getSupportedFormats==="function"?await BarcodeDetector.getSupportedFormats():undefined;
  const detector=formats?.length?new BarcodeDetector({formats}):new BarcodeDetector();
  const bitmap=await createImageBitmap(file);
  try{
    const codes=await detector.detect(bitmap);
    return codes?.[0]?.rawValue||"";
  }finally{
    bitmap.close?.();
  }
}

function closeSalesBarcodeScanner(){
  $("salesBarcodeScanCard").hidden=true;
  $("salesBarcodeScanPreview").removeAttribute("src");
}

function searchMedicines(){
  const q=$("medicineSearch").value.trim().toLowerCase();

  if(q.length<2){
    results.classList.remove("open");
    return;
  }

  const found=medicines
    .filter(m=>
      `${m.brand_name} ${m.generic_name||""} ${m.barcode||""}`
        .toLowerCase()
        .includes(q)
    )
    .slice(0,20);

  results.innerHTML=found.map(m=>`
    <div class="search-result" data-id="${m.id}">
      <b>${UI.safe(m.brand_name)}</b>
      <br><small>${UI.safe(m.generic_name||"")}</small>
      <br>
      <span class="erp-badge ${m.availablePacks>0?"erp-badge-success":"erp-badge-danger"}">
        ${m.availablePacks} ${UI.safe(m.primary_pack_unit||"pack")}
      </span>
      ${
        m.loose_sale_allowed
          ? `<span class="erp-badge erp-badge-warning">
               ${Number(m.availablePacks*m.units_per_pack).toFixed(0)}
               ${UI.safe(m.loose_unit||"loose units")}
             </span>`
          : ""
      }
      ${
        m.availablePacks<=0
          ? `<button
               type="button"
               class="record-bounce"
               data-bounce-id="${m.id}"
               style="margin-left:8px;background:#b42318;color:#fff;border:0;border-radius:7px;padding:6px 9px"
             >
               Record Unavailable
             </button>`
          : ""
      }
    </div>
  `).join("") || `
    <div class="search-result">
      <b>No medicine found</b>
      <br><small>Record this customer request for procurement follow-up.</small>
      <br>
      <button
        type="button"
        id="recordUnknownBounce"
        style="margin-top:7px;background:#b42318;color:#fff;border:0;border-radius:7px;padding:7px 10px"
      >
        Record Unavailable Request
      </button>
    </div>`;

  results.classList.add("open");

  results.querySelectorAll("[data-id]").forEach(row=>{
    row.onclick=event=>{
      if(event.target.closest(".record-bounce")) return;
      addItem(row.dataset.id);
      $("medicineSearch").value="";
      results.classList.remove("open");
    };
  });

  results.querySelectorAll(".record-bounce").forEach(button=>{
    button.onclick=async event=>{
      event.stopPropagation();
      const medicine=medicines.find(x=>x.id===button.dataset.bounceId);
      await recordBounceRequest({
        medicine,
        searchText:q,
        reason:"OUT_OF_STOCK"
      });
    };
  });

  const unknownBounce=document.getElementById("recordUnknownBounce");
  if(unknownBounce){
    unknownBounce.onclick=async event=>{
      event.stopPropagation();
      await recordBounceRequest({
        medicine:null,
        searchText:q,
        reason:"NOT_LISTED"
      });
    };
  }
}

function normaliseQuantities(item){
  const unitsPerPack=Math.max(1,Number(item.units_per_pack||1));
  let packQty=Math.max(0,Math.trunc(Number(item.pack_quantity||0)));
  let looseQty=Math.max(0,Math.trunc(Number(item.loose_quantity||0)));

  if(looseQty>=unitsPerPack){
    packQty+=Math.floor(looseQty/unitsPerPack);
    looseQty=looseQty%unitsPerPack;
  }

  item.pack_quantity=packQty;
  item.loose_quantity=looseQty;

  if(looseQty>0){
    item.sale_unit="loose";
    item.display_quantity=(packQty*unitsPerPack)+looseQty;
  }else{
    item.sale_unit="pack";
    item.display_quantity=packQty;
  }
}

function quantityDescription(item){
  const packQty=Number(item.pack_quantity||0);
  const looseQty=Number(item.loose_quantity||0);
  const packName=item.primary_pack_unit||"pack";
  const looseName=item.loose_unit||"tablet";

  if(packQty>0 && looseQty>0){
    return `${packQty} ${packName}${packQty===1?"":"s"} + ${looseQty} ${looseName}${looseQty===1?"":"s"}`;
  }
  if(packQty>0){
    return `${packQty} ${packName}${packQty===1?"":"s"}`;
  }
  if(looseQty>0){
    return `${looseQty} ${looseName}${looseQty===1?"":"s"}`;
  }
  return "Enter quantity";
}

function addItem(id){
  const m=medicines.find(x=>x.id===id);
  if(!m) return;

  const existing=items.find(x=>x.medicine_id===id);

  if(existing){
    existing.pack_quantity=Number(existing.pack_quantity||0)+1;
    normaliseQuantities(existing);
  }else{
    items.push({
      medicine_id:id,
      brand_name:m.brand_name,
      generic_name:m.generic_name,
      composition:m.composition||"",
      schedule:m.schedule||"",
      regulatory_schedule:m.regulatory_schedule||"",
      batches:m.batches,
      selected_batch_id:m.batches[0]?.id || null,
      available_packs:Number(m.batches[0]?.quantity_available || 0),
      units_per_pack:Number(m.units_per_pack||1),
      primary_pack_unit:m.primary_pack_unit||"pack",
      loose_unit:m.loose_unit||"unit",
      loose_sale_allowed:!!m.loose_sale_allowed,
      pack_quantity:1,
      loose_quantity:0,
      sale_unit:"pack",
      display_quantity:1,
      selling_rate_per_pack:Number(
        m.batches[0]?.selling_rate ||
        m.default_selling_rate ||
        m.batches[0]?.mrp ||
        0
      ),
      purchase_rate_per_pack:Number(m.batches[0]?.purchase_rate||0),
      gst_percent:Number(m.batches[0]?.gst_percent??m.gst_percent??0),
      discount_percent:0,
      requires_register:!!m.requires_register,
      register_type:m.register_type
    });
  }

  /*
   * Safety invariant for a freshly added, batch-backed line.
   * Existing quantity logic already intends a new item to start at 1 pack.
   * This only repairs an unexpected zero/undefined state immediately after addItem().
   * It does NOT affect legitimate loose-only billing after the user edits quantities.
   */
  const justAdded=items.find(x=>x.medicine_id===id);
  if(
    justAdded &&
    justAdded.selected_batch_id &&
    Number(justAdded.pack_quantity||0)===0 &&
    Number(justAdded.loose_quantity||0)===0
  ){
    justAdded.pack_quantity=1;
    justAdded.sale_unit="pack";
    justAdded.display_quantity=1;
  }

  renderItems();
}

function applyNearExpirySalesHandoff(){
  const raw=sessionStorage.getItem("medvikaNearExpirySalesHandoff");
  if(!raw) return;

  sessionStorage.removeItem("medvikaNearExpirySalesHandoff");
  let handoff;
  try{ handoff=JSON.parse(raw); }
  catch(error){ notify("Near-expiry sales handoff was invalid.","warning"); return; }

  const medicine=medicines.find(row=>row.id===handoff.medicine_id);
  const batch=medicine?.batches?.find(row=>row.id===handoff.medicine_batch_id);
  if(!medicine || !batch){
    notify("The selected near-expiry batch is no longer available for sale.","warning");
    return;
  }

  addItem(medicine.id);
  const item=items.find(row=>row.medicine_id===medicine.id);
  if(!item) return;
  item.selected_batch_id=batch.id;
  applySelectedBatch(item);
  item.pack_quantity=1;
  item.loose_quantity=0;
  normaliseQuantities(item);
  renderItems();
  $("medicineSearch").value=medicine.brand_name||"";
  document.querySelector(".sales-items-card")?.scrollIntoView({behavior:"smooth",block:"start"});
  notify(`${medicine.brand_name} batch ${batch.batch_number||"—"} added for priority sell-through.`);
}

function localTodayKey(){
  const now=new Date();
  const year=now.getFullYear();
  const month=String(now.getMonth()+1).padStart(2,"0");
  const day=String(now.getDate()).padStart(2,"0");
  return `${year}-${month}-${day}`;
}

function expiryDays(value){
  if(!value) return null;
  const expiry=new Date(String(value).slice(0,10)+"T00:00:00");
  const today=new Date(); today.setHours(0,0,0,0);
  if(Number.isNaN(expiry.getTime())) return null;
  return Math.ceil((expiry-today)/86400000);
}

function expiryUrgency(batch){
  const days=expiryDays(batch?.expiry_date);
  if(days===null) return {label:"Expiry unknown",className:""};
  if(days<=7) return {label:`${days} days left • Use first`,className:"sales-expiry-critical"};
  if(days<=30) return {label:`${days} days left • FEFO priority`,className:"sales-expiry-warning"};
  if(days<=90) return {label:`${days} days left • Near expiry`,className:"sales-expiry-watch"};
  return {label:`${days} days left`,className:""};
}

function selectedBatch(item){
  return (item.batches||[]).find(
    batch=>batch.id===item.selected_batch_id
  ) || null;
}

function applySelectedBatch(item){
  const batch=selectedBatch(item);
  if(!batch) return;

  item.available_packs=Number(batch.quantity_available||0);
  item.purchase_rate_per_pack=Number(batch.purchase_rate||0);
  item.selling_rate_per_pack=Number(
    batch.selling_rate ||
    batch.mrp ||
    item.selling_rate_per_pack ||
    0
  );
  item.gst_percent=Number(
    batch.gst_percent ??
    item.gst_percent ??
    0
  );
}

function packEquivalent(item){
  return Number(item.pack_quantity||0)+
    (Number(item.loose_quantity||0)/Math.max(1,Number(item.units_per_pack||1)));
}

function effectiveRate(item){
  return item.sale_unit==="loose"
    ? item.selling_rate_per_pack/Math.max(1,Number(item.units_per_pack||1))
    : item.selling_rate_per_pack;
}

function margin(item){
  const packQty=Number(item.pack_quantity||0);
  const looseQty=Number(item.loose_quantity||0);
  const unitsPerPack=Math.max(1,Number(item.units_per_pack||1));
  const looseRate=item.selling_rate_per_pack/unitsPerPack;
  const gross=(packQty*item.selling_rate_per_pack)+(looseQty*looseRate);
  const discount=gross*item.discount_percent/100;
  const net=gross-discount;
  const cost=(packQty+(looseQty/unitsPerPack))*item.purchase_rate_per_pack;
  const profit=net-cost;

  return {
    gross,
    discount,
    net,
    cost,
    profit,
    marginPercent:net>0?profit/net*100:0,
    packQty:packQty+(looseQty/unitsPerPack)
  };
}

function availableDisplay(item){
  const totalLoose=Math.floor(Number(item.available_packs||0)*Math.max(1,Number(item.units_per_pack||1)));
  const fullPacks=Math.floor(totalLoose/Math.max(1,Number(item.units_per_pack||1)));
  const looseUnits=totalLoose%Math.max(1,Number(item.units_per_pack||1));
  return {fullPacks,looseUnits,totalLoose};
}

function renderItems(){
  itemsBody.innerHTML="";

  items.forEach((item,index)=>{
    const m=margin(item);

    const badge=m.profit<0
      ? `<span class="erp-badge erp-badge-danger">Loss ${UI.money(Math.abs(m.profit))}</span>`
      : m.marginPercent<5
        ? `<span class="erp-badge erp-badge-warning">${m.marginPercent.toFixed(1)}%</span>`
        : `<span class="erp-badge erp-badge-success">${m.marginPercent.toFixed(1)}%</span>`;

    itemsBody.insertAdjacentHTML("beforeend",`
      <tr>
        <td>
          <b>${UI.safe(item.brand_name)}</b>
          <br><small>${UI.safe(item.generic_name||"")}</small>
          ${(()=>{const u=expiryUrgency(selectedBatch(item));return u.className?`<br><span class="sales-expiry-badge ${u.className}">${UI.safe(u.label)}</span>`:"";})()}
          ${
            item.loose_sale_allowed
              ? `<br><small>1 ${UI.safe(item.primary_pack_unit)} =
                   ${item.units_per_pack} ${UI.safe(item.loose_unit)}</small>`
              : ""
          }
        </td>

        <td>
          <select class="batch-select" data-index="${index}" style="min-width:170px">
            ${(item.batches||[]).map(batch=>`
              <option
                value="${batch.id}"
                ${batch.id===item.selected_batch_id?"selected":""}
              >
                ${UI.safe(batch.batch_number||"No batch")}
                | Exp ${UI.safe(batch.expiry_date||"—")}
                | ${UI.safe(expiryUrgency(batch).label)}
                | Stock ${Number(batch.quantity_available||0).toFixed(3).replace(/\.?0+$/,"")}
              </option>
            `).join("")}
          </select>
        </td>

        <td>
          ${(()=>{const a=availableDisplay(item);return `${a.fullPacks}:${a.looseUnits}`;})()}
          <br><small>${UI.safe(item.primary_pack_unit)} : ${UI.safe(item.loose_unit)}</small>
        </td>

        <td>
          <input
            class="pack-qty"
            data-index="${index}"
            type="number"
            inputmode="numeric"
            min="0"
            step="1"
            value="${Number(item.pack_quantity||0)}"
            style="min-width:70px;width:76px"
          >
        </td>

        <td>
          ${item.loose_sale_allowed
            ? `<input
                 class="loose-qty"
                 data-index="${index}"
                 type="number"
                 inputmode="numeric"
                 min="0"
                 step="1"
                 max="${Math.max(0,Number(item.units_per_pack||1)-1)}"
                 value="${Number(item.loose_quantity||0)}"
                 style="min-width:70px;width:76px"
               >`
            : `<span class="erp-badge">N/A</span>`}
          <br><small>${UI.safe(quantityDescription(item))}</small>
        </td>

        <td>
          <input
            class="rate"
            data-index="${index}"
            type="number"
            min="0"
            step="0.01"
            value="${item.selling_rate_per_pack}"
            style="min-width:90px"
          >
          <br>
          <small>
            ${UI.money(item.selling_rate_per_pack)}/${UI.safe(item.primary_pack_unit)}
            ${item.loose_sale_allowed
              ? `<br>${UI.money(item.selling_rate_per_pack/Math.max(1,item.units_per_pack))}/${UI.safe(item.loose_unit)}`
              : ""}
          </small>
        </td>

        <td>
          <input
            class="disc"
            data-index="${index}"
            type="number"
            min="0"
            max="100"
            step="0.01"
            value="${item.discount_percent}"
            style="min-width:80px"
          >
        </td>

        <td>${item.gst_percent}</td>
        <td>${UI.money(m.net)}</td>

        <td>
          ${badge}
          ${
            item.requires_register
              ? `<div class="line-warning" style="color:#1d4ed8">
                   ${UI.safe(item.register_type||"Register")}
                 </div>`
              : ""
          }
        </td>

        <td>
          <button
            type="button"
            class="erp-btn-danger remove"
            data-index="${index}"
          >
            Remove
          </button>
        </td>
      </tr>
    `);
  });

  document.querySelectorAll(".batch-select").forEach(select=>{
    select.onchange=()=>{
      const item=items[Number(select.dataset.index)];
      item.selected_batch_id=select.value;
      applySelectedBatch(item);
      item.pack_quantity=1;
      item.loose_quantity=0;
      normaliseQuantities(item);
      renderItems();
    };
  });

  const commitWholeQuantity=(input,fieldName)=>{
    const item=items[Number(input.dataset.index)];
    const value=Number(input.value||0);

    if(!Number.isInteger(value) || value<0){
      notify("Only whole-number quantities are allowed.","danger");
      input.value=Number(item[fieldName]||0);
      input.focus();
      input.select();
      return false;
    }

    if(fieldName==="loose_quantity"){
      if(!item.loose_sale_allowed && value>0){
        notify(`${item.brand_name} is not enabled for loose sale.`,"danger");
        input.value=0;
        return false;
      }
      if(value>=Math.max(1,Number(item.units_per_pack||1))){
        const convertedPacks=Math.floor(value/item.units_per_pack);
        item.pack_quantity=Number(item.pack_quantity||0)+convertedPacks;
        item.loose_quantity=value%item.units_per_pack;
      }else{
        item.loose_quantity=value;
      }
    }else{
      item.pack_quantity=value;
    }

    normaliseQuantities(item);
    renderItems();
    return true;
  };

  document.querySelectorAll(".pack-qty").forEach(input=>{
    input.onkeydown=event=>{
      if(event.key==="." || event.key==="," || event.key==="-") event.preventDefault();
      if(event.key==="Enter"){
        event.preventDefault();
        const index=Number(input.dataset.index);
        if(commitWholeQuantity(input,"pack_quantity")){
          const loose=document.querySelector(`.loose-qty[data-index="${index}"]`);
          (loose || document.querySelector(`.rate[data-index="${index}"]`))?.focus();
        }
      }
    };
    input.onchange=()=>commitWholeQuantity(input,"pack_quantity");
  });

  document.querySelectorAll(".loose-qty").forEach(input=>{
    input.onkeydown=event=>{
      if(event.key==="." || event.key==="," || event.key==="-") event.preventDefault();
      if(event.key==="Enter"){
        event.preventDefault();
        const index=Number(input.dataset.index);
        if(commitWholeQuantity(input,"loose_quantity")){
          document.querySelector(`.rate[data-index="${index}"]`)?.focus();
        }
      }
    };
    input.onchange=()=>commitWholeQuantity(input,"loose_quantity");
  });

  document.querySelectorAll(".rate").forEach(input=>{
    input.onchange=()=>{
      items[Number(input.dataset.index)].selling_rate_per_pack=
        Number(input.value||0);
      renderItems();
    };
  });

  document.querySelectorAll(".disc").forEach(input=>{
    input.onchange=()=>{
      items[Number(input.dataset.index)].discount_percent=
        Number(input.value||0);
      renderItems();
    };
  });

  document.querySelectorAll(".remove").forEach(button=>{
    button.onclick=()=>{
      items.splice(Number(button.dataset.index),1);
      renderItems();
    };
  });

  totals();
  renderComplianceSaleAlert();
}

function totals(){
  let subtotal=0,itemDiscount=0,taxable=0,gst=0,profit=0;

  items.forEach(item=>{
    const m=margin(item);
    subtotal+=m.gross;
    itemDiscount+=m.discount;
    const gstRate=Math.max(0,Number(item.gst_percent||0));
    const lineTaxable=gstRate>0 ? (m.net/(1+(gstRate/100))) : m.net;
    const lineGst=m.net-lineTaxable;
    taxable+=lineTaxable;
    gst+=lineGst;
    profit+=m.profit;
  });

  const invoiceDiscount=Number($("invoiceDiscount").value||0);
  const roundOff=Number($("roundOff").value||0);
  // Selling rates are GST-inclusive (retail/MRP basis).
  // taxable + gst equals the post-item-discount selling value; GST is never added again.
  const grand=(subtotal-itemDiscount)-invoiceDiscount+roundOff;
  profit-=invoiceDiscount;

  $("subtotalText").textContent=UI.money(subtotal);
  $("itemDiscountText").textContent=UI.money(itemDiscount);
  $("taxableText").textContent=UI.money(taxable);
  $("gstText").textContent=UI.money(gst);
  $("grandTotalText").textContent=UI.money(grand);
  $("estimatedProfitText").textContent=UI.money(profit);

  $("invoiceMarginAlert").innerHTML=
    profit<0
      ? `<div class="erp-alert erp-alert-danger">
           Invoice loss: ${UI.money(Math.abs(profit))}
         </div>`
      : taxable>0 && profit/taxable*100<5
        ? `<div class="erp-alert erp-alert-warning">
             Low margin: ${(profit/taxable*100).toFixed(1)}%
           </div>`
        : items.length
          ? '<div class="erp-alert erp-alert-success">Margin is positive.</div>'
          : "";

  return {grand,profit};
}


function resetToNewSale(message="") {
  sessionStorage.removeItem("medvika_edit_sales_invoice_id");
  editingInvoiceId = null;
  items = [];

  salesForm.reset();
  $("invoiceNumber").value = invoiceNo();
  $("invoiceDate").value = nowInput();
  $("amountPaid").value = "0";
  $("invoiceDiscount").value = "0";
  $("roundOff").value = "0";
  $("saveSaleButton").textContent = "Save Sale";

  const newSaleButton = $("newSaleButton");
  if (newSaleButton) newSaleButton.style.display = "none";

  renderItems();
  refreshGstContext().catch(()=>{});
  if (message) notify(message, "warning");
}

async function loadInvoiceForEdit() {
  const storedInvoiceId = sessionStorage.getItem(
    "medvika_edit_sales_invoice_id"
  );

  if (!storedInvoiceId) return;

  editingInvoiceId = storedInvoiceId;

  const { data: invoice, error } = await supabaseClient
    .from("sales_invoices")
    .select(`
      *,
      sales_items (
        medicine_id,
        medicine_batch_id,
        quantity,
        selling_rate,
        discount_percent,
        gst_percent,
        medicines (
          id,
          brand_name,
          generic_name,
          composition,
          schedule,
          regulatory_schedule,
          primary_pack_unit,
          loose_unit,
          units_per_pack,
          loose_sale_allowed,
          requires_register,
          register_type
        )
      )
    `)
    .eq("id", editingInvoiceId)
    .maybeSingle();

  if (error || !invoice) {
    resetToNewSale(
      "Original invoice is unavailable. A new sale has been opened."
    );
    return;
  }

  if (invoice.invoice_status !== "posted") {
    resetToNewSale(
      "This invoice is cancelled or no longer editable. A new sale has been opened."
    );
    return;
  }

  if (!Array.isArray(invoice.sales_items) || !invoice.sales_items.length) {
    resetToNewSale(
      "Original invoice items are unavailable. A new sale has been opened."
    );
    return;
  }

  $("invoiceNumber").value = invoice.invoice_number || "";
  $("invoiceDate").value = invoice.invoice_date
    ? new Date(invoice.invoice_date).toISOString().slice(0, 16)
    : nowInput();
  $("saleType").value = invoice.sale_type || "retail";
  $("customerId").value = invoice.customer_id || "";
  $("doctorId").value = invoice.doctor_id || "";
  $("patientName").value = invoice.patient_name || "";
  $("patientAge").value = invoice.patient_age ?? "";
  $("patientGender").value = invoice.patient_gender || "";
  $("prescriptionNumber").value = invoice.prescription_number || "";
  $("prescriptionDate").value = invoice.prescription_date || "";
  $("invoiceDiscount").value = invoice.invoice_discount_amount || 0;
  $("roundOff").value = invoice.round_off || 0;
  $("amountPaid").value = invoice.amount_paid || 0;
  $("notes").value = invoice.notes || "";

  items = invoice.sales_items.map((saleItem) => {
    const medicine = saleItem.medicines || {};
    const unitsPerPack = Math.max(1, Number(medicine.units_per_pack || 1));
    const storedPackQuantity = Number(saleItem.quantity || 0);
    const wholePacks = Math.floor(storedPackQuantity + 0.0000001);
    const looseUnits = Math.round(
      (storedPackQuantity - wholePacks) * unitsPerPack
    );
    const sourceMedicine = medicines.find(
      (entry) => entry.id === saleItem.medicine_id
    );
    const selectedBatch = sourceMedicine?.batches?.find(
      (batch) => batch.id === saleItem.medicine_batch_id
    );

    return {
      medicine_id: saleItem.medicine_id,
      brand_name: medicine.brand_name || "Medicine",
      generic_name: medicine.generic_name || "",
      composition: medicine.composition || sourceMedicine?.composition || "",
      schedule: medicine.schedule || sourceMedicine?.schedule || "",
      regulatory_schedule: medicine.regulatory_schedule || sourceMedicine?.regulatory_schedule || "",
      batches: sourceMedicine?.batches || [],
      selected_batch_id: saleItem.medicine_batch_id || null,
      available_packs:
        Number(selectedBatch?.quantity_available || 0) + storedPackQuantity,
      units_per_pack: unitsPerPack,
      primary_pack_unit: medicine.primary_pack_unit || "pack",
      loose_unit: medicine.loose_unit || "tablet",
      loose_sale_allowed: !!medicine.loose_sale_allowed,
      pack_quantity: wholePacks,
      loose_quantity: looseUnits,
      selling_rate_per_pack: Number(saleItem.selling_rate || 0),
      purchase_rate_per_pack: Number(selectedBatch?.purchase_rate || 0),
      gst_percent: Number(saleItem.gst_percent || 0),
      discount_percent: Number(saleItem.discount_percent || 0),
      requires_register: !!medicine.requires_register,
      register_type: medicine.register_type
    };
  });

  $("saveSaleButton").textContent = "Update Sale";
  const newSaleButton = $("newSaleButton");
  if (newSaleButton) newSaleButton.style.display = "block";

  renderItems();
  notify(`Editing invoice ${invoice.invoice_number}`, "warning");
}

async function loadRecent(){
  const {data,error}=await supabaseClient
    .from("sales_invoices")
    .select(`
  id,
  invoice_number,
  invoice_date,
  grand_total,
  amount_paid,
  payment_status,
  invoice_status,
  cancellation_reason,
  customers(full_name)
`)
    .order("invoice_date",{ascending:false})
    .limit(20);

  if(error) return;

  recentBody.innerHTML=(data||[]).map(x=>`
    <tr>
      <td><b>${UI.safe(x.invoice_number)}</b></td>
      <td>${new Date(x.invoice_date).toLocaleString()}</td>
      <td>${UI.safe(x.customers?.full_name||"Walk-in")}</td>
      <td>${UI.money(x.grand_total)}</td>
      <td>${UI.money(x.amount_paid)}</td>
      <td>
  ${UI.safe(x.payment_status)}
  /
  ${UI.safe(x.invoice_status)}
</td>

<td>
  <div style="display:flex;gap:6px;flex-wrap:wrap">

    ${
      x.invoice_status === "posted"
        ? `
          <button
            type="button"
            class="edit-sale"
            data-id="${x.id}"
            style="background:#f59e0b;color:white;border:0;border-radius:8px;padding:8px 11px"
          >
            Edit
          </button>
        `
        : ""
    }

    <button
      type="button"
      class="print-sale"
      data-id="${x.id}"
      style="background:#0b3c5d;color:white;border:0;border-radius:8px;padding:8px 11px"
    >
      ${x.invoice_status === "cancelled" ? "View" : "Print"}
    </button>
${
  x.invoice_status === "posted"
    ? `
      <button
        type="button"
        class="cancel-sale"
        data-id="${x.id}"
        data-number="${UI.safe(x.invoice_number)}"
        style="background:#dc2626;color:white;border:0;border-radius:8px;padding:8px 11px"
      >
        Cancel
      </button>
    `
    : ""
}
  </div>
</td>
    </tr>
   `).join("");

  document
    .querySelectorAll(".print-sale")
    .forEach((button) => {
      button.onclick = () => {
        const invoiceId =
          encodeURIComponent(
            button.dataset.id
          );

       window.location.href =
  `/sales-print.html?id=${invoiceId}`;
      };
    });

  document
  .querySelectorAll(".edit-sale")
  .forEach((button) => {
    button.onclick = () => {
const invoiceId = button.dataset.id;

sessionStorage.setItem(
  "medvika_edit_sales_invoice_id",
  invoiceId
);

window.MedvikaRouter.navigate(
  "sales",
  false
);
          };
});
     document
  .querySelectorAll(".cancel-sale")
  .forEach((button) => {
    button.onclick = async () => {
      const invoiceId =
        button.dataset.id;

      const invoiceNumber =
        button.dataset.number || "";

      const reason = prompt(
        `Enter cancellation reason for ${invoiceNumber}:`
      );

      if (reason === null) {
        return;
      }

      if (!reason.trim()) {
        notify(
          "Cancellation reason is required.",
          "danger"
        );
        return;
      }

      const confirmed = confirm(
        `Cancel invoice ${invoiceNumber}?\n\nStock will be restored automatically.`
      );

      if (!confirmed) {
        return;
      }

      button.disabled = true;
      button.textContent = "Cancelling...";

      try {
        const { error } =
  await supabaseClient.rpc(
    "cancel_sales_invoice",
    {
      p_sales_invoice_id: invoiceId,
      p_reason: reason.trim()
    }
  );

        if (error) {
          throw error;
        }

        notify(
          `Invoice ${invoiceNumber} cancelled successfully.`
        );

        await loadMedicines();
        await loadRecent();

      } catch (error) {
        notify(
          "Invoice could not be cancelled: " +
          error.message,
          "danger"
        );

        button.disabled = false;
        button.textContent = "Cancel";
      }
    };
  });
  }
salesForm.onsubmit=async event=>{
event.preventDefault();
  const button=$("saveSaleButton");
  button.disabled=true;
  button.textContent="Saving Sale...";

  try{
    if(!items.length){
      throw new Error("Add at least one medicine.");
    }

    items.forEach(item=>{
      if(!item.selected_batch_id){
        throw new Error(`Select a batch for ${item.brand_name}.`);
      }

      normaliseQuantities(item);

      if((Number(item.pack_quantity||0)+Number(item.loose_quantity||0))<=0){
        throw new Error(`Enter strip or tablet quantity for ${item.brand_name}.`);
      }

      if(!Number.isInteger(Number(item.pack_quantity)) || !Number.isInteger(Number(item.loose_quantity))){
        throw new Error(`Only whole-number quantities are allowed for ${item.brand_name}.`);
      }

      if(Number(item.loose_quantity||0)>0 && !item.loose_sale_allowed){
        throw new Error(`${item.brand_name} is not enabled for loose sale.`);
      }

      if(packEquivalent(item)>item.available_packs+0.000001){
        throw new Error(`Insufficient stock for ${item.brand_name}.`);
      }
    });

    /*
     * Compliance hard-stop occurs immediately before existing save work.
     * Ordinary non-regulated retail invoices are unaffected.
     */
    const regulatedForCapture=validateComplianceBeforeSave();

    /*
     * Preserve legacy register validation for any medicine marked
     * requires_register even if no generic compliance rule has yet been mapped.
     */
    const hasRegister=items.some(item=>item.requires_register);
    if(hasRegister && !$("patientName").value.trim()){
      throw new Error("Patient name is required for register medicine.");
    }
    if(hasRegister && $("patientAge").value===""){
      throw new Error("Patient age is required for register medicine.");
    }
    if(hasRegister && !$("doctorId").value){
      throw new Error("Doctor is required for register medicine.");
    }

    await refreshGstContext();

    const result=totals();

    if(
      result.profit<0 &&
      !confirm(
        `This invoice may make a loss of ${UI.money(Math.abs(result.profit))}. Continue?`
      )
    ){
      throw new Error("Sale cancelled due to loss.");
    }

    const paid=Number($("amountPaid").value||0);

    if(paid>result.grand){
      throw new Error("Amount paid cannot exceed total.");
    }

    const payments=paid>0
      ? [{
          payment_method:$("paymentMethod").value,
          amount:paid,
          transaction_reference:$("transactionReference").value.trim()
        }]
      : [];

    const rpcName =
  editingInvoiceId
    ? "update_sales_invoice_v2"
    : "create_sales_invoice_v2";

const rpcParameters = {
  p_customer_id:
    $("customerId").value || null,

  p_doctor_id:
    $("doctorId").value || null,

  p_invoice_number:
    $("invoiceNumber").value.trim(),

  p_invoice_date:
    new Date(
      $("invoiceDate").value
    ).toISOString(),

  p_sale_type:
    $("saleType").value,

  p_prescription_number:
    $("prescriptionNumber")
      .value
      .trim() || null,

  p_prescription_date:
    $("prescriptionDate").value || null,

  p_patient_name:
    $("patientName")
      .value
      .trim() || null,

  p_patient_age:
    $("patientAge").value === ""
      ? null
      : Number(
          $("patientAge").value
        ),

  p_patient_gender:
    $("patientGender").value || null,

  p_invoice_discount_amount:
    Number(
      $("invoiceDiscount").value || 0
    ),

  p_round_off:
    Number(
      $("roundOff").value || 0
    ),

  p_notes:
    $("notes").value.trim() || null,

  p_items: items.map((item) => {
    normaliseQuantities(item);
    return ({
    medicine_id:
      item.medicine_id,

    medicine_batch_id:
      item.selected_batch_id,

    display_quantity:
      item.display_quantity,

    sale_unit:
      item.sale_unit,

    selling_rate:
      item.selling_rate_per_pack,

    discount_percent:
      item.discount_percent
    });
  }),

  p_payments: payments
};

if (editingInvoiceId) {
  rpcParameters.p_sales_invoice_id =
    editingInvoiceId;
}

const { data, error } =
  await supabaseClient.rpc(
    rpcName,
    rpcParameters
  );

    if(error) throw error;

    await snapshotInvoiceGst(
      data,
      $("invoiceNumber").value.trim()
    );

    await captureComplianceAfterSuccessfulSale(
      data,
      $("invoiceNumber").value.trim(),
      regulatedForCapture
    );

    notify(
  editingInvoiceId
    ? `Sale updated successfully. Invoice ID: ${data}`
    : `Sale saved successfully. Invoice ID: ${data}`
)
if (editingInvoiceId) {
  sessionStorage.removeItem(
    "medvika_edit_sales_invoice_id"
  );

  editingInvoiceId = null;
}
    items=[];
    salesForm.reset();
    $("invoiceNumber").value=invoiceNo();
    $("invoiceDate").value=nowInput();
    $("amountPaid").value="0";
    $("invoiceDiscount").value="0";
    $("roundOff").value="0";

    renderItems();
    await loadMedicines();
    await loadRecent();

  }catch(error){
    notify(error.message,"danger");
  }finally{
    button.disabled=false;
    button.textContent="Save Sale";
  }
};

$("medicineSearch").oninput=searchMedicines;
$("medicineSearch").addEventListener("keydown",event=>{
  if(event.key!=="Enter")return;
  event.preventDefault();
  const barcode=event.currentTarget.value.trim();
  if(!addScannedSaleBarcode(barcode))searchMedicines();
});
$("salesBarcodeScanOpen").onclick=()=>{$("salesBarcodeScanCard").hidden=false;$("salesBarcodeScanFile").value="";$("salesBarcodeScanStatus").textContent="Point the camera at the physical barcode.";$("salesBarcodeScanCard").scrollIntoView({behavior:"smooth",block:"center"})};
$("salesBarcodeScanClose").onclick=closeSalesBarcodeScanner;
$("salesBarcodeScanFile").onchange=async event=>{
  const file=event.target.files?.[0];
  if(!file)return;
  const preview=$("salesBarcodeScanPreview");
  preview.src=URL.createObjectURL(file);
  preview.hidden=false;
  $("salesBarcodeScanStatus").textContent="Reading barcode…";
  try{
    const barcode=await detectSalesBarcodeFromFile(file);
    if(!barcode)throw new Error("No barcode detected. Retake the photo with the full barcode sharp and well lit.");
    $("salesBarcodeScanStatus").textContent=`Detected: ${barcode}`;
    if(addScannedSaleBarcode(barcode))closeSalesBarcodeScanner();
  }catch(error){
    $("salesBarcodeScanStatus").textContent=error.message;
    notify(error.message,"warning");
  }
};
$("invoiceDiscount").oninput=totals;
$("roundOff").oninput=totals;

["patientName","patientAge","doctorId","prescriptionNumber"].forEach(id=>{
  const el=$(id);
  if(!el) return;
  const oldHandler=el.onchange;
  el.addEventListener("input",renderComplianceSaleAlert);
  el.addEventListener("change",renderComplianceSaleAlert);
});

$("customerId").onchange=async function(){
  if(this.value && !$("patientName").value.trim()){
    $("patientName").value=
      this.options[this.selectedIndex].text.split(" — ")[0];
  }
  try{
    await refreshGstContext();
  }catch(error){
    notify("GST context could not be resolved: "+error.message,"warning");
  }
};


const newSaleButton = $("newSaleButton");
if (newSaleButton) {
  newSaleButton.onclick = () => {
    resetToNewSale("A new sale has been opened.");
  };
}

try{
    $("invoiceNumber").value=invoiceNo();
    $("invoiceDate").value=nowInput();

    await Promise.all([
      loadCustomers(),
      loadDoctors(),
      loadMedicines(),
      loadRecent(),
      loadComplianceRules()
    ]);
  applyNearExpirySalesHandoff();
  await loadInvoiceForEdit();
  await refreshGstContext();
  }
  catch(error){ notify("Sales page could not load: "+error.message,"danger"); }
};
