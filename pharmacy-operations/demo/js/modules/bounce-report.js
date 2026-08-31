window.initBounceReportModule=async function(){
  const UI=window.MedvikaUI,$=id=>document.getElementById(id);
  const toast=(m,t="success")=>UI.toast(m,t==="danger"?"error":t);
  const pid=window.MedvikaAuth?.profile?.pharmacy_id;
  const num=v=>Number.isFinite(Number(v))?Number(v):0;
  const safe=v=>UI.safe(v??"");
  let rows=[],visible=[];

  if(!pid){toast("Pharmacy profile not available.","danger");return;}

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

  function displayDateTime(value){
    return value?new Date(value).toLocaleString("en-IN"):"—";
  }

  function defaultDates(){
    const d=new Date(),f=new Date(d.getFullYear(),d.getMonth(),1);
    $("bounceFrom").value=dateKey(f);$("bounceTo").value=dateKey(d);
  }

  async function load(){
    const {data,error}=await supabaseClient
      .from("sales_bounces")
      .select(`
        *,
        medicines(brand_name,generic_name),
        customers(full_name,mobile)
      `)
      .eq("pharmacy_id",pid)
      .order("created_at",{ascending:false})
      .limit(20000);

    if(error)throw error;
    rows=data||[];
    apply();
  }

  function labelReason(v){
    return String(v||"OTHER").replaceAll("_"," ");
  }

  function unmetQty(x){
    const requested=num(x.requested_quantity);
    return x.available_quantity===null||x.available_quantity===undefined?requested:Math.max(0,requested-num(x.available_quantity));
  }

  function apply(){
    const from=$("bounceFrom").value,to=$("bounceTo").value,reason=$("bounceReason").value,status=$("bounceStatus").value,q=$("bounceSearch").value.trim().toLowerCase();
    visible=rows.filter(x=>{
      const d=dateKey(x.created_at);
      const txt=[
        x.search_text,x.medicines?.brand_name,x.medicines?.generic_name,
        x.customers?.full_name,x.customers?.mobile,x.notes
      ].filter(Boolean).join(" ").toLowerCase();
      return (!from||d>=from)&&(!to||d<=to)&&(!reason||x.reason===reason)&&(!status||x.status===status)&&(!q||txt.includes(q));
    });

    $("bounceTotal").textContent=visible.length;
    $("bounceQty").textContent=visible.reduce((sum,x)=>sum+unmetQty(x),0).toFixed(2).replace(/\.00$/,"");
    $("bounceOOS").textContent=visible.filter(x=>x.reason==="OUT_OF_STOCK"||x.reason==="INSUFFICIENT_STOCK").length;
    $("bounceNotListed").textContent=visible.filter(x=>x.reason==="NOT_LISTED").length;
    $("bounceOpen").textContent=visible.filter(x=>x.status==="open").length;
    $("bounceResolved").textContent=visible.filter(x=>x.status==="resolved").length;
    $("bounceLost").textContent=visible.filter(x=>x.status==="lost").length;
    $("bounceCount").textContent=`${visible.length} row${visible.length===1?"":"s"}`;

    $("bounceTable").innerHTML=visible.length?visible.map(x=>`
      <tr>
        <td>${displayDate(x.created_at)}</td>
        <td><b>${safe(x.medicines?.brand_name||x.search_text||"Unknown item")}</b>${x.medicines?.generic_name?`<br><small>${safe(x.medicines.generic_name)}</small>`:""}</td>
        <td>${safe(labelReason(x.reason))}</td>
        <td>${num(x.requested_quantity)}</td>
        <td>${x.available_quantity===null||x.available_quantity===undefined?"—":num(x.available_quantity)}</td>
        <td><b>${unmetQty(x)}</b></td>
        <td>${safe(x.customers?.full_name||"Walk-in / Not linked")}</td>
        <td>${safe(x.status)}</td>
        <td>${displayDateTime(x.resolved_at)}</td>
        <td>
          ${x.status==="open"?`
            <button class="bounce-resolve" data-id="${x.id}" data-status="resolved" type="button">Fulfilled</button>
            <button class="bounce-lost" data-id="${x.id}" data-status="lost" type="button">Lost</button>
          `:"—"}
        </td>
      </tr>`).join(""):'<tr><td colspan="10" class="empty">No bounce requests found.</td></tr>';

    document.querySelectorAll("[data-status]").forEach(b=>b.onclick=()=>setStatus(b.dataset.id,b.dataset.status));
  }

  async function setStatus(id,status){
    const {error}=await supabaseClient.from("sales_bounces").update({status,resolved_at:status==="resolved"||status==="lost"?new Date().toISOString():null}).eq("id",id).eq("pharmacy_id",pid);
    if(error){toast(error.message,"danger");return;}
    toast(status==="resolved"?"Bounce marked fulfilled.":`Bounce marked ${status}.`);
    await load();
  }

  function exportCsv(){
    if(!visible.length){toast("No bounce data to export.","warning");return;}
    const esc=v=>`"${String(v??"").replaceAll('"','""')}"`;
    const lines=[
      ["Date","Requested Item","Generic","Reason","Requested Qty","Available Qty","Unmet Qty","Customer","Status","Resolved At","Notes"].map(esc).join(","),
      ...visible.map(x=>[
        dateKey(x.created_at),x.medicines?.brand_name||x.search_text,x.medicines?.generic_name||"",
        labelReason(x.reason),x.requested_quantity,x.available_quantity??"",unmetQty(x),
        x.customers?.full_name||"",x.status,displayDateTime(x.resolved_at),x.notes||""
      ].map(esc).join(","))
    ];
    const blob=new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8"});
    const a=document.createElement("a"),url=URL.createObjectURL(blob);
    a.href=url;a.download=`medvika-bounce-report-${$("bounceFrom").value}-to-${$("bounceTo").value}.csv`;
    document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  }

  defaultDates();
  $("bounceApply").onclick=apply;$("bounceFrom").onchange=apply;$("bounceTo").onchange=apply;$("bounceReason").onchange=apply;$("bounceStatus").onchange=apply;$("bounceSearch").oninput=apply;$("bounceExport").onclick=exportCsv;
  $("bounceRefresh").onclick=async()=>{try{await load();toast("Bounce Report refreshed.");}catch(e){toast(e.message,"danger");}};
  try{await load();}catch(e){toast("Bounce Report could not load: "+e.message,"danger");}
};