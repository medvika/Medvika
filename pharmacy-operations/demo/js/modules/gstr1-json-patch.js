
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
    const d=String(x.date||"").slice(0,10);
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
  const retRows=jsonPeriodRows().filter(x=>x.type==="CREDIT_NOTE");
  const map=new Map();

  retRows.forEach(r=>{
    const key=r.invoice;
    if(!map.has(key)) map.set(key,[]);
    map.get(key).push(r);
  });

  const registered=[],unregistered=[];

  [...map.entries()].forEach(([note,rs])=>{
    const firstRow=rs[0],pos=normStateCode(firstRow.pos||firstRow.gstin);
    const val=Math.abs(rs.reduce((s,r)=>s+n(r.invoiceValue),0));
    const noteObj={
      nt_num:String(note),
      nt_dt:ddmmyyyy(firstRow.date),
      ntty:"C",
      val:round2(val),
      itms:rs.map((r,idx)=>{
        const split=taxSplit({...r,gst:Math.abs(r.gst)},pos,ownState);
        return {
          num:idx+1,
          itm_det:{
            txval:round2(Math.abs(r.taxable)),
            rt:round2(r.rate),
            iamt:split.iamt,
            camt:split.camt,
            samt:split.samt,
            csamt:0
          }
        };
      })
    };

    if(firstRow.gstin){
      registered.push({ctin:firstRow.gstin,nt:[noteObj]});
    }else{
      unregistered.push({...noteObj,pos});
    }
  });

  return {cdnr:registered,cdnur:unregistered};
}

function makeHsn(){
  const src=jsonPeriodRows().filter(x=>x.type==="SALE");
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
    g.qty+=Math.abs(n(r.qty));
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
    const d=String(first(x,["invoice_date","created_at"],"")).slice(0,10);
    return d && (!$("gstr1From").value||d>=$("gstr1From").value) &&
      (!$("gstr1To").value||d<=$("gstr1To").value);
  });

  const issued=allSales.length;
  const cancelled=allSales.filter(x=>
    String(first(x,["invoice_status","status"],"")).toLowerCase()==="cancelled"
  ).length;

  const nums=allSales.map(x=>String(first(x,["invoice_number","sale_number"],"")))
                     .filter(Boolean)
                     .sort();

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
