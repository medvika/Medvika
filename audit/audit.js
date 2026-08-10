let stockRegisterRows=[],stockRegisterFiltered=[],stockRegisterPage=1;
const SUPABASE_URL = "https://etevzodzxhsdwidtrmwv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_iKWBOAxrWTZfU6Qb5PYd5Q_0y80GEOw";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

let currentAuditId = null;
let projects = [];
let zones = [];
let teams = [];
let nearExpiryDays = 180;
let currentAuditDate = null;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

function toast(message, type="ok"){
  const el = $("toast");
  el.textContent = message;
  el.className = "toast show" + (type === "error" ? " error" : "");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=>el.className="toast",2600);
}

function fmtNum(v){ return Number(v || 0).toLocaleString("en-IN"); }
function fmtMoney(v){
  if(v===null||v===undefined||Number.isNaN(Number(v))) return "—";
  return "₹"+Number(v).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
}
function fmtDate(v){
  if(!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString("en-IN",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});
}
function varianceClass(v){ v=Number(v||0); return v<0?"negative":v>0?"positive":"ok"; }

async function requireSession(){
  const { data } = await sb.auth.getSession();
  if(data.session){
    showApp(data.session.user);
    await bootstrap();
  }else{
    $("loginView").hidden = false;
    $("loginView").style.display = "";
    $("appShell").hidden = true;
    $("appShell").style.display = "none";
  }
}

function showApp(user){
  $("loginView").hidden = true;
  $("loginView").style.display = "none";
  $("appShell").hidden = false;
  $("appShell").style.display = "";
  $("signedInAs").textContent = user?.email || "Authorised user";
}

$("loginForm").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const message = $("loginMessage");
  const btn = $("loginButton");
  message.textContent = "";
  btn.disabled = true;
  btn.textContent = "Signing in...";

  try {
    const { data, error } = await sb.auth.signInWithPassword({
      email: $("loginEmail").value.trim(),
      password: $("loginPassword").value
    });

    if (error) throw error;
    if (!data || !data.session || !data.user) {
      throw new Error("Login completed but no active session was returned.");
    }

    // Show the dashboard immediately after successful authentication.
    showApp(data.user);
    localStorage.setItem("medvika_login_ok", "1");

    try {
      await bootstrap();
    } catch (bootError) {
      console.error("Dashboard bootstrap error:", bootError);
      toast("Signed in. Dashboard data could not load: " + (bootError.message || bootError), "error");
    }
  } catch (err) {
    console.error("Login error:", err);
    message.textContent = err.message || "Unable to sign in.";
  } finally {
    btn.disabled = false;
    btn.textContent = "Sign in";
  }
});

$("signOutButton").addEventListener("click", async ()=>{
  await sb.auth.signOut();
  location.reload();
});

document.querySelectorAll(".nav-btn").forEach(btn=>{
  btn.addEventListener("click",()=>{
    document.querySelectorAll(".nav-btn").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    const view=btn.dataset.view;
    document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
    $(view+"View").classList.add("active");
    const titles={dashboard:"Audit Dashboard",count:"Physical Stock Count",zones:"Zones & Teams",exceptions:"Exceptions & Controls",reconciliation:"Complete Reconciliation",report:"Final Audit Report",imports:"Stock Imports",stockRegister:"Current Stock Register"};
    $("viewTitle").textContent=titles[view]||"Stock Audit";
    if(view==="count") $("itemName").focus();
    if(view==="reconciliation") loadReconciliation();
    if(view==="report") loadFinalReport();
    if(view==="stockRegister") loadStockRegister();
  });
});

async function bootstrap(){
  await loadProjects();
  if(!projects.length){
    toast("No audit project found. Check Step 1 SQL.", "error");
    return;
  }
  const saved=localStorage.getItem("medvika_audit_id");
  currentAuditId = projects.some(p=>p.id===saved) ? saved : projects[0].id;
  $("projectSelect").value=currentAuditId;
  await loadCurrentAudit();
}

async function loadProjects(){
  const {data,error}=await sb
    .from("medvika_audit_projects")
    .select("id,project_code,project_name,audit_date,status,client_id,medvika_audit_clients(client_name,business_name)")
    .order("audit_date",{ascending:false});
  if(error){ toast(error.message,"error"); return; }
  projects=data||[];
  $("projectSelect").innerHTML=projects.map(p=>{
    const client=p.medvika_audit_clients?.business_name || p.medvika_audit_clients?.client_name || "Client";
    return `<option value="${p.id}">${esc(p.project_code||"Audit")} — ${esc(client)}</option>`;
  }).join("");
}

$("projectSelect").addEventListener("change", async e=>{
  currentAuditId=e.target.value;
  localStorage.setItem("medvika_audit_id",currentAuditId);
  await loadCurrentAudit();
});

$("refreshButton").addEventListener("click",loadCurrentAudit);
$("reloadCountsButton").addEventListener("click",loadRecentCounts);

async function loadCurrentAudit(){
  if(!currentAuditId) return;
  await Promise.all([loadProjectDetails(),loadZonesAndTeams(),loadDashboard(),loadRecentCounts(),loadExceptions(),loadImportHistory(),loadReconciliation(),loadFinalReport()]);
}

async function loadProjectDetails(){
  const {data,error}=await sb
    .from("medvika_audit_projects")
    .select("*,medvika_audit_clients(client_name,business_name)")
    .eq("id",currentAuditId).single();
  if(error){toast(error.message,"error");return;}
  const client=data.medvika_audit_clients?.business_name || data.medvika_audit_clients?.client_name || "Client";
  $("projectCode").textContent=data.project_code||"AUDIT";
  $("projectName").textContent=`${client} — ${data.project_name}`;
  $("projectMeta").textContent=`${data.location||"Location"} • ${data.audit_date||""} ${data.start_time? "• "+data.start_time.slice(0,5):""}`;
  $("projectStatus").textContent=data.status.replaceAll("_"," ");
  $("stockFreeze").textContent=data.stock_freeze_required?"Required":"No";
  $("batchWise").textContent=data.batch_wise?"Yes":"No";
  $("expiryWise").textContent=data.expiry_wise?"Yes":"No";
  $("clientStaff").textContent=fmtNum(data.expected_client_staff);
  $("medvikaTeam").textContent=fmtNum(data.medvika_team_size);
  $("expectedItems").textContent=fmtNum(data.expected_running_items);
  nearExpiryDays = Number(data.near_expiry_days || 180);
  currentAuditDate = data.audit_date || null;
  if($("nearExpiryRule")) $("nearExpiryRule").textContent = `${nearExpiryDays} days`;
  if($("expiryRuleDays")) $("expiryRuleDays").value = String(nearExpiryDays);
}

async function loadDashboard(){
  const {data,error}=await sb
    .from("medvika_audit_dashboard_summary")
    .select("*").eq("audit_id",currentAuditId).single();
  if(error){toast(error.message,"error");return;}
  $("kpiCount").textContent=fmtNum(data.total_count_lines);
  $("kpiVerified").textContent=fmtNum(data.verified_lines);
  $("kpiRecount").textContent=fmtNum(data.recount_lines);
  $("kpiVariance").textContent=fmtNum(data.variance_lines);
  if($("kpiExcess")) $("kpiExcess").textContent=fmtNum(data.excess_unlisted_lines);
  $("kpiExpiry").textContent=fmtNum(Number(data.expired_lines||0)+Number(data.near_expiry_lines||0));
  $("kpiProgress").textContent=`${Number(data.progress_percent||0).toFixed(1)}%`;
}

async function loadZonesAndTeams(){
  const [zr,tr]=await Promise.all([
    sb.from("medvika_audit_zones").select("*").eq("audit_id",currentAuditId).order("sequence_no"),
    sb.from("medvika_audit_teams").select("*").eq("audit_id",currentAuditId).eq("active",true).order("team_code")
  ]);
  if(zr.error){toast(zr.error.message,"error");return;}
  if(tr.error){toast(tr.error.message,"error");return;}
  zones=zr.data||[]; teams=tr.data||[];

  $("countZone").innerHTML='<option value="">Select zone</option>'+zones.map(z=>`<option value="${z.id}">${esc(z.zone_code)} — ${esc(z.zone_name)}</option>`).join("");
  $("countTeam").innerHTML='<option value="">Select team</option>'+teams.map(t=>`<option value="${t.id}">${esc(t.team_code)} — ${esc(t.team_name||"Counting Team")}</option>`).join("");
  if($("physicalImportZone")) $("physicalImportZone").innerHTML='<option value="">Select zone</option>'+zones.map(z=>`<option value="${z.id}">${esc(z.zone_code)} — ${esc(z.zone_name)}</option>`).join("");
  if($("physicalImportTeam")) $("physicalImportTeam").innerHTML='<option value="">Select team</option>'+teams.map(t=>`<option value="${t.id}">${esc(t.team_code)} — ${esc(t.team_name||"Counting Team")}</option>`).join("");

  $("zoneProgress").innerHTML=zones.length?zones.map(z=>`<div class="zone-row"><div><strong>${esc(z.zone_code)} — ${esc(z.zone_name)}</strong><br><span>${esc(z.category||"General")}</span></div><span class="zone-state">${esc(z.status)}</span></div>`).join(""):'<div class="empty">No zones configured.</div>';

  $("zonesTableWrap").innerHTML=tableHtml(
    ["Code","Zone","Category","Status","Supervisor"],
    zones.map(z=>[z.zone_code,z.zone_name,z.category||"—",z.status,z.assigned_supervisor||"—"])
  );
  $("teamsTableWrap").innerHTML=tableHtml(
    ["Team","Lead","Counter 1","Counter 2","Entry","Supervisor"],
    teams.map(t=>[t.team_code,t.client_team_lead||"—",t.counter_1||"—",t.counter_2||"—",t.system_entry_person||"—",t.medvika_supervisor||"—"])
  );
}

function tableHtml(headers,rows){
  if(!rows.length) return '<div class="empty">No records yet.</div>';
  return `<table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(v=>`<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

async function loadRecentCounts(){
  const {data,error}=await sb
    .from("medvika_audit_count_lines")
    .select("id,item_name,item_code,batch_no,physical_qty,system_qty,pack_uom,pack_size,count_status,condition,counted_at")
    .eq("audit_id",currentAuditId)
    .order("counted_at",{ascending:false})
    .limit(30);
  if(error){toast(error.message,"error");return;}
  const rows=data||[];
  $("recentCountBody").innerHTML=rows.length?rows.slice(0,12).map(r=>{
    const hasVar=(r.system_qty===null||r.system_qty===undefined)?false:hasSmallestUnitVariance(r.physical_qty,r.system_qty,r.pack_size);
    const rawVariance=Number(r.physical_qty||0)-Number(r.system_qty||0);
    const cls=hasVar?varianceClass(rawVariance):"ok";
    const physicalDisplay=pharmacyQtyDisplay(r.physical_qty,r.pack_size,r.pack_uom||"Pack");
    const systemDisplay=(r.system_qty===null||r.system_qty===undefined)?"—":pharmacyQtyDisplay(r.system_qty,r.pack_size,r.pack_uom||"Pack");
    const varianceDisplay=(r.system_qty===null||r.system_qty===undefined)?"—":varianceUnitDisplay(r.physical_qty,r.system_qty,r.pack_size);
    return `<tr><td>${fmtDate(r.counted_at)}</td><td>${esc(r.item_name)}</td><td>${esc(r.batch_no||"—")}</td><td>${esc(physicalDisplay)}</td><td>${esc(systemDisplay)}</td><td class="${cls}">${esc(varianceDisplay)}</td><td>${esc(r.count_status)}</td><td><button type="button" class="btn secondary admin-delete-count" data-id="${r.id}" data-item="${esc(r.item_name)}" data-batch="${esc(r.batch_no||"")}">Delete</button></td></tr>`;
  }).join(""):'<tr><td colspan="8" class="empty">No count entries yet.</td></tr>';

  $("recentCountBody").querySelectorAll(".admin-delete-count").forEach(btn=>{
    btn.addEventListener("click",()=>deleteAdminCount(Number(btn.dataset.id),btn.dataset.item||"",btn.dataset.batch||""));
  });

  $("mobileCountList").innerHTML=rows.length?rows.map(r=>{
    const physicalDisplay=pharmacyQtyDisplay(r.physical_qty,r.pack_size,r.pack_uom||"Pack");
    const varianceDisplay=(r.system_qty===null||r.system_qty===undefined)?null:varianceUnitDisplay(r.physical_qty,r.system_qty,r.pack_size);
    return `<div class="count-entry"><div class="count-entry-head"><h4>${esc(r.item_name)}</h4><span class="qty">${esc(physicalDisplay)}</span></div><p>${esc(r.item_code||"No code")} • Batch ${esc(r.batch_no||"—")} • ${esc(r.condition.replaceAll("_"," "))}${varianceDisplay===null?"":` • Var: ${esc(varianceDisplay)}`}</p></div>`;
  }).join(""):'<div class="empty">No count entries yet.</div>';
}

async function deleteAdminCount(countId,itemName="",batchNo=""){
  if(!currentAuditId||!countId) return;
  const ok=window.confirm(
    `Delete this physical count?\n\n${itemName}${batchNo?` • Batch ${batchNo}`:""}\n\n`+
    `Current/System Stock and stock allocations will remain unchanged.`
  );
  if(!ok) return;

  try{
    // Remove any open recount generated for the same item/batch so the Exceptions page
    // does not retain a stale recount after the source count is deleted.
    let q=sb.from("medvika_audit_recounts").delete()
      .eq("audit_id",currentAuditId)
      .eq("item_name",itemName);
    if(batchNo) q=q.eq("batch_no",batchNo);
    await q;

    const {error}=await sb.from("medvika_audit_count_lines")
      .delete().eq("audit_id",currentAuditId).eq("id",countId);
    if(error) throw error;

    toast("Physical count deleted");
    await Promise.all([loadDashboard(),loadRecentCounts(),loadExceptions(),loadReconciliation(),loadFinalReport()]);
  }catch(err){
    console.error("Delete count error:",err);
    toast(err.message||"Unable to delete count","error");
  }
}

async function clearAdminAllocations(){
  if(!currentAuditId) return;
  const label=await getCurrentAuditLabel();
  const typed=window.prompt(
    `Remove ALL stock allocations for ${label}?\n\nCurrent Stock and physical counts will remain.\n\nType CLEAR ALLOCATIONS to continue:`
  );
  if(String(typed||"").trim().toUpperCase()!=="CLEAR ALLOCATIONS"){
    toast("Allocation reset cancelled");
    return;
  }

  const btn=$("clearAdminAllocationsButton");
  const msg=$("adminOpsMessage");
  if(btn){btn.disabled=true;btn.textContent="Clearing...";}
  try{
    const {data,error,count}=await sb.from("medvika_audit_stock_allocations")
      .delete({count:"exact"})
      .eq("audit_id",currentAuditId)
      .select("id");
    if(error) throw error;
    const n=Array.isArray(data)?data.length:(count||0);
    if(msg) msg.textContent=`${n} stock allocation${n===1?"":"s"} cleared.`;
    toast("Stock allocations cleared");
  }catch(err){
    if(msg) msg.textContent=err.message||"Unable to clear allocations.";
    toast(err.message||"Unable to clear allocations","error");
  }finally{
    if(btn){btn.disabled=false;btn.textContent="Clear Stock Allocations";}
  }
}

async function setAdminAuditStatus(status){
  if(!currentAuditId) return;
  const label=await getCurrentAuditLabel();
  const isClose=status==="closed";
  const question=isClose
    ? `Close / archive ${label}?\n\nThe audit data will be retained. The project status will become CLOSED.`
    : `Re-open ${label}?\n\nThe project status will become IN PROGRESS.`;
  if(!window.confirm(question)) return;

  const btn=$(isClose?"closeAuditButton":"reopenAuditButton");
  const msg=$("adminOpsMessage");
  if(btn){btn.disabled=true;btn.textContent=isClose?"Closing...":"Re-opening...";}
  try{
    const {error}=await sb.from("medvika_audit_projects")
      .update({status})
      .eq("id",currentAuditId);
    if(error) throw error;
    if(msg) msg.textContent=isClose?"Audit closed/archived successfully.":"Audit re-opened successfully.";
    toast(isClose?"Audit closed":"Audit re-opened");
    await Promise.all([loadProjects(),loadProjectDetails(),loadDashboard(),loadFinalReport()]);
    $("projectSelect").value=currentAuditId;
  }catch(err){
    if(msg) msg.textContent=err.message||"Unable to update audit status.";
    toast(err.message||"Unable to update audit status","error");
  }finally{
    if(btn){
      btn.disabled=false;
      btn.textContent=isClose?"Close / Archive Audit":"Re-open Audit";
    }
  }
}

$("clearAdminAllocationsButton")?.addEventListener("click",clearAdminAllocations);
$("reopenAuditButton")?.addEventListener("click",()=>setAdminAuditStatus("in_progress"));
$("closeAuditButton")?.addEventListener("click",()=>setAdminAuditStatus("closed"));
$("reloadAdminCountsButton")?.addEventListener("click",loadRecentCounts);


function expiryMonthToDate(v){
  if(!v) return null;
  const [y,m]=v.split("-").map(Number);
  return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
}

$("countForm").addEventListener("submit", async e=>{
  e.preventDefault();
  if(!currentAuditId) return;

  const btn=$("saveCountButton");
  btn.disabled=true;
  btn.textContent="Saving…";

  try{
    const stock=await fetchAllSystemStock();
    const name=$("itemName").value.trim();
    const code=$("itemCode").value.trim();
    const barcode=$("barcode").value.trim();
    const batch=$("batchNo").value.trim();
    const manualPackSize=toNumber($("packSize")?.value);
    const manualFullPackQty=toNumber($("fullPackQty")?.value);
    const manualLooseQty=toNumber($("looseQty")?.value);
    const manualQtyBasis=$("qtyBasis")?.value||"decimal";
    const physical=calculateDecimalPackQty({
      physicalQty:$("physicalQty").value,
      fullPackQty:manualFullPackQty,
      looseQty:manualLooseQty,
      packSize:manualPackSize,
      qtyBasis:manualQtyBasis
    });
    if(physical===null) throw new Error("Enter Physical Qty or Pack + Loose quantities.");
    const enteredExpiry=expiryMonthToDate($("expiryDate").value);
    const explicitCondition=$("condition").value;

    let s=null, matchStatus="unmatched_excess";

    // Exact item+batch match first.
    if(code){
      s=stock.find(x=>cleanCode(x.item_code)===cleanCode(code) && cleanBatch(x.batch_no)===cleanBatch(batch)) || null;
      if(s) matchStatus="matched_item_batch";
    }
    if(!s && barcode){
      s=stock.find(x=>cleanCode(x.barcode)===cleanCode(barcode) && cleanBatch(x.batch_no)===cleanBatch(batch)) || null;
      if(s) matchStatus="matched_barcode_batch";
    }
    if(!s && name){
      s=stock.find(x=>normName(x.item_name)===normName(name) && cleanBatch(x.batch_no)===cleanBatch(batch)) || null;
      if(s) matchStatus="matched_name_batch";
    }

    // Safe fallback if only one system row exists for the supplied item.
    if(!s && code){
      const candidates=stock.filter(x=>cleanCode(x.item_code)===cleanCode(code));
      if(candidates.length===1){s=candidates[0];matchStatus="matched_item_batch";}
    }
    if(!s && barcode){
      const candidates=stock.filter(x=>cleanCode(x.barcode)===cleanCode(barcode));
      if(candidates.length===1){s=candidates[0];matchStatus="matched_barcode_batch";}
    }
    if(!s && name){
      const candidates=stock.filter(x=>normName(x.item_name)===normName(name));
      if(candidates.length===1){s=candidates[0];matchStatus="matched_name_batch";}
    }

    const finalExpiry=enteredExpiry||s?.expiry_date||null;
    const finalCondition=classifyCondition(finalExpiry,explicitCondition);
    const systemQty=s?Number(s.system_qty||0):0;
    const finalPackSize=manualPackSize||s?.pack_size||null;
    const hasVariance=s && hasSmallestUnitVariance(physical,systemQty,finalPackSize);

    const record={
      audit_id:currentAuditId,
      zone_id:$("countZone").value,
      team_id:$("countTeam").value,
      system_stock_id:s?.id||null,
      item_name:name,
      item_code:code||s?.item_code||null,
      barcode:barcode||s?.barcode||null,
      batch_no:batch||s?.batch_no||null,
      expiry_date:finalExpiry,
      pack_uom:$("packUom").value.trim()||s?.pack_uom||null,
      pack_size:finalPackSize,
      full_pack_qty:manualFullPackQty,
      loose_qty:manualLooseQty,
      qty_basis:manualQtyBasis,
      category:s?.category||null,
      physical_qty:physical,
      system_qty:systemQty,
      condition:finalCondition,
      counted_by:$("countedBy").value.trim()||null,
      remarks:$("remarks").value.trim()||null,
      count_status:hasVariance?"recount":"counted",
      match_status:matchStatus,
      excess_reason:s?null:"Physical stock found but item/batch not present in imported current stock."
    };

    const {error}=await sb.from("medvika_audit_count_lines").insert(record);
    if(error) throw error;

    toast(s ? (hasVariance?"Count saved - variance flagged":"Count saved - matched") : "Count saved - unlisted excess");

    const keepZone=$("countZone").value;
    const keepTeam=$("countTeam").value;
    const keepCounter=$("countedBy").value;
    e.target.reset();
    $("countZone").value=keepZone;
    $("countTeam").value=keepTeam;
    $("countedBy").value=keepCounter;
    $("condition").value="saleable";
    $("itemName").focus();

    await Promise.all([loadDashboard(),loadRecentCounts(),loadExceptions(),loadReconciliation(),loadFinalReport()]);
  }catch(err){
    console.error("Manual count save error:",err);
    toast(err.message||"Unable to save count","error");
  }finally{
    btn.disabled=false;
    btn.textContent="Save Count";
  }
});

async function loadExceptions(){
  const [rr,er]=await Promise.all([
    sb.from("medvika_audit_recounts").select("*").eq("audit_id",currentAuditId).eq("status","open").order("created_at",{ascending:false}).limit(100),
    sb.from("medvika_audit_count_lines").select("item_name,item_code,batch_no,expiry_date,physical_qty,pack_uom,pack_size,condition,count_status").eq("audit_id",currentAuditId).in("condition",["near_expiry","expired","damaged"]).order("counted_at",{ascending:false}).limit(100)
  ]);
  if(!rr.error){
    const recountRows=rr.data||[];
    if(recountRows.some(r=>!r.pack_size)){
      try{
        const stock=await fetchAllSystemStock();
        recountRows.forEach(r=>{
          const m=stock.find(s=>
            (r.system_stock_id && String(s.id)===String(r.system_stock_id)) ||
            (cleanCode(s.item_code)===cleanCode(r.item_code) && cleanBatch(s.batch_no)===cleanBatch(r.batch_no)) ||
            (normName(s.item_name)===normName(r.item_name) && cleanBatch(s.batch_no)===cleanBatch(r.batch_no))
          );
          if(m){ r.pack_size=m.pack_size; r.pack_uom=m.pack_uom; }
        });
      }catch(e){}
    }
    $("recountWrap").innerHTML=tableHtml(["Item","Batch","System","First","Recount","Status"],recountRows.map(r=>{
      const ps=r.pack_size??null, u=r.pack_uom||"Pack";
      return [r.item_name,r.batch_no||"—",
        r.system_qty===null||r.system_qty===undefined?"—":pharmacyQtyDisplay(r.system_qty,ps,u),
        r.first_count_qty===null||r.first_count_qty===undefined?"—":pharmacyQtyDisplay(r.first_count_qty,ps,u),
        r.recount_qty===null||r.recount_qty===undefined?"—":pharmacyQtyDisplay(r.recount_qty,ps,u),
        r.status];
    }));
  }
  if(!er.error){
    $("expiryWrap").innerHTML=tableHtml(["Item","Batch","Expiry","Qty","Condition"],(er.data||[]).map(r=>[
      r.item_name,r.batch_no||"—",r.expiry_date||"—",
      pharmacyQtyDisplay(r.physical_qty,r.pack_size,r.pack_uom||"Pack"),
      r.condition.replaceAll("_"," ")
    ]));
  }
}


// Security: sign out after 30 minutes of inactivity.
const INACTIVITY_LIMIT_MS = 30 * 60 * 1000;
let inactivityTimer = null;

async function secureAutoLogout() {
  try {
    await sb.auth.signOut();
  } finally {
    sessionStorage.clear();
    location.reload();
  }
}

function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(secureAutoLogout, INACTIVITY_LIMIT_MS);
}

["click","touchstart","keydown","mousemove"].forEach(evt => {
  window.addEventListener(evt, resetInactivityTimer, { passive: true });
});
resetInactivityTimer();


// ============================================================
// STEP 3 - CSV / EXCEL IMPORTS
// ============================================================
const HEADER_ALIASES = {
  item_code:["item_code","item code","sku","sku code","code","product code","medicine code"],
  barcode:["barcode","bar code","ean","ean13","gtin"],
  item_name:["item_name","item name","product","product name","medicine","medicine name","brand","brand name"],
  generic_name:["generic_name","generic name","generic"],
  category:["category","group","item group","department"],
  manufacturer:["manufacturer","company","mfr","maker"],
  batch_no:["batch_no","batch no","batch","batch number"],
  expiry_date:["expiry_date","expiry date","expiry","exp date","exp"],
  pack_uom:["pack_uom","pack uom","pack","uom","unit","packing"],
  pack_size:["pack_size","pack size","units per pack","unit per pack","tabs per strip","tablets per strip","pcs per pack"],
  full_pack_qty:["full_pack_qty","full pack qty","pack qty","full packs","packs"],
  loose_qty:["loose_qty","loose qty","loose units","loose","loose tablets","loose pcs"],
  qty_basis:["qty_basis","quantity basis","qty basis"],
  system_qty:["system_qty","system qty","stock","stock qty","current stock","book stock","quantity","qty"],
  physical_qty:["physical_qty","physical qty","physical stock","count qty","counted qty","actual qty","actual stock","quantity","qty"],
  mrp:["mrp","m.r.p"],
  purchase_rate:["purchase_rate","purchase rate","purchase rate ex gst","purchase rate ex-gst","ptr","cost","cost rate"],
  gst_percent:["gst_percent","gst percent","gst %","gst","tax %","tax percent"],
  stock_value:["stock_value","stock value","inventory value"],
  condition:["condition","stock condition","physical condition","status","item condition"]
};

function normHeader(v){
  return String(v??"").trim().toLowerCase().replace(/[_-]+/g," ").replace(/\s+/g," ");
}
function normName(v){
  return String(v??"").trim().toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
}
function cleanBatch(v){ return String(v??"").trim().toUpperCase(); }
function cleanCode(v){ return String(v??"").trim().toUpperCase(); }
function toNumber(v){
  if(v===null||v===undefined||v==="") return null;
  const n=Number(String(v).replace(/,/g,"").trim());
  return Number.isFinite(n)?n:null;
}

function normalizeQtyBasis(v){
  const s=String(v??"").trim().toLowerCase();
  if(/pack.?loose|pack \+ loose|packs? and loose/.test(s)) return "pack_loose";
  if(/base|tablet|piece|unit/.test(s)) return "base_unit";
  return "decimal";
}

function calculateDecimalPackQty({physicalQty=null,fullPackQty=null,looseQty=null,packSize=null,qtyBasis="decimal"}){
  const basis=normalizeQtyBasis(qtyBasis);

  // If pack+loose is selected and enough information exists, calculate on pack basis.
  if(basis==="pack_loose"){
    const fp=Number(fullPackQty||0);
    const lq=Number(looseQty||0);
    const ps=Number(packSize||0);
    if(ps>0) return fp + (lq/ps);
  }

  // Base units can be converted to pack basis only when pack size is known.
  if(basis==="base_unit"){
    const pq=toNumber(physicalQty);
    const ps=Number(packSize||0);
    if(pq!==null && ps>0) return pq/ps;
  }

  // Decimal quantities are retained exactly as supplied.
  const pq=toNumber(physicalQty);
  if(pq!==null) return pq;

  // Sensible fallback if physical qty is blank but pack+loose values are present.
  if(fullPackQty!==null || looseQty!==null){
    const fp=Number(fullPackQty||0);
    const lq=Number(looseQty||0);
    const ps=Number(packSize||0);
    if(ps>0) return fp + (lq/ps);
    if(lq===0) return fp;
  }
  return null;
}

function parsePharmacyQuantity(value, packSize=null){
  if(value===null || value===undefined || value==="") return null;

  const direct=toNumber(value);
  if(direct!==null) return direct;

  const ps=Number(packSize||0);
  const raw=String(value).trim().toLowerCase()
    .replace(/\+/g," ")
    .replace(/,/g," ")
    .replace(/\s+/g," ")
    .trim();

  let packQty=0;
  let looseQty=0;
  let found=false;

  const tokenRe=/(\d+(?:\.\d+)?)\s*(strips?|packs?|boxes?|bottles?|vials?|amp(?:oules?)?|pieces?|pcs?|tabs?|tablets?|caps?|capsules?|units?)/gi;
  let m;
  while((m=tokenRe.exec(raw))!==null){
    found=true;
    const qty=Number(m[1]);
    const unit=m[2].toLowerCase();

    if(/^(strip|strips|pack|packs|box|boxes|bottle|bottles|vial|vials|amp|ampoule|ampoules)$/.test(unit)){
      packQty += qty;
    }else{
      looseQty += qty;
    }
  }

  if(!found){
    const shortRe=/(\d+(?:\.\d+)?)\s*([sptcu])/gi;
    while((m=shortRe.exec(raw))!==null){
      found=true;
      const qty=Number(m[1]);
      const unit=m[2].toLowerCase();
      if(unit==="s" || unit==="p") packQty += qty;
      else looseQty += qty;
    }
  }

  if(!found) return null;

  if(looseQty>0){
    if(!(ps>0)) return null;
    return packQty + (looseQty/ps);
  }

  return packQty;
}

function quantityProfileKey(type){
  return `medvika_qty_profile_${currentAuditId||"audit"}_${type}`;
}

function saveQuantityProfile(type,mode){
  try{ localStorage.setItem(quantityProfileKey(type),mode); }catch(e){}
}
function loadQuantityProfile(type){
  try{ return localStorage.getItem(quantityProfileKey(type))||"smart"; }catch(e){ return "smart"; }
}

function decimalParts(value){
  const s=String(value??"").replace(/,/g,"").trim();
  if(!/^[+-]?\d+(?:\.\d+)?$/.test(s)) return null;
  const negative=s.startsWith("-");
  const clean=negative?s.slice(1):s;
  const [whole,frac=""]=clean.split(".");
  return {negative,whole:Number(whole||0),frac,raw:s};
}

function normalizeImportedQuantity(value,packSize,mode="smart"){
  if(value===null||value===undefined||String(value).trim()===""){
    return {ok:false,reason:"Blank quantity"};
  }

  const ps=toNumber(packSize);
  const raw=String(value).trim();

  // Explicit pharmacy text is unambiguous and always wins.
  if(/[a-zA-Z]/.test(raw)){
    const q=parsePharmacyQuantity(value,ps);
    if(q===null) return {ok:false,reason:"Could not parse pack/loose text"};
    const units=(ps>0)?Math.round(q*ps):q;
    return {ok:true,qty:q,units,method:"pharmacy_text",display:formatImportedQuantity(q,ps)};
  }

  const n=toNumber(value);
  if(n===null) return {ok:false,reason:"Not numeric"};

  if(mode==="base_unit"){
    if(!(ps>0)) return {ok:true,qty:n,units:n,method:"base_unit_no_pack",display:String(n)};
    if(Math.abs(n-Math.round(n))>1e-9) return {ok:false,reason:"Smallest-unit quantity is not a whole unit"};
    const units=Math.round(n);
    return {ok:true,qty:units/ps,units,method:"base_unit",display:formatImportedQuantity(units/ps,ps)};
  }

  if(mode==="decimal_pack"){
    if(!(ps>0)) return {ok:true,qty:n,units:null,method:"decimal_pack_no_pack",display:String(n)};
    const unitsRaw=n*ps;
    if(Math.abs(unitsRaw-Math.round(unitsRaw))>1e-9){
      return {ok:false,reason:`Decimal pack creates fractional smallest units (${unitsRaw})`};
    }
    const units=Math.round(unitsRaw);
    return {ok:true,qty:units/ps,units,method:"decimal_pack",display:formatImportedQuantity(units/ps,ps)};
  }

  if(mode==="erp_pack_loose"){
    if(!(ps>0)) return {ok:false,reason:"Pack Size is required for ERP pack.loose notation"};
    const p=decimalParts(value);
    if(!p) return {ok:false,reason:"Invalid ERP pack.loose quantity"};
    const loose=p.frac===""?0:Number(p.frac);
    if(!Number.isInteger(ps)) return {ok:false,reason:"Pack Size must be a whole number"};
    if(loose>=ps) return {ok:false,reason:`Loose part ${loose} must be less than Pack Size ${ps}`};
    const units=(p.whole*ps)+loose;
    const signed=p.negative?-units:units;
    if(signed<0) return {ok:false,reason:"Negative stock is not supported"};
    return {ok:true,qty:signed/ps,units:signed,method:"erp_pack_loose",display:formatImportedQuantity(signed/ps,ps)};
  }

  // SMART:
  // Explicit pharmacy text is handled above. Plain decimal quantities are
  // intentionally NOT guessed because different ERPs use different conventions.
  if(!(ps>0)) return {ok:true,qty:n,units:null,method:"smart_numeric_no_pack",display:String(n)};

  const parts=decimalParts(value);
  if(parts && parts.frac!==""){
    return {
      ok:false,
      reason:`Decimal quantity "${raw}" is ambiguous. Choose ERP Pack.Loose or True Decimal Packs for this file.`
    };
  }

  const units=Math.round(n*ps);
  return {ok:true,qty:n,units,method:"smart_whole_pack",display:formatImportedQuantity(n,ps)};
}

function formatImportedQuantity(qty,packSize,packUom="Pack"){
  const q=toNumber(qty),ps=toNumber(packSize);
  if(q===null) return "—";
  if(!(ps>0)||!Number.isInteger(ps)) return String(Number(q.toFixed(6)));
  const rawUnits=q*ps;
  if(Math.abs(rawUnits-Math.round(rawUnits))>1e-8) return String(Number(q.toFixed(6)));
  const units=Math.round(rawUnits);
  const packs=Math.floor(Math.abs(units)/ps);
  const loose=Math.abs(units)%ps;
  const sign=units<0?"−":"";
  const u=String(packUom||"Pack").trim()||"Pack";
  return loose
    ? `${sign}${packs} ${u}${packs===1?"":"s"} + ${loose} loose`
    : `${sign}${packs} ${u}${packs===1?"":"s"}`;
}


function smallestUnitCount(qty,packSize){
  const q=toNumber(qty),ps=toNumber(packSize);
  if(q===null || !(ps>0) || !Number.isInteger(ps)) return null;
  return Math.round(q*ps);
}

function pharmacyQtyDisplay(qty,packSize,packUom="Pack"){
  const q=toNumber(qty),ps=toNumber(packSize);
  if(q===null) return "—";
  if(!(ps>0) || !Number.isInteger(ps)) return String(Number(q.toFixed(3)));

  const units=Math.round(q*ps);
  const abs=Math.abs(units);
  const packs=Math.floor(abs/ps);
  const loose=abs%ps;
  const sign=units<0?"−":"";
  const u=String(packUom||"Pack").trim()||"Pack";

  if(packs===0 && loose>0) return `${sign}${loose} loose unit${loose===1?"":"s"}`;
  if(loose===0) return `${sign}${packs} ${u}${packs===1?"":"s"}`;
  return `${sign}${packs} ${u}${packs===1?"":"s"} + ${loose} loose`;
}

function varianceUnitDisplay(physicalQty,systemQty,packSize){
  const p=smallestUnitCount(physicalQty,packSize);
  const s=smallestUnitCount(systemQty,packSize);
  if(p===null || s===null){
    const a=toNumber(physicalQty),b=toNumber(systemQty);
    if(a===null||b===null) return "—";
    return String(Number((a-b).toFixed(3)));
  }
  const diff=p-s;
  if(diff===0) return "0";
  return `${diff>0?"+":"−"}${Math.abs(diff)} loose unit${Math.abs(diff)===1?"":"s"}`;
}

function hasSmallestUnitVariance(physicalQty,systemQty,packSize){
  const p=smallestUnitCount(physicalQty,packSize);
  const s=smallestUnitCount(systemQty,packSize);
  if(p!==null && s!==null) return p!==s;
  return Math.abs(Number(physicalQty||0)-Number(systemQty||0))>0.0000001;
}

function quantityModeOptions(selected="smart"){
  const opts=[
    ["smart","Smart Detect — text + whole quantities only"],
    ["erp_pack_loose","ERP Pack.Loose — 2.5 = 2 packs + 5 loose"],
    ["decimal_pack","True Decimal Packs — 2.5 = 2½ packs"],
    ["base_unit","Smallest Units — 35 = 35 tablets/pieces"]
  ];
  return opts.map(([v,l])=>`<option value="${v}"${v===selected?" selected":""}>${l}</option>`).join("");
}

function analyzeImportQuantities(container,type){
  const rows=container.__rows||[];
  const map=readMapping(container);
  const qtyKey=type==="system"?"system_qty":"physical_qty";
  const mode=container.querySelector("[data-qty-mode]")?.value||"smart";
  const report=container.querySelector("[data-qty-analysis]");
  if(!report) return null;

  if(!map[qtyKey]){
    report.innerHTML='<div class="import-progress error">Map the quantity column first.</div>';
    return null;
  }

  let valid=0,invalid=0;
  const methods={};
  const examples=[];
  rows.forEach((r,idx)=>{
    const ps=map.pack_size?toNumber(r[map.pack_size]):null;
    const result=normalizeImportedQuantity(r[map[qtyKey]],ps,mode);
    if(result.ok){
      valid++;
      methods[result.method]=(methods[result.method]||0)+1;
      if(examples.length<5) examples.push([idx+2,r[map[qtyKey]],ps??"—",result.display]);
    }else{
      invalid++;
      if(examples.length<8) examples.push([idx+2,r[map[qtyKey]],ps??"—","⚠ "+result.reason]);
    }
  });

  const methodText=Object.entries(methods).map(([k,v])=>`${k.replaceAll("_"," ")}: ${fmtNum(v)}`).join(" · ");
  report.innerHTML=`
    <div class="import-progress ${invalid?"error":""}">
      <strong>Smart Quantity Check:</strong> ${fmtNum(valid)} ready · ${fmtNum(invalid)} need review
      ${methodText?`<br><span class="helper">${esc(methodText)}</span>`:""}
    </div>
    <div class="preview-table">${tableHtml(
      ["Row","Imported Qty","Pack Size","Normalized"],
      examples
    )}</div>
    ${invalid?'<p class="helper"><strong>No row-by-row editing required.</strong> For decimal quantities, choose once for the whole file whether the ERP means Pack.Loose or True Decimal Packs, then re-run Analyze.</p>':""}
  `;
  container.__qtyAnalysis={valid,invalid,mode};
  saveQuantityProfile(type,mode);
  return container.__qtyAnalysis;
}

function toISODate(v){
  if(!v) return null;
  if(typeof v==="number" && window.XLSX){
    const d=XLSX.SSF.parse_date_code(v);
    if(d) return `${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`;
  }
  const s=String(v).trim();
  const iso=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(iso) return `${iso[1]}-${iso[2].padStart(2,"0")}-${iso[3].padStart(2,"0")}`;
  const dm=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if(dm){
    let y=dm[3]; if(y.length===2) y="20"+y;
    return `${y}-${dm[2].padStart(2,"0")}-${dm[1].padStart(2,"0")}`;
  }
  const parsed=new Date(s);
  if(!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0,10);
  return null;
}

function parseConditionText(v){
  const s=String(v??"").trim().toLowerCase();
  if(!s) return null;
  if(/damag|broken|leak|torn|crush|open pack|non.?saleable/.test(s)) return "damaged";
  if(/expired/.test(s)) return "expired";
  if(/near.?exp|short.?exp/.test(s)) return "near_expiry";
  if(/saleable|good|ok|normal/.test(s)) return "saleable";
  return null;
}

function auditReferenceDate(){
  if(currentAuditDate){
    const d=new Date(currentAuditDate+"T00:00:00");
    if(!Number.isNaN(d.getTime())) return d;
  }
  const n=new Date();
  return new Date(n.getFullYear(),n.getMonth(),n.getDate());
}

function classifyCondition(expiryDate, explicitCondition=null){
  // Physical damage always overrides expiry-derived condition.
  if(explicitCondition==="damaged") return "damaged";

  if(expiryDate){
    const exp=new Date(expiryDate+"T23:59:59");
    const ref=auditReferenceDate();
    if(!Number.isNaN(exp.getTime())){
      const diffDays=Math.ceil((exp-ref)/(1000*60*60*24));
      if(diffDays < 0) return "expired";
      if(diffDays <= Number(nearExpiryDays||180)) return "near_expiry";
    }
  }

  // Respect an explicit expired/near-expiry status if no usable date was supplied.
  if(["expired","near_expiry","saleable"].includes(explicitCondition)) return explicitCondition;
  return "saleable";
}

function conditionLabel(v){
  return ({
    saleable:"Saleable",
    near_expiry:"Near Expiry",
    expired:"Expired",
    damaged:"Damaged",
    other:"Other"
  })[v] || v || "—";
}

function conditionChip(v){
  const safe=v||"saleable";
  return `<span class="condition-chip condition-${esc(safe)}">${esc(conditionLabel(safe))}</span>`;
}

function detectColumn(headers,key){
  const aliases=HEADER_ALIASES[key]||[];
  const nheaders=headers.map(normHeader);
  for(const alias of aliases){
    const i=nheaders.indexOf(normHeader(alias));
    if(i>=0) return headers[i];
  }
  return "";
}
async function parseImportFile(file){
  if(!file) throw new Error("Choose a CSV or Excel file first.");
  const ext=(file.name.split(".").pop()||"").toLowerCase();
  if(ext==="csv"){
    return new Promise((resolve,reject)=>{
      Papa.parse(file,{
        header:true,skipEmptyLines:true,dynamicTyping:false,
        complete:r=>r.errors?.length && !r.data?.length ? reject(new Error(r.errors[0].message)) : resolve(r.data||[]),
        error:reject
      });
    });
  }
  if(["xlsx","xls"].includes(ext)){
    const buf=await file.arrayBuffer();
    const book=XLSX.read(buf,{type:"array",cellDates:false});
    const sheet=book.Sheets[book.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet,{defval:"",raw:true});
  }
  throw new Error("Only CSV, XLSX and XLS files are supported.");
}
function mappingField(label,key,headers,required=false){
  const detected=detectColumn(headers,key);
  return `<label>${esc(label)}${required?" *":""}<select data-map="${key}">
    <option value="">-- Not mapped --</option>
    ${headers.map(h=>`<option value="${esc(h)}"${h===detected?" selected":""}>${esc(h)}</option>`).join("")}
  </select></label>`;
}
function renderMapping(container,rows,type){
  if(!rows.length){container.innerHTML='<div class="import-progress error">No rows found in file.</div>';return;}
  const headers=Object.keys(rows[0]);
  const isSystem=type==="system";
  const fields=isSystem
    ? [["Item Name","item_name",true],["Item Code","item_code",false],["Barcode","barcode",false],["Batch No.","batch_no",false],["Expiry Date","expiry_date",false],["System Qty","system_qty",true],["Pack/UOM","pack_uom",false],["Pack Size","pack_size",false],["Category","category",false],["Manufacturer","manufacturer",false],["Purchase Rate Ex-GST","purchase_rate",false],["GST %","gst_percent",false],["MRP","mrp",false]]
    : [["Item Name","item_name",true],["Item Code","item_code",false],["Barcode","barcode",false],["Batch No.","batch_no",false],["Expiry Date","expiry_date",false],["Physical Qty","physical_qty",true],["Pack/UOM","pack_uom",false],["Pack Size","pack_size",false],["Category","category",false],["Condition / Damage","condition",false]];
  const savedMode=loadQuantityProfile(type);
  container.__rows=rows;
  container.innerHTML=`<div class="mapping-card">
    <strong>Column Mapping</strong>
    <p class="helper">${fmtNum(rows.length)} rows detected. Confirm the columns before importing.</p>
    <div class="mapping-grid">${fields.map(f=>mappingField(f[0],f[1],headers,f[2])).join("")}</div>

    <div class="import-options" style="margin-top:14px">
      <label>Quantity Interpretation
        <select data-qty-mode>${quantityModeOptions(savedMode)}</select>
      </label>
      <button class="btn secondary" type="button" data-analyze-qty>Analyze Quantities</button>
    </div>
    <p class="helper">Choose one rule for the complete file. Smart Detect understands pharmacy text and common ERP pack.loose notation. The selected rule is remembered for this audit.</p>
    <div data-qty-analysis></div>

    <div class="preview-table">${tableHtml(headers.slice(0,8),rows.slice(0,5).map(r=>headers.slice(0,8).map(h=>r[h])))}</div>
    <button class="btn primary" type="button" data-import="${type}">${isSystem?"Import System Stock":"Match & Import Physical Counts"}</button>
    <div class="import-progress" data-progress hidden></div>
  </div>`;

  const analyze=()=>analyzeImportQuantities(container,type);
  container.querySelector("[data-analyze-qty]").addEventListener("click",analyze);
  container.querySelector("[data-qty-mode]").addEventListener("change",analyze);
  container.querySelectorAll("[data-map]").forEach(el=>el.addEventListener("change",()=>{ if(el.dataset.map==="system_qty"||el.dataset.map==="physical_qty"||el.dataset.map==="pack_size") analyze(); }));
  container.querySelector(`[data-import="${type}"]`).addEventListener("click",()=> type==="system" ? importSystemRows(container) : importPhysicalRows(container));
  setTimeout(analyze,0);
}
function readMapping(container){
  const out={};
  container.querySelectorAll("[data-map]").forEach(el=>out[el.dataset.map]=el.value);
  return out;
}
async function createImportJob(type,file,mode,total){
  const {data:{user}}=await sb.auth.getUser();
  const {data,error}=await sb.from("medvika_audit_import_jobs").insert({
    audit_id:currentAuditId,import_type:type,file_name:file?.name||null,
    file_type:file?.name?.split(".").pop()?.toLowerCase()||null,
    mode,total_rows:total,created_by:user?.id||null
  }).select("id").single();
  if(error) throw error;
  return data.id;
}
async function finishImportJob(id,stats,errorText=null){
  const status=errorText ? "failed" : (stats.failed_rows>0 ? "completed_with_errors":"completed");
  await sb.from("medvika_audit_import_jobs").update({
    ...stats,status,error_summary:errorText,completed_at:new Date().toISOString()
  }).eq("id",id);
}
async function insertChunks(table,records,chunk=400){
  let inserted=0;
  for(let i=0;i<records.length;i+=chunk){
    const part=records.slice(i,i+chunk);
    const {error}=await sb.from(table).insert(part);
    if(error) throw error;
    inserted+=part.length;
  }
  return inserted;
}

$("previewSystemButton")?.addEventListener("click",async()=>{
  const area=$("systemImportArea");
  area.innerHTML='<div class="import-progress">Reading file…</div>';
  try{ renderMapping(area,await parseImportFile($("systemStockFile").files[0]),"system"); }
  catch(e){area.innerHTML=`<div class="import-progress error">${esc(e.message)}</div>`;}
});
$("previewPhysicalButton")?.addEventListener("click",async()=>{
  const area=$("physicalImportArea");
  area.innerHTML='<div class="import-progress">Reading file…</div>';
  try{ renderMapping(area,await parseImportFile($("physicalCountFile").files[0]),"physical"); }
  catch(e){area.innerHTML=`<div class="import-progress error">${esc(e.message)}</div>`;}
});

async function importSystemRows(container){
  const rows=container.__rows||[], map=readMapping(container), file=$("systemStockFile").files[0], mode=$("systemImportMode").value;
  const progress=container.querySelector("[data-progress]"); progress.hidden=false; progress.textContent="Preparing stock import…";
  if(!map.item_name||!map.system_qty){progress.className="import-progress error";progress.textContent="Map Item Name and System Qty.";return;}
  const analysis=analyzeImportQuantities(container,"system");
  if(!analysis) return;
  if(analysis.invalid>0){
    progress.className="import-progress error";
    progress.textContent=`${analysis.invalid} quantities are still ambiguous. Choose the correct file-wide Quantity Interpretation and analyze again before import.`;
    return;
  }
  let jobId=null;
  try{
    jobId=await createImportJob("system_stock",file,mode,rows.length);
    if(mode==="replace"){
      progress.textContent="Removing previous current-stock rows…";
      const {error}=await sb.from("medvika_audit_system_stock").delete().eq("audit_id",currentAuditId);
      if(error) throw error;
    }
    const recs=[];
    let failed=0;
    rows.forEach((r,idx)=>{
      const name=String(r[map.item_name]??"").trim();
      const importedPackSize=map.pack_size?toNumber(r[map.pack_size]):null;
      const qtyMode=container.querySelector("[data-qty-mode]")?.value||"smart";
      const normalized=normalizeImportedQuantity(r[map.system_qty],importedPackSize,qtyMode);
      const qty=normalized.ok?normalized.qty:null;
      if(!name||qty===null){failed++;return;}
      recs.push({
        audit_id:currentAuditId,import_job_id:jobId,source_row_no:idx+2,
        item_name:name,item_code:map.item_code?String(r[map.item_code]??"").trim()||null:null,
        barcode:map.barcode?String(r[map.barcode]??"").trim()||null:null,
        batch_no:map.batch_no?String(r[map.batch_no]??"").trim()||null:null,
        expiry_date:map.expiry_date?toISODate(r[map.expiry_date]):null,
        pack_uom:map.pack_uom?String(r[map.pack_uom]??"").trim()||null:null,
        pack_size:importedPackSize,
        qty_basis:"decimal", // retained in DB for compatibility; quantity format is auto-detected
        category:map.category?String(r[map.category]??"").trim()||null:null,
        manufacturer:map.manufacturer?String(r[map.manufacturer]??"").trim()||null:null,
        system_qty:qty,mrp:map.mrp?toNumber(r[map.mrp]):null,
        purchase_rate:map.purchase_rate?toNumber(r[map.purchase_rate]):null,
        gst_percent:map.gst_percent?toNumber(r[map.gst_percent]):null,
        normalized_name:normName(name)
      });
    });
    progress.textContent=`Uploading ${fmtNum(recs.length)} current-stock rows…`;
    const inserted=await insertChunks("medvika_audit_system_stock",recs);
    await finishImportJob(jobId,{inserted_rows:inserted,matched_rows:0,unmatched_rows:0,failed_rows:failed});
    progress.className="import-progress"; progress.textContent=`Completed: ${fmtNum(inserted)} stock rows imported${failed?`, ${failed} skipped`:""}.`;
    toast("System stock import completed");
    await loadImportHistory();
  }catch(e){
    if(jobId) await finishImportJob(jobId,{inserted_rows:0,matched_rows:0,unmatched_rows:0,failed_rows:rows.length},e.message);
    progress.className="import-progress error";progress.textContent=e.message;toast(e.message,"error");
  }
}

async function fetchAllSystemStock(){
  const all=[]; let from=0; const size=1000;
  while(true){
    const {data,error}=await sb.from("medvika_audit_system_stock")
      .select("id,item_code,barcode,item_name,normalized_name,batch_no,expiry_date,pack_uom,category,system_qty,mrp,purchase_rate,gst_percent,pack_size,qty_basis")
      .eq("audit_id",currentAuditId).range(from,from+size-1);
    if(error) throw error;
    all.push(...(data||[]));
    if(!data||data.length<size) break;
    from+=size;
  }
  return all;
}
function stockKey(v,b){return `${cleanCode(v)}|${cleanBatch(b)}`;}
function nameKey(v,b){return `${normName(v)}|${cleanBatch(b)}`;}

async function importPhysicalRows(container){
  const rows=container.__rows||[], map=readMapping(container), file=$("physicalCountFile").files[0];
  const zoneId=$("physicalImportZone").value||null, teamId=$("physicalImportTeam").value||null;
  const progress=container.querySelector("[data-progress]"); progress.hidden=false; progress.textContent="Loading current inventory for matching…";
  if(!map.item_name||!map.physical_qty){progress.className="import-progress error";progress.textContent="Map Item Name and Physical Qty.";return;}
  const analysis=analyzeImportQuantities(container,"physical");
  if(!analysis) return;
  if(analysis.invalid>0){
    progress.className="import-progress error";
    progress.textContent=`${analysis.invalid} quantities are still ambiguous. Choose the correct file-wide Quantity Interpretation and analyze again before import.`;
    return;
  }
  let jobId=null;
  try{
    jobId=await createImportJob("physical_count",file,"append",rows.length);
    const stock=await fetchAllSystemStock();
    const byCode=new Map(),byBarcode=new Map(),byName=new Map();
    stock.forEach(s=>{
      if(s.item_code) byCode.set(stockKey(s.item_code,s.batch_no),s);
      if(s.barcode) byBarcode.set(stockKey(s.barcode,s.batch_no),s);
      byName.set(nameKey(s.normalized_name||s.item_name,s.batch_no),s);
    });
    const recs=[];let matched=0,unmatched=0,failed=0;
    rows.forEach(r=>{
      const name=String(r[map.item_name]??"").trim();
      const importedPackSize=map.pack_size?toNumber(r[map.pack_size]):null;
      const rawPhysical=map.physical_qty?r[map.physical_qty]:null;
      const qtyMode=container.querySelector("[data-qty-mode]")?.value||"smart";
      const normalizedPhysical=normalizeImportedQuantity(rawPhysical,importedPackSize,qtyMode);
      const physical=normalizedPhysical.ok?normalizedPhysical.qty:null;
      if(!name||physical===null){failed++;return;}
      const code=map.item_code?String(r[map.item_code]??"").trim():"";
      const barcode=map.barcode?String(r[map.barcode]??"").trim():"";
      const batch=map.batch_no?String(r[map.batch_no]??"").trim():"";
      let s=null,matchStatus="unmatched_excess";
      if(code && byCode.has(stockKey(code,batch))){s=byCode.get(stockKey(code,batch));matchStatus="matched_item_batch";}
      else if(barcode && byBarcode.has(stockKey(barcode,batch))){s=byBarcode.get(stockKey(barcode,batch));matchStatus="matched_barcode_batch";}
      else if(byName.has(nameKey(name,batch))){s=byName.get(nameKey(name,batch));matchStatus="matched_name_batch";}
      if(s) matched++; else unmatched++;

      // Read expiry and condition from the imported physical-count row.
      // If expiry is blank, fall back to the matched system-stock expiry.
      const importedExpiry = map.expiry_date ? toISODate(r[map.expiry_date]) : (s?.expiry_date || null);
      const explicitCondition = map.condition ? parseConditionText(r[map.condition]) : null;
      const finalCondition = classifyCondition(importedExpiry, explicitCondition);

      recs.push({
        audit_id:currentAuditId,zone_id:zoneId,team_id:teamId,system_stock_id:s?.id||null,import_job_id:jobId,
        item_code:code||s?.item_code||null,barcode:barcode||s?.barcode||null,item_name:name||s?.item_name,
        category:(map.category?String(r[map.category]??"").trim():null)||s?.category||null,
        batch_no:batch||s?.batch_no||null,expiry_date:importedExpiry,
        pack_uom:(map.pack_uom?String(r[map.pack_uom]??"").trim():null)||s?.pack_uom||null,
        pack_size:importedPackSize||s?.pack_size||null,
        full_pack_qty:null,
        loose_qty:null,
        qty_basis:"decimal", // retained in DB for compatibility; quantity format is auto-detected
        physical_qty:physical,system_qty:s?Number(s.system_qty||0):0,
        condition:finalCondition,count_status:(s && physical!==Number(s.system_qty||0))?"recount":"counted",
        match_status:matchStatus,excess_reason:s?null:"Physical stock found but item/batch not present in imported current stock.",
        counted_by:"Physical Import"
      });
    });
    progress.textContent=`Saving ${fmtNum(recs.length)} physical count rows…`;
    const inserted=await insertChunks("medvika_audit_count_lines",recs);
    await finishImportJob(jobId,{inserted_rows:inserted,matched_rows:matched,unmatched_rows:unmatched,failed_rows:failed});
    progress.className="import-progress";
    progress.innerHTML=`Completed: ${fmtNum(inserted)} counts · ${fmtNum(matched)} matched · <strong>${fmtNum(unmatched)} unlisted excess</strong>${failed?` · ${failed} skipped`:""}.`;
    toast("Physical count import completed");
    await Promise.all([loadDashboard(),loadRecentCounts(),loadExceptions(),loadImportHistory(),loadReconciliation(),loadFinalReport()]);
  }catch(e){
    if(jobId) await finishImportJob(jobId,{inserted_rows:0,matched_rows:0,unmatched_rows:0,failed_rows:rows.length},e.message);
    progress.className="import-progress error";progress.textContent=e.message;toast(e.message,"error");
  }
}


/* ---------------- Current Stock Register ---------------- */
function stockExpiryClass(expiry){
  if(!expiry) return "ok";
  const d=new Date(`${expiry}T00:00:00`);
  if(Number.isNaN(d.getTime())) return "ok";
  const today=new Date(); today.setHours(0,0,0,0);
  const near=new Date(today); near.setDate(near.getDate()+180);
  return d<today?"expired":d<=near?"near_expiry":"ok";
}

async function loadStockRegister(){
  if(!currentAuditId || !$("stockRegisterTable")) return;
  $("stockRegStatus").textContent="Loading current stock…";
  try{
    const [stock,allocRes]=await Promise.all([
      fetchAllSystemStock(),
      sb.from("medvika_audit_stock_allocations")
        .select("system_stock_id,active")
        .eq("audit_id",currentAuditId)
        .eq("active",true)
    ]);
    const allocMap=new Map();
    (allocRes.data||[]).forEach(a=>{
      const k=String(a.system_stock_id);
      allocMap.set(k,(allocMap.get(k)||0)+1);
    });
    stockRegisterRows=stock.map(r=>({
      ...r,
      _alloc:allocMap.get(String(r.id))||0,
      _expiry:stockExpiryClass(r.expiry_date)
    }));
    stockRegisterPage=1;
    renderStockRegister();
    $("stockRegStatus").textContent=`${stockRegisterRows.length} current-stock lines loaded.`;
  }catch(err){
    console.error("Current Stock Register:",err);
    $("stockRegStatus").textContent=err.message||"Unable to load current stock.";
  }
}

function renderStockRegister(){
  if(!$("stockRegisterTable")) return;
  const term=String($("stockRegSearch")?.value||"").trim().toLowerCase();
  const risk=$("stockRegRisk")?.value||"";
  const size=Math.max(1,Number($("stockRegPageSize")?.value||100));

  stockRegisterFiltered=stockRegisterRows.filter(r=>{
    const hay=[r.item_name,r.item_code,r.barcode,r.batch_no].map(v=>String(v||"").toLowerCase()).join(" ");
    if(term && !hay.includes(term)) return false;
    const rate=firstFiniteNumber(r.purchase_rate,r.purchase_rate_ex_gst,r.ptr,r.cost_rate);
    if(risk==="unallocated" && r._alloc) return false;
    if(risk==="missing_rate" && rate!==null) return false;
    if(risk==="expired" && r._expiry!=="expired") return false;
    if(risk==="near_expiry" && r._expiry!=="near_expiry") return false;
    return true;
  });

  const pages=Math.max(1,Math.ceil(stockRegisterFiltered.length/size));
  stockRegisterPage=Math.max(1,Math.min(stockRegisterPage,pages));
  const start=(stockRegisterPage-1)*size;
  const rows=stockRegisterFiltered.slice(start,start+size);

  $("stockRegTotal").textContent=stockRegisterRows.length;
  $("stockRegUnallocated").textContent=stockRegisterRows.filter(r=>!r._alloc).length;
  $("stockRegMissingRate").textContent=stockRegisterRows.filter(r=>firstFiniteNumber(r.purchase_rate,r.purchase_rate_ex_gst,r.ptr,r.cost_rate)===null).length;
  $("stockRegExpiryRisk").textContent=stockRegisterRows.filter(r=>r._expiry!=="ok").length;
  $("stockRegPageInfo").textContent=`Page ${stockRegisterPage} of ${pages} • ${stockRegisterFiltered.length} rows`;
  $("stockRegPrev").disabled=stockRegisterPage<=1;
  $("stockRegNext").disabled=stockRegisterPage>=pages;

  $("stockRegisterTable").innerHTML=rows.length?`
    <table>
      <thead><tr><th>Item</th><th>Code / Barcode</th><th>Batch</th><th>Expiry</th><th>Pack</th><th>System Qty</th><th>Purchase Rate</th><th>GST</th><th>MRP</th><th>Allocation</th></tr></thead>
      <tbody>${rows.map(r=>{
        const rate=firstFiniteNumber(r.purchase_rate,r.purchase_rate_ex_gst,r.ptr,r.cost_rate);
        const badge=r._expiry==="expired"
          ?'<span class="stock-risk stock-expired">Expired</span>'
          :r._expiry==="near_expiry"
            ?'<span class="stock-risk stock-near">Near Expiry</span>'
            :'<span class="stock-risk stock-ok">OK</span>';
        return `<tr>
          <td><strong>${esc(r.item_name||"")}</strong></td>
          <td>${esc(r.item_code||"—")}<br><small>${esc(r.barcode||"")}</small></td>
          <td>${esc(r.batch_no||"—")}</td>
          <td>${esc(r.expiry_date||"—")}<br>${badge}</td>
          <td>${esc(r.pack_uom||"Pack")} × ${esc(r.pack_size||"—")}</td>
          <td>${esc(pharmacyQtyDisplay(r.system_qty,r.pack_size,r.pack_uom||"Pack"))}</td>
          <td>${rate===null?'<span class="risk-negative">Rate unavailable</span>':esc(fmtMoney(rate))}</td>
          <td>${esc(r.gst_percent??"—")}</td>
          <td>${r.mrp===null||r.mrp===undefined?"—":esc(fmtMoney(r.mrp))}</td>
          <td class="${r._alloc?"stock-yes":"stock-no"}">${r._alloc?`Allocated (${r._alloc})`:"Unallocated"}</td>
        </tr>`;
      }).join("")}</tbody>
    </table>`:'<div class="empty">No stock rows match this filter.</div>';
}

function exportStockRegisterCsv(){
  const rows=stockRegisterFiltered.length?stockRegisterFiltered:stockRegisterRows;
  if(!rows.length){toast("No stock rows to export","error");return;}
  downloadCsv("current_stock_register.csv",rows.map(r=>({
    Item_Code:r.item_code||"",
    Barcode:r.barcode||"",
    Item_Name:r.item_name||"",
    Batch:r.batch_no||"",
    Expiry:r.expiry_date||"",
    Pack_UOM:r.pack_uom||"",
    Pack_Size:r.pack_size??"",
    System_Qty:r.system_qty??"",
    System_Qty_Display:pharmacyQtyDisplay(r.system_qty,r.pack_size,r.pack_uom||"Pack"),
    Purchase_Rate_Ex_GST:firstFiniteNumber(r.purchase_rate,r.purchase_rate_ex_gst,r.ptr,r.cost_rate)??"",
    GST:r.gst_percent??"",
    MRP:r.mrp??"",
    Allocation:r._alloc?"Allocated":"Unallocated"
  })));
}

$("refreshStockRegister")?.addEventListener("click",loadStockRegister);
$("exportStockRegister")?.addEventListener("click",exportStockRegisterCsv);
$("stockRegSearch")?.addEventListener("input",()=>{stockRegisterPage=1;renderStockRegister();});
$("stockRegRisk")?.addEventListener("change",()=>{stockRegisterPage=1;renderStockRegister();});
$("stockRegPageSize")?.addEventListener("change",()=>{stockRegisterPage=1;renderStockRegister();});
$("stockRegPrev")?.addEventListener("click",()=>{stockRegisterPage--;renderStockRegister();});
$("stockRegNext")?.addEventListener("click",()=>{stockRegisterPage++;renderStockRegister();});

async function loadImportHistory(){
  if(!$("importHistoryWrap")||!currentAuditId) return;
  const {data,error}=await sb.from("medvika_audit_import_jobs").select("*").eq("audit_id",currentAuditId).order("created_at",{ascending:false}).limit(30);
  if(error){$("importHistoryWrap").innerHTML=`<div class="empty">${esc(error.message)}</div>`;return;}
  $("importHistoryWrap").innerHTML=tableHtml(
    ["Time","Type","File","Mode","Rows","Inserted","Matched","Unlisted","Failed","Status"],
    (data||[]).map(r=>[fmtDate(r.created_at),r.import_type.replaceAll("_"," "),r.file_name||"—",r.mode,r.total_rows,r.inserted_rows,r.matched_rows,r.unmatched_rows,r.failed_rows,r.status])
  );
}
$("reloadImportsButton")?.addEventListener("click",loadImportHistory);


// ============================================================
// STEP 4 - COMPLETE STOCK RECONCILIATION & EXPORT
// ============================================================
let reconciliationRows = [];

function buildReconciliationRows(systemStock, countLines){
  const matchedGroups = new Map();
  const unlistedGroups = new Map();

  // Aggregate matched physical counts against system_stock_id.
  countLines.forEach(c=>{
    if(c.system_stock_id){
      const key=String(c.system_stock_id);
      if(!matchedGroups.has(key)){
        matchedGroups.set(key,{
          physical_qty:0,
          recount:false,
          count_ids:[],
          latest_count:null
        });
      }
      const g=matchedGroups.get(key);
      g.physical_qty += Number(c.physical_qty||0);
      g.recount = g.recount || c.count_status==="recount";
      g.count_ids.push(c.id);
      g.latest_count=c;
    }else if(c.match_status==="unmatched_excess"){
      const key=[
        cleanCode(c.item_code||""),
        cleanBatch(c.batch_no||""),
        normName(c.item_name||"")
      ].join("|");
      if(!unlistedGroups.has(key)){
        unlistedGroups.set(key,{
          item_name:c.item_name,
          item_code:c.item_code||null,
          batch_no:c.batch_no||null,
          category:c.category||null,
          expiry_date:c.expiry_date||null,
          condition:c.condition||classifyCondition(c.expiry_date,null),
          pack_uom:c.pack_uom||"Pack",
          pack_size:c.pack_size||null,
          full_pack_qty:c.full_pack_qty??null,
          loose_qty:c.loose_qty??null,
          qty_basis:c.qty_basis||"decimal",
          system_qty:0,
          physical_qty:0,
          recount:false,
          match_status:"unmatched_excess"
        });
      }
      const g=unlistedGroups.get(key);
      g.physical_qty += Number(c.physical_qty||0);
      g.recount = g.recount || c.count_status==="recount";
    }
  });

  const rows=[];

  systemStock.forEach(s=>{
    const g=matchedGroups.get(String(s.id));
    const sys=Number(s.system_qty||0);
    const phy=g ? Number(g.physical_qty||0) : 0;
    const variance=Number((phy-sys).toFixed(9));

    let status="matched";
    if(!g) status="missing";
    else if(variance>0) status="excess";
    else if(variance<0) status="short";

    rows.push({
      source:"system",
      system_stock_id:s.id,
      item_name:s.item_name,
      item_code:s.item_code||"",
      batch_no:s.batch_no||"",
      category:s.category||"",
      expiry_date:g?.latest_count?.expiry_date || s.expiry_date || null,
      condition:g?.latest_count?.condition || classifyCondition(s.expiry_date,null),
      pack_uom:g?.latest_count?.pack_uom || s.pack_uom || "Pack",
      pack_size:g?.latest_count?.pack_size || s.pack_size || null,
      full_pack_qty:g?.latest_count?.full_pack_qty ?? null,
      loose_qty:g?.latest_count?.loose_qty ?? null,
      qty_basis:g?.latest_count?.qty_basis || s.qty_basis || "decimal",
      purchase_rate:s.purchase_rate===null||s.purchase_rate===undefined?null:Number(s.purchase_rate),
      gst_percent:s.gst_percent===null||s.gst_percent===undefined?null:Number(s.gst_percent),
      mrp:s.mrp===null||s.mrp===undefined?null:Number(s.mrp),
      system_qty:sys,
      physical_qty:phy,
      variance,
      system_value:s.purchase_rate===null||s.purchase_rate===undefined?null:sys*Number(s.purchase_rate),
      physical_value:s.purchase_rate===null||s.purchase_rate===undefined?null:phy*Number(s.purchase_rate),
      variance_value:s.purchase_rate===null||s.purchase_rate===undefined?null:variance*Number(s.purchase_rate),
      status,
      recount:!!g?.recount,
      finding:
        status==="matched" ? "Matched" :
        status==="excess" ? "Physical stock exceeds system stock" :
        status==="short" ? "Physical stock below system stock" :
        "System stock not found physically"
    });
  });

  unlistedGroups.forEach(g=>{
    rows.push({
      source:"unlisted",
      system_stock_id:null,
      item_name:g.item_name,
      item_code:g.item_code||"",
      batch_no:g.batch_no||"",
      category:g.category||"",
      expiry_date:g.expiry_date||null,
      condition:g.condition||"saleable",
      pack_uom:g.pack_uom||"Pack",
      pack_size:g.pack_size||null,
      full_pack_qty:g.full_pack_qty??null,
      loose_qty:g.loose_qty??null,
      qty_basis:g.qty_basis||"decimal",
      purchase_rate:firstFiniteNumber(g.resolved_purchase_rate,g.purchase_rate,g.purchase_rate_ex_gst,g.ptr,g.cost_rate),
      gst_percent:null,
      mrp:null,
      system_qty:0,
      physical_qty:Number(g.physical_qty||0),
      variance:Number(g.physical_qty||0),
      system_value:0,
      physical_value:null,
      variance_value:null,
      status:"unlisted",
      recount:!!g.recount,
      finding:"Physical stock not present in current/system stock"
    });
  });

  return rows.sort((a,b)=>{
    const rank={missing:1,unlisted:2,short:3,excess:4,matched:5};
    return (rank[a.status]-rank[b.status]) || a.item_name.localeCompare(b.item_name);
  });
}

function statusLabel(r){
  if(r.status==="matched") return "Matched";
  if(r.status==="excess") return "Excess";
  if(r.status==="short") return "Short";
  if(r.status==="missing") return "Missing";
  if(r.status==="unlisted") return "Unlisted Excess";
  return r.status;
}

function statusChip(r){
  return `<span class="status-chip status-${esc(r.status)}">${esc(statusLabel(r))}</span>`;
}

function filteredReconciliationRows(){
  const q=($("reconSearch")?.value||"").trim().toLowerCase();
  const status=$("reconStatusFilter")?.value||"all";
  const category=$("reconCategoryFilter")?.value||"all";
  const condition=$("reconConditionFilter")?.value||"all";

  return reconciliationRows.filter(r=>{
    const hay=[r.item_name,r.item_code,r.batch_no,r.category].join(" ").toLowerCase();
    const qOk=!q || hay.includes(q);
    const categoryOk=category==="all" || (r.category||"")===category;
    const conditionOk=condition==="all" || (r.condition||"saleable")===condition;
    let statusOk=true;
    if(status==="recount") statusOk=r.recount===true;
    else if(status!=="all") statusOk=r.status===status;
    return qOk && categoryOk && conditionOk && statusOk;
  });
}

function renderReconSummary(){
  if(!$("reconSummary")) return;
  const count=(s)=>reconciliationRows.filter(r=>r.status===s).length;
  const recount=reconciliationRows.filter(r=>r.recount).length;
  $("reconSummary").innerHTML=[
    ["Matched",count("matched"),"is-ok"],
    ["Excess",count("excess"),"is-warn"],
    ["Short",count("short"),"is-danger"],
    ["Missing",count("missing"),"is-danger"],
    ["Unlisted",count("unlisted"),"is-danger"],
    ["Recount",recount,"is-warn"]
  ].map(x=>`<div class="recon-stat ${x[2]}"><span>${x[0]}</span><strong>${fmtNum(x[1])}</strong></div>`).join("");
}

function renderReconciliationTable(){
  if(!$("reconBody")) return;
  const rows=filteredReconciliationRows();

  $("reconBody").innerHTML=rows.length ? rows.map(r=>`
    <tr>
      <td>${statusChip(r)}</td>
      <td>${esc(r.item_name)}</td>
      <td>${esc(r.item_code||"—")}</td>
      <td>${esc(r.batch_no||"—")}</td>
      <td>${esc(r.category||"—")}</td>
      <td>${esc(r.expiry_date||"—")}</td>
      <td>${conditionChip(r.condition)}</td>
      <td>${r.purchase_rate===null?"—":fmtMoney(r.purchase_rate)}</td>
      <td>${r.gst_percent===null?"—":esc(r.gst_percent)+"%"}</td>
      <td>${esc(pharmacyQtyDisplay(r.system_qty,r.pack_size,r.pack_uom))}</td>
      <td>${esc(pharmacyQtyDisplay(r.physical_qty,r.pack_size,r.pack_uom))}</td>
      <td class="${varianceClass(r.variance)}">${esc(varianceUnitDisplay(r.physical_qty,r.system_qty,r.pack_size))}</td>
      <td>${r.system_value===null?"—":fmtMoney(r.system_value)}</td>
      <td>${r.physical_value===null?"—":fmtMoney(r.physical_value)}</td>
      <td class="${r.variance_value===null?"":(r.variance_value<0?"money-negative":r.variance_value>0?"money-positive":"money-neutral")}">${r.variance_value===null?"—":fmtMoney(r.variance_value)}</td>
      <td>${r.recount?'<span class="status-chip status-recount">Recount</span>':'—'}</td>
    </tr>
  `).join("") : '<tr><td colspan="16" class="empty">No reconciliation rows for this filter.</td></tr>';

  if($("reconFooter")){
    $("reconFooter").innerHTML=`<span>Showing ${fmtNum(rows.length)} of ${fmtNum(reconciliationRows.length)} reconciliation rows</span><span>Positive variance = excess · Negative variance = short</span>`;
  }
}

async function loadReconciliation(){
  if(!currentAuditId || !$("reconBody")) return;
  try{
    const [stock,counts]=await Promise.all([fetchAllSystemStock(),fetchAllCountLinesDetailed()]);
    reconciliationRows=buildReconciliationRows(stock,counts);

    const categories=[...new Set(reconciliationRows.map(r=>r.category).filter(Boolean))].sort();
    const sel=$("reconCategoryFilter");
    if(sel){
      const current=sel.value;
      sel.innerHTML='<option value="all">All categories</option>'+categories.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("");
      if([...sel.options].some(o=>o.value===current)) sel.value=current;
    }

    renderReconSummary();
    renderReconciliationTable();
  }catch(err){
    console.error("Reconciliation load error:",err);
    $("reconBody").innerHTML=`<tr><td colspan="16" class="empty">${esc(err.message||"Unable to load reconciliation")}</td></tr>`;
  }
}

async function fetchAllCountLinesDetailed(){
  const all=[]; let from=0; const size=1000;
  while(true){
    const {data,error}=await sb.from("medvika_audit_count_lines")
      .select("id,system_stock_id,item_code,barcode,item_name,batch_no,category,expiry_date,condition,physical_qty,system_qty,count_status,match_status,pack_uom,pack_size,full_pack_qty,loose_qty,qty_basis")
      .eq("audit_id",currentAuditId).range(from,from+size-1);
    if(error) throw error;
    all.push(...(data||[]));
    if(!data || data.length<size) break;
    from += size;
  }
  return all;
}

function reconciliationExportRows(){
  return filteredReconciliationRows().map(r=>({
    Status:statusLabel(r),
    Item_Name:r.item_name,
    Item_Code:r.item_code||"",
    Batch_No:r.batch_no||"",
    Category:r.category||"",
    Expiry_Date:r.expiry_date||"",
    Condition:conditionLabel(r.condition),
    Pack_Size:r.pack_size??"",
    Full_Pack_Qty:r.full_pack_qty??"",
    Loose_Qty:r.loose_qty??"",
    Qty_Basis:r.qty_basis||"",
    Purchase_Rate_Ex_GST:r.purchase_rate,
    Rate_Status:r.purchase_rate===null?"Rate unavailable":"Valued",
    GST_Percent:r.gst_percent,
    System_Qty:r.system_qty,
    System_Qty_Display:pharmacyQtyDisplay(r.system_qty,r.pack_size,r.pack_uom),
    Physical_Qty:r.physical_qty,
    Physical_Qty_Display:pharmacyQtyDisplay(r.physical_qty,r.pack_size,r.pack_uom),
    Variance:r.variance,
    Variance_Display:varianceUnitDisplay(r.physical_qty,r.system_qty,r.pack_size),
    System_Value_Ex_GST:r.system_value,
    Physical_Value_Ex_GST:r.physical_value,
    Variance_Value_Ex_GST:r.variance_value,
    Recount:r.recount?"Yes":"No",
    Finding:r.finding
  }));
}

function downloadBlob(blob,fileName){
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=fileName;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function exportReconciliationCsv(){
  const rows=reconciliationExportRows();
  if(!rows.length){toast("No reconciliation rows to export","error");return;}
  const csv=window.Papa ? Papa.unparse(rows) : [
    Object.keys(rows[0]).join(","),
    ...rows.map(r=>Object.values(r).map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(","))
  ].join("\n");
  downloadBlob(new Blob([csv],{type:"text/csv;charset=utf-8"}),`Medvika_Reconciliation_${new Date().toISOString().slice(0,10)}.csv`);
}

function exportReconciliationExcel(){
  const rows=reconciliationExportRows();
  if(!rows.length){toast("No reconciliation rows to export","error");return;}
  if(!window.XLSX){toast("Excel library not loaded","error");return;}
  const ws=XLSX.utils.json_to_sheet(rows);
  ws["!cols"]=[
    {wch:18},{wch:32},{wch:16},{wch:16},{wch:22},
    {wch:14},{wch:16},{wch:12},{wch:12},{wch:12},{wch:10},{wch:36}
  ];
  const book=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book,ws,"Reconciliation");

  const summary=[
    ["Medvika Stock Audit Reconciliation"],
    ["Audit Project",projects.find(p=>p.id===currentAuditId)?.project_code||currentAuditId],
    ["Generated",new Date().toLocaleString("en-IN")],
    [],
    ["Metric","Count"],
    ["Matched",reconciliationRows.filter(r=>r.status==="matched").length],
    ["Excess",reconciliationRows.filter(r=>r.status==="excess").length],
    ["Short",reconciliationRows.filter(r=>r.status==="short").length],
    ["Missing",reconciliationRows.filter(r=>r.status==="missing").length],
    ["Unlisted Excess",reconciliationRows.filter(r=>r.status==="unlisted").length],
    ["Recount",reconciliationRows.filter(r=>r.recount).length]
  ];
  const sws=XLSX.utils.aoa_to_sheet(summary);
  XLSX.utils.book_append_sheet(book,sws,"Summary");

  XLSX.writeFile(book,`Medvika_Reconciliation_${new Date().toISOString().slice(0,10)}.xlsx`);
}

$("reconSearch")?.addEventListener("input",renderReconciliationTable);
$("reconStatusFilter")?.addEventListener("change",renderReconciliationTable);
$("reconCategoryFilter")?.addEventListener("change",renderReconciliationTable);
$("reconConditionFilter")?.addEventListener("change",renderReconciliationTable);
$("reloadReconButton")?.addEventListener("click",loadReconciliation);
$("exportReconCsvButton")?.addEventListener("click",exportReconciliationCsv);
$("exportReconExcelButton")?.addEventListener("click",exportReconciliationExcel);


async function saveNearExpiryRule(){
  const days=Number($("expiryRuleDays")?.value||180);
  if(!currentAuditId || !days) return;
  const {error}=await sb.from("medvika_audit_projects")
    .update({near_expiry_days:days})
    .eq("id",currentAuditId);
  if(error){toast(error.message,"error");return;}
  nearExpiryDays=days;
  if($("nearExpiryRule")) $("nearExpiryRule").textContent=`${days} days`;
  toast(`Near-expiry rule saved: ${days} days`);

  // Reclassify existing non-damaged physical count rows using their expiry dates.
  const counts=await fetchAllCountLinesForCondition();
  for(let i=0;i<counts.length;i+=300){
    const chunk=counts.slice(i,i+300);
    await Promise.all(chunk.map(async c=>{
      if(c.condition==="damaged") return;
      const next=classifyCondition(c.expiry_date,c.condition);
      if(next!==c.condition){
        await sb.from("medvika_audit_count_lines").update({condition:next}).eq("id",c.id);
      }
    }));
  }
  await Promise.all([loadDashboard(),loadExceptions(),loadReconciliation()]);
}

async function fetchAllCountLinesForCondition(){
  const all=[];let from=0;const size=1000;
  while(true){
    const {data,error}=await sb.from("medvika_audit_count_lines")
      .select("id,expiry_date,condition")
      .eq("audit_id",currentAuditId).range(from,from+size-1);
    if(error) throw error;
    all.push(...(data||[]));
    if(!data||data.length<size) break;
    from+=size;
  }
  return all;
}

$("saveExpiryRuleButton")?.addEventListener("click",saveNearExpiryRule);


// ============================================================
// STEP 6 - FINAL CLIENT AUDIT REPORT
// ============================================================
let finalReportData = null;

function daysFromAudit(expiryDate){
  if(!expiryDate) return null;
  const exp=new Date(expiryDate+"T23:59:59");
  const ref=auditReferenceDate();
  if(Number.isNaN(exp.getTime()) || Number.isNaN(ref.getTime())) return null;
  return Math.ceil((exp-ref)/(1000*60*60*24));
}

function systemExpiryClass(expiryDate){
  const d=daysFromAudit(expiryDate);
  if(d===null) return "no_expiry";
  if(d<0) return "expired";
  if(d<=Number(nearExpiryDays||180)) return "near_expiry";
  return "saleable";
}

function aggregatePhysicalConditions(counts){
  const out={saleable:0,near_expiry:0,expired:0,damaged:0,other:0};
  counts.forEach(c=>{
    const key=out.hasOwnProperty(c.condition)?c.condition:"other";
    out[key]+=Number(c.physical_qty||0);
  });
  return out;
}

function buildReportReconciliation(systemStock,counts){
  // Re-use the complete reconciliation engine if present.
  return buildReconciliationRows(systemStock,counts);
}

function reportStat(label,value,cssClass="",small=""){
  return `<div class="report-stat ${cssClass}"><span>${esc(label)}</span><strong>${typeof value==="string"?esc(value):fmtNum(value)}</strong>${small?`<small>${esc(small)}</small>`:""}</div>`;
}

async function fetchSignoff(){
  const {data,error}=await sb.from("medvika_audit_signoff")
    .select("*").eq("audit_id",currentAuditId).maybeSingle();
  if(error) throw error;
  return data||null;
}

async function saveReportDetails(){
  if(!currentAuditId) return;
  const payload={
    audit_id:currentAuditId,
    medvika_lead_name:$("reportLeadName")?.value.trim()||null,
    client_representative_name:$("reportClientRep")?.value.trim()||null,
    medvika_remarks:$("reportMedvikaRemarks")?.value.trim()||null,
    client_remarks:$("reportClientRemarks")?.value.trim()||null
  };
  const {error}=await sb.from("medvika_audit_signoff").upsert(payload,{onConflict:"audit_id"});
  if(error){toast(error.message,"error");return;}
  toast("Report details saved");
  await loadFinalReport();
}


function calculateFinancialImpact(systemStock,counts,recon){
  const stockById=new Map(systemStock.map(s=>[String(s.id),s]));
  let shortageLoss=0, excessValue=0, damagedValue=0, expiredValue=0, nearExpiryValue=0;
  let systemStockValue=0, physicalStockValue=0, unvaluedLines=0;

  systemStock.forEach(s=>{
    if(s.purchase_rate!==null && s.purchase_rate!==undefined){
      systemStockValue += Number(s.system_qty||0)*Number(s.purchase_rate);
    }
  });

  recon.forEach(r=>{
    if(r.purchase_rate===null || r.purchase_rate===undefined){
      if(r.status!=="matched") unvaluedLines++;
      return;
    }
    const vv=Number(r.variance_value||0);
    if(vv<0) shortageLoss += Math.abs(vv);
    if(vv>0) excessValue += vv;
    if(r.physical_value!==null) physicalStockValue += Number(r.physical_value||0);
  });

  counts.forEach(c=>{
    const s=c.system_stock_id ? stockById.get(String(c.system_stock_id)) : null;
    const rate=s?.purchase_rate;
    if(rate===null || rate===undefined) return;
    const value=Number(c.physical_qty||0)*Number(rate);
    if(c.condition==="damaged") damagedValue += value;
    else if(c.condition==="expired") expiredValue += value;
    else if(c.condition==="near_expiry") nearExpiryValue += value;
  });

  return {
    systemStockValue,physicalStockValue,shortageLoss,excessValue,
    netInventoryVariance:excessValue-shortageLoss,
    damagedValue,expiredValue,nearExpiryValue,
    totalRiskExposure:shortageLoss+damagedValue+expiredValue+nearExpiryValue,
    unvaluedLines
  };
}


function clampScore(v){ return Math.max(0,Math.min(100,Math.round(Number(v)||0))); }

function buildAuditHealthScore(data){
  const recon=data?.recon||[];
  const rc=data?.reconCounts||{};
  const pc=data?.physicalConditions||{};
  const se=data?.systemExpiry||{};
  const fin=data?.financials||{};

  const total=Math.max(1,recon.length);
  const matched=Number(rc.matched||0);
  const excess=Number(rc.excess||0);
  const short=Number(rc.short||0);
  const missing=Number(rc.missing||0);
  const unlisted=Number(rc.unlisted||0);
  const recount=Number(rc.recount||0);

  const accuracy=clampScore((matched/total)*100);
  const completion=clampScore(100-((recount/total)*100));

  const damagedLines=recon.filter(r=>r.condition==="damaged").length;
  const unvaluedLines=Number(fin.unvaluedLines||0);
  const expiryRiskLines=Number(se.expired_lines||0)+Number(se.near_lines||0);
  const damageRisk=clampScore(100-((damagedLines/total)*100*4));
  const expiryRisk=clampScore(100-((expiryRiskLines/total)*100*3));

  const stockValue=Math.max(1,Number(fin.systemStockValue||0));
  const exposure=Math.abs(Number(fin.shortageLoss||0))
    +Math.abs(Number(fin.excessValue||0))
    +Math.abs(Number(fin.damagedValue||0))
    +Math.abs(Number(fin.expiredValue||0))
    +Math.abs(Number(fin.nearExpiryValue||0));
  const financial=clampScore(100-Math.min(100,(exposure/stockValue)*100));

  const overall=clampScore(
    accuracy*0.35 +
    completion*0.20 +
    expiryRisk*0.15 +
    damageRisk*0.10 +
    financial*0.20
  );

  return {overall,accuracy,completion,expiryRisk,damageRisk,financial};
}

function scoreLabel(score){
  if(score>=90) return ["Excellent","risk-positive"];
  if(score>=75) return ["Good","risk-positive"];
  if(score>=60) return ["Needs Attention","risk-warn"];
  return ["High Risk","risk-negative"];
}



function firstFiniteNumber(...vals){
  for(const v of vals){
    const n=Number(v);
    if(v!==null && v!==undefined && v!=="" && Number.isFinite(n)) return n;
  }
  return null;
}

function resolvePurchaseRateForCount(count,systemStock){
  if(!count) return {rate:null,source:"unavailable"};

  // Direct rate on the physical/count row wins when present.
  const direct=firstFiniteNumber(count.purchase_rate,count.purchase_rate_ex_gst,count.ptr,count.cost_rate);
  if(direct!==null) return {rate:direct,source:"physical_count"};

  const stock=systemStock||[];
  let match=null;

  // Strongest match: linked system stock row.
  if(count.system_stock_id!==null && count.system_stock_id!==undefined){
    match=stock.find(s=>String(s.id)===String(count.system_stock_id))||null;
  }

  // Then item code + batch.
  if(!match && count.item_code){
    match=stock.find(s=>
      cleanCode(s.item_code)===cleanCode(count.item_code) &&
      cleanBatch(s.batch_no)===cleanBatch(count.batch_no)
    )||null;
  }

  // Then barcode + batch.
  if(!match && count.barcode){
    match=stock.find(s=>
      cleanCode(s.barcode)===cleanCode(count.barcode) &&
      cleanBatch(s.batch_no)===cleanBatch(count.batch_no)
    )||null;
  }

  // Then exact name + batch.
  if(!match && count.item_name){
    match=stock.find(s=>
      normName(s.item_name)===normName(count.item_name) &&
      cleanBatch(s.batch_no)===cleanBatch(count.batch_no)
    )||null;
  }

  // Safe fallback only when exactly one stock row exists for the item/code/barcode.
  if(!match && count.item_code){
    const c=stock.filter(s=>cleanCode(s.item_code)===cleanCode(count.item_code));
    if(c.length===1) match=c[0];
  }
  if(!match && count.barcode){
    const c=stock.filter(s=>cleanCode(s.barcode)===cleanCode(count.barcode));
    if(c.length===1) match=c[0];
  }
  if(!match && count.item_name){
    const c=stock.filter(s=>normName(s.item_name)===normName(count.item_name));
    if(c.length===1) match=c[0];
  }

  if(!match) return {rate:null,source:"unavailable"};

  const rate=firstFiniteNumber(match.purchase_rate,match.purchase_rate_ex_gst,match.ptr,match.cost_rate);
  return rate===null ? {rate:null,source:"unavailable"} : {rate,source:"system_stock"};
}

function rateLabel(v){
  return v===null||v===undefined||!Number.isFinite(Number(v)) ? "Rate unavailable" : fmtMoney(v);
}

function valueLabel(v,rateKnown=true){
  if(!rateKnown) return "Not valued";
  return fmtMoney(v||0);
}

function enrichCountsWithRates(counts,systemStock){
  return (counts||[]).map(c=>{
    const resolved=resolvePurchaseRateForCount(c,systemStock);
    return {
      ...c,
      resolved_purchase_rate:resolved.rate,
      resolved_rate_source:resolved.source,
      rate_available:resolved.rate!==null
    };
  });
}

function renderFinancialImpactChart(data){
  const box=$("financialImpactChart");
  if(!box) return;
  const f=data?.financials||{};
  const rows=[
    ["Shortage",Math.abs(Number(f.shortageLoss||0)),"bar-shortage"],
    ["Excess",Math.abs(Number(f.excessValue||0)),"bar-excess"],
    ["Expired",Math.abs(Number(f.expiredValue||0)),"bar-expired"],
    ["Damaged",Math.abs(Number(f.damagedValue||0)),"bar-damaged"],
    ["Near Expiry",Math.abs(Number(f.nearExpiryValue||0)),"bar-near"]
  ];
  const max=Math.max(...rows.map(r=>r[1]),0);
  if(max<=0){
    box.innerHTML=(Number(f.unvaluedLines||0)>0)
      ? `<div class="chart-empty">${Number(f.unvaluedLines||0)} exception line${Number(f.unvaluedLines||0)===1?"":"s"} could not be valued because purchase rate is unavailable.</div>`
      : '<div class="chart-empty">No financial risk exposure recorded.</div>';
    return;
  }
  box.innerHTML=rows.map(([label,value,cls])=>{
    const width=Math.max(2,(value/max)*100);
    return `<div class="chart-row">
      <span class="chart-label">${esc(label)}</span>
      <div class="chart-track"><div class="chart-bar ${cls}" style="width:${width.toFixed(1)}%"></div></div>
      <span class="chart-value">${esc(fmtMoney(value))}</span>
    </div>`;
  }).join("");
}

function zoneCompletionRows(data){
  const zones=data?.zones||[];
  const allocations=(data?.allocations||[]).filter(a=>a.active!==false);
  const counts=data?.counts||[];

  return zones.map(z=>{
    const allocatedIds=new Set(
      allocations.filter(a=>String(a.zone_id||"")===String(z.id)).map(a=>String(a.system_stock_id))
    );

    const countedIds=new Set(
      counts
        .filter(c=>String(c.zone_id||"")===String(z.id) && c.system_stock_id!==null && c.system_stock_id!==undefined)
        .map(c=>String(c.system_stock_id))
    );

    let percent=null;
    let basis="";
    if(allocatedIds.size>0){
      const done=[...countedIds].filter(id=>allocatedIds.has(id)).length;
      percent=Math.min(100,(done/allocatedIds.size)*100);
      basis=`${done}/${allocatedIds.size} allocated items`;
    }else{
      const status=String(z.status||"").toLowerCase();
      if(status==="completed"||status==="closed") percent=100;
      else if(status==="in_progress"||status==="counting") percent=50;
      else percent=0;
      basis="status based";
    }
    return {...z,percent,basis};
  });
}

function renderZoneCompletionChart(data){
  const box=$("zoneCompletionChart");
  if(!box) return;
  const rows=zoneCompletionRows(data);
  if(!rows.length){
    box.innerHTML='<div class="chart-empty">No zones configured.</div>';
    return;
  }
  box.innerHTML=rows.map(z=>{
    const p=Math.max(0,Math.min(100,Number(z.percent||0)));
    const cls=p>=80?"":p>=40?"warn":"danger";
    return `<div class="zone-chart-row" title="${esc(z.basis)}">
      <span class="chart-label">${esc(`${z.zone_code||""} ${z.zone_name||""}`.trim())}</span>
      <div class="zone-progress-track"><div class="zone-progress-bar ${cls}" style="width:${p.toFixed(1)}%"></div></div>
      <span class="chart-value">${p.toFixed(0)}%</span>
    </div>`;
  }).join("");
}

function renderExecutiveAuditIntelligence(data){
  if(!data) return;
  renderFinancialImpactChart(data);
  renderZoneCompletionChart(data);
  const s=buildAuditHealthScore(data);
  const [label,cls]=scoreLabel(s.overall);

  const scoreEl=$("auditHealthScore");
  const labelEl=$("auditHealthLabel");
  const narrative=$("auditHealthNarrative");
  const ring=document.querySelector(".score-ring");
  if(scoreEl) scoreEl.textContent=s.overall;
  if(labelEl){labelEl.textContent=label;labelEl.className=cls;}
  if(ring) ring.style.setProperty("--scoredeg",`${s.overall*3.6}deg`);

  const rc=data.reconCounts||{}, fin=data.financials||{};
  if(narrative){
    const exceptions=Number(rc.excess||0)+Number(rc.short||0)+Number(rc.missing||0)+Number(rc.unlisted||0);
    narrative.textContent=`${exceptions} material reconciliation exception${exceptions===1?"":"s"} identified. Financial risk exposure is ${fmtMoney(
      Math.abs(Number(fin.shortageLoss||0))+Math.abs(Number(fin.excessValue||0))+Math.abs(Number(fin.damagedValue||0))+Math.abs(Number(fin.expiredValue||0))+Math.abs(Number(fin.nearExpiryValue||0))
    )}.`;
  }

  const breakdown=[
    ["Inventory Accuracy",s.accuracy],
    ["Execution Completion",s.completion],
    ["Expiry Control",s.expiryRisk],
    ["Damage Control",s.damageRisk],
    ["Financial Control",s.financial]
  ];
  if($("auditScoreBreakdown")){
    $("auditScoreBreakdown").innerHTML=breakdown.map(([k,v])=>{
      const [lbl,klass]=scoreLabel(v);
      return `<div class="score-item"><span>${esc(k)}</span><strong class="${klass}">${v}/100</strong><small>${esc(lbl)}</small></div>`;
    }).join("");
  }

  const riskCards=[
    ["Shortage Loss",fmtMoney(fin.shortageLoss||0)],
    ["Excess Value",fmtMoney(fin.excessValue||0)],
    ["Expired Value",fmtMoney(fin.expiredValue||0)],
    ["Damaged Value",fmtMoney(fin.damagedValue||0)],
    ["Near Expiry Exposure",fmtMoney(fin.nearExpiryValue||0)],
    ["Unvalued Exception Lines",String(fin.unvaluedLines||0)]
  ];
  if($("financialRiskCards")){
    $("financialRiskCards").innerHTML=riskCards.map(([k,v])=>`<div class="report-stat"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join("");
  }

  const shortage=[...(data.recon||[])]
    .filter(r=>r.variance_value!==null && r.variance_value!==undefined && Number(r.variance_value)<0)
    .sort((a,b)=>Math.abs(Number(b.variance_value||0))-Math.abs(Number(a.variance_value||0)))
    .slice(0,10);

  const excess=[...(data.recon||[])]
    .filter(r=>r.variance_value!==null && r.variance_value!==undefined && Number(r.variance_value)>0)
    .sort((a,b)=>Math.abs(Number(b.variance_value||0))-Math.abs(Number(a.variance_value||0)))
    .slice(0,10);

  if($("topShortageRiskTable")){
    $("topShortageRiskTable").innerHTML=tableHtml(
      ["Item","Batch","Variance","Value"],
      shortage.map(r=>[
        r.item_name,
        r.batch_no||"—",
        varianceUnitDisplay(r.physical_qty,r.system_qty,r.pack_size),
        fmtMoney(Math.abs(Number(r.variance_value||0)))
      ])
    );
  }
  if($("topExcessRiskTable")){
    $("topExcessRiskTable").innerHTML=tableHtml(
      ["Item","Batch","Variance","Value"],
      excess.map(r=>[
        r.item_name,
        r.batch_no||"—",
        varianceUnitDisplay(r.physical_qty,r.system_qty,r.pack_size),
        fmtMoney(Math.abs(Number(r.variance_value||0)))
      ])
    );
  }

  renderManagementFindings(data,s);
}

function renderManagementFindings(data,scores){
  const rc=data.reconCounts||{}, fin=data.financials||{}, se=data.systemExpiry||{};
  const recon=data.recon||[];
  const findings=[];

  const shortageCount=Number(rc.short||0)+Number(rc.missing||0);
  const unlisted=Number(rc.unlisted||0);
  const recount=Number(rc.recount||0);
  const expiredLines=Number(se.expired_lines||0);
  const nearLines=Number(se.near_lines||0);
  const damagedLines=recon.filter(r=>r.condition==="damaged").length;

  if(unvaluedLines>0){
    findings.push({
      p:"High",
      t:`${unvaluedLines} material exception line${unvaluedLines===1?"":"s"} could not be financially valued`,
      a:"Purchase rate is unavailable for these items. Map/import purchase rate or resolve the item against Current Stock before relying on total financial exposure."
    });
  }

  if(Math.abs(Number(fin.shortageLoss||0))>0){
    findings.push({
      p:Math.abs(Number(fin.shortageLoss||0))>Math.max(5000,Number(fin.systemStockValue||0)*0.01)?"Critical":"High",
      t:`Shortage exposure of ${fmtMoney(Math.abs(Number(fin.shortageLoss||0)))}`,
      a:`Review ${shortageCount} shortage/missing line${shortageCount===1?"":"s"}, verify recounts and investigate high-value discrepancies before sign-off.`
    });
  }
  if(unlisted>0){
    findings.push({
      p:unlisted>=10?"High":"Medium",
      t:`${unlisted} unlisted physical stock line${unlisted===1?"":"s"} found`,
      a:"Validate purchase/GRN posting, batch master accuracy and stock-entry controls for items physically present but absent from system stock."
    });
  }
  if(expiredLines>0){
    findings.push({
      p:expiredLines>=5?"High":"Medium",
      t:`${expiredLines} expired current-stock line${expiredLines===1?"":"s"} identified`,
      a:`Segregate expired inventory immediately and initiate supplier return/write-off controls. Estimated expired value: ${fmtMoney(fin.expiredValue||0)}.`
    });
  }
  if(nearLines>0){
    findings.push({
      p:Number(fin.nearExpiryValue||0)>5000?"High":"Medium",
      t:`Near-expiry exposure of ${fmtMoney(fin.nearExpiryValue||0)}`,
      a:"Prioritize FEFO movement, supplier return opportunities and targeted sale-through for short-dated stock."
    });
  }
  if(damagedLines>0){
    findings.push({
      p:damagedLines>=5?"High":"Medium",
      t:`${damagedLines} damaged physical stock line${damagedLines===1?"":"s"} recorded`,
      a:`Quarantine non-saleable stock and document supplier claims/write-offs. Estimated damaged value: ${fmtMoney(fin.damagedValue||0)}.`
    });
  }
  if(recount>0){
    findings.push({
      p:recount>=10?"High":"Medium",
      t:`${recount} line${recount===1?"":"s"} require recount`,
      a:"Complete second-count verification before final audit closure, prioritizing high-value and controlled medicines."
    });
  }
  if(scores.accuracy>=95 && shortageCount===0 && unlisted===0){
    findings.push({
      p:"Low",
      t:"Strong inventory accuracy",
      a:"Maintain the current stock-control process and continue periodic cycle counts to preserve accuracy."
    });
  }
  if(!findings.length){
    findings.push({
      p:"Low",
      t:"No material control exceptions identified",
      a:"Proceed with routine management sign-off and retain the reconciliation export as the audit trail."
    });
  }

  const rank={Critical:4,High:3,Medium:2,Low:1};
  findings.sort((a,b)=>rank[b.p]-rank[a.p]);

  if($("managementFindings")){
    $("managementFindings").innerHTML=findings.map(f=>{
      const cls="finding-"+f.p.toLowerCase();
      return `<div class="finding-row"><div class="finding-priority ${cls}">${esc(f.p)}</div><div><h4>${esc(f.t)}</h4><p>${esc(f.a)}</p></div></div>`;
    }).join("");
  }
}

async function loadFinalReport(){
  if(!currentAuditId || !$("reportView")) return;

  try{
    const [projectRes,systemStock,counts,zoneRes,teamRes,allocationRes,signoff]=await Promise.all([
      sb.from("medvika_audit_projects")
        .select("*,medvika_audit_clients(client_name,business_name,contact_person)")
        .eq("id",currentAuditId).single(),
      fetchAllSystemStock(),
      fetchAllCountLinesDetailed(),
      sb.from("medvika_audit_zones").select("*").eq("audit_id",currentAuditId).order("sequence_no"),
      sb.from("medvika_audit_teams").select("*").eq("audit_id",currentAuditId).eq("active",true).order("team_code"),
      sb.from("medvika_audit_stock_allocations").select("system_stock_id,zone_id,team_id,active").eq("audit_id",currentAuditId).eq("active",true),
      fetchSignoff()
    ]);

    if(projectRes.error) throw projectRes.error;
    if(zoneRes.error) throw zoneRes.error;
    if(teamRes.error) throw teamRes.error;
    if(allocationRes.error) console.warn("Allocation data could not load for zone completion chart:",allocationRes.error);

    const project=projectRes.data;
    counts=enrichCountsWithRates(counts,systemStock);
    const client=project.medvika_audit_clients?.business_name || project.medvika_audit_clients?.client_name || "Client";
    const recon=buildReportReconciliation(systemStock,counts);

    const reconCounts={
      matched:recon.filter(r=>r.status==="matched").length,
      excess:recon.filter(r=>r.status==="excess").length,
      short:recon.filter(r=>r.status==="short").length,
      missing:recon.filter(r=>r.status==="missing").length,
      unlisted:recon.filter(r=>r.status==="unlisted").length,
      recount:recon.filter(r=>r.recount).length
    };

    const physicalConditions=aggregatePhysicalConditions(counts);
    const financials=calculateFinancialImpact(systemStock,counts,recon);

    const systemExpiryRows=systemStock.map(s=>({
      ...s,
      expiry_class:systemExpiryClass(s.expiry_date),
      days_to_expiry:daysFromAudit(s.expiry_date)
    }));

    const systemExpiry={
      expired_lines:systemExpiryRows.filter(r=>r.expiry_class==="expired").length,
      expired_qty:systemExpiryRows.filter(r=>r.expiry_class==="expired").reduce((a,r)=>a+Number(r.system_qty||0),0),
      near_lines:systemExpiryRows.filter(r=>r.expiry_class==="near_expiry").length,
      near_qty:systemExpiryRows.filter(r=>r.expiry_class==="near_expiry").reduce((a,r)=>a+Number(r.system_qty||0),0)
    };

    finalReportData={
      project,client,systemStock,counts,recon,zones:zoneRes.data||[],teams:teamRes.data||[],
      allocations:allocationRes.data||[],signoff,reconCounts,physicalConditions,systemExpiryRows,systemExpiry,financials
    };

    $("reportProjectMeta").textContent=`${client} • ${project.project_code||""} • ${project.location||""} • ${project.audit_date||""}`;
    $("reportProjectStatus").textContent=(project.status||"planning").replaceAll("_"," ");

    $("reportReconSummary").innerHTML=[
      reportStat("System Lines",systemStock.length,"","item + batch"),
      reportStat("Physical Lines",counts.length,"","count entries"),
      reportStat("Matched",reconCounts.matched,"ok"),
      reportStat("Excess",reconCounts.excess,"warn"),
      reportStat("Short",reconCounts.short,"danger"),
      reportStat("Missing",reconCounts.missing,"danger"),
      reportStat("Unlisted",reconCounts.unlisted,"danger"),
      reportStat("Recount",reconCounts.recount,"warn")
    ].join("");

    if($("reportFinancialSummary")){
      $("reportFinancialSummary").innerHTML=[
        reportStat("System Stock Value",fmtMoney(financials.systemStockValue),"","Ex-GST"),
        reportStat("Physical Stock Value",fmtMoney(financials.physicalStockValue),"","Ex-GST"),
        reportStat("Shortage Loss",fmtMoney(financials.shortageLoss),"danger","Ex-GST"),
        reportStat("Excess Value",fmtMoney(financials.excessValue),"warn","Ex-GST"),
        reportStat("Net Variance",fmtMoney(financials.netInventoryVariance),financials.netInventoryVariance<0?"danger":"ok","Ex-GST"),
        reportStat("Damaged Value",fmtMoney(financials.damagedValue),"danger","Ex-GST"),
        reportStat("Expired Value",fmtMoney(financials.expiredValue),"danger","Ex-GST"),
        reportStat("Near Expiry Exposure",fmtMoney(financials.nearExpiryValue),"warn","Ex-GST")
      ].join("");
    }

    $("reportSystemExpiry").innerHTML=[
      reportStat("Expired Lines",systemExpiry.expired_lines,"danger"),
      reportStat("Expired Qty",systemExpiry.expired_qty,"danger"),
      reportStat("Near Expiry Lines",systemExpiry.near_lines,"warn"),
      reportStat("Near Expiry Qty",systemExpiry.near_qty,"warn")
    ].join("");

    $("reportPhysicalCondition").innerHTML=[
      reportStat("Saleable Qty",physicalConditions.saleable,"ok"),
      reportStat("Damaged Qty",physicalConditions.damaged,"danger"),
      reportStat("Expired Qty",physicalConditions.expired,"danger"),
      reportStat("Near Expiry Qty",physicalConditions.near_expiry,"warn")
    ].join("");

    const exposureRows=systemExpiryRows
      .filter(r=>["expired","near_expiry"].includes(r.expiry_class))
      .sort((a,b)=>(a.days_to_expiry??999999)-(b.days_to_expiry??999999))
      .slice(0,100);

    $("reportSystemExpiryTable").innerHTML=tableHtml(
      ["Item","Batch","Expiry","System Qty","Finding"],
      exposureRows.map(r=>[
        r.item_name,r.batch_no||"—",r.expiry_date||"—",pharmacyQtyDisplay(r.system_qty,r.pack_size,r.pack_uom||"Pack"),
        r.expiry_class==="expired"?"Expired":"Near Expiry"
      ])
    );

    const conditionRows=counts
      .filter(c=>["damaged","expired","near_expiry"].includes(c.condition))
      .sort((a,b)=>String(a.item_name).localeCompare(String(b.item_name)))
      .slice(0,150);

    $("reportConditionTable").innerHTML=tableHtml(
      ["Item","Batch","Expiry","Qty","Condition"],
      conditionRows.map(c=>[
        c.item_name,c.batch_no||"—",c.expiry_date||"—",pharmacyQtyDisplay(c.physical_qty,c.pack_size,c.pack_uom||"Pack"),conditionLabel(c.condition)
      ])
    );

    const zoneCompletion=zoneCompletionRows(finalReportData);
    $("reportZoneTable").innerHTML=tableHtml(
      ["Zone","Category","Status","Completion","Basis","Supervisor"],
      zoneCompletion.map(z=>[
        `${z.zone_code} - ${z.zone_name}`,z.category||"—",z.status,
        `${Number(z.percent||0).toFixed(0)}%`,z.basis,z.assigned_supervisor||"—"
      ])
    );

    const exceptions=recon.filter(r=>r.status!=="matched");
    $("reportExceptionTable").innerHTML=tableHtml(
      ["Status","Item","Code","Batch","System","Physical","Variance","Rate Ex-GST","Variance Value","Condition"],
      exceptions.slice(0,500).map(r=>[
        statusLabel(r),r.item_name,r.item_code||"—",r.batch_no||"—",
        pharmacyQtyDisplay(r.system_qty,r.pack_size,r.pack_uom),
        pharmacyQtyDisplay(r.physical_qty,r.pack_size,r.pack_uom),
        varianceUnitDisplay(r.physical_qty,r.system_qty,r.pack_size),
        r.purchase_rate===null?"—":fmtMoney(r.purchase_rate),
        r.variance_value===null?"—":fmtMoney(r.variance_value),
        conditionLabel(r.condition)
      ])
    );

    renderExecutiveAuditIntelligence(finalReportData);

    if($("reportLeadName")) $("reportLeadName").value=signoff?.medvika_lead_name||"";
    if($("reportClientRep")) $("reportClientRep").value=signoff?.client_representative_name||project.medvika_audit_clients?.contact_person||"";
    if($("reportMedvikaRemarks")) $("reportMedvikaRemarks").value=signoff?.medvika_remarks||"";
    if($("reportClientRemarks")) $("reportClientRemarks").value=signoff?.client_remarks||"";

  }catch(err){
    console.error("Final report load error:",err);
    toast("Final report could not load: "+(err.message||err),"error");
  }
}

function reportExcelRows(){
  if(!finalReportData) return [];
  return finalReportData.recon.map(r=>({
    Status:statusLabel(r),
    Item_Name:r.item_name,
    Item_Code:r.item_code||"",
    Batch_No:r.batch_no||"",
    Category:r.category||"",
    Expiry_Date:r.expiry_date||"",
    Condition:conditionLabel(r.condition),
    Purchase_Rate_Ex_GST:r.purchase_rate,
    GST_Percent:r.gst_percent,
    System_Qty:r.system_qty,
    System_Qty_Display:pharmacyQtyDisplay(r.system_qty,r.pack_size,r.pack_uom),
    Physical_Qty:r.physical_qty,
    Physical_Qty_Display:pharmacyQtyDisplay(r.physical_qty,r.pack_size,r.pack_uom),
    Variance:r.variance,
    Variance_Display:varianceUnitDisplay(r.physical_qty,r.system_qty,r.pack_size),
    System_Value_Ex_GST:r.system_value,
    Physical_Value_Ex_GST:r.physical_value,
    Variance_Value_Ex_GST:r.variance_value,
    Recount:r.recount?"Yes":"No",
    Finding:r.finding
  }));
}

function exportFinalReportExcel(){
  if(!finalReportData){toast("Load report first","error");return;}
  if(!window.XLSX){toast("Excel library not loaded","error");return;}

  const book=XLSX.utils.book_new();

  const summaryRows=[
    ["Medvika Stock Audit - Final Report"],
    ["Client",finalReportData.client],
    ["Project",finalReportData.project.project_code||""],
    ["Audit Date",finalReportData.project.audit_date||""],
    ["Location",finalReportData.project.location||""],
    [],
    ["Reconciliation","Count"],
    ["Matched",finalReportData.reconCounts.matched],
    ["Excess",finalReportData.reconCounts.excess],
    ["Short",finalReportData.reconCounts.short],
    ["Missing",finalReportData.reconCounts.missing],
    ["Unlisted Excess",finalReportData.reconCounts.unlisted],
    ["Recount",finalReportData.reconCounts.recount],
    [],
    ["Physical Condition","Quantity"],
    ["Saleable",finalReportData.physicalConditions.saleable],
    ["Damaged",finalReportData.physicalConditions.damaged],
    ["Expired",finalReportData.physicalConditions.expired],
    ["Near Expiry",finalReportData.physicalConditions.near_expiry],
    [],
    ["Current Stock Expiry Exposure","Value"],
    ["Expired Lines",finalReportData.systemExpiry.expired_lines],
    ["Expired Qty",finalReportData.systemExpiry.expired_qty],
    ["Near Expiry Lines",finalReportData.systemExpiry.near_lines],
    ["Near Expiry Qty",finalReportData.systemExpiry.near_qty],
    [],
    ["Financial Impact - Ex-GST","Value"],
    ["System Stock Value",finalReportData.financials.systemStockValue],
    ["Physical Stock Value",finalReportData.financials.physicalStockValue],
    ["Shortage Loss",finalReportData.financials.shortageLoss],
    ["Excess Value",finalReportData.financials.excessValue],
    ["Net Inventory Variance",finalReportData.financials.netInventoryVariance],
    ["Damaged Value",finalReportData.financials.damagedValue],
    ["Expired Value",finalReportData.financials.expiredValue],
    ["Near Expiry Exposure",finalReportData.financials.nearExpiryValue],
    ["Unvalued Exception Lines",finalReportData.financials.unvaluedLines],
    [],
    ["Valuation Basis","Purchase Rate excluding GST. GST % stored separately when supplied."]
  ];
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(summaryRows),"Summary");

  XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(reportExcelRows()),"Reconciliation");

  const conditionRows=finalReportData.counts
    .filter(c=>["damaged","expired","near_expiry"].includes(c.condition))
    .map(c=>({
      Item:c.item_name,Code:c.item_code||"",Batch:c.batch_no||"",
      Expiry:c.expiry_date||"",Physical_Qty:c.physical_qty,
      Physical_Qty_Display:pharmacyQtyDisplay(c.physical_qty,c.pack_size,c.pack_uom||"Pack"),
      Condition:conditionLabel(c.condition)
    }));
  XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(conditionRows),"Condition Findings");

  const expiryRows=finalReportData.systemExpiryRows
    .filter(r=>["expired","near_expiry"].includes(r.expiry_class))
    .map(r=>({
      Item:r.item_name,Code:r.item_code||"",Batch:r.batch_no||"",
      Expiry:r.expiry_date||"",System_Qty:r.system_qty,
      System_Qty_Display:pharmacyQtyDisplay(r.system_qty,r.pack_size,r.pack_uom||"Pack"),
      Finding:r.expiry_class==="expired"?"Expired":"Near Expiry"
    }));
  XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(expiryRows),"System Expiry Exposure");

  XLSX.writeFile(book,`Medvika_Final_Audit_Report_${finalReportData.project.project_code||"Audit"}.xlsx`);
}

function safePdfText(v){
  return String(v??"").replace(/[^\x20-\x7E]/g," ");
}

async function logoDataUrl(){
  try{
    const res=await fetch("./logo.png");
    const blob=await res.blob();
    return await new Promise((resolve,reject)=>{
      const fr=new FileReader();
      fr.onload=()=>resolve(fr.result);
      fr.onerror=reject;
      fr.readAsDataURL(blob);
    });
  }catch(e){return null;}
}

async function exportFinalReportPdf(){
  if(!finalReportData){toast("Load report first","error");return;}
  if(!window.jspdf?.jsPDF){toast("PDF library not loaded","error");return;}

  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
  const navy=[11,60,93], green=[11,143,77], dark=[29,43,54], grey=[102,117,128];
  const pageW=210, margin=15;
  let y=15;

  const addHeader=async(first=false)=>{
    const logo=await logoDataUrl();
    if(logo){
      try{doc.addImage(logo,"PNG",margin,9,43,13);}catch(e){}
    }
    doc.setTextColor(...navy);
    doc.setFont("helvetica","bold");
    doc.setFontSize(first?16:10);
    doc.text(first?"STOCK AUDIT - FINAL REPORT":"MEDVIKA HEALTHCARE SOLUTIONS",first?margin+49:margin,first?16:12);
    if(first){
      doc.setFontSize(8);
      doc.setTextColor(...green);
      doc.text("Independent verification | Inventory control | Actionable reporting",margin+49,21);
    }
    doc.setDrawColor(215,225,231);
    doc.line(margin,27,pageW-margin,27);
    y=33;
  };

  const footer=()=>{
    const n=doc.getNumberOfPages();
    for(let i=1;i<=n;i++){
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(...grey);
      doc.text("Confidential - Medvika Healthcare Solutions",margin,290);
      doc.text(`Page ${i} of ${n}`,pageW-margin,290,{align:"right"});
    }
  };

  await addHeader(true);

  doc.setFontSize(9); doc.setTextColor(...dark); doc.setFont("helvetica","normal");
  const meta=[
    ["Client",finalReportData.client],
    ["Project",finalReportData.project.project_code||""],
    ["Audit Date",finalReportData.project.audit_date||""],
    ["Location",finalReportData.project.location||""],
    ["Audit Status",(finalReportData.project.status||"").replaceAll("_"," ")]
  ];
  doc.autoTable({
    startY:y,head:[["Engagement","Details"]],body:meta,
    theme:"grid",styles:{fontSize:8,cellPadding:2.2},
    headStyles:{fillColor:navy,textColor:[255,255,255]},
    columnStyles:{0:{fontStyle:"bold",cellWidth:35}}
  });
  y=doc.lastAutoTable.finalY+7;

  doc.setTextColor(...navy); doc.setFont("helvetica","bold"); doc.setFontSize(12);
  doc.text("Executive Summary",margin,y); y+=4;

  const rc=finalReportData.reconCounts, pc=finalReportData.physicalConditions, se=finalReportData.systemExpiry;
  doc.autoTable({
    startY:y,
    head:[["Metric","Count","Metric","Count"]],
    body:[
      ["Matched",rc.matched,"Excess",rc.excess],
      ["Short",rc.short,"Missing",rc.missing],
      ["Unlisted Excess",rc.unlisted,"Recount",rc.recount],
      ["Damaged Qty",pc.damaged,"Expired Physical Qty",pc.expired],
      ["Near Expiry Physical Qty",pc.near_expiry,"Saleable Qty",pc.saleable],
      ["System Expired Lines",se.expired_lines,"System Near Expiry Lines",se.near_lines],
      ["Shortage Loss Ex-GST",fmtMoney(finalReportData.financials.shortageLoss),"Excess Value Ex-GST",fmtMoney(finalReportData.financials.excessValue)],
      ["Damaged Value Ex-GST",fmtMoney(finalReportData.financials.damagedValue),"Expired Value Ex-GST",fmtMoney(finalReportData.financials.expiredValue)],
      ["Net Inventory Variance",fmtMoney(finalReportData.financials.netInventoryVariance),"Near Expiry Exposure",fmtMoney(finalReportData.financials.nearExpiryValue)],
      ["Unvalued Exception Lines",finalReportData.financials.unvaluedLines||0,"Valuation Note",(finalReportData.financials.unvaluedLines||0)>0?"Some exceptions have no purchase rate":"All material exceptions valued"]
    ],
    theme:"grid",styles:{fontSize:8,cellPadding:2},
    headStyles:{fillColor:green,textColor:[255,255,255]}
  });
  y=doc.lastAutoTable.finalY+7;

  const scoreData=buildAuditHealthScore(finalReportData);
  const scoreLbl=scoreLabel(scoreData.overall)[0];
  if(y>245){doc.addPage();await addHeader();}
  doc.setTextColor(...navy);doc.setFontSize(11);doc.setFont("helvetica","bold");
  doc.text("Executive Audit Intelligence",margin,y); y+=3;
  doc.autoTable({
    startY:y,
    head:[["Audit Health","Accuracy","Completion","Expiry","Damage","Financial"]],
    body:[[
      `${scoreData.overall}/100 - ${scoreLbl}`,
      `${scoreData.accuracy}/100`,
      `${scoreData.completion}/100`,
      `${scoreData.expiryRisk}/100`,
      `${scoreData.damageRisk}/100`,
      `${scoreData.financial}/100`
    ]],
    theme:"grid",
    styles:{fontSize:8,cellPadding:2},
    headStyles:{fillColor:green,textColor:[255,255,255]}
  });
  y=doc.lastAutoTable.finalY+7;


  if(y>235){doc.addPage();await addHeader();}
  doc.setTextColor(...navy);doc.setFontSize(11);doc.setFont("helvetica","bold");
  doc.text("Financial Risk & Zone Completion",margin,y); y+=3;

  const f=finalReportData.financials||{};
  const zc=zoneCompletionRows(finalReportData);
  doc.autoTable({
    startY:y,
    head:[["Risk","Value","Zone","Completion"]],
    body:[
      ["Shortage",fmtMoney(Math.abs(Number(f.shortageLoss||0))),zc[0]?`${zc[0].zone_code} - ${zc[0].zone_name}`:"-",zc[0]?`${Number(zc[0].percent||0).toFixed(0)}%`:"-"],
      ["Excess",fmtMoney(Math.abs(Number(f.excessValue||0))),zc[1]?`${zc[1].zone_code} - ${zc[1].zone_name}`:"-",zc[1]?`${Number(zc[1].percent||0).toFixed(0)}%`:"-"],
      ["Expired",fmtMoney(Math.abs(Number(f.expiredValue||0))),zc[2]?`${zc[2].zone_code} - ${zc[2].zone_name}`:"-",zc[2]?`${Number(zc[2].percent||0).toFixed(0)}%`:"-"],
      ["Damaged",fmtMoney(Math.abs(Number(f.damagedValue||0))),zc[3]?`${zc[3].zone_code} - ${zc[3].zone_name}`:"-",zc[3]?`${Number(zc[3].percent||0).toFixed(0)}%`:"-"],
      ["Near Expiry",fmtMoney(Math.abs(Number(f.nearExpiryValue||0))),zc[4]?`${zc[4].zone_code} - ${zc[4].zone_name}`:"-",zc[4]?`${Number(zc[4].percent||0).toFixed(0)}%`:"-"]
    ],
    theme:"grid",styles:{fontSize:8,cellPadding:2},
    headStyles:{fillColor:navy,textColor:[255,255,255]}
  });
  y=doc.lastAutoTable.finalY+7;

  const exceptions=finalReportData.recon.filter(r=>r.status!=="matched");
  if(y>245){doc.addPage();await addHeader();}
  doc.setTextColor(...navy);doc.setFontSize(11);doc.setFont("helvetica","bold");
  doc.text("Material Reconciliation Exceptions",margin,y); y+=3;
  doc.autoTable({
    startY:y,
    head:[["Status","Item","Batch","System","Physical","Variance"]],
    body:exceptions.map(r=>[
      statusLabel(r),safePdfText(r.item_name),safePdfText(r.batch_no||"-"),
      safePdfText(pharmacyQtyDisplay(r.system_qty,r.pack_size,r.pack_uom)),
      safePdfText(pharmacyQtyDisplay(r.physical_qty,r.pack_size,r.pack_uom)),
      safePdfText(varianceUnitDisplay(r.physical_qty,r.system_qty,r.pack_size))
    ]),
    theme:"striped",
    styles:{fontSize:7,cellPadding:1.6,overflow:"linebreak"},
    headStyles:{fillColor:navy,textColor:[255,255,255]},
    columnStyles:{1:{cellWidth:55},2:{cellWidth:27}},
    margin:{left:margin,right:margin,top:31,bottom:15}
  });
  y=doc.lastAutoTable.finalY+7;

  if(y>235){doc.addPage();await addHeader();}
  doc.setTextColor(...navy);doc.setFontSize(11);doc.setFont("helvetica","bold");
  doc.text("Expiry & Condition Findings",margin,y); y+=3;

  const findings=finalReportData.counts.filter(c=>["damaged","expired","near_expiry"].includes(c.condition));
  doc.autoTable({
    startY:y,
    head:[["Item","Batch","Expiry","Qty","Condition"]],
    body:findings.map(c=>[
      safePdfText(c.item_name),safePdfText(c.batch_no||"-"),c.expiry_date||"-",
      safePdfText(pharmacyQtyDisplay(c.physical_qty,c.pack_size,c.pack_uom||"Pack")),conditionLabel(c.condition)
    ]),
    theme:"grid",
    styles:{fontSize:7,cellPadding:1.6},
    headStyles:{fillColor:green,textColor:[255,255,255]},
    margin:{left:margin,right:margin,top:31,bottom:15}
  });
  y=doc.lastAutoTable.finalY+7;

  if(y>225){doc.addPage();await addHeader();}
  doc.setTextColor(...navy);doc.setFontSize(11);doc.setFont("helvetica","bold");
  doc.text("Zone Completion",margin,y); y+=3;
  doc.autoTable({
    startY:y,
    head:[["Zone","Category","Status","Supervisor"]],
    body:finalReportData.zones.map(z=>[
      safePdfText(`${z.zone_code} - ${z.zone_name}`),safePdfText(z.category||"-"),
      safePdfText(z.status),safePdfText(z.assigned_supervisor||"-")
    ]),
    theme:"grid",styles:{fontSize:7.5,cellPadding:1.8},
    headStyles:{fillColor:navy,textColor:[255,255,255]}
  });
  y=doc.lastAutoTable.finalY+7;

  const lead=$("reportLeadName")?.value.trim()||finalReportData.signoff?.medvika_lead_name||"";
  const clientRep=$("reportClientRep")?.value.trim()||finalReportData.signoff?.client_representative_name||"";
  const medRemarks=$("reportMedvikaRemarks")?.value.trim()||finalReportData.signoff?.medvika_remarks||"No additional observations recorded.";
  const clientRemarks=$("reportClientRemarks")?.value.trim()||finalReportData.signoff?.client_remarks||"";

  if(y>215){doc.addPage();await addHeader();}
  doc.setTextColor(...navy);doc.setFontSize(11);doc.setFont("helvetica","bold");
  doc.text("Management Observations",margin,y); y+=5;
  doc.setTextColor(...dark);doc.setFontSize(8);doc.setFont("helvetica","normal");
  const lines=doc.splitTextToSize(safePdfText(medRemarks),180);
  doc.text(lines,margin,y); y+=Math.max(12,lines.length*4)+4;

  if(clientRemarks){
    doc.setTextColor(...navy);doc.setFont("helvetica","bold");doc.text("Client Remarks",margin,y); y+=5;
    doc.setTextColor(...dark);doc.setFont("helvetica","normal");
    const cl=doc.splitTextToSize(safePdfText(clientRemarks),180);
    doc.text(cl,margin,y);y+=Math.max(10,cl.length*4)+4;
  }

  doc.setDrawColor(215,225,231);
  doc.line(margin,y,pageW-margin,y); y+=8;
  doc.setFontSize(8);doc.setTextColor(...dark);
  doc.text(`Medvika Audit Lead: ${safePdfText(lead||"________________")}`,margin,y);
  doc.text(`Client Representative: ${safePdfText(clientRep||"________________")}`,110,y);
  y+=14;
  doc.text("Signature: __________________________",margin,y);
  doc.text("Signature: __________________________",110,y);

  y+=14;
  doc.setFontSize(7.5);doc.setTextColor(...grey);
  doc.text("Valuation basis: Purchase Rate excluding GST. GST % is stored separately where provided.",margin,y);
  y+=4;
  doc.text("Detailed item-and-batch reconciliation is available in the accompanying Excel/CSV export.",margin,y);

  footer();
  doc.save(`Medvika_Final_Audit_Report_${finalReportData.project.project_code||"Audit"}.pdf`);
}

$("refreshReportButton")?.addEventListener("click",loadFinalReport);
$("saveReportRemarksButton")?.addEventListener("click",saveReportDetails);
$("exportReportExcelButton")?.addEventListener("click",exportFinalReportExcel);
$("exportReportPdfButton")?.addEventListener("click",exportFinalReportPdf);


// ============================================================
// STEP 8 - IMPORTED DATA DELETE / RESET CONTROLS
// ============================================================
async function getCurrentAuditLabel(){
  const p=projects.find(x=>x.id===currentAuditId);
  return p?.project_code || "current audit";
}

async function deletePhysicalAuditData(){
  if(!currentAuditId) return;
  const label=await getCurrentAuditLabel();
  const ok=window.confirm(
    `Delete ALL physical count data for ${label}?\n\n`+
    `This will remove physical count rows, recount records and physical-import history.\n`+
    `Current/System Stock will NOT be deleted.\n\nThis action cannot be undone.`
  );
  if(!ok) return;

  const btn=$("deletePhysicalDataButton");
  const msg=$("deleteDataMessage");
  if(btn){btn.disabled=true;btn.textContent="Deleting...";}
  if(msg) msg.textContent="";

  try{
    let r=await sb.from("medvika_audit_recounts").delete().eq("audit_id",currentAuditId);
    if(r.error) throw r.error;

    r=await sb.from("medvika_audit_expiry_actions").delete().eq("audit_id",currentAuditId);
    if(r.error) throw r.error;

    r=await sb.from("medvika_audit_count_lines").delete().eq("audit_id",currentAuditId);
    if(r.error) throw r.error;

    r=await sb.from("medvika_audit_import_jobs")
      .delete()
      .eq("audit_id",currentAuditId)
      .eq("import_type","physical_count");
    if(r.error) throw r.error;

    if(msg) msg.textContent="Physical count data deleted successfully.";
    toast("Physical count data deleted");
    await loadCurrentAudit();
  }catch(err){
    console.error("Delete physical data error:",err);
    if(msg) msg.textContent=err.message||"Unable to delete physical data.";
    toast(err.message||"Unable to delete physical data","error");
  }finally{
    if(btn){btn.disabled=false;btn.textContent="Delete Physical Count Data";}
  }
}

async function deleteSystemAuditData(){
  if(!currentAuditId) return;

  try{
    const {count,error}=await sb.from("medvika_audit_count_lines")
      .select("id",{count:"exact",head:true})
      .eq("audit_id",currentAuditId);
    if(error) throw error;

    if(Number(count||0)>0){
      const msg="Physical count data exists. Delete Physical Count Data first, or use Reset Imported Audit Data.";
      if($("deleteDataMessage")) $("deleteDataMessage").textContent=msg;
      toast(msg,"error");
      return;
    }
  }catch(err){
    toast(err.message||"Unable to check physical data","error");
    return;
  }

  const label=await getCurrentAuditLabel();
  const ok=window.confirm(
    `Delete ALL Current/System Stock data for ${label}?\n\n`+
    `This removes the imported stock master and system-stock import history.\n`+
    `The audit project, zones and teams will remain.\n\nThis action cannot be undone.`
  );
  if(!ok) return;

  const btn=$("deleteSystemDataButton");
  const msg=$("deleteDataMessage");
  if(btn){btn.disabled=true;btn.textContent="Deleting...";}
  if(msg) msg.textContent="";

  try{
    let r=await sb.from("medvika_audit_system_stock").delete().eq("audit_id",currentAuditId);
    if(r.error) throw r.error;

    r=await sb.from("medvika_audit_import_jobs")
      .delete()
      .eq("audit_id",currentAuditId)
      .eq("import_type","system_stock");
    if(r.error) throw r.error;

    if(msg) msg.textContent="Current/System Stock data deleted successfully.";
    toast("Current stock data deleted");
    await loadCurrentAudit();
  }catch(err){
    console.error("Delete system data error:",err);
    if(msg) msg.textContent=err.message||"Unable to delete current stock data.";
    toast(err.message||"Unable to delete current stock data","error");
  }finally{
    if(btn){btn.disabled=false;btn.textContent="Delete Current Stock Data";}
  }
}

async function resetImportedAuditData(){
  if(!currentAuditId) return;
  const label=await getCurrentAuditLabel();

  const first=window.confirm(
    `RESET ALL IMPORTED AUDIT DATA for ${label}?\n\n`+
    `This will delete:\n`+
    `• Current/System Stock\n`+
    `• Physical Count data\n`+
    `• Recount records\n`+
    `• Expiry action records\n`+
    `• Import history\n\n`+
    `Client, audit project, zones and teams will be kept.`
  );
  if(!first) return;

  const typed=window.prompt(`For safety, type RESET to confirm deletion for ${label}:`);
  if(String(typed||"").trim().toUpperCase()!=="RESET"){
    toast("Reset cancelled");
    return;
  }

  const btn=$("resetAuditDataButton");
  const msg=$("deleteDataMessage");
  if(btn){btn.disabled=true;btn.textContent="Resetting...";}
  if(msg) msg.textContent="";

  try{
    let r=await sb.from("medvika_audit_recounts").delete().eq("audit_id",currentAuditId);
    if(r.error) throw r.error;

    r=await sb.from("medvika_audit_expiry_actions").delete().eq("audit_id",currentAuditId);
    if(r.error) throw r.error;

    r=await sb.from("medvika_audit_count_lines").delete().eq("audit_id",currentAuditId);
    if(r.error) throw r.error;

    r=await sb.from("medvika_audit_system_stock").delete().eq("audit_id",currentAuditId);
    if(r.error) throw r.error;

    r=await sb.from("medvika_audit_import_jobs").delete().eq("audit_id",currentAuditId);
    if(r.error) throw r.error;

    if(msg) msg.textContent="Imported audit data reset successfully.";
    toast("Imported audit data reset");
    await loadCurrentAudit();
  }catch(err){
    console.error("Reset audit data error:",err);
    if(msg) msg.textContent=err.message||"Unable to reset audit data.";
    toast(err.message||"Unable to reset audit data","error");
  }finally{
    if(btn){btn.disabled=false;btn.textContent="Reset Imported Audit Data";}
  }
}

$("deletePhysicalDataButton")?.addEventListener("click",deletePhysicalAuditData);
$("deleteSystemDataButton")?.addEventListener("click",deleteSystemAuditData);
$("resetAuditDataButton")?.addEventListener("click",resetImportedAuditData);


function updateManualQtyPreview(){
  const out=$("calculatedPhysicalQty");
  if(!out) return;
  const basis=$("qtyBasis")?.value||"decimal";
  const qty=calculateDecimalPackQty({
    physicalQty:$("physicalQty")?.value,
    fullPackQty:toNumber($("fullPackQty")?.value),
    looseQty:toNumber($("looseQty")?.value),
    packSize:toNumber($("packSize")?.value),
    qtyBasis:basis
  });
  if(qty===null){
    out.textContent="—";
    return;
  }
  out.textContent=`${Number(qty).toFixed(3)} ${$("packUom")?.value||"pack basis"}`;
}

["physicalQty","fullPackQty","looseQty","packSize","qtyBasis","packUom"].forEach(id=>{
  $(id)?.addEventListener("input",updateManualQtyPreview);
  $(id)?.addEventListener("change",updateManualQtyPreview);
});

requireSession();
