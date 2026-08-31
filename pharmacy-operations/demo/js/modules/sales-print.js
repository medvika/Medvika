const UI = window.MedvikaUI;
const field = id => document.getElementById(id);
const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const money = v => UI.money(num(v));

function safeDate(value){
  return value ? new Date(value).toLocaleString("en-IN") : "—";
}

function inclusiveTax(lineValue,rate){
  const total=Math.max(0,num(lineValue));
  const r=Math.max(0,num(rate));
  const taxable=r ? total/(1+r/100) : total;
  return {total,taxable,gst:total-taxable};
}

function splitTax(gst,taxType){
  if(String(taxType||"").toUpperCase()==="IGST"){
    return {cgst:0,sgst:0,igst:gst};
  }
  return {cgst:gst/2,sgst:gst/2,igst:0};
}

async function loadInvoice(){
  const invoiceId=new URLSearchParams(window.location.search).get("id");
  if(!invoiceId){
    field("loading").textContent="Invoice ID is missing.";
    return;
  }

  const {data:invoice,error}=await supabaseClient
    .from("sales_invoices")
    .select(`
      *,
      customers (
        full_name,
        mobile,
        address,
        city,
        state,
        state_code,
        gstin,
        gst_number,
        customer_tax_type
      ),
      doctors (
        full_name,
        registration_number,
        clinic_name
      ),
      pharmacies (
        name,
        legal_name,
        phone,
        email,
        address_line_1,
        address_line_2,
        city,
        state,
        registered_state,
        gst_state_code,
        postal_code,
        gst_number,
        drug_license_number
      ),
      sales_items (
        quantity,
        batch_number,
        expiry_date,
        selling_rate,
        discount_amount,
        discount_percent,
        gst_percent,
        gst_amount,
        line_total,
        medicines (
          brand_name,
          generic_name,
          hsn_code
        )
      )
    `)
    .eq("id",invoiceId)
    .single();

  if(error)throw error;

  const pharmacy=invoice.pharmacies||{};
  const customer=invoice.customers||{};
  const customerGstin=String(
    invoice.customer_gstin ||
    customer.gstin ||
    customer.gst_number ||
    ""
  ).trim().toUpperCase();

  const isB2B=!!customerGstin;
  const posName=
    invoice.place_of_supply ||
    customer.state ||
    pharmacy.registered_state ||
    pharmacy.state ||
    "—";
  const posCode=
    invoice.place_of_supply_code ||
    customer.state_code ||
    pharmacy.gst_state_code ||
    "";
  const taxType=
    String(invoice.tax_type||"").toUpperCase()==="IGST"
      ? "IGST"
      : "CGST_SGST";

  field("pharmacyName").textContent=
    pharmacy.legal_name||pharmacy.name||"Medvika Pharmacy";

  field("pharmacyAddress").textContent=[
    pharmacy.address_line_1,
    pharmacy.address_line_2,
    pharmacy.city,
    pharmacy.state,
    pharmacy.postal_code
  ].filter(Boolean).join(" | ");

  field("pharmacyContact").textContent=[
    pharmacy.phone ? `Phone: ${pharmacy.phone}` : "",
    pharmacy.email ? `Email: ${pharmacy.email}` : ""
  ].filter(Boolean).join(" | ");

  field("pharmacyGST").textContent=
    pharmacy.gst_number ? `GSTIN: ${pharmacy.gst_number}` : "";

  field("pharmacyDrugLicence").textContent=
    pharmacy.drug_license_number
      ? `Drug Licence: ${pharmacy.drug_license_number}`
      : "";

  field("invoiceNumber").textContent=invoice.invoice_number||"—";
  field("invoiceDate").textContent=safeDate(invoice.invoice_date);

  if(String(invoice.invoice_status||"").toLowerCase()==="cancelled"){
    field("cancelledBadge").innerHTML=
      `<div class="cancelled">CANCELLED${invoice.cancellation_reason?": "+UI.safe(invoice.cancellation_reason):""}</div>`;
  }

  field("customerName").textContent=
    customer.full_name ||
    invoice.patient_name ||
    "Walk-in Customer";

  field("customerTaxStatus").textContent=
    isB2B
      ? "GST Registered Customer (B2B)"
      : "Unregistered Customer (B2C)";

  field("customerGST").textContent=
    isB2B
      ? `GSTIN: ${customerGstin}`
      : "GSTIN: Unregistered";

  field("taxStatusShort").textContent=
    isB2B
      ? "B2B / GST Registered"
      : "B2C / Unregistered";

  field("placeOfSupply").textContent=
    [posName,posCode?`(${posCode})`:""].filter(Boolean).join(" ");

  field("taxType").textContent=
    taxType==="IGST" ? "IGST" : "CGST + SGST";

  field("patientDetails").textContent=[
    invoice.patient_age!==null && invoice.patient_age!==undefined
      ? `Age: ${invoice.patient_age}`
      : "",
    invoice.patient_gender
      ? `Gender: ${invoice.patient_gender}`
      : "",
    customer.mobile
      ? `Mobile: ${customer.mobile}`
      : ""
  ].filter(Boolean).join(" | ");

  field("doctorName").textContent=
    invoice.doctors?.full_name||"Not specified";

  field("prescriptionDetails").textContent=[
    invoice.prescription_number
      ? `Prescription: ${invoice.prescription_number}`
      : "",
    invoice.prescription_date
      ? `Date: ${invoice.prescription_date}`
      : "",
    invoice.doctors?.registration_number
      ? `Reg. No.: ${invoice.doctors.registration_number}`
      : ""
  ].filter(Boolean).join(" | ");

  let taxableTotal=0,cgstTotal=0,sgstTotal=0,igstTotal=0,gstTotal=0;
  const itemBody=field("invoiceItems");
  itemBody.innerHTML="";

  (invoice.sales_items||[]).forEach(item=>{
    const rate=num(item.gst_percent);
    const line=num(item.line_total) ||
      Math.max(0,num(item.quantity)*num(item.selling_rate)-num(item.discount_amount));

    const tax=inclusiveTax(line,rate);
    const parts=splitTax(tax.gst,taxType);

    taxableTotal+=tax.taxable;
    gstTotal+=tax.gst;
    cgstTotal+=parts.cgst;
    sgstTotal+=parts.sgst;
    igstTotal+=parts.igst;

    itemBody.insertAdjacentHTML("beforeend",`
      <tr>
        <td>
          <b>${UI.safe(item.medicines?.brand_name||"—")}</b>
          <br><small>${UI.safe(item.medicines?.generic_name||"")}</small>
        </td>
        <td>${UI.safe(item.medicines?.hsn_code||"—")}</td>
        <td>${UI.safe(item.batch_number||"—")}</td>
        <td>${UI.safe(item.expiry_date||"—")}</td>
        <td>${num(item.quantity)}</td>
        <td>${money(item.selling_rate)}</td>
        <td>${money(item.discount_amount)}</td>
        <td>${rate.toFixed(2)}%</td>
        <td>${money(tax.taxable)}</td>
        <td>${money(parts.cgst)}</td>
        <td>${money(parts.sgst)}</td>
        <td>${money(parts.igst)}</td>
        <td><b>${money(line)}</b></td>
      </tr>
    `);
  });

  field("taxableSummary").textContent=money(taxableTotal);
  field("cgstSummary").textContent=money(cgstTotal);
  field("sgstSummary").textContent=money(sgstTotal);
  field("igstSummary").textContent=money(igstTotal);
  field("gstSummary").textContent=money(gstTotal);

  /*
   * Prefer stored invoice totals for commercial totals.
   * For taxable/GST display use the line-wise GST-inclusive extraction above,
   * keeping the tax presentation internally consistent with the invoice rows.
   */
  field("subtotal").textContent=money(invoice.subtotal);
  field("itemDiscount").textContent=money(invoice.item_discount_amount);
  field("invoiceDiscount").textContent=money(invoice.invoice_discount_amount);
  field("taxable").textContent=money(
    taxableTotal || invoice.taxable_amount
  );
  field("gst").textContent=money(
    gstTotal || invoice.gst_amount
  );
  field("roundOff").textContent=money(invoice.round_off);
  field("grandTotal").textContent=money(invoice.grand_total);
  field("amountPaid").textContent=money(invoice.amount_paid);
  field("balance").textContent=money(
    invoice.balance_amount ?? invoice.outstanding_amount
  );
  field("paymentStatus").textContent=invoice.payment_status||"—";
  field("notes").textContent=invoice.notes||"—";

  field("loading").style.display="none";
  field("invoiceContent").style.display="block";
}

window.addEventListener("load",async()=>{
  try{
    await loadInvoice();
  }catch(error){
    console.error("Invoice print error:",error);
    const loading=field("loading"),content=field("invoiceContent");
    if(content)content.style.display="none";
    if(loading){
      loading.style.display="block";
      loading.style.color="#991b1b";
      loading.style.padding="16px";
      loading.style.background="#fee2e2";
      loading.style.borderRadius="10px";
      loading.textContent="Invoice rendering error: "+(error?.message||"Unknown error");
    }
  }
});