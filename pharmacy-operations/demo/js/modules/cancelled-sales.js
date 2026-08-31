window.initCancelledSalesModule=async function(){
 const UI=window.MedvikaUI,$=id=>document.getElementById(id);
 const pid=window.MedvikaAuth?.profile?.pharmacy_id;
 const n=v=>Number.isFinite(Number(v))?Number(v):0;
 const money=v=>UI.money(n(v));
 let rows=[],visible=[];

 function local(d){const x=new Date(d);return new Date(x.getTime()-x.getTimezoneOffset()*60000).toISOString().slice(0,10)}
 function monthStart(){const d=new Date();return local(new Date(d.getFullYear(),d.getMonth(),1))}
 function first(o,keys,d=null){for(const k of keys){if(o&&o[k]!==undefined&&o[k]!==null&&o[k]!=="")return o[k]}return d}
 function dateOnly(v){if(!v)return "—";const d=new Date(v);return Number.isNaN(d.getTime())?String(v).slice(0,10):d.toLocaleString("en-IN")}
 function customerText(x){return first(x.customers,["full_name"],null)||first(x,["patient_name"],null)||"Walk-in"}
 function cancellationDate(x){return first(x,["cancelled_at","cancellation_date","cancelled_on"],null)}
 function cancelledBy(x){return first(x,["cancelled_by_name","cancelled_by","cancelled_by_user_id","cancelled_by_user"],null)}

 function render(){
   const f=$("csFrom").value,t=$("csTo").value,q=$("csSearch").value.trim().toLowerCase();
   visible=rows.filter(x=>{
     const date=String(first(x,["invoice_date","created_at"],"")).slice(0,10);
     const text=[x.invoice_number,customerText(x),x.patient_name,x.cancellation_reason,x.sale_type].filter(Boolean).join(" ").toLowerCase();
     return(!f||date>=f)&&(!t||date<=t)&&(!q||text.includes(q))
   });

   $("csCountCard").textContent=String(visible.length);
   $("csValueCard").textContent=money(visible.reduce((s,x)=>s+n(x.grand_total),0));
   $("csPaidCard").textContent=money(visible.reduce((s,x)=>s+n(x.amount_paid),0));
   $("csReasonCard").textContent=String(visible.filter(x=>String(x.cancellation_reason||"").trim()).length);
   $("csRows").textContent=`${visible.length} rows`;

   $("csBody").innerHTML=visible.length?visible.map(x=>`<tr>
     <td><b>${UI.safe(x.invoice_number||"—")}</b></td>
     <td>${UI.safe(dateOnly(x.invoice_date||x.created_at))}</td>
     <td>${UI.safe(dateOnly(cancellationDate(x)))}</td>
     <td>${UI.safe(customerText(x))}</td>
     <td>${UI.safe(x.sale_type||"—")}</td>
     <td>${money(x.grand_total)}</td>
     <td>${money(x.amount_paid)}</td>
     <td>${UI.safe(x.payment_status||"—")}</td>
     <td>${UI.safe(x.cancellation_reason||"—")}</td>
     <td>${UI.safe(cancelledBy(x)||"—")}</td>
     <td><button type="button" class="view-cancelled" data-id="${x.id}">View Invoice</button></td>
   </tr>`).join(""):'<tr><td colspan="11" class="empty">No cancelled sales found.</td></tr>';

   document.querySelectorAll(".view-cancelled").forEach(button=>{
     button.onclick=()=>{window.location.href=`/sales-print.html?id=${encodeURIComponent(button.dataset.id)}`}
   });
 }

 async function load(){
   const {data,error}=await supabaseClient.from("sales_invoices").select("*,customers(full_name)")
     .eq("pharmacy_id",pid).eq("invoice_status","cancelled").order("invoice_date",{ascending:false}).limit(50000);
   if(error)throw error;rows=data||[];render();
 }

 function csv(){
   if(!visible.length)return UI.toast("No cancelled sales to export.","warning");
   const heads=["Invoice","Original Sale Date","Cancellation Date","Customer / Patient","Sale Type","Invoice Value","Paid","Payment Status","Reason","Cancelled By"];
   const data=visible.map(x=>[x.invoice_number||"",x.invoice_date||x.created_at||"",cancellationDate(x)||"",customerText(x),x.sale_type||"",n(x.grand_total),n(x.amount_paid),x.payment_status||"",x.cancellation_reason||"",cancelledBy(x)||""]);
   const esc=v=>`"${String(v??"").replaceAll('"','""')}"`;
   const text=[heads,...data].map(r=>r.map(esc).join(",")).join("\n");
   const a=document.createElement("a"),u=URL.createObjectURL(new Blob([text],{type:"text/csv;charset=utf-8"}));
   a.href=u;a.download=`Medvika_Cancelled_Sales_${$("csFrom").value}_to_${$("csTo").value}.csv`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(u)
 }

 $("csFrom").value=monthStart();$("csTo").value=local(new Date());
 $("csFrom").onchange=render;$("csTo").onchange=render;$("csSearch").oninput=render;
 $("csRefresh").onclick=load;$("csPrint").onclick=()=>window.print();$("csCsv").onclick=csv;

 try{await load()}catch(e){UI.toast("Cancelled Sales could not load: "+e.message,"error")}
};