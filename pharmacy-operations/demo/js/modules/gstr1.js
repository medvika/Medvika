window.initGstr1Module=async function(){
 const UI=window.MedvikaUI,$=id=>document.getElementById(id),pid=window.MedvikaAuth?.profile?.pharmacy_id,n=v=>Number.isFinite(Number(v))?Number(v):0,first=(o,ks,d=null)=>{for(const k of ks){if(o&&o[k]!==undefined&&o[k]!==null&&o[k]!=="")return o[k];}return d;},money=v=>UI.money(n(v));
 let medicines=[],batches=[],sales=[],items=[],returns=[],returnItems=[],rows=[],displayRows=[],pharmacy={};
 const med=id=>medicines.find(x=>x.id===id)||{},batch=id=>batches.find(x=>x.id===id)||{};
 function today(){const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)}
 function dateKey(v){const raw=String(v||"");if(!raw)return"";if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;const d=new Date(raw);return Number.isNaN(d.getTime())?raw.slice(0,10):new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)}
 function monthStart(){const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1).toLocaleDateString("en-CA")}
 async function safe(t,filter=true){let q=supabaseClient.from(t).select("*").limit(50000);if(filter)q=q.eq("pharmacy_id",pid);const r=await q;if(r.error){console.warn(t,r.error);return []}return r.data||[]}
 function correctedInclusive(i){const stored=n(first(i,["line_total","total_amount","net_amount","amount"],0));if(stored>0)return stored;const q=n(first(i,["quantity","sold_quantity"],0)),rate=n(first(i,["selling_rate","sale_rate","rate"],0)),discount=n(first(i,["discount_amount"],0))||(q*rate*n(first(i,["discount_percent"],0))/100);return Math.max(0,q*rate-discount)}
 function tax(i,inv,denoms){const medicine=med(i.medicine_id),b=batch(i.medicine_batch_id),rawRate=first(i,["gst_percent","gst_rate"],first(b,["gst_percent"],first(medicine,["gst_percent"],null))),rate=n(rawRate),incl0=correctedInclusive(i),den=n(denoms.get(inv.id)),disc=n(inv.invoice_discount_amount),incl=Math.max(0,incl0-(den?disc*incl0/den:0)),savedTaxable=n(first(i,["taxable_amount","taxable_value"],0)),savedGst=n(first(i,["gst_amount","tax_amount"],0)),factor=incl0>0?incl/incl0:1,taxable=(savedTaxable||savedGst)?savedTaxable*factor:(rate?incl/(1+rate/100):incl),gst=(savedTaxable||savedGst)?savedGst*factor:incl-taxable;let igst=n(first(i,["igst_amount","igst"],0)),cgst=n(first(i,["cgst_amount","cgst"],0)),sgst=n(first(i,["sgst_amount","sgst"],0));return{rate,rateMissing:rawRate===null||rawRate==="",incl:round2(incl),taxable:round2(taxable),gst:round2(gst),igst,cgst,sgst}}
 function gstin(inv){return String(first(inv,["customer_gstin","gstin","buyer_gstin"],"")).trim().toUpperCase()}
 function pos(inv){return String(first(inv,["place_of_supply","pos","customer_state","state"],"")).trim()}
 function supplierState(){return String(first(pharmacy,["state","business_state","registered_state"],"")).trim()}
 function classify(inv){const g=gstin(inv),p=normStateCode(pos(inv)||g),home=pharmacyStateCode(),inter=p&&home&&p!==home,value=n(first(inv,["grand_total","invoice_total","total_amount"],0));if(g)return"B2B";if(inter&&value>100000)return"B2CL";return"B2CS"}
 function build(){
  const invMap=new Map(sales.map(x=>[x.id,x])),itemMap=new Map(items.map(x=>[x.id,x])),retMap=new Map(returns.map(x=>[x.id,x])),den=new Map();
  items.forEach(i=>den.set(first(i,["sales_invoice_id","invoice_id"]),n(den.get(first(i,["sales_invoice_id","invoice_id"])))+correctedInclusive(i)));
  rows=[];
  items.forEach(i=>{const inv=invMap.get(first(i,["sales_invoice_id","invoice_id"]));if(!inv||String(first(inv,["invoice_status","status"],"")).toLowerCase()==="cancelled")return;const t=tax(i,inv,den),m=med(i.medicine_id),cls=classify(inv),g=gstin(inv),p=pos(inv);let exceptions=[];if(!first(m,["hsn_code","hsn","hsn_number"]))exceptions.push("HSN missing");if(t.rateMissing)exceptions.push("GST rate missing");if(cls==="B2B"&&!g)exceptions.push("GSTIN missing");if(!p)exceptions.push("Place of supply missing");rows.push({date:first(inv,["invoice_date","sale_date","created_at"]),type:"SALE",section:cls,invoice:first(inv,["invoice_number","sale_number"],"Sale"),gstin:g,pos:p,medicine_id:i.medicine_id,medicine:first(m,["brand_name","name","medicine_name"],"Medicine"),hsn:first(m,["hsn_code","hsn","hsn_number"],""),qty:n(i.quantity),rate:t.rate,taxable:t.taxable,gst:t.gst,invoiceValue:t.incl,exceptions});});
  returnItems.forEach(ri=>{const ret=retMap.get(first(ri,["sales_return_id","return_id"])),oi=itemMap.get(first(ri,["sales_item_id"]));if(!ret||!oi||String(first(ret,["return_status","status"],"")).toLowerCase()==="cancelled")return;const inv=invMap.get(first(oi,["sales_invoice_id","invoice_id"]))||{};if(String(first(inv,["invoice_status","status"],"")).toLowerCase()==="cancelled")return;const sold=n(oi.quantity),rq=n(first(ri,["return_quantity","quantity"],0));if(!sold||!rq)return;const t=tax(oi,inv,den),ratio=Math.min(1,rq/sold),m=med(oi.medicine_id);rows.push({date:first(ret,["return_date","created_at"]),type:"CREDIT_NOTE",section:classify(inv),invoice:first(ret,["return_number","sales_return_number"],"Sales Return"),gstin:gstin(inv),pos:pos(inv),medicine_id:oi.medicine_id,medicine:first(m,["brand_name","name"],"Medicine"),hsn:first(m,["hsn_code","hsn"],""),qty:-rq,rate:t.rate,taxable:-round2(t.taxable*ratio),gst:-round2(t.gst*ratio),invoiceValue:-round2(t.incl*ratio),exceptions:[]});});
 }
 function filtered(){const f=$("gstr1From").value,t=$("gstr1To").value;return rows.filter(x=>{const d=dateKey(x.date);return(!f||d>=f)&&(!t||d<=t)})}
 function group(list,keys){const m=new Map();list.forEach(x=>{const k=keys.map(y=>x[y]||"").join("|");if(!m.has(k))m.set(k,{...Object.fromEntries(keys.map(y=>[y,x[y]])),count:0,qty:0,taxable:0,gst:0,invoiceValue:0});const g=m.get(k);g.count++;g.qty+=n(x.qty);g.taxable+=n(x.taxable);g.gst+=n(x.gst);g.invoiceValue+=n(x.invoiceValue)});return[...m.values()]}
 function setTable(title,note,headers,data,mapper){$("gstr1TableTitle").textContent=title;$("gstr1TableNote").textContent=note;$("gstr1Head").innerHTML="<tr>"+headers.map(h=>`<th>${h}</th>`).join("")+"</tr>";displayRows=data.map(mapper);$("gstr1Body").innerHTML=displayRows.length?displayRows.map(r=>"<tr>"+r.map(v=>`<td>${UI.safe(String(v??"—"))}</td>`).join("")+"</tr>").join(""):`<tr><td colspan="${headers.length}" class="empty">No records.</td></tr>`;$("gstr1Count").textContent=`${displayRows.length} records`}
 function render(){
  const all=filtered(),salesOnly=all.filter(x=>x.type==="SALE"),v=$("gstr1View").value,exceptions=all.filter(x=>x.exceptions.length);
  const creditNotes=all.filter(x=>x.type==="CREDIT_NOTE"),grossValue=salesOnly.reduce((s,x)=>s+x.invoiceValue,0),returnValue=Math.abs(creditNotes.reduce((s,x)=>s+x.invoiceValue,0)),netTaxable=round2(all.reduce((s,x)=>s+x.taxable,0)),netTax=round2(all.reduce((s,x)=>s+x.gst,0));$("g1Invoice").textContent=money(grossValue);$("g1Returns").textContent=money(returnValue);$("g1NetInvoice").textContent=money(grossValue-returnValue);$("g1Taxable").textContent=money(netTaxable);$("g1Tax").textContent=money(netTax);$("g1B2B").textContent=new Set(salesOnly.filter(x=>x.section==="B2B").map(x=>x.invoice)).size;$("g1B2CL").textContent=new Set(salesOnly.filter(x=>x.section==="B2CL").map(x=>x.invoice)).size;$("g1Exceptions").textContent=exceptions.length;
  if(v==="SUMMARY"){const d=group(all,["section","type"]);setTable("GSTR-1 Summary","Section-wise working summary.",["Section","Type","Records","Taxable Value","GST Amount","Invoice Value"],d,x=>[x.section,x.type,x.count,money(x.taxable),money(x.gst),money(x.invoiceValue)])}
  else if(["B2B","B2CL"].includes(v)){const d=all.filter(x=>x.type==="SALE"&&x.section===v);setTable(v==="B2B"?"B2B Invoices":"B2C Large Invoices","Invoice-level outward supply working.",["Date","Invoice","GSTIN","POS","Medicine","HSN","GST Rate (%)","Taxable","GST Amount","Invoice Value"],d,x=>[dateKey(x.date),x.invoice,x.gstin||"—",x.pos||"—",x.medicine,x.hsn||"—",x.rate.toFixed(2)+"%",money(x.taxable),money(x.gst),money(x.invoiceValue)])}
  else if(v==="B2CS"){const d=group(all.filter(x=>x.type==="SALE"&&x.section==="B2CS"),["pos","rate"]);setTable("B2C Others","Consolidated by place of supply and GST rate.",["POS","GST Rate (%)","Records","Taxable","GST Amount","Invoice Value"],d,x=>[x.pos||"—",n(x.rate).toFixed(2)+"%",x.count,money(x.taxable),money(x.gst),money(x.invoiceValue)])}
  else if(v==="CDN"){const d=all.filter(x=>x.type==="CREDIT_NOTE");setTable("Credit Notes / Sales Returns","Outward tax reductions from sales returns.",["Date","Credit Note","GSTIN","POS","Medicine","HSN","GST Rate (%)","Taxable Adjustment","GST Adjustment","Note Value"],d,x=>[dateKey(x.date),x.invoice,x.gstin||"—",x.pos||"—",x.medicine,x.hsn||"—",x.rate.toFixed(2)+"%",money(x.taxable),money(x.gst),money(x.invoiceValue)])}
  else if(v==="HSN_B2B"||v==="HSN_B2C"){const sec=v==="HSN_B2B"?"B2B":"B2C",d=group(all.filter(x=>(sec==="B2B"?x.section==="B2B":x.section!=="B2B")),["hsn","rate"]);setTable(`HSN Summary — ${sec}`,`Table 12 working summary for ${sec} supplies.`,["HSN","GST Rate (%)","Quantity","Taxable Value","GST Amount","Total Value"],d,x=>[x.hsn||"MISSING",n(x.rate).toFixed(2)+"%",x.qty,money(x.taxable),money(x.gst),money(x.invoiceValue)])}
  else if(v==="DOCS"){const f=$("gstr1From").value,t=$("gstr1To").value,periodDocs=sales.filter(x=>{const d=dateKey(first(x,["invoice_date","created_at"],""));return d&&(!f||d>=f)&&(!t||d<=t)}),nums=[...new Set(periodDocs.map(x=>String(first(x,["invoice_number","sale_number"],""))).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),cancelled=periodDocs.filter(x=>String(first(x,["invoice_status","status"],"")).toLowerCase()==="cancelled").length;setTable("Documents Issued","Invoice-series working for Table 13 review.",["Nature","From Serial","To Serial","Total Issued","Cancelled","Net Issued"],nums.length?[{nature:"Invoices for outward supply",from:nums[0],to:nums[nums.length-1],issued:periodDocs.length,cancelled}]:[],x=>[x.nature,x.from,x.to,x.issued,x.cancelled,x.issued-x.cancelled])}
  else {setTable("Data Exceptions","Correct these before accountant hand-off.",["Date","Invoice","Section","Medicine","GSTIN","POS","HSN","Issue"],exceptions,x=>[dateKey(x.date),x.invoice,x.section,x.medicine,x.gstin||"—",x.pos||"—",x.hsn||"—",x.exceptions.join("; ")])}
 }
 function exportCsv(){if(!displayRows.length)return UI.toast("No rows to export.","warning");const heads=[...document.querySelectorAll("#gstr1Head th")].map(x=>x.textContent),esc=v=>`"${String(v??"").replaceAll('"','""')}"`,csv=[heads,...displayRows].map(r=>r.map(esc).join(",")).join("\n"),a=document.createElement("a"),url=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.href=url;a.download=`medvika-gstr1-${$("gstr1View").value}-${$("gstr1From").value}-to-${$("gstr1To").value}.csv`;a.click();URL.revokeObjectURL(url)}
 

/* ============================================================
   MEDVIKA GSTR-1 JSON EXPORT — BETA
   Add this block inside window.initGstr1Module, after build()
   is available and before the final event bindings.
   ============================================================ */

const GST_STATE_CODES = {
  "jammu and kashmir":"01","himachal pradesh":"02","punjab":"03","chandigarh":"04",
  "uttarakhand":"05","haryana":"06","delhi":"07","rajasthan":"08","uttar pradesh":"09",
  "bihar":"10","sikkim":"11","arunachal pradesh":"12","nagaland":"13","manipur":"14",
  "mizoram":"15","tripura":"16","meghalaya":"17","assam":"18","west bengal":"19",
  "jharkhand":"20","odisha":"21","chhattisgarh":"22","madhya pradesh":"23","gujarat":"24",
  "dadra and nagar haveli and daman and diu":"26","maharashtra":"27","andhra pradesh":"37",
  "karnataka":"29","goa":"30","lakshadweep":"31","kerala":"32","tamil nadu":"33",
  "puducherry":"34","andaman and nicobar islands":"35","telangana":"36","ladakh":"38"
};

function normStateCode(value){
  const s=String(value||"").trim();
  if(/^\d{2}$/.test(s)) return s;
  const gstMatch=s.match(/^(\d{2})[A-Z0-9]{13}$/i);
  if(gstMatch) return gstMatch[1];
  return GST_STATE_CODES[s.toLowerCase()] || "";
}

function ddmmyyyy(value){
  const d=new Date(value);
  if(Number.isNaN(d.getTime())) return "";
  return String(d.getDate()).padStart(2,"0")+"-"+
         String(d.getMonth()+1).padStart(2,"0")+"-"+
         d.getFullYear();
}

function returnPeriod(){
  const d=new Date($("gstr1To").value+"T00:00:00");
  if(Number.isNaN(d.getTime())) return "";
  return String(d.getMonth()+1).padStart(2,"0")+String(d.getFullYear());
}

function round2(v){ return Math.round((n(v)+Number.EPSILON)*100)/100; }

function pharmacyGstin(){
  return String(first(pharmacy,[
    "gstin","gst_number","gst_no","gstin_number"
  ],"")).trim().toUpperCase();
}

function pharmacyStateCode(){
  const gst=pharmacyGstin();
  return normStateCode(gst) ||
         normStateCode(first(pharmacy,[
           "state_code","gst_state_code","registered_state","state","business_state"
         ],""));
}

function uqcForMedicine(m){
  const raw=String(first(m,["uqc","unit","unit_name","pack_uom"],"NOS")).trim().toUpperCase();
  const map={
    "PCS":"NOS","PIECE":"NOS","PIECES":"NOS","UNIT":"NOS","UNITS":"NOS",
    "TAB":"NOS","TABLET":"NOS","TABLETS":"NOS","STRIP":"NOS","STRIPS":"NOS",
    "CAP":"NOS","CAPSULE":"NOS","CAPSULES":"NOS","BOTTLE":"BTL","BOTTLES":"BTL",
    "BOX":"BOX","BOXES":"BOX","ML":"MLT","L":"LTR","LTR":"LTR","KG":"KGS","GM":"GMS"
  };
  return map[raw] || raw || "NOS";
}

/*
 * Build invoice groups from the already-normalised `rows`.
 * Each SALE row is already GST-exclusive taxable + GST amount
 * based on corrected GST-inclusive billing.
 */
function jsonPeriodRows(){
  const f=$("gstr1From").value,t=$("gstr1To").value;
  return rows.filter(x=>{
    const d=dateKey(x.date);
    return d && (!f||d>=f) && (!t||d<=t);
  });
}

function invoiceGroups(){
  const source=jsonPeriodRows().filter(x=>x.type==="SALE");
  const map=new Map();
  source.forEach(x=>{
    const key=x.invoice;
    if(!map.has(key)){
      map.set(key,{
        invoice:x.invoice,
        date:x.date,
        section:x.section,
        gstin:x.gstin,
        pos:x.pos,
        rows:[]
      });
    }
    map.get(key).rows.push(x);
  });
  return [...map.values()];
}

function buildJsonPreflight(){
  const issues=[];
  const gstin=pharmacyGstin();
  const ownState=pharmacyStateCode();

  if(!/^\d{2}[A-Z0-9]{13}$/i.test(gstin)){
    issues.push("Pharmacy GSTIN is missing or invalid in Pharmacy Profile.");
  }
  if(!ownState){
    issues.push("Pharmacy GST state/state code is missing.");
  }

  const invs=invoiceGroups();

  invs.forEach(inv=>{
    const pos=normStateCode(inv.pos || inv.gstin);
    if(!pos) issues.push(`Invoice ${inv.invoice}: Place of Supply/state code missing.`);

    if(inv.section==="B2B" && !/^\d{2}[A-Z0-9]{13}$/i.test(inv.gstin||"")){
      issues.push(`Invoice ${inv.invoice}: B2B recipient GSTIN missing/invalid.`);
    }

    inv.rows.forEach(r=>{
      if(!r.hsn) issues.push(`Invoice ${inv.invoice}: HSN missing for ${r.medicine}.`);
      if(n(r.rate)<0) issues.push(`Invoice ${inv.invoice}: invalid GST rate for ${r.medicine}.`);
    });
  });

  return [...new Set(issues)];
}

function taxSplit(row,posCode,ownState){
  /*
   * If explicit component values are not available in the GSTR working row,
   * derive tax split from POS for JSON generation:
   * same state => CGST + SGST
   * different state => IGST
   */
  const total=round2(row.gst);
  if(!total) return {iamt:0,camt:0,samt:0,csamt:0};

  if(posCode && ownState && posCode!==ownState){
    return {iamt:total,camt:0,samt:0,csamt:0};
  }
  return {
    iamt:0,
    camt:round2(total/2),
    samt:round2(total-total/2),
    csamt:0
  };
}

function makeB2B(invs,ownState){
  const recipients=new Map();

  invs.filter(x=>x.section==="B2B").forEach(inv=>{
    const ctin=String(inv.gstin||"").toUpperCase();
    if(!recipients.has(ctin)) recipients.set(ctin,[]);

    const pos=normStateCode(inv.pos||ctin);
    const items=inv.rows.map((r,idx)=>{
      const split=taxSplit(r,pos,ownState);
      return {
        num:idx+1,
        itm_det:{
          txval:round2(r.taxable),
          rt:round2(r.rate),
          iamt:split.iamt,
          camt:split.camt,
          samt:split.samt,
          csamt:0
        }
      };
    });

    recipients.get(ctin).push({
      inum:String(inv.invoice),
      idt:ddmmyyyy(inv.date),
      val:round2(inv.rows.reduce((s,r)=>s+n(r.invoiceValue),0)),
      pos:pos,
      rchrg:"N",
      inv_typ:"R",
      itms:items
    });
  });

  return [...recipients.entries()].map(([ctin,inv])=>({ctin,inv}));
}

function makeB2CS(invs,ownState){
  const map=new Map();

  invs.filter(x=>x.section==="B2CS").forEach(inv=>{
    const pos=normStateCode(inv.pos);
    inv.rows.forEach(r=>{
      const key=`${pos}|${round2(r.rate)}`;
      if(!map.has(key)){
        map.set(key,{pos,rt:round2(r.rate),txval:0,iamt:0,camt:0,samt:0,csamt:0});
      }
      const g=map.get(key),split=taxSplit(r,pos,ownState);
      g.txval+=n(r.taxable);
      g.iamt+=split.iamt; g.camt+=split.camt; g.samt+=split.samt;
    });
  });

  return [...map.values()].map(g=>({
    sply_ty:g.pos!==ownState?"INTER":"INTRA",
    typ:"OE",
    pos:g.pos,
    rt:g.rt,
    txval:round2(g.txval),
    iamt:round2(g.iamt),
    camt:round2(g.camt),
    samt:round2(g.samt),
    csamt:0
  }));
}

function makeB2CL(invs,ownState){
  return invs.filter(x=>x.section==="B2CL").map(inv=>{
    const pos=normStateCode(inv.pos);
    return {
      pos,
      inv:[{
        inum:String(inv.invoice),
        idt:ddmmyyyy(inv.date),
        val:round2(inv.rows.reduce((s,r)=>s+n(r.invoiceValue),0)),
        itms:inv.rows.map((r,idx)=>{
          const split=taxSplit(r,pos,ownState);
          return {
            num:idx+1,
            itm_det:{
              txval:round2(r.taxable),
              rt:round2(r.rate),
              iamt:split.iamt,
              csamt:0
            }
          };
        })
      }]
    };
  });
}

function makeCreditNotes(ownState){
  const retRows=jsonPeriodRows().filter(x=>x.type==="CREDIT_NOTE"),notes=new Map();
  retRows.forEach(r=>{if(!notes.has(r.invoice))notes.set(r.invoice,[]);notes.get(r.invoice).push(r)});
  const registered=new Map(),unregistered=[];
  [...notes.entries()].forEach(([note,rs])=>{
    const firstRow=rs[0],pos=normStateCode(firstRow.pos||firstRow.gstin),val=Math.abs(rs.reduce((s,r)=>s+n(r.invoiceValue),0));
    const noteObj={nt_num:String(note),nt_dt:ddmmyyyy(firstRow.date),ntty:"C",val:round2(val),itms:rs.map((r,idx)=>{const components=taxSplit({...r,gst:Math.abs(r.gst)},pos,ownState);return{num:idx+1,itm_det:{txval:round2(Math.abs(r.taxable)),rt:round2(r.rate),iamt:components.iamt,camt:components.camt,samt:components.samt,csamt:0}}})};
    if(firstRow.gstin){const ctin=String(firstRow.gstin).toUpperCase();if(!registered.has(ctin))registered.set(ctin,[]);registered.get(ctin).push(noteObj)}
    else unregistered.push({...noteObj,pos});
  });
  return{cdnr:[...registered.entries()].map(([ctin,nt])=>({ctin,nt})),cdnur:unregistered};
}

function makeHsn(){
  const src=jsonPeriodRows();
  const map=new Map();

  src.forEach(r=>{
    const m=medicines.find(x=>x.id===r.medicine_id)||{};
    const key=`${r.hsn}|${r.rate}|${uqcForMedicine(m)}`;
    if(!map.has(key)){
      map.set(key,{
        hsn_sc:String(r.hsn||""),
        desc:String(r.medicine||""),
        uqc:uqcForMedicine(m),
        qty:0,
        val:0,
        txval:0,
        iamt:0,
        camt:0,
        samt:0,
        csamt:0,
        rt:round2(r.rate)
      });
    }
    const g=map.get(key);
    const pos=normStateCode(r.pos||r.gstin),split=taxSplit(r,pos,pharmacyStateCode());
    g.qty+=n(r.qty);
    g.val+=n(r.invoiceValue);
    g.txval+=n(r.taxable);
    g.iamt+=split.iamt;g.camt+=split.camt;g.samt+=split.samt;
  });

  return {
    data:[...map.values()].map((g,idx)=>({
      num:idx+1,
      hsn_sc:g.hsn_sc,
      desc:g.desc,
      uqc:g.uqc,
      qty:round2(g.qty),
      val:round2(g.val),
      txval:round2(g.txval),
      iamt:round2(g.iamt),
      camt:round2(g.camt),
      samt:round2(g.samt),
      csamt:0,
      rt:g.rt
    }))
  };
}

function makeDocIssue(){
  const allSales=sales.filter(x=>{
    const d=dateKey(first(x,["invoice_date","created_at"],""));
    return d && (!$("gstr1From").value||d>=$("gstr1From").value) &&
      (!$("gstr1To").value||d<=$("gstr1To").value);
  });

  const issued=allSales.length;
  const cancelled=allSales.filter(x=>
    String(first(x,["invoice_status","status"],"")).toLowerCase()==="cancelled"
  ).length;

  const nums=allSales.map(x=>String(first(x,["invoice_number","sale_number"],"")))
                     .filter(Boolean)
                     .sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));

  if(!nums.length) return {doc_det:[]};

  return {
    doc_det:[{
      doc_num:1,
      docs:[{
        num:1,
        from:nums[0],
        to:nums[nums.length-1],
        totnum:issued,
        cancel:cancelled,
        net_issue:issued-cancelled
      }]
    }]
  };
}

function buildGstr1Json(){
  const issues=buildJsonPreflight();
  if(issues.length){
    return {ok:false,issues};
  }

  const gstin=pharmacyGstin(),ownState=pharmacyStateCode(),invs=invoiceGroups();
  const notes=makeCreditNotes(ownState);

  const payload={
    gstin,
    fp:returnPeriod(),
    gt:round2(n(first(pharmacy,["aggregate_turnover","gross_turnover","annual_turnover"],0))),
    cur_gt:round2(n(first(pharmacy,["current_turnover","current_gross_turnover"],0))),
    b2b:makeB2B(invs,ownState),
    b2cl:makeB2CL(invs,ownState),
    b2cs:makeB2CS(invs,ownState),
    cdnr:notes.cdnr,
    cdnur:notes.cdnur,
    hsn:makeHsn(),
    doc_issue:makeDocIssue()
  };

  return {ok:true,payload};
}

function downloadGstr1Json(){
  const result=buildGstr1Json();
  const status=$("gstr1JsonStatus");

  if(!result.ok){
    if(status){
      status.style.display="block";
      status.innerHTML="<b>JSON blocked — correct these first:</b><br>"+
        result.issues.map(x=>"• "+UI.safe(x)).join("<br>");
    }
    UI.toast(`GSTR-1 JSON blocked: ${result.issues.length} data issue(s).`,"warning");
    $("gstr1View").value="EXCEPTIONS";
    render();
    return;
  }

  if(status){
    status.style.display="block";
    status.innerHTML="<b>JSON generated.</b> Validate against the current GST Portal GSTR-1 schema before upload.";
  }

  const blob=new Blob(
    [JSON.stringify(result.payload,null,2)],
    {type:"application/json;charset=utf-8"}
  );
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=`Medvika_GSTR1_${pharmacyGstin()}_${returnPeriod()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* Add to existing event bindings */
if($("gstr1Json")){
  $("gstr1Json").onclick=downloadGstr1Json;
}

$("gstr1From").value=monthStart();$("gstr1To").value=today();["gstr1From","gstr1To","gstr1View"].forEach(id=>$(id).onchange=render);$("gstr1Export").onclick=exportCsv;$("gstr1Print").onclick=()=>window.print();$("gstr1Refresh").onclick=async()=>{await load();UI.toast("GSTR-1 report refreshed.")};
 async function load(){[medicines,batches,sales,items,returns,returnItems]=await Promise.all([safe("medicines",false),safe("medicine_batches"),safe("sales_invoices"),safe("sales_items"),safe("sales_returns"),safe("sales_return_items")]);const ps=await safe("pharmacies",false);pharmacy=ps.find(x=>x.id===pid)||{};build();render()}
 try{await load()}catch(e){UI.toast("GSTR-1 report could not load: "+e.message,"error")}
};