const SUPABASE_URL = "https://etevzodzxhsdwidtrmwv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_iKWBOAxrWTZfU6Qb5PYd5Q_0y80GEOw";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentAuditId = null;
let projects = [];
let zones = [];
let teams = [];

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
    $("appShell").hidden = true;
  }
}

function showApp(user){
  $("loginView").hidden = true;
  $("appShell").hidden = false;
  $("signedInAs").textContent = user.email || "Authorised user";
}

$("loginForm").addEventListener("submit", async (e)=>{
  e.preventDefault();
  $("loginMessage").textContent="";
  $("loginButton").disabled=true;
  $("loginButton").textContent="Signing in…";
  const {data,error}=await sb.auth.signInWithPassword({
    email:$("loginEmail").value.trim(),
    password:$("loginPassword").value
  });
  $("loginButton").disabled=false;
  $("loginButton").textContent="Sign in";
  if(error){ $("loginMessage").textContent=error.message; return; }
  showApp(data.user);
  await bootstrap();
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
    const titles={dashboard:"Audit Dashboard",count:"Physical Stock Count",zones:"Zones & Teams",exceptions:"Exceptions & Controls"};
    $("viewTitle").textContent=titles[view]||"Stock Audit";
    if(view==="count") $("itemName").focus();
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
  await Promise.all([loadProjectDetails(),loadZonesAndTeams(),loadDashboard(),loadRecentCounts(),loadExceptions()]);
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
    .select("id,item_name,item_code,batch_no,physical_qty,system_qty,count_status,condition,counted_at")
    .eq("audit_id",currentAuditId)
    .order("counted_at",{ascending:false})
    .limit(30);
  if(error){toast(error.message,"error");return;}
  const rows=data||[];
  $("recentCountBody").innerHTML=rows.length?rows.slice(0,12).map(r=>{
    const variance=(r.system_qty===null||r.system_qty===undefined)?"—":Number(r.physical_qty)-Number(r.system_qty);
    const cls=variance==="—"?"":varianceClass(variance);
    return `<tr><td>${fmtDate(r.counted_at)}</td><td>${esc(r.item_name)}</td><td>${esc(r.batch_no||"—")}</td><td>${esc(r.physical_qty)}</td><td>${esc(r.system_qty??"—")}</td><td class="${cls}">${esc(variance)}</td><td>${esc(r.count_status)}</td></tr>`;
  }).join(""):'<tr><td colspan="7" class="empty">No count entries yet.</td></tr>';

  $("mobileCountList").innerHTML=rows.length?rows.map(r=>{
    const variance=(r.system_qty===null||r.system_qty===undefined)?null:Number(r.physical_qty)-Number(r.system_qty);
    return `<div class="count-entry"><div class="count-entry-head"><h4>${esc(r.item_name)}</h4><span class="qty">${esc(r.physical_qty)}</span></div><p>${esc(r.item_code||"No code")} • Batch ${esc(r.batch_no||"—")} • ${esc(r.condition.replaceAll("_"," "))}${variance===null?"":` • Var: ${esc(variance)}`}</p></div>`;
  }).join(""):'<div class="empty">No count entries yet.</div>';
}

function expiryMonthToDate(v){
  if(!v) return null;
  const [y,m]=v.split("-").map(Number);
  return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
}

$("countForm").addEventListener("submit", async e=>{
  e.preventDefault();
  if(!currentAuditId) return;
  const btn=$("saveCountButton");
  btn.disabled=true; btn.textContent="Saving…";
  const record={
    audit_id:currentAuditId,
    zone_id:$("countZone").value,
    team_id:$("countTeam").value,
    item_name:$("itemName").value.trim(),
    item_code:$("itemCode").value.trim()||null,
    barcode:$("barcode").value.trim()||null,
    batch_no:$("batchNo").value.trim()||null,
    expiry_date:expiryMonthToDate($("expiryDate").value),
    pack_uom:$("packUom").value.trim()||null,
    physical_qty:Number($("physicalQty").value),
    system_qty:$("systemQty").value===""?null:Number($("systemQty").value),
    condition:$("condition").value,
    counted_by:$("countedBy").value.trim()||null,
    remarks:$("remarks").value.trim()||null,
    count_status:"counted"
  };
  const {error}=await sb.from("medvika_audit_count_lines").insert(record);
  btn.disabled=false; btn.textContent="Save Count";
  if(error){toast(error.message,"error");return;}
  toast("Count saved");
  const keepZone=$("countZone").value, keepTeam=$("countTeam").value, keepCounter=$("countedBy").value;
  e.target.reset();
  $("countZone").value=keepZone; $("countTeam").value=keepTeam; $("countedBy").value=keepCounter; $("condition").value="saleable";
  $("itemName").focus();
  await Promise.all([loadDashboard(),loadRecentCounts()]);
});

async function loadExceptions(){
  const [rr,er]=await Promise.all([
    sb.from("medvika_audit_recounts").select("*").eq("audit_id",currentAuditId).eq("status","open").order("created_at",{ascending:false}).limit(100),
    sb.from("medvika_audit_count_lines").select("item_name,item_code,batch_no,expiry_date,physical_qty,condition,count_status").eq("audit_id",currentAuditId).in("condition",["near_expiry","expired","damaged"]).order("counted_at",{ascending:false}).limit(100)
  ]);
  if(!rr.error){
    $("recountWrap").innerHTML=tableHtml(["Item","Batch","System","First","Recount","Status"],(rr.data||[]).map(r=>[r.item_name,r.batch_no||"—",r.system_qty??"—",r.first_count_qty??"—",r.recount_qty??"—",r.status]));
  }
  if(!er.error){
    $("expiryWrap").innerHTML=tableHtml(["Item","Batch","Expiry","Qty","Condition"],(er.data||[]).map(r=>[r.item_name,r.batch_no||"—",r.expiry_date||"—",r.physical_qty,r.condition.replaceAll("_"," ")]));
  }
}

requireSession();
