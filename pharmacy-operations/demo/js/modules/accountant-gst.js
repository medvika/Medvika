window.initAccountantGstModule=async function(){
 const UI=window.MedvikaUI,$=id=>document.getElementById(id),pid=window.MedvikaAuth?.profile?.pharmacy_id;
 const n=v=>Number.isFinite(Number(v))?Number(v):0;
 const first=(o,ks,d=null)=>{for(const k of ks){if(o&&o[k]!==undefined&&o[k]!==null&&o[k]!=="")return o[k];}return d;};
 const money=v=>UI.money(n(v));
 let medicines=[],batches=[],sales=[],items=[],returns=[],returnItems=[],pharmacy={},rows=[],displayRows=[];

 function localDate(d){const x=new Date(d);return new Date(x.getTime()-x.getTimezoneOffset()*60000).toISOString().slice(0,10)}
 function today(){return localDate(new Date())}
 function monthStart(){const d=new Date();return localDate(new Date(d.getFullYear(),d.getMonth(),1))}
 async function safe(t,filter=true){let q=supabaseClient.from(t).select("*").limit(50000);if(filter)q=q.eq("pharmacy_id",pid);const r=await q;if(r.error){console.warn(t,r.error);return []}return r.data||[]}
 const med=id=>medicines.find(x=>x.id===id)||{},batch=id=>batches.find(x=>x.id===id)||{};
 function correctedInclusive(i){const q=n(first(i,["quantity","sold_quantity"],0)),rate=n(first(i,["selling_rate","sale_rate","rate"],0)),disc=n(first(i,["discount_percent"],0)),expected=q*rate*(1-disc/100),stored=n(first(i,["line_total","total_amount","net_amount","amount"],0));if(stored<=0)return Math.max(0,expected);if(expected<=0)return stored;return stored>expected+Math.max(.02,expected*.002)?expected:stored}
 function gstin(inv){return String(first(inv,["customer_gstin","gstin","buyer_gstin"],"")).trim().toUpperCase()}
 function pos(inv){return String(first(inv,["place_of_supply","pos","customer_state","state"],"")).trim()}
 function home(){return String(first(pharmacy,["registered_state","state","business_state"],"")).trim()}
 function classify(inv){const g=gstin(inv),p=pos(inv),h=home(),inter=p&&h&&p.toLowerCase()!==h.toLowerCase(),value=n(first(inv,["grand_total","invoice_total","total_amount"],0));if(g)return"B2B";if(inter&&value>100000)return"B2CL";return"B2CS"}
 function splitTax(gst,inv){const p=pos(inv),h=home();if(p&&h&&p.toLowerCase()!==h.toLowerCase())return{sgst:0,cgst:0,igst:gst};return{sgst:gst/2,cgst:gst/2,igst:0}}
 function build(){
   const invMap=new Map(sales.map(x=>[x.id,x])), itemMap=new Map(items.map(x=>[x.id,x])), retMap=new Map(returns.map(x=>[x.id,x])), den=new Map();
   items.forEach(i=>{const iid=first(i,["sales_invoice_id","invoice_id"]);den.set(iid,n(den.get(iid))+correctedInclusive(i))});
   rows=[];
   items.forEach(i=>{
     const inv=invMap.get(first(i,["sales_invoice_id","invoice_id"])); if(!inv||String(first(inv,["invoice_status","status"],"")).toLowerCase()==="cancelled")return;
     const m=med(i.medicine_id),b=batch(i.medicine_batch_id),rate=n(first(i,["gst_percent","gst_rate"],first(b,["gst_percent"],first(m,["gst_percent"],0)))),incl0=correctedInclusive(i),d=n(den.get(inv.id)),invDisc=n(first(inv,["invoice_discount_amount"],0)),incl=Math.max(0,incl0-(d?invDisc*incl0/d:0)),taxable=rate?incl/(1+rate/100):incl,gst=incl-taxable,sp=splitTax(gst,inv);
     rows.push({date:first(inv,["invoice_date","sale_date","created_at"]),kind:"SALE",section:classify(inv),invoice:first(inv,["invoice_number","sale_number"],""),rate,taxable,gst,sgst:sp.sgst,cgst:sp.cgst,igst:sp.igst,invoiceValue:incl});
   });
   returnItems.forEach(ri=>{
     const ret=retMap.get(first(ri,["sales_return_id","return_id"])),oi=itemMap.get(first(ri,["sales_item_id"]));if(!ret||!oi)return;
     const inv=invMap.get(first(oi,["sales_invoice_id","invoice_id"]))||{},sold=n(oi.quantity),rq=n(first(ri,["return_quantity","quantity"],0));if(!sold||!rq)return;
     const m=med(oi.medicine_id),b=batch(oi.medicine_batch_id),rate=n(first(oi,["gst_percent","gst_rate"],first(b,["gst_percent"],first(m,["gst_percent"],0)))),base=correctedInclusive(oi),ratio=Math.min(1,rq/sold),incl=base*ratio,taxable=rate?incl/(1+rate/100):incl,gst=incl-taxable,sp=splitTax(gst,inv);
     rows.push({date:first(ret,["return_date","created_at"]),kind:"RETURN",section:classify(inv),invoice:first(ret,["return_number","sales_return_number"],""),rate,taxable:-taxable,gst:-gst,sgst:-sp.sgst,cgst:-sp.cgst,igst:-sp.igst,invoiceValue:-incl});
   });
 }
 function period(){const f=$("agrFrom").value,t=$("agrTo").value;return rows.filter(x=>{const d=String(x.date).slice(0,10);return(!f||d>=f)&&(!t||d<=t)})}
 function agg(list){return list.reduce((a,x)=>{a.count++;a.taxable+=x.taxable;a.sgst+=x.sgst;a.cgst+=x.cgst;a.igst+=x.igst;a.gst+=x.gst;a.invoiceValue+=x.invoiceValue;return a},{count:0,taxable:0,sgst:0,cgst:0,igst:0,gst:0,invoiceValue:0})}
 function row(label,a){return[label,a.count,money(a.taxable),money(a.sgst),money(a.cgst),money(a.igst),money(0),money(a.gst),money(a.invoiceValue)]}
 function setTable(title,note,headers,data){$("agrTitle").textContent=title;$("agrNote").textContent=note;$("agrHead").innerHTML="<tr>"+headers.map(h=>`<th>${h}</th>`).join("")+"</tr>";displayRows=data;$("agrBody").innerHTML=data.length?data.map(r=>"<tr>"+r.map(v=>`<td>${UI.safe(String(v??"—"))}</td>`).join("")+"</tr>").join(""):`<tr><td colspan="${headers.length}" class="empty">No records.</td></tr>`;$("agrCount").textContent=`${data.length} rows`}
 function renderSummary(all){
   const sale=all.filter(x=>x.kind==="SALE"),ret=all.filter(x=>x.kind==="RETURN");
   const b2b=agg(sale.filter(x=>x.section==="B2B")),b2cl=agg(sale.filter(x=>x.section==="B2CL")),b2cs=agg(sale.filter(x=>x.section==="B2CS"));
   const zero=agg(sale.filter(x=>x.rate===0)), nil=zero, exempt=agg([]), exportA=agg([]),advance=agg([]),advanceSetoff=agg([]);
   const regRet=agg(ret.filter(x=>x.section==="B2B")),unregRet=agg(ret.filter(x=>x.section!=="B2B"));
   const gross=agg(sale),returnsA=agg(ret),net=agg(all);
   const data=[
     row("B2B",b2b),row("B2C (Large) Invoice",b2cl),row("B2C (Small) Invoice",b2cs),
     row("Nil Rated",nil),row("Exempted",exempt),row("Export Invoices",exportA),
     row("Tax Liability on Advance",advance),row("Set/off Tax on Advance of prior period",advanceSetoff),
     row("Less: Credit/Debit Note – Registered Parties",regRet),
     row("Less: Credit/Debit Note – Unregistered Parties",unregRet),
     row("TOTAL",net)
   ];
   setTable("Accountant Summary","Marg-style concise outward-supply summary for accountant review.",["Description","Count","Taxable","SGST","CGST","IGST","Cess","Total GST","Invoice Amount"],data);
   $("agrGross").textContent=money(gross.invoiceValue);$("agrTaxable").textContent=money(gross.taxable);$("agrTax").textContent=money(gross.gst);$("agrReturns").textContent=money(Math.abs(returnsA.invoiceValue));$("agrNetSales").textContent=money(net.taxable);$("agrNetTax").textContent=money(net.gst);
 }
 function renderLedger(all){
   const rates=[...new Set(all.map(x=>n(x.rate)))].sort((a,b)=>a-b),data=[];
   rates.forEach(rate=>{
     const salesA=agg(all.filter(x=>x.kind==="SALE"&&n(x.rate)===rate)),retA=agg(all.filter(x=>x.kind==="RETURN"&&n(x.rate)===rate)),net=agg(all.filter(x=>n(x.rate)===rate));
     data.push([`GST Local/General Sales ${rate}%`,money(salesA.taxable),money(salesA.gst),money(salesA.invoiceValue),money(Math.abs(retA.taxable)),money(Math.abs(retA.gst)),money(net.taxable),money(net.gst)]);
   });
   const net=agg(all),gross=agg(all.filter(x=>x.kind==="SALE")),ret=agg(all.filter(x=>x.kind==="RETURN"));
   data.push(["TOTAL",money(gross.taxable),money(gross.gst),money(gross.invoiceValue),money(Math.abs(ret.taxable)),money(Math.abs(ret.gst)),money(net.taxable),money(net.gst)]);
   setTable("Sales Tax Ledger","GST-rate-wise sales, returns and net tax values.",["Tax Rate / Ledger","Gross Sale","Gross Tax","Invoice Value","Returns","Return Tax","Net Sale","Net Tax"],data);
   $("agrGross").textContent=money(gross.invoiceValue);$("agrTaxable").textContent=money(gross.taxable);$("agrTax").textContent=money(gross.gst);$("agrReturns").textContent=money(Math.abs(ret.invoiceValue));$("agrNetSales").textContent=money(net.taxable);$("agrNetTax").textContent=money(net.gst);
 }
 function render(){const all=period();$("agrView").value==="ledger"?renderLedger(all):renderSummary(all)}
 function exportCsv(){if(!displayRows.length)return UI.toast("No rows to export.","warning");const heads=[...document.querySelectorAll("#agrHead th")].map(x=>x.textContent),esc=v=>`"${String(v??"").replaceAll('"','""')}"`,csv=[heads,...displayRows].map(r=>r.map(esc).join(",")).join("\n"),a=document.createElement("a"),url=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.href=url;a.download=`medvika-accountant-${$("agrView").value}-${$("agrFrom").value}-to-${$("agrTo").value}.csv`;a.click();URL.revokeObjectURL(url)}
 async function load(){[medicines,batches,sales,items,returns,returnItems]=await Promise.all([safe("medicines",false),safe("medicine_batches"),safe("sales_invoices"),safe("sales_items"),safe("sales_returns"),safe("sales_return_items")]);const ps=await safe("pharmacies",false);pharmacy=ps.find(x=>x.id===pid)||{};build();render()}
 $("agrFrom").value=monthStart();$("agrTo").value=today();["agrFrom","agrTo","agrView"].forEach(id=>$(id).onchange=render);$("agrCsv").onclick=exportCsv;$("agrPrint").onclick=()=>window.print();$("agrRefresh").onclick=async()=>{await load();UI.toast("Accountant reports refreshed.")};
 try{await load()}catch(e){UI.toast("Accountant report could not load: "+e.message,"error")}
};