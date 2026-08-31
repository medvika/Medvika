window.initChainStockReportModule=async function(){
  const UI=window.MedvikaUI,$=id=>document.getElementById(id);
  const n=v=>Number.isFinite(Number(v))?Number(v):0;
  const qty=v=>n(v).toLocaleString("en-IN",{maximumFractionDigits:3});
  const money=v=>UI.money(n(v));
  const safe=v=>UI.safe(v??"");
  let page=1,total=0,lastRows=[],loading=false;

  function dateKey(value){if(!value)return "";const raw=String(value);if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;const d=value instanceof Date?value:new Date(value);if(Number.isNaN(d.getTime()))return "";return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");}
  function displayDate(value){const key=dateKey(value);if(!key)return "—";const [y,m,d]=key.split("-");return `${d}/${m}/${y}`;}

  function params(targetPage=page,pageSize=n($("cstPageSize").value)||25){
    return {
      p_view:$("cstView").value,
      p_search:$("cstSearch").value.trim()||null,
      p_branch_id:$("cstBranch").value||null,
      p_stock_filter:$("cstStatus").value,
      p_page:targetPage,
      p_page_size:pageSize,
      p_as_of_date:dateKey(new Date())
    };
  }

  function fillBranches(branches){
    const el=$("cstBranch"),current=el.value;
    el.innerHTML='<option value="">All Branches</option>'+(branches||[]).map(x=>`<option value="${safe(x.id)}">${safe(x.name)}${x.code?` — ${safe(x.code)}`:""}</option>`).join("");
    if((branches||[]).some(x=>x.id===current))el.value=current;
  }

  function renderSummary(s={}){
    $("cstBranches").textContent=n(s.branches);
    $("cstMedicines").textContent=n(s.medicines);
    $("cstBatches").textContent=n(s.batches);
    $("cstQuantity").textContent=qty(s.quantity);
    $("cstPurchaseValue").textContent=money(s.purchase_value);
    $("cstMrpValue").textContent=money(s.mrp_value);
  }

  function itemStatusInfo(r){
    if(n(r.blocked_batches)>0)return ["Blocked batch","blocked"];
    if(n(r.quantity_available)<=0)return ["Out of stock","zero"];
    if(n(r.expired_batches)>0)return ["Expiry risk","expired"];
    if(n(r.near_expiry_batches)>0)return ["Near expiry","warning"];
    return ["Available","available"];
  }

  function batchStatusInfo(r){
    if(r.is_blocked)return ["Blocked","blocked"];
    if(n(r.quantity_available)<=0)return ["Zero","zero"];
    const expiry=dateKey(r.expiry_date),today=dateKey(new Date());
    if(expiry){
      if(expiry<today)return ["Expired","expired"];
      const [ey,em,ed]=expiry.split("-").map(Number),[ty,tm,td]=today.split("-").map(Number);
      if(Date.UTC(ey,em-1,ed)-Date.UTC(ty,tm-1,td)<=90*86400000)return ["Near expiry","warning"];
    }
    return ["Available","available"];
  }

  function statusBadge(info){return `<span class="status ${info[1]}">${info[0]}</span>`;}

  function renderRows(rows){
    const batch=$("cstView").value==="BATCH";
    $("cstTableTitle").textContent=batch?"Batch-wise Stock Audit":"Item-wise Stock";
    $("cstHead").innerHTML=batch
      ?"<tr><th>Branch</th><th>Medicine</th><th>Batch</th><th>Expiry</th><th>Qty (Packs)</th><th>Cost Rate</th><th>MRP</th><th>Purchase Value</th><th>MRP Value</th><th>Status</th></tr>"
      :"<tr><th>Branch</th><th>Medicine</th><th>Pack</th><th>Qty (Packs)</th><th>Batches</th><th>Purchase Value</th><th>MRP Value</th><th>Status</th></tr>";
    $("cstBody").innerHTML=rows.length?rows.map(r=>batch
      ?`<tr><td><b>${safe(r.branch_name)}</b><small>${safe(r.branch_code||"")}</small></td><td><b>${safe(r.brand_name)}</b><small>${safe([r.generic_name,r.strength].filter(Boolean).join(" / "))}</small></td><td>${safe(r.batch_number||"—")}</td><td>${displayDate(r.expiry_date)}</td><td><b>${qty(r.quantity_available)}</b></td><td>${money(r.cost_rate)}</td><td>${money(r.mrp)}</td><td>${money(r.purchase_value)}</td><td>${money(r.mrp_value)}</td><td>${statusBadge(batchStatusInfo(r))}</td></tr>`
      :`<tr><td><b>${safe(r.branch_name)}</b><small>${safe(r.branch_code||"")}</small></td><td><b>${safe(r.brand_name)}</b><small>${safe([r.generic_name,r.strength].filter(Boolean).join(" / "))}</small></td><td>${safe(r.pack_size||"—")}</td><td><b>${qty(r.quantity_available)}</b></td><td>${n(r.batch_count)}</td><td>${money(r.purchase_value)}</td><td>${money(r.mrp_value)}</td><td>${statusBadge(itemStatusInfo(r))}</td></tr>`
    ).join(""):`<tr><td colspan="${batch?10:8}" class="empty">No matching stock found.</td></tr>`;
  }

  function renderPagination(){
    const size=n($("cstPageSize").value)||25,pages=Math.max(1,Math.ceil(total/size));
    if(page>pages)page=pages;
    $("cstCount").textContent=`${total} record${total===1?"":"s"}`;
    $("cstPageLabel").textContent=`Page ${page} of ${pages}`;
    $("cstPrevious").disabled=page<=1||loading;
    $("cstNext").disabled=page>=pages||loading;
  }

  async function load(reset=false){
    if(loading)return;
    if(reset)page=1;
    loading=true;renderPagination();
    try{
      const {data,error}=await supabaseClient.rpc("chain_stock_report_v1",params());
      if(error)throw error;
      lastRows=data?.rows||[];total=n(data?.total_count);
      fillBranches(data?.branches||[]);
      renderSummary(data?.summary||{});
      renderRows(lastRows);
      renderPagination();
    }catch(error){
      $("cstBody").innerHTML=`<tr><td class="empty">${safe(error.message)}</td></tr>`;
      UI.toast("Chain Stock Report could not load: "+error.message,"error");
    }finally{loading=false;renderPagination()}
  }

  function esc(v){return `"${String(v??"").replace(/"/g,'""')}"`}
  async function exportCsv(){
    if(!total)return UI.toast("No stock rows to export.","warning");
    const button=$("cstExport"),old=button.textContent;button.disabled=true;button.textContent="Preparing…";
    try{
      const all=[];for(let p=1;p<=Math.ceil(total/100);p++){const {data,error}=await supabaseClient.rpc("chain_stock_report_v1",params(p,100));if(error)throw error;all.push(...(data?.rows||[]))}
      const batch=$("cstView").value==="BATCH";
      const headers=batch?["Branch","Branch Code","Medicine","Generic","Strength","Pack","Barcode","Batch","Expiry","Qty Packs","Cost Rate","MRP","Purchase Value","MRP Value","Blocked","Status"]:["Branch","Branch Code","Medicine","Generic","Strength","Pack","Barcode","Qty Packs","Batch Count","Purchase Value","MRP Value","Blocked Batches","Near Expiry Batches","Expired Batches","Status"];
      const values=r=>batch?[r.branch_name,r.branch_code,r.brand_name,r.generic_name,r.strength,r.pack_size,r.barcode,r.batch_number,displayDate(r.expiry_date),qty(r.quantity_available),n(r.cost_rate).toFixed(2),n(r.mrp).toFixed(2),n(r.purchase_value).toFixed(2),n(r.mrp_value).toFixed(2),r.is_blocked?"Yes":"No",batchStatusInfo(r)[0]]:[r.branch_name,r.branch_code,r.brand_name,r.generic_name,r.strength,r.pack_size,r.barcode,qty(r.quantity_available),n(r.batch_count),n(r.purchase_value).toFixed(2),n(r.mrp_value).toFixed(2),n(r.blocked_batches),n(r.near_expiry_batches),n(r.expired_batches),itemStatusInfo(r)[0]];
      const csv=[headers.map(esc).join(","),...all.map(r=>values(r).map(esc).join(","))].join("\n"),url=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"})),a=document.createElement("a");
      a.href=url;a.download=`medvika-chain-stock-${batch?"batchwise":"itemwise"}-${dateKey(new Date())}.csv`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
    }catch(error){UI.toast(error.message,"error")}finally{button.disabled=false;button.textContent=old}
  }

  $("cstApply").onclick=()=>load(true);
  $("cstRefresh").onclick=()=>load(false);
  $("cstExport").onclick=exportCsv;
  $("cstView").onchange=()=>load(true);
  $("cstBranch").onchange=()=>load(true);
  $("cstStatus").onchange=()=>load(true);
  $("cstPageSize").onchange=()=>load(true);
  $("cstPrevious").onclick=()=>{if(page>1){page--;load()}};
  $("cstNext").onclick=()=>{if(page<Math.ceil(total/(n($("cstPageSize").value)||25))){page++;load()}};
  $("cstSearch").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();load(true)}};
  await load(true);
};
