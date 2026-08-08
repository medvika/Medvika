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
    const titles={dashboard:"Audit Dashboard",count:"Physical Stock Count",zones:"Zones & Teams",exceptions:"Exceptions & Controls",reconciliation:"Complete Reconciliation",imports:"Stock Imports"};
    $("viewTitle").textContent=titles[view]||"Stock Audit";
    if(view==="count") $("itemName").focus();
    if(view==="reconciliation") loadReconciliation();
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
  await Promise.all([loadProjectDetails(),loadZonesAndTeams(),loadDashboard(),loadRecentCounts(),loadExceptions(),loadImportHistory(),loadReconciliation()]);
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
    condition:classifyCondition(enteredExpiry||s?.expiry_date||null, explicitCondition),
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
  system_qty:["system_qty","system qty","stock","stock qty","current stock","book stock","quantity","qty"],
  physical_qty:["physical_qty","physical qty","physical stock","count qty","counted qty","actual qty","actual stock","quantity","qty"],
  mrp:["mrp","m.r.p"],
  purchase_rate:["purchase_rate","purchase rate","ptr","cost","cost rate"],
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
    ? [["Item Name","item_name",true],["Item Code","item_code",false],["Barcode","barcode",false],["Batch No.","batch_no",false],["Expiry Date","expiry_date",false],["System Qty","system_qty",true],["Pack/UOM","pack_uom",false],["Category","category",false],["Manufacturer","manufacturer",false],["MRP","mrp",false],["Purchase Rate","purchase_rate",false]]
    : [["Item Name","item_name",true],["Item Code","item_code",false],["Barcode","barcode",false],["Batch No.","batch_no",false],["Expiry Date","expiry_date",false],["Physical Qty","physical_qty",true],["Pack/UOM","pack_uom",false],["Category","category",false],["Condition / Damage","condition",false]];
  container.__rows=rows;
  container.innerHTML=`<div class="mapping-card">
    <strong>Column Mapping</strong>
    <p class="helper">${fmtNum(rows.length)} rows detected. Confirm the columns before importing.</p>
    <div class="mapping-grid">${fields.map(f=>mappingField(f[0],f[1],headers,f[2])).join("")}</div>
    <div class="preview-table">${tableHtml(headers.slice(0,8),rows.slice(0,5).map(r=>headers.slice(0,8).map(h=>r[h])))}</div>
    <button class="btn primary" type="button" data-import="${type}">${isSystem?"Import System Stock":"Match & Import Physical Counts"}</button>
    <div class="import-progress" data-progress hidden></div>
  </div>`;
  container.querySelector(`[data-import="${type}"]`).addEventListener("click",()=> type==="system" ? importSystemRows(container) : importPhysicalRows(container));
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
      const name=String(r[map.item_name]??"").trim(), qty=toNumber(r[map.system_qty]);
      if(!name||qty===null){failed++;return;}
      recs.push({
        audit_id:currentAuditId,import_job_id:jobId,source_row_no:idx+2,
        item_name:name,item_code:map.item_code?String(r[map.item_code]??"").trim()||null:null,
        barcode:map.barcode?String(r[map.barcode]??"").trim()||null:null,
        batch_no:map.batch_no?String(r[map.batch_no]??"").trim()||null:null,
        expiry_date:map.expiry_date?toISODate(r[map.expiry_date]):null,
        pack_uom:map.pack_uom?String(r[map.pack_uom]??"").trim()||null:null,
        category:map.category?String(r[map.category]??"").trim()||null:null,
        manufacturer:map.manufacturer?String(r[map.manufacturer]??"").trim()||null:null,
        system_qty:qty,mrp:map.mrp?toNumber(r[map.mrp]):null,
        purchase_rate:map.purchase_rate?toNumber(r[map.purchase_rate]):null,
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
      .select("id,item_code,barcode,item_name,normalized_name,batch_no,expiry_date,pack_uom,category,system_qty")
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
      const name=String(r[map.item_name]??"").trim(), physical=toNumber(r[map.physical_qty]);
      if(!name||physical===null){failed++;return;}
      const code=map.item_code?String(r[map.item_code]??"").trim():"";
      const barcode=map.barcode?String(r[map.barcode]??"").trim():"";
      const batch=map.batch_no?String(r[map.batch_no]??"").trim():"";
      let s=null,matchStatus="unmatched_excess";
      if(code && byCode.has(stockKey(code,batch))){s=byCode.get(stockKey(code,batch));matchStatus="matched_item_batch";}
      else if(barcode && byBarcode.has(stockKey(barcode,batch))){s=byBarcode.get(stockKey(barcode,batch));matchStatus="matched_barcode_batch";}
      else if(byName.has(nameKey(name,batch))){s=byName.get(nameKey(name,batch));matchStatus="matched_name_batch";}
      if(s) matched++; else unmatched++;
      recs.push({
        audit_id:currentAuditId,zone_id:zoneId,team_id:teamId,system_stock_id:s?.id||null,import_job_id:jobId,
        item_code:code||s?.item_code||null,barcode:barcode||s?.barcode||null,item_name:name||s?.item_name,
        category:(map.category?String(r[map.category]??"").trim():null)||s?.category||null,
        batch_no:batch||s?.batch_no||null,expiry_date:importedExpiry,
        pack_uom:(map.pack_uom?String(r[map.pack_uom]??"").trim():null)||s?.pack_uom||null,
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
    await Promise.all([loadDashboard(),loadRecentCounts(),loadExceptions(),loadImportHistory()]);
  }catch(e){
    if(jobId) await finishImportJob(jobId,{inserted_rows:0,matched_rows:0,unmatched_rows:0,failed_rows:rows.length},e.message);
    progress.className="import-progress error";progress.textContent=e.message;toast(e.message,"error");
  }
}

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
    const variance=phy-sys;

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
      system_qty:sys,
      physical_qty:phy,
      variance,
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
      system_qty:0,
      physical_qty:Number(g.physical_qty||0),
      variance:Number(g.physical_qty||0),
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
      <td>${esc(r.system_qty)}</td>
      <td>${esc(r.physical_qty)}</td>
      <td class="${varianceClass(r.variance)}">${esc(r.variance)}</td>
      <td>${r.recount?'<span class="status-chip status-recount">Recount</span>':'—'}</td>
    </tr>
  `).join("") : '<tr><td colspan="11" class="empty">No reconciliation rows for this filter.</td></tr>';

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
    $("reconBody").innerHTML=`<tr><td colspan="11" class="empty">${esc(err.message||"Unable to load reconciliation")}</td></tr>`;
  }
}

async function fetchAllCountLinesDetailed(){
  const all=[]; let from=0; const size=1000;
  while(true){
    const {data,error}=await sb.from("medvika_audit_count_lines")
      .select("id,system_stock_id,item_code,barcode,item_name,batch_no,category,expiry_date,condition,physical_qty,system_qty,count_status,match_status")
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
    System_Qty:r.system_qty,
    Physical_Qty:r.physical_qty,
    Variance:r.variance,
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

requireSession();
