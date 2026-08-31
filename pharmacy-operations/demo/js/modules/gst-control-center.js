window.initGstControlCenterModule=async function(){
  const UI=window.MedvikaUI,$=id=>document.getElementById(id);
  const pid=window.MedvikaAuth?.profile?.pharmacy_id;
  const n=v=>Number.isFinite(Number(v))?Number(v):0;
  const r2=v=>Math.round(n(v)*100)/100;
  const money=v=>UI.money(n(v));
  const first=(o,ks,d=null)=>{for(const k of ks){if(o&&o[k]!==undefined&&o[k]!==null&&o[k]!=="")return o[k];}return d;};

  let pharmacy={},medicines=[],batches=[],sales=[],saleItems=[],returns=[],returnItems=[];
  let purchases=[],purchaseItems=[],purchaseReturns=[],purchaseReturnItems=[];
  let displayHeaders=[],displayRows=[];

  function local(d){const x=new Date(d);return new Date(x.getTime()-x.getTimezoneOffset()*60000).toISOString().slice(0,10)}
  function dateKey(v){const raw=String(v||"");if(!raw)return "";if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;const d=new Date(raw);return Number.isNaN(d.getTime())?raw.slice(0,10):local(d)}
  function monthStart(){const d=new Date();return local(new Date(d.getFullYear(),d.getMonth(),1))}
  function inPeriod(v){const d=dateKey(v);return d&&(!$("gstccFrom").value||d>=$("gstccFrom").value)&&(!$("gstccTo").value||d<=$("gstccTo").value)}
  function newestDocumentsFirst(rows,key){return rows.map((row,index)=>({row,index})).sort((a,b)=>String(b.row.date||"").localeCompare(String(a.row.date||""))||String(key(a.row)||"").localeCompare(String(key(b.row)||""))||a.index-b.index).map(x=>x.row)}
  function gstCode(g){g=String(g||"").trim().toUpperCase();return /^\d{2}[A-Z0-9]{13}$/.test(g)?g.slice(0,2):""}
  function ownCode(){return String(pharmacy.gst_state_code||gstCode(pharmacy.gst_number)||"")}
  function taxSplit(gst,parent){
    const type=String(parent?.tax_type||"").toUpperCase();
    const pos=String(parent?.place_of_supply_code||"");
    if(type==="IGST" || (ownCode()&&pos&&ownCode()!==pos))return{igst:gst,cgst:0,sgst:0};
    return{igst:0,cgst:gst/2,sgst:gst/2};
  }
  function med(id){return medicines.find(x=>x.id===id)||{}}
  function batch(id){return batches.find(x=>x.id===id)||{}}
  function correctedSaleLine(i){
    const q=n(first(i,["quantity","sold_quantity"],0));
    const rate=n(first(i,["selling_rate","sale_rate","rate"],0));
    const disc=n(first(i,["discount_amount"],q*rate*n(first(i,["discount_percent"],0))/100));
    const stored=n(first(i,["line_total","total_amount","net_amount","amount"],0));
    return stored>0?stored:Math.max(0,q*rate-disc);
  }
  function saleTax(i,inv){
    const md=med(i.medicine_id),bt=batch(first(i,["medicine_batch_id"]));
    const rate=n(first(i,["gst_percent","gst_rate","tax_rate"],first(bt,["gst_percent"],first(md,["gst_percent"],0))));
    const incl=correctedSaleLine(i);
    const savedTaxable=n(first(i,["taxable_amount","taxable_value"],0));
    const savedGst=n(first(i,["gst_amount","tax_amount"],0));
    const taxable=(savedTaxable||savedGst)?savedTaxable:(rate?incl/(1+rate/100):incl);
    const gst=(savedTaxable||savedGst)?savedGst:incl-taxable;
    const explicit={igst:n(first(i,["igst_amount","igst"],0)),cgst:n(first(i,["cgst_amount","cgst"],0)),sgst:n(first(i,["sgst_amount","sgst"],0))};
    return {rate,incl:r2(incl),taxable:r2(taxable),gst:r2(gst),...(explicit.igst||explicit.cgst||explicit.sgst?explicit:taxSplit(r2(gst),inv))};
  }
  function purchaseTax(i,inv){
    const md=med(i.medicine_id),bt=batch(first(i,["medicine_batch_id"]));
    const rate=n(first(i,["gst_percent","gst_rate","tax_rate"],first(bt,["gst_percent"],first(md,["gst_percent"],0))));
    const gross=n(first(i,["quantity","purchase_quantity","qty"],0))*n(first(i,["purchase_rate","rate","cost_rate"],0));
    let taxable=n(first(i,["taxable_amount","taxable_value","net_taxable"],0));
    if(!taxable)taxable=gross*(1-n(first(i,["discount_percent"],0))/100);
    let gst=n(first(i,["gst_amount","tax_amount","total_tax"],0));
    if(!gst&&rate)gst=taxable*rate/100;
    const explicit={igst:n(first(i,["igst_amount","igst"],0)),cgst:n(first(i,["cgst_amount","cgst"],0)),sgst:n(first(i,["sgst_amount","sgst"],0))};
    return {rate,taxable:r2(taxable),gst:r2(gst),...(explicit.igst||explicit.cgst||explicit.sgst?explicit:taxSplit(r2(gst),inv))};
  }

  async function safe(table,filterPharmacy=false){
    let q=supabaseClient.from(table).select("*").limit(50000);
    if(filterPharmacy)q=q.eq("pharmacy_id",pid);
    const r=await q;
    if(r.error){console.warn(table,r.error);return []}
    return r.data||[];
  }

  function activeSales(){
    return sales.filter(x=>inPeriod(first(x,["invoice_date","created_at"])) && String(first(x,["invoice_status","status"],"")).toLowerCase()!=="cancelled");
  }
  function activePurchases(){
    return purchases.filter(x=>inPeriod(first(x,["purchase_date","created_at"])) && String(first(x,["purchase_status","status"],"")).toLowerCase()!=="cancelled");
  }

  function buildSaleRows(){
    const invMap=new Map(activeSales().map(x=>[x.id,x]));
    return saleItems.map(i=>{
      const inv=invMap.get(first(i,["sales_invoice_id","invoice_id"])); if(!inv)return null;
      const t=saleTax(i,inv),m=med(i.medicine_id);
      return {
        invoice:first(inv,["invoice_number","sale_number"],""),
        date:dateKey(first(inv,["invoice_date","created_at"],"")),
        customer_gstin:first(inv,["customer_gstin"],""),
        pos:first(inv,["place_of_supply"],""),
        pos_code:first(inv,["place_of_supply_code"],""),
        hsn:first(m,["hsn_code","hsn"],""),
        medicine:first(m,["brand_name","name"],"Medicine"),
        rate:t.rate,taxable:t.taxable,igst:t.igst,cgst:t.cgst,sgst:t.sgst,gst:t.gst,invoiceValue:t.incl
      };
    }).filter(Boolean);
  }

  function buildReturnRows(){
    const retMap=new Map(returns.filter(x=>inPeriod(first(x,["return_date","created_at"])) && String(first(x,["return_status","status"],"")).toLowerCase()!=="cancelled").map(x=>[x.id,x]));
    const saleItemMap=new Map(saleItems.map(x=>[x.id,x]));
    const saleMap=new Map(sales.map(x=>[x.id,x]));
    return returnItems.map(ri=>{
      const ret=retMap.get(first(ri,["sales_return_id","return_id"])); if(!ret)return null;
      const si=saleItemMap.get(first(ri,["sales_item_id"])); if(!si)return null;
      const inv=saleMap.get(first(si,["sales_invoice_id","invoice_id"]))||{};
      const sold=n(si.quantity),rq=n(first(ri,["return_quantity","quantity"],0)); if(!sold||!rq)return null;
      const base=saleTax(si,inv),ratio=Math.min(1,rq/sold),m=med(si.medicine_id);
      return {
        note:first(ret,["return_number","sales_return_number"],""),
        date:dateKey(first(ret,["return_date","created_at"],"")),
        type:"Sales Return / Credit Note",
        party_gstin:first(inv,["customer_gstin"],""),
        hsn:first(m,["hsn_code","hsn"],""),
        purchase_invoice_id:inv.id,itc_status:String(inv.itc_status||"Pending"),gstr2b_matched:inv.gstr2b_matched===true,
        rate:base.rate,taxable:r2(base.taxable*ratio),gst:r2(base.gst*ratio),
        igst:r2(base.igst*ratio),cgst:r2(base.cgst*ratio),sgst:r2(base.sgst*ratio)
      };
    }).filter(Boolean);
  }

  function buildPurchaseRows(){
    const invMap=new Map(activePurchases().map(x=>[x.id,x]));
    return purchaseItems.map(i=>{
      const inv=invMap.get(first(i,["purchase_invoice_id","purchase_id"])); if(!inv)return null;
      const t=purchaseTax(i,inv),m=med(i.medicine_id);
      return {
        invoice:first(inv,["purchase_number"],""),
        supplier_invoice:first(inv,["supplier_invoice_number"],""),
        date:dateKey(first(inv,["purchase_date","created_at"],"")),
        supplier_gstin:first(inv,["supplier_gstin"],""),
        pos:first(inv,["place_of_supply"],""),
        hsn:first(m,["hsn_code","hsn"],""),
        invoice_id:inv.id,itc_status:String(inv.itc_status||"Pending"),gstr2b_matched:inv.gstr2b_matched===true,
        rate:t.rate,taxable:t.taxable,igst:t.igst,cgst:t.cgst,sgst:t.sgst,gst:t.gst
      };
    }).filter(Boolean);
  }

  function buildPurchaseReturnRows(){
    const retMap=new Map(purchaseReturns.filter(x=>inPeriod(first(x,["return_date","created_at"])) && String(first(x,["return_status","status"],"")).toLowerCase()!=="cancelled").map(x=>[x.id,x]));
    const itemMap=new Map(purchaseItems.map(x=>[x.id,x]));
    const purchaseMap=new Map(purchases.map(x=>[x.id,x]));
    return purchaseReturnItems.map(ri=>{
      const ret=retMap.get(first(ri,["purchase_return_id","return_id"])); if(!ret)return null;
      const original=itemMap.get(first(ri,["purchase_item_id"])); if(!original)return null;
      const inv=purchaseMap.get(first(original,["purchase_invoice_id","purchase_id"]))||{};
      const qty=n(first(ri,["paid_return_quantity","return_quantity","quantity"],0));
      const purchased=n(first(original,["quantity","purchase_quantity"],0)); if(!qty||!purchased)return null;
      const base=purchaseTax(original,inv),ratio=Math.min(1,qty/purchased),m=med(original.medicine_id);
      return {
        note:first(ret,["return_number","debit_note_number","supplier_cn_number"],""),
        date:dateKey(first(ret,["return_date","created_at"],"")),
        type:"Purchase Return / Supplier Credit Note",
        party_gstin:first(inv,["supplier_gstin"],""),
        hsn:first(m,["hsn_code","hsn"],""),
        rate:base.rate,taxable:r2(base.taxable*ratio),gst:r2(base.gst*ratio),
        igst:r2(base.igst*ratio),cgst:r2(base.cgst*ratio),sgst:r2(base.sgst*ratio)
      };
    }).filter(Boolean);
  }

  function setTable(title,note,headers,rows){
    $("gstccTitle").textContent=title;$("gstccNote").textContent=note;
    displayHeaders=headers;displayRows=rows;
    $("gstccHead").innerHTML="<tr>"+headers.map(h=>`<th>${UI.safe(h)}</th>`).join("")+"</tr>";
    $("gstccBody").innerHTML=rows.length?rows.map(r=>"<tr>"+r.map(v=>`<td>${UI.safe(String(v??"—"))}</td>`).join("")+"</tr>").join(""):`<tr><td colspan="${headers.length}" class="empty">No records.</td></tr>`;
    $("gstccCount").textContent=`${rows.length} rows`;
  }

  function exceptionRows(saleRows,purchaseRows){
    const rows=[];
    if(!pharmacy.gst_number)rows.push(["PHARMACY","—","GSTIN missing","Pharmacy Profile"]);
    if(!pharmacy.gst_state_code)rows.push(["PHARMACY","—","GST State Code missing","Pharmacy Profile"]);
    saleRows.forEach(x=>{
      if(!x.hsn)rows.push(["SALE",x.invoice,`HSN missing for ${x.medicine}`,"Medicine Master"]);
      if(!x.pos_code)rows.push(["SALE",x.invoice,"Place of Supply code missing","Sales invoice"]);
      if(x.customer_gstin && !/^\d{2}[A-Z0-9]{13}$/i.test(x.customer_gstin))rows.push(["SALE",x.invoice,"Invalid customer GSTIN","Customer / Sales"]);
    });
    purchaseRows.forEach(x=>{
      if(!x.hsn)rows.push(["PURCHASE",x.invoice,"HSN missing","Medicine Master"]);
      if(!x.pos)rows.push(["PURCHASE",x.invoice,"Supplier State / POS missing","Supplier Master"]);
      if(x.supplier_gstin && !/^\d{2}[A-Z0-9]{13}$/i.test(x.supplier_gstin))rows.push(["PURCHASE",x.invoice,"Invalid supplier GSTIN","Supplier Master"]);
    });
    return rows;
  }

  function render(){
    const sr=buildSaleRows(),rr=buildReturnRows(),pr=buildPurchaseRows(),prr=buildPurchaseReturnRows();
    const grossTaxable=sr.reduce((s,x)=>s+x.taxable,0), grossGst=sr.reduce((s,x)=>s+x.gst,0);
    const returnTaxable=rr.reduce((s,x)=>s+x.taxable,0), returnGst=rr.reduce((s,x)=>s+x.gst,0);
    const purchaseGst=pr.reduce((s,x)=>s+x.gst,0),purchaseReturnGst=prr.reduce((s,x)=>s+x.gst,0);
    const ex=exceptionRows(sr,pr);
    $("gstccTaxable").textContent=money(grossTaxable-returnTaxable);
    $("gstccOutput").textContent=money(grossGst-returnGst);
    $("gstccInput").textContent=money(purchaseGst);
    $("gstccPurchaseReturnTax").textContent=money(purchaseReturnGst);
    $("gstccNetInput").textContent=money(purchaseGst-purchaseReturnGst);
    $("gstccReturnTax").textContent=money(returnGst);
    $("gstccExceptions").textContent=String(ex.length);

    const view=$("gstccView").value;

    if(view==="output"){
      setTable("Output GST Register","Invoice/item-wise outward GST after GST-inclusive extraction.",
        ["Invoice","Date","Customer GSTIN","POS","HSN","Medicine","GST %","Taxable","IGST","CGST","SGST","Total GST","Invoice Value"],
        newestDocumentsFirst(sr,x=>x.invoice).map(x=>[x.invoice,x.date,x.customer_gstin||"B2C",x.pos||"—",x.hsn||"—",x.medicine,x.rate+"%",money(x.taxable),money(x.igst),money(x.cgst),money(x.sgst),money(x.gst),money(x.invoiceValue)]));
    }

    if(view==="rates"){
      const rates=[...new Set([...sr,...rr,...pr,...prr].map(x=>n(x.rate)))].sort((a,b)=>a-b);
      setTable("GST Rate-wise Summary","Sales and purchase GST grouped by actual tax rates in ERP.",
        ["GST Rate","Sales Taxable","Sales GST","Sales Return Taxable","Sales Return GST","Purchase Taxable","Purchase GST","Purchase Return GST","Net Output GST","Net Input GST"],
        rates.map(rate=>{
          const s=sr.filter(x=>x.rate===rate),r=rr.filter(x=>n(x.rate)===rate),p=pr.filter(x=>x.rate===rate),pRet=prr.filter(x=>n(x.rate)===rate);
          const st=s.reduce((a,x)=>a+x.taxable,0),sg=s.reduce((a,x)=>a+x.gst,0);
          const rt=r.reduce((a,x)=>a+x.taxable,0),rg=r.reduce((a,x)=>a+x.gst,0);
          const pt=p.reduce((a,x)=>a+x.taxable,0),pg=p.reduce((a,x)=>a+x.gst,0),prg=pRet.reduce((a,x)=>a+x.gst,0);
          return [rate+"%",money(st),money(sg),money(rt),money(rg),money(pt),money(pg),money(prg),money(sg-rg),money(pg-prg)];
        }));
    }

    if(view==="hsn"){
      const map=new Map();
      const ensure=x=>{const key=`${x.hsn||"MISSING"}|${x.rate}`;if(!map.has(key))map.set(key,{hsn:x.hsn||"MISSING",rate:x.rate,saleLines:0,returnLines:0,grossTaxable:0,grossGst:0,grossValue:0,returnTaxable:0,returnGst:0,returnValue:0});return map.get(key)};
      sr.forEach(x=>{const g=ensure(x);g.saleLines++;g.grossTaxable+=x.taxable;g.grossGst+=x.gst;g.grossValue+=x.invoiceValue});
      rr.forEach(x=>{const g=ensure(x);g.returnLines++;g.returnTaxable+=x.taxable;g.returnGst+=x.gst;g.returnValue+=x.taxable+x.gst});
      setTable("HSN Summary","Return-adjusted outward HSN summary using saved sale and credit-note tax values.",
        ["HSN","GST Rate","Sale Lines","Return Lines","Gross Taxable","Return Taxable","Net Taxable","Net GST","Net Invoice Value"],
        [...map.values()].sort((a,b)=>String(a.hsn).localeCompare(String(b.hsn))||a.rate-b.rate).map(x=>[x.hsn,x.rate+"%",x.saleLines,x.returnLines,money(x.grossTaxable),money(x.returnTaxable),money(x.grossTaxable-x.returnTaxable),money(x.grossGst-x.returnGst),money(x.grossValue-x.returnValue)]));
    }

    if(view==="notes"){
      setTable("Credit / Debit Note Register","Sales and purchase returns are shown using their saved ERP tax values.",
        ["Note No.","Date","Type","Party GSTIN","HSN","Taxable","IGST","CGST","SGST","GST"],
        newestDocumentsFirst([...rr,...prr],x=>x.note).map(x=>[x.note,x.date,x.type,x.party_gstin||"Unregistered",x.hsn||"—",money(x.taxable),money(x.igst),money(x.cgst),money(x.sgst),money(x.gst)]));
    }

    if(view==="exceptions"){
      setTable("GST Exceptions","Fix these before trial GST reconciliation.",
        ["Area","Reference","Exception","Fix In"],ex);
    }

    if(view==="recon"){
      const outputNet=grossGst-returnGst;
      const matchedEligible=pr.filter(x=>x.itc_status==="Eligible"&&x.gstr2b_matched).reduce((s,x)=>s+x.gst,0);
      const eligibleUnmatched=pr.filter(x=>x.itc_status==="Eligible"&&!x.gstr2b_matched).reduce((s,x)=>s+x.gst,0);
      const matchedReturnReversal=prr.filter(x=>x.itc_status==="Eligible"&&x.gstr2b_matched).reduce((s,x)=>s+x.gst,0);
      const claimableItc=matchedEligible-matchedReturnReversal;
      const liability=outputNet-claimableItc;
      setTable("GST Reconciliation Readiness","Live controls using the same saved transactions and 2B eligibility rules as GSTR-1 and GSTR-3B.",
        ["Check","Current Result","Control","Status"],
        [
          ["Net outward GST",money(outputNet),"Sales GST less credit-note GST","OK"],
          ["2B-matched eligible ITC",money(matchedEligible),"Only matched + Eligible invoices enter GSTR-3B",matchedEligible>0?"READY":"NONE"],
          ["Eligible but not 2B matched",money(eligibleUnmatched),"Must remain excluded from GSTR-3B",eligibleUnmatched>0?"REVIEW":"OK"],
          ["Eligible purchase-return reversal",money(matchedReturnReversal),"Deduct from matched eligible ITC",matchedReturnReversal>0?"APPLIED":"NONE"],
          ["Net claimable ITC working",money(claimableItc),"Matched eligible ITC less eligible returns",claimableItc>=0?"OK":"REVIEW"],
          ["Indicative liability",money(liability),"Net output GST less claimable ITC","WORKING"],
          ["GST data exceptions",String(ex.length),"Resolve missing GSTIN, HSN and POS data",ex.length?"REVIEW":"OK"]
        ]);
    }
  }

  async function load(){
    const results=await Promise.all([
      safe("medicines",false),
      safe("medicine_batches",true),
      safe("sales_invoices",true),
      safe("sales_items",false),
      safe("sales_returns",true),
      safe("sales_return_items",false),
      safe("purchase_invoices",true),
      safe("purchase_items",false),
      safe("purchase_returns",true),
      safe("purchase_return_items",false)
    ]);
    [medicines,batches,sales,saleItems,returns,returnItems,purchases,purchaseItems,purchaseReturns,purchaseReturnItems]=results;
    const p=await supabaseClient.from("pharmacies").select("gst_number,gst_state_code,registered_state,state").eq("id",pid).maybeSingle();
    pharmacy=p.data||{};
    render();
  }

  function csv(){
    if(!displayRows.length)return UI.toast("No rows to export.","warning");
    const esc=v=>`"${String(v??"").replaceAll('"','""')}"`;
    const text=[displayHeaders,...displayRows].map(r=>r.map(esc).join(",")).join("\n");
    const a=document.createElement("a"),u=URL.createObjectURL(new Blob([text],{type:"text/csv"}));
    a.href=u;a.download=`Medvika_GST_${$("gstccView").value}_${$("gstccFrom").value}_to_${$("gstccTo").value}.csv`;a.click();URL.revokeObjectURL(u);
  }

  $("gstccFrom").value=monthStart();$("gstccTo").value=local(new Date());
  $("gstccFrom").onchange=render;$("gstccTo").onchange=render;$("gstccView").onchange=render;
  $("gstccRefresh").onclick=load;$("gstccPrint").onclick=()=>window.print();$("gstccCsv").onclick=csv;
  try{await load()}catch(e){UI.toast("GST Control Center could not load: "+e.message,"error")}
};