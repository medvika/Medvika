const SUPABASE_URL="https://etevzodzxhsdwidtrmwv.supabase.co";
const SUPABASE_KEY="sb_publishable_iKWBOAxrWTZfU6Qb5PYd5Q_0y80GEOw";
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{
  auth:{storage:window.sessionStorage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
});
const $=id=>document.getElementById(id);
let customerId=null,access=null,audits=[],currentAudit=null,reconRows=[];
let customerZones=[],customerTeams=[];
let dashboardSummary={};
let dashboardRecentRows=[];
let customerView="dashboard",reconPage=1,reconPageSize=25;
let currentStockRows=[],currentStockFiltered=[],currentStockPage=1;

function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function msg(t){const e=$("msg");if(e)e.textContent=t||"";}
function authMsg(t){const e=$("authMsg");if(e)e.textContent=t||"";}
function showAuth(){ $("authCard").hidden=false; $("workspace").hidden=true; $("logoutBtn").hidden=true; $("recoveryCard").hidden=true; }
function showWorkspace(){ $("authCard").hidden=true; $("workspace").hidden=false; $("logoutBtn").hidden=false; $("recoveryCard").hidden=true; setCustomerView(customerView); }
function showRecovery(){ $("authCard").hidden=true; $("workspace").hidden=true; $("logoutBtn").hidden=true; $("recoveryCard").hidden=false; }

window.addEventListener("error",e=>{authMsg("Page script error: "+(e.message||"Unknown error"));});
window.addEventListener("unhandledrejection",e=>{authMsg("Page error: "+(e.reason?.message||e.reason||"Unknown error"));});

async function claimAndLoad(){
  const {data:c,error:ce}=await sb.rpc("medvika_claim_audit_customer_account");
  if(ce) throw ce;
  customerId=c;
  const {data:a,error:ae}=await sb.rpc("medvika_customer_access_row");
  if(ae) throw ae;
  access=a?.[0];
  if(!access) throw new Error("No audit subscription found for this login.");
  showWorkspace();
  $("accessBanner").innerHTML=`<span class="eyebrow">Access</span><h3>${access.access_active?"Active":"Inactive"}</h3><p class="muted">Until ${access.access_until||"—"} • ${access.audit_limit} audit • ${access.team_limit} team • ${Number(access.sku_limit||0).toLocaleString("en-IN")} SKU</p>`; if($("sidebarAccess")) $("sidebarAccess").textContent=`${access.access_active?"Active":"Inactive"} access`;
  await loadAudits();
}

async function doLogin(){
  authMsg("Signing in...");
  const email=$("email").value.trim(),password=$("password").value;
  if(!email||!password){authMsg("Enter email and password.");return;}
  // Never carry an old password-recovery state into a normal login.
  sessionStorage.removeItem("medvika_password_recovery");
  if(location.search||location.hash) history.replaceState(null,"",location.pathname);
  const {error}=await sb.auth.signInWithPassword({email,password});
  if(error){authMsg(error.message);return;}
  try{await claimAndLoad();}catch(e){authMsg(e.message);}
}
async function doSignup(){
  authMsg("Creating login...");
  const email=$("email").value.trim(),password=$("password").value;
  if(!email){authMsg("Enter registered email first.");return;}
  if(!password||password.length<6){authMsg("Password must be at least 6 characters.");return;}
  const {data,error}=await sb.auth.signUp({email,password,options:{emailRedirectTo:location.origin+"/audit/customer/"}});
  if(error){authMsg("Create Login failed: "+error.message);return;}
  if(data?.session){authMsg("Login created.");try{await claimAndLoad();}catch(e){authMsg(e.message);}}
  else authMsg("Login created. Check your email for confirmation, then sign in.");
}
async function doForgot(){
  const email=$("email").value.trim();
  if(!email){authMsg("Enter registered email first.");$("email").focus();return;}
  authMsg("Sending password reset email...");
  // Recovery mode is determined only from the actual Supabase recovery callback.
  const redirectTo=location.origin+"/audit/customer/?recovery=1";
  const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo});
  if(error){authMsg("Reset failed: "+error.message);return;}
  authMsg("Reset email request accepted. Check Inbox and Spam/Junk.");
}
async function savePassword(){
  const a=$("newPassword").value,b=$("confirmPassword").value;
  if(!a||a.length<6){$("recoveryMsg").textContent="Use at least 6 characters.";return;}
  if(a!==b){$("recoveryMsg").textContent="Passwords do not match.";return;}
  const {error}=await sb.auth.updateUser({password:a});
  if(error){$("recoveryMsg").textContent=error.message;return;}
  $("recoveryMsg").textContent="Password updated successfully.";
  sessionStorage.removeItem("medvika_password_recovery");
  history.replaceState(null,"",location.pathname);
  try{await claimAndLoad();}catch(e){$("recoveryMsg").textContent=e.message;}
}


const customerTitles={dashboard:"Audit Dashboard",setup:"Teams & Zones",stock:"Stock Allocation",imports:"Imports",currentStock:"Current Stock Register",counts:"Physical Counts",reconciliation:"Reconciliation",report:"Final Report"};
function setCustomerView(view){
 customerView=customerTitles[view]?view:"dashboard";
 document.querySelectorAll(".customer-view").forEach(x=>x.classList.toggle("active",x.id===customerView+"View"));
 document.querySelectorAll(".portal-nav-btn").forEach(x=>x.classList.toggle("active",x.dataset.customerView===customerView));
 if($("customerViewTitle")) $("customerViewTitle").textContent=customerTitles[customerView];
 if(customerView==="reconciliation"&&currentAudit) renderReconPage();
 if(customerView==="currentStock"&&currentAudit) loadCustomerCurrentStock();
 if(customerView==="report"&&currentAudit) renderCustomerReport();
 window.scrollTo({top:0,left:0,behavior:"auto"});
}
function bindCustomerNavigation(){
 document.querySelectorAll(".portal-nav-btn").forEach(b=>b.addEventListener("click",()=>setCustomerView(b.dataset.customerView)));
 document.querySelectorAll(".customer-go").forEach(b=>b.addEventListener("click",()=>setCustomerView(b.dataset.go)));
 $("customerAuditSelect")?.addEventListener("change",async e=>{if(e.target.value) await openAudit(e.target.value);});
}

document.addEventListener("DOMContentLoaded",async()=>{
  authMsg("Login system loaded.");
  bindCustomerNavigation();
  $("loginBtn").addEventListener("click",doLogin);
  $("createLoginBtn").addEventListener("click",doSignup);
  $("forgotBtn").addEventListener("click",doForgot);
  $("savePasswordBtn").addEventListener("click",savePassword);
  $("cancelRecoveryBtn").addEventListener("click",async()=>{sessionStorage.removeItem("medvika_password_recovery");history.replaceState(null,"",location.pathname);showAuth();});
  $("logoutBtn").addEventListener("click",async()=>{await sb.auth.signOut();sessionStorage.clear();location.href=location.origin+"/audit/customer/";});

  const isRecoveryCallback=()=>{
    const params=new URLSearchParams(location.search);
    return params.get("recovery")==="1" || params.get("type")==="recovery" || (location.hash||"").includes("type=recovery");
  };

  sb.auth.onAuthStateChange((event,session)=>{
    // Only a genuine Supabase PASSWORD_RECOVERY callback can open Change Password.
    if(event==="PASSWORD_RECOVERY"){
      showRecovery();
      return;
    }
    if(event==="SIGNED_OUT") showAuth();
  });

  const {data,error}=await sb.auth.getSession();
  if(error){authMsg(error.message);showAuth();return;}
  if(isRecoveryCallback()){
    if(data?.session) showRecovery();
    else showAuth();
    return;
  }
  // Clear any stale flag left by older portal builds. It must never affect normal workflow.
  sessionStorage.removeItem("medvika_password_recovery");
  if(data?.session){try{await claimAndLoad();}catch(e){authMsg(e.message);showAuth();}} else showAuth();
});

async function loadAudits(){
 const {data,error}=await sb.rpc("medvika_customer_audits",{p_customer_id:customerId});
 if(error){msg(error.message);return;}
 audits=data||[];
 $("auditList").innerHTML=audits.length?audits.map(a=>`<div class="audit-row"><div><strong>${esc(a.project_code)} — ${esc(a.project_name)}</strong><br><small>${esc(a.location||"")} • ${esc(a.audit_date||"")} • ${esc(a.status)}</small></div><div class="audit-actions"><button class="btn primary customer-dashboard" data-id="${a.audit_id}">Open Dashboard</button><button class="btn secondary open-audit" data-id="${a.audit_id}">Teams & Setup</button></div></div>`).join(""):'<p class="muted">No audits yet.</p>';
 if($("customerAuditSelect")) $("customerAuditSelect").innerHTML='<option value="">Select audit</option>'+audits.map(a=>`<option value="${a.audit_id}">${esc(a.project_code)} — ${esc(a.project_name)}</option>`).join("");
 document.querySelectorAll(".customer-dashboard").forEach(b=>b.onclick=async()=>{await openAudit(b.dataset.id);setCustomerView("dashboard");});
 document.querySelectorAll(".open-audit").forEach(b=>b.onclick=async()=>{await openAudit(b.dataset.id);setCustomerView("setup");});
}
$("newAuditBtn").onclick=()=>{$("modal").hidden=false;};
$("cancelModal").onclick=()=>{$("modal").hidden=true;};
$("createAuditConfirm").onclick=async()=>{
 const {data,error}=await sb.rpc("medvika_create_customer_audit",{p_customer_id:customerId,p_project_name:$("newAuditName").value,p_location:$("newAuditLocation").value,p_audit_date:$("newAuditDate").value,p_expected_items:Number($("newAuditItems").value||20000)});
 if(error){msg(error.message);return;}$("modal").hidden=true;await loadAudits();await openAudit(data);
};
async function openAudit(id){
 currentAudit=audits.find(a=>String(a.audit_id)===String(id))||{audit_id:id};
 $("auditPanel").hidden=false;
 $("auditTitle").textContent=`${currentAudit.project_code||""} — ${currentAudit.project_name||"Audit"}`;
 if($("customerAuditSelect")) $("customerAuditSelect").value=String(id);
 if($("allocationPanel")) $("allocationPanel").hidden=false;
 if($("unifiedImportPanel")) $("unifiedImportPanel").hidden=false;
 await Promise.all([loadSummary(),loadZones(),loadTeams(),loadCustomerRecentCounts(),loadRecon(),loadCustomerCurrentStock()]);
 if(window.stockAllocation) await window.stockAllocation.loadSummary();
 if(typeof loadUnifiedImportHistory==="function") try{await loadUnifiedImportHistory();}catch(e){}
}
async function loadSummary(){
 const {data,error}=await sb.rpc("medvika_customer_audit_summary",{p_customer_id:customerId,p_audit_id:currentAudit.audit_id});if(error){msg(error.message);return;}const r=data?.[0]||{};
 dashboardSummary=r;
 $("summaryGrid").innerHTML=[["Count Lines",r.total_count_lines],["Variance",r.variance_lines],["Expired",r.expired_lines],["Near Expiry",r.near_expiry_lines],["Damaged",r.damaged_lines],["Progress",(Number(r.progress_percent||0).toFixed(1)+"%")]].map(x=>`<div class="stat"><span>${x[0]}</span><strong>${x[1]??0}</strong></div>`).join("");
 renderDashboardInsights();
}

function dashboardPct(v){return Math.max(0,Math.min(100,Number(v)||0));}
function setDashboardRing(id,pct,color){const el=$(id);if(el)el.style.background=`conic-gradient(${color} ${dashboardPct(pct)}%, #e8eef5 0)`;}
function renderDashboardInsights(){
 if(!$("auditHealthValue"))return;
 const r=dashboardSummary||{};
 const rows=reconRows||[];
 const progress=dashboardPct(r.progress_percent||0);
 const matched=rows.filter(x=>String(x.finding||"").toLowerCase().includes("match") || Math.abs(Number(x.variance_qty??(Number(x.physical_qty||0)-Number(x.system_qty||0)))||0)<0.000001).length;
 const short=rows.filter(x=>Number(x.physical_qty||0)<Number(x.system_qty||0)).length;
 const excess=rows.filter(x=>Number(x.physical_qty||0)>Number(x.system_qty||0)).length;
 const recount=rows.filter(x=>x.recount===true || String(x.finding||"").toLowerCase().includes("recount")).length;
 const accuracy=rows.length?dashboardPct((matched/rows.length)*100):0;
 const health=rows.length?dashboardPct((progress*0.55)+(accuracy*0.45)):progress;
 const net=rows.reduce((sum,x)=>sum+(Number(x.variance_value)||0),0);
 $("auditHealthValue").textContent=`${health.toFixed(0)}%`; $("accuracyValue").textContent=`${accuracy.toFixed(0)}%`; $("completionValue").textContent=`${progress.toFixed(0)}%`;
 $("auditHealthLabel").textContent=health>=90?"Excellent":health>=70?"Healthy":health>0?"In progress":"Awaiting count";
 $("accuracyLabel").textContent=rows.length?(accuracy>=95?"Strong match rate":accuracy>=80?"Review variances":"Variance review needed"):"No reconciled lines";
 $("completionLabel").textContent=progress>=100?"Counting complete":progress>0?"Counting in progress":"Not started";
 setDashboardRing("auditHealthRing",health,"#0f766e");setDashboardRing("accuracyRing",accuracy,"#2563eb");setDashboardRing("completionRing",progress,"#f59e0b");
 if($("dashboardReconStats")) $("dashboardReconStats").innerHTML=[["Reconciled",rows.length,"neutral"],["Matched",matched,"good"],["Short",short,"bad"],["Excess",excess,"warn"],["Recount",recount,"warn"]].map(x=>`<div class="recon-mini ${x[2]}"><span>${x[0]}</span><strong>${x[1]}</strong></div>`).join("");
 if($("dashboardVarianceValue")) $("dashboardVarianceValue").textContent=new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(net);
 const controls=[["Zones configured",customerZones.length>0,`${customerZones.length} zone${customerZones.length===1?"":"s"}`],["Teams configured",customerTeams.length>0,`${customerTeams.length} team${customerTeams.length===1?"":"s"}`],["Physical counting",Number(r.total_count_lines||0)>0,`${Number(r.total_count_lines||0)} count lines`],["Reconciliation",rows.length>0,`${rows.length} reconciled lines`]];
 if($("dashboardControlList")) $("dashboardControlList").innerHTML=controls.map(x=>`<div class="control-row"><span class="control-dot ${x[1]?"done":"pending"}"></span><div><strong>${x[0]}</strong><small>${x[2]}</small></div><b>${x[1]?"Ready":"Pending"}</b></div>`).join("");
 if($("dashboardRecentActivity")) $("dashboardRecentActivity").innerHTML=dashboardRecentRows.length?dashboardRecentRows.slice(0,6).map(x=>`<div class="activity-row"><div><strong>${esc(x.item_name||"Item")}</strong><small>${esc(x.item_code||"No code")} • Batch ${esc(x.batch_no||"—")}</small></div><div class="activity-qty"><strong>${esc(pharmacyQtyDisplay(x.physical_qty,x.pack_size,x.pack_uom||"Pack"))}</strong><small>physical</small></div></div>`).join(""):'<p class="muted">No physical counts yet.</p>';
 const exceptions=[["Variance lines",Number(r.variance_lines||0),"bad"],["Expired",Number(r.expired_lines||0),"bad"],["Near expiry",Number(r.near_expiry_lines||0),"warn"],["Damaged",Number(r.damaged_lines||0),"warn"],["Recount",recount,"neutral"]];
 if($("dashboardExceptionList")) $("dashboardExceptionList").innerHTML=exceptions.map(x=>`<div class="exception-row"><span>${x[0]}</span><strong class="${x[2]}">${x[1]}</strong></div>`).join("");
}

async function loadZones(){
 const {data,error}=await sb.rpc("medvika_customer_zones",{p_customer_id:customerId,p_audit_id:currentAudit.audit_id});if(error){msg(error.message);return;}const rows=data||[]; customerZones=rows; renderDashboardInsights();
 $("zoneList").innerHTML=rows.map(z=>`<div class="item-row"><div><strong>${esc(z.zone_code)} — ${esc(z.zone_name)}</strong><br><small>${esc(z.category||"")}</small></div></div>`).join("")||'<p class="muted">No zones.</p>';
 $("teamZone").innerHTML=rows.map(z=>`<option value="${z.id}">${esc(z.zone_code)} — ${esc(z.zone_name)}</option>`).join(""); if($("allocationZone")) $("allocationZone").innerHTML='<option value="">-- No Zone --</option>'+rows.map(z=>`<option value="${z.id}">${esc(z.zone_code)} — ${esc(z.zone_name)}</option>`).join(""); if($("unifiedPhysicalZone")) $("unifiedPhysicalZone").innerHTML=rows.map(z=>`<option value="${z.id}">${esc(z.zone_code)} — ${esc(z.zone_name)}</option>`).join("");
}
$("addZoneBtn").onclick=async()=>{if(!currentAudit)return;const {error}=await sb.rpc("medvika_manage_zone",{p_customer_id:customerId,p_audit_id:currentAudit.audit_id,p_zone_name:$("zoneName").value,p_category:$("zoneCategory").value,p_zone_id:null});if(error){msg(error.message);return;}$("zoneName").value="";$("zoneCategory").value="";await loadZones();};

async function loadTeams(){
 const {data,error}=await sb.rpc("medvika_customer_teams",{p_customer_id:customerId,p_audit_id:currentAudit.audit_id});if(error){msg(error.message);return;}const rows=data||[]; customerTeams=rows; renderDashboardInsights(); if($("allocationTeam")) $("allocationTeam").innerHTML='<option value="">-- No Team --</option>'+rows.map(t=>`<option value="${t.team_id}">${esc(t.team_code)} — ${esc(t.team_name||"")}</option>`).join("");
 $("teamList").innerHTML=rows.map(t=>`<div class="item-row"><div><strong>${esc(t.team_code)} — ${esc(t.team_name||"")}</strong><br><small>${esc(t.zone_code||"")} ${esc(t.zone_name||"")} • Login ${esc(t.login_code||"—")}</small></div><button class="btn secondary reset-pin" data-id="${t.team_id}">Reset PIN</button></div>`).join("")||'<p class="muted">No teams.</p>';
 if($("unifiedPhysicalTeam")) $("unifiedPhysicalTeam").innerHTML=rows.map(t=>`<option value="${t.team_id}">${esc(t.team_code)} — ${esc(t.team_name||"")}</option>`).join("");
 document.querySelectorAll(".reset-pin").forEach(b=>b.onclick=async()=>{const pin=prompt("Enter new PIN (4+ digits):");if(!pin)return;const {error}=await sb.rpc("medvika_reset_customer_team_pin",{p_customer_id:customerId,p_audit_id:currentAudit.audit_id,p_team_id:b.dataset.id,p_new_pin:pin});msg(error?error.message:"PIN reset successfully.");});
}
$("addTeamBtn").onclick=async()=>{if(!currentAudit)return;const {error}=await sb.rpc("medvika_create_customer_team",{p_customer_id:customerId,p_audit_id:currentAudit.audit_id,p_zone_id:$("teamZone").value,p_team_name:$("teamName").value,p_login_code:$("teamLoginCode").value,p_pin:$("teamPin").value,p_can_add_unlisted:$("allowUnlisted").checked});if(error){msg(error.message);return;}$("teamName").value="";$("teamLoginCode").value="";$("teamPin").value="";await loadTeams();};

function toQtyNumber(v){
  if(v===null||v===undefined||v==="") return null;
  const n=Number(String(v).replace(/,/g,"").trim());
  return Number.isFinite(n)?n:null;
}
function smallestUnitCount(qty,packSize){
  const q=toQtyNumber(qty),ps=toQtyNumber(packSize);
  if(q===null||!(ps>0)||!Number.isInteger(ps)) return null;
  return Math.round(q*ps);
}
function pharmacyQtyDisplay(qty,packSize,packUom="Pack"){
  const q=toQtyNumber(qty),ps=toQtyNumber(packSize);
  if(q===null) return "—";
  if(!(ps>0)||!Number.isInteger(ps)) return String(Number(q.toFixed(3)));
  const units=Math.round(q*ps), abs=Math.abs(units);
  const packs=Math.floor(abs/ps), loose=abs%ps, sign=units<0?"−":"";
  const u=String(packUom||"Pack").trim()||"Pack";
  if(packs===0&&loose>0) return `${sign}${loose} loose unit${loose===1?"":"s"}`;
  if(loose===0) return `${sign}${packs} ${u}${packs===1?"":"s"}`;
  return `${sign}${packs} ${u}${packs===1?"":"s"} + ${loose} loose`;
}
function varianceUnitDisplay(physicalQty,systemQty,packSize){
  const p=smallestUnitCount(physicalQty,packSize),s=smallestUnitCount(systemQty,packSize);
  if(p===null||s===null){
    const a=toQtyNumber(physicalQty),b=toQtyNumber(systemQty);
    if(a===null||b===null) return "—";
    return String(Number((a-b).toFixed(3)));
  }
  const d=p-s;
  if(d===0) return "0";
  return `${d>0?"+":"−"}${Math.abs(d)} loose unit${Math.abs(d)===1?"":"s"}`;
}

function getFilteredRecon(){
 const q=String($("reconSearch")?.value||"").trim().toLowerCase();
 const f=String($("reconFindingFilter")?.value||"").trim().toLowerCase();
 return (reconRows||[]).filter(r=>{
  const finding=String(r.finding||"").toLowerCase();
  const hay=[r.item_name,r.batch_no,r.finding,r.condition].map(x=>String(x||"").toLowerCase()).join(" ");
  return (!q||hay.includes(q))&&(!f||finding.includes(f));
 });
}
function renderReconPage(){
 if(!$("reconTable"))return;
 const filtered=getFilteredRecon(),pages=Math.max(1,Math.ceil(filtered.length/reconPageSize));
 reconPage=Math.max(1,Math.min(reconPage,pages));
 const rows=filtered.slice((reconPage-1)*reconPageSize,reconPage*reconPageSize);
 $("reconTable").innerHTML=`<div class="table-wrap"><table><thead><tr><th>Finding</th><th>Item</th><th>Batch</th><th>System</th><th>Physical</th><th>Variance</th><th>Rate Ex-GST</th><th>Variance Value</th><th>Condition</th></tr></thead><tbody>${rows.map(r=>{
  const ps=r.pack_size??null,u=r.pack_uom||"Pack";
  return `<tr><td>${esc(r.finding)}</td><td>${esc(r.item_name)}</td><td>${esc(r.batch_no||"")}</td><td>${esc(pharmacyQtyDisplay(r.system_qty,ps,u))}</td><td>${esc(pharmacyQtyDisplay(r.physical_qty,ps,u))}</td><td>${esc(varianceUnitDisplay(r.physical_qty,r.system_qty,ps))}</td><td>${r.purchase_rate??"—"}</td><td>${r.variance_value??"—"}</td><td>${esc(r.condition||"")}</td></tr>`;
 }).join("")||'<tr><td colspan="9">No reconciliation findings match this filter.</td></tr>'}</tbody></table></div>`;
 if($("reconPageInfo")) $("reconPageInfo").textContent=`Page ${reconPage} of ${pages} • ${filtered.length} findings`;
 if($("reconPrev")) $("reconPrev").disabled=reconPage<=1;
 if($("reconNext")) $("reconNext").disabled=reconPage>=pages;
}
async function loadRecon(){
 const {data,error}=await sb.rpc("medvika_customer_reconciliation",{p_customer_id:customerId,p_audit_id:currentAudit.audit_id});
 if(error){msg(error.message);return;}
 reconRows=data||[];reconPage=1;renderReconPage();renderCustomerReport();renderDashboardInsights();
}

function cleanDisplayQty(v){
 const n=Number(v); return Number.isFinite(n)?String(Number(n.toFixed(6))):(v??"—");
}

function customerStockExpiryState(expiry){
 if(!expiry)return "ok";
 const d=new Date(`${expiry}T00:00:00`); if(Number.isNaN(d.getTime()))return "ok";
 const today=new Date();today.setHours(0,0,0,0);const near=new Date(today);near.setDate(near.getDate()+180);
 return d<today?"expired":d<=near?"near":"ok";
}
function customerStockMoney(v){const n=Number(v);return Number.isFinite(n)?`₹${n.toFixed(2)}`:"—";}
async function fetchCustomerCurrentStock(){
 if(!currentAudit?.audit_id)return [];
 const all=[];let from=0,size=1000;
 while(true){
   const {data,error}=await sb.from("medvika_audit_system_stock")
    .select("id,item_code,barcode,item_name,batch_no,expiry_date,pack_uom,category,system_qty,mrp,purchase_rate,gst_percent,pack_size,qty_basis")
    .eq("audit_id",currentAudit.audit_id).range(from,from+size-1);
   if(error){
     const {data:fallback,error:fallbackError}=await sb.rpc("medvika_allocation_candidates",{p_audit_id:currentAudit.audit_id,p_mode:"all",p_value1:null,p_value2:null,p_limit:5000});
     if(fallbackError)throw error;
     return (fallback||[]).map(r=>({id:r.stock_id,item_code:r.item_code,barcode:r.barcode,item_name:r.item_name,batch_no:r.batch_no,expiry_date:r.expiry_date,pack_uom:r.pack_uom,category:r.category,system_qty:r.system_qty,mrp:r.mrp,purchase_rate:r.purchase_rate,gst_percent:r.gst_percent,pack_size:r.pack_size,manufacturer:r.manufacturer,_limited:true}));
   }
   all.push(...(data||[]));if(!data||data.length<size)break;from+=size;
 }
 return all;
}
async function loadCustomerCurrentStock(){
 if(!currentAudit?.audit_id||!$("currentStockTable"))return;
 $("currentStockStatus").textContent="Loading current stock…";
 try{
   currentStockRows=(await fetchCustomerCurrentStock()).map(r=>({...r,_risk:customerStockExpiryState(r.expiry_date)}));currentStockPage=1;renderCustomerCurrentStock();
   const limited=currentStockRows.some(r=>r._limited);
   $("currentStockStatus").textContent=`${currentStockRows.length.toLocaleString("en-IN")} current-stock lines loaded${limited?" (fallback view; maximum 5,000 lines).":"."}`;
 }catch(e){
   console.error("Customer current stock:",e);$("currentStockStatus").textContent=e.message||"Unable to load current stock.";
 }
}
function renderCustomerCurrentStock(){
 if(!$("currentStockTable"))return;
 const term=String($("currentStockSearch")?.value||"").trim().toLowerCase();const risk=$("currentStockRisk")?.value||"";const size=Math.max(1,Number($("currentStockPageSize")?.value||50));
 currentStockFiltered=currentStockRows.filter(r=>{
   const hay=[r.item_name,r.item_code,r.barcode,r.batch_no,r.category,r.manufacturer].map(v=>String(v||"").toLowerCase()).join(" ");
   if(term&&!hay.includes(term))return false;
   if(risk==="expired"&&r._risk!=="expired")return false;if(risk==="near"&&r._risk!=="near")return false;if(risk==="missing_rate"&&Number.isFinite(Number(r.purchase_rate)))return false;return true;
 });
 const pages=Math.max(1,Math.ceil(currentStockFiltered.length/size));currentStockPage=Math.max(1,Math.min(currentStockPage,pages));const rows=currentStockFiltered.slice((currentStockPage-1)*size,currentStockPage*size);
 $("currentStockTotal").textContent=currentStockRows.length.toLocaleString("en-IN");
 const qty=currentStockRows.reduce((s,r)=>s+(Number.isFinite(Number(r.system_qty))?Number(r.system_qty):0),0);$("currentStockQty").textContent=Number(qty.toFixed(2)).toLocaleString("en-IN");
 $("currentStockExpired").textContent=currentStockRows.filter(r=>r._risk==="expired").length.toLocaleString("en-IN");$("currentStockNear").textContent=currentStockRows.filter(r=>r._risk==="near").length.toLocaleString("en-IN");
 $("currentStockTable").innerHTML=`<div class="table-wrap"><table><thead><tr><th>Item</th><th>Code</th><th>Batch</th><th>Expiry</th><th>System Qty</th><th>Pack</th><th>Purchase Rate</th><th>MRP</th><th>GST</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.item_name||"")}</td><td>${esc(r.item_code||"")}</td><td>${esc(r.batch_no||"")}</td><td>${esc(r.expiry_date||"—")}${r._risk!=="ok"?`<br><small>${r._risk==="expired"?"Expired":"Near expiry"}</small>`:""}</td><td>${esc(pharmacyQtyDisplay(r.system_qty,r.pack_size,r.pack_uom||"Pack"))}</td><td>${esc(r.pack_size||"—")} ${esc(r.pack_uom||"")}</td><td>${customerStockMoney(r.purchase_rate)}</td><td>${customerStockMoney(r.mrp)}</td><td>${r.gst_percent??"—"}${r.gst_percent!==null&&r.gst_percent!==undefined?"%":""}</td></tr>`).join("")||'<tr><td colspan="9">No stock rows match this filter.</td></tr>'}</tbody></table></div>`;
 $("currentStockPageInfo").textContent=`Page ${currentStockPage} of ${pages} • ${currentStockFiltered.length.toLocaleString("en-IN")} rows`;$("currentStockPrev").disabled=currentStockPage<=1;$("currentStockNext").disabled=currentStockPage>=pages;
}
function exportCustomerCurrentStock(){
 if(!currentStockRows.length)return;const rows=currentStockFiltered.length?currentStockFiltered:currentStockRows;const csv=Papa.unparse(rows.map(r=>({Item:r.item_name,ItemCode:r.item_code,Barcode:r.barcode,Batch:r.batch_no,Expiry:r.expiry_date,SystemQty:r.system_qty,PackSize:r.pack_size,PackUOM:r.pack_uom,PurchaseRate:r.purchase_rate,MRP:r.mrp,GST:r.gst_percent,Category:r.category})));const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download=`Medvika_Current_Stock_${currentAudit?.project_code||"Audit"}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
$("reloadCurrentStock")?.addEventListener("click",loadCustomerCurrentStock);$("exportCurrentStock")?.addEventListener("click",exportCustomerCurrentStock);$("currentStockSearch")?.addEventListener("input",()=>{currentStockPage=1;renderCustomerCurrentStock();});$("currentStockRisk")?.addEventListener("change",()=>{currentStockPage=1;renderCustomerCurrentStock();});$("currentStockPageSize")?.addEventListener("change",()=>{currentStockPage=1;renderCustomerCurrentStock();});$("currentStockPrev")?.addEventListener("click",()=>{currentStockPage--;renderCustomerCurrentStock();});$("currentStockNext")?.addEventListener("click",()=>{currentStockPage++;renderCustomerCurrentStock();});

async function loadCustomerRecentCounts(){
 if(!currentAudit?.audit_id||!$("customerRecentCounts")) return;
 $("customerRecentCounts").innerHTML='<p class="muted">Loading counts…</p>';
 const {data,error}=await sb.rpc("medvika_customer_recent_counts",{p_audit_id:currentAudit.audit_id,p_limit:50});
 if(error){$("customerRecentCounts").innerHTML=`<p class="muted">${esc(error.message)}</p>`;return;}
 const rows=data||[];
 dashboardRecentRows=rows;
 renderDashboardInsights();
 $("customerRecentCounts").innerHTML=rows.length?rows.map(r=>{
   const variance=(r.system_qty===null||r.system_qty===undefined)?null:Number((Number(r.physical_qty)-Number(r.system_qty)).toFixed(9));
   return `<div class="count-control-row"><div><strong>${esc(r.item_name||"Item")}</strong><small> • ${esc(r.item_code||"No code")} • Batch ${esc(r.batch_no||"—")} • ${esc(r.counted_at||"")}</small><div class="qty-line">Physical ${esc(pharmacyQtyDisplay(r.physical_qty,r.pack_size,r.pack_uom||"Pack"))} · System ${esc(pharmacyQtyDisplay(r.system_qty,r.pack_size,r.pack_uom||"Pack"))}${variance===null?"":` · Variance ${esc(varianceUnitDisplay(r.physical_qty,r.system_qty,r.pack_size))}`}</div></div><button class="btn danger-soft count-delete" type="button" data-count-id="${r.id}">Delete Count</button></div>`;
 }).join(""):'<p class="muted">No physical counts for this audit.</p>';
 $("customerRecentCounts").querySelectorAll(".count-delete").forEach(b=>b.onclick=()=>deleteCustomerCount(b.dataset.countId));
}
async function deleteCustomerCount(id){
 if(!currentAudit?.audit_id||!confirm("Delete this physical count? Current Stock and allocations remain unchanged.")) return;
 const {error}=await sb.rpc("medvika_customer_delete_count",{p_audit_id:currentAudit.audit_id,p_count_id:Number(id)});
 if(error){msg(error.message);return;}
 msg("Physical count deleted.");
 await Promise.all([loadCustomerRecentCounts(),loadSummary()]);
}
async function clearAllCustomerCounts(){
 if(!currentAudit?.audit_id) return;
 if(prompt("Type CLEAR COUNTS to delete all physical counts for this audit:")!=="CLEAR COUNTS") return;
 const {data,error}=await sb.rpc("medvika_customer_clear_counts",{p_audit_id:currentAudit.audit_id});
 if(error){msg(error.message);return;}
 msg(`${data||0} physical count rows deleted.`);
 await Promise.all([loadCustomerRecentCounts(),loadSummary()]);
}
async function clearCustomerAllocations(){
 if(!currentAudit?.audit_id) return;
 if(prompt("Type CLEAR ALLOCATIONS to remove all stock allocations for this audit:")!=="CLEAR ALLOCATIONS") return;
 const {data,error}=await sb.rpc("medvika_customer_clear_allocations",{p_audit_id:currentAudit.audit_id});
 if(error){msg(error.message);return;}
 msg(`${data||0} stock allocations cleared.`);
 if(window.stockAllocation) await window.stockAllocation.loadSummary();
}
async function resetCustomerCounting(){
 if(!currentAudit?.audit_id) return;
 if(prompt("Type RESET COUNTING to delete all physical counts AND allocations:")!=="RESET COUNTING") return;
 const {data,error}=await sb.rpc("medvika_customer_reset_counting",{p_audit_id:currentAudit.audit_id});
 if(error){msg(error.message);return;}
 msg(`Counting reset. ${data?.deleted_counts||0} counts and ${data?.deleted_allocations||0} allocations removed.`);
 await Promise.all([loadCustomerRecentCounts(),loadSummary()]);
 if(window.stockAllocation) await window.stockAllocation.loadSummary();
}
$("reloadCustomerCounts")?.addEventListener("click",loadCustomerRecentCounts);
$("clearAllCountsBtn")?.addEventListener("click",clearAllCustomerCounts);
$("clearAllocationsBtn")?.addEventListener("click",clearCustomerAllocations);
$("resetCountingBtn")?.addEventListener("click",resetCustomerCounting);


$("reconSearch")?.addEventListener("input",()=>{reconPage=1;renderReconPage();});
$("reconFindingFilter")?.addEventListener("change",()=>{reconPage=1;renderReconPage();});
$("reconPrev")?.addEventListener("click",()=>{reconPage--;renderReconPage();});
$("reconNext")?.addEventListener("click",()=>{reconPage++;renderReconPage();});

$("exportCsvBtn").onclick=()=>{if(!reconRows.length)return;const csv=Papa.unparse(reconRows);const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=`Medvika_Reconciliation_${currentAudit.project_code||"Audit"}.csv`;a.click();};


// Full stock import/reconciliation uses the shared /audit/ engine.




window.stockAllocation=installStockAllocation({sb,esc,msg,getAuditId:()=>currentAudit?.audit_id||null});

// Install the customer stock importer locally. Import completion refreshes data in-place;
// it never reloads or redirects the browser, so authentication/recovery state is untouched.
window.unifiedImporter=installUnifiedImporter({
  sb,esc,msg,
  getAuditId:()=>currentAudit?.audit_id||null,
  getCustomerId:()=>customerId,
  reloadAfterImport:async()=>{
    if(!currentAudit?.audit_id) return;
    await Promise.all([loadSummary(),loadRecon(),loadCustomerCurrentStock()]);
    if(window.stockAllocation) await window.stockAllocation.loadSummary();
  }
});
window.loadUnifiedImportHistory=()=>window.unifiedImporter?.history?.();


// ===== Customer report v1.4 =====
function crN(v){const n=Number(v);return Number.isFinite(n)?n:0}
function crMoney(v){const n=Number(v);return Number.isFinite(n)?`₹${n.toFixed(2)}`:"—"}
function crCsv(v){return `"${String(v??"").replace(/"/g,'""')}"`}
function renderCustomerReport(){
 const body=$("customerReportBody"); if(!body||!currentAudit)return;
 const rows=reconRows||[];
 const matched=rows.filter(r=>String(r.finding||"").toLowerCase().includes("match")).length;
 const short=rows.filter(r=>crN(r.physical_qty)<crN(r.system_qty)).length;
 const excess=rows.filter(r=>crN(r.physical_qty)>crN(r.system_qty)).length;
 const damaged=rows.filter(r=>String(r.condition||"").toLowerCase().includes("damag")).length;
 const expired=rows.filter(r=>String(r.condition||"").toLowerCase().includes("expired")).length;
 const near=rows.filter(r=>String(r.condition||"").toLowerCase().includes("near")).length;
 const net=rows.reduce((s,r)=>s+crN(r.variance_value),0);
 const detail=rows.slice(0,50).map(r=>{
   const ps=r.pack_size??null,u=r.pack_uom||"Pack";
   return `<tr><td>${esc(r.finding||"")}</td><td>${esc(r.item_name||"")}</td><td>${esc(r.batch_no||"")}</td><td>${esc(pharmacyQtyDisplay(r.system_qty,ps,u))}</td><td>${esc(pharmacyQtyDisplay(r.physical_qty,ps,u))}</td><td>${esc(varianceUnitDisplay(r.physical_qty,r.system_qty,ps))}</td><td>${crMoney(r.variance_value)}</td><td>${esc(r.condition||"")}</td></tr>`;
 }).join("");
 body.innerHTML=`
 <div class="report-project"><strong>${esc(currentAudit.project_code||"")} — ${esc(currentAudit.project_name||"Audit")}</strong><span>${esc(currentAudit.location||"")} ${currentAudit.audit_date?" • "+esc(currentAudit.audit_date):""} • ${esc(currentAudit.status||"")}</span></div>
 <div class="customer-report-grid">
  <div class="customer-report-kpi"><small>Reconciled Lines</small><strong>${rows.length}</strong></div>
  <div class="customer-report-kpi"><small>Matched</small><strong>${matched}</strong></div>
  <div class="customer-report-kpi"><small>Short</small><strong>${short}</strong></div>
  <div class="customer-report-kpi"><small>Excess</small><strong>${excess}</strong></div>
  <div class="customer-report-kpi"><small>Expired</small><strong>${expired}</strong></div>
  <div class="customer-report-kpi"><small>Near Expiry / Damaged</small><strong>${near} / ${damaged}</strong></div>
 </div>
 <div class="report-value"><span>Net Inventory Variance Value</span><strong>${crMoney(net)}</strong></div>
 <h3 style="margin-top:16px">Key Findings</h3><p class="muted">Showing up to 50 findings in the PDF view. Use Export Full Report CSV for complete item-level detail.</p><div class="table-wrap"><table class="customer-report-table"><thead><tr><th>Finding</th><th>Item</th><th>Batch</th><th>System</th><th>Physical</th><th>Variance</th><th>Variance Value</th><th>Condition</th></tr></thead><tbody>${detail||'<tr><td colspan="8">No reconciliation findings yet.</td></tr>'}</tbody></table></div>
 <p class="muted report-foot">Generated from the selected Medvika audit workspace. Final values depend on completed physical counting and reconciliation.</p>`;
}
function exportCustomerReport(){
 if(!currentAudit)return;
 const head=["Finding","Item","Batch","System Qty (Practical)","Physical Qty (Practical)","Variance (Smallest Units)","System Qty (Pack Decimal)","Physical Qty (Pack Decimal)","Purchase Rate Ex-GST","Variance Value","Condition"];
 const data=[head,...(reconRows||[]).map(r=>[r.finding,r.item_name,r.batch_no,pharmacyQtyDisplay(r.system_qty,r.pack_size,r.pack_uom||"Pack"),pharmacyQtyDisplay(r.physical_qty,r.pack_size,r.pack_uom||"Pack"),varianceUnitDisplay(r.physical_qty,r.system_qty,r.pack_size),r.system_qty,r.physical_qty,r.purchase_rate,r.variance_value,r.condition])];
 const csv=data.map(row=>row.map(crCsv).join(",")).join("\n");
 const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download=`Medvika_Final_Report_${currentAudit.project_code||"Audit"}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function customerLogoDataUrl(){
 try{
  const res=await fetch("./logo.png"); const blob=await res.blob();
  return await new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=reject;fr.readAsDataURL(blob);});
 }catch(e){return null;}
}
function crSafePdf(v){return String(v??"").replace(/[^\x20-\x7E]/g," ");}
function crPdfMoney(v){const n=Number(v);return Number.isFinite(n)?`INR ${n.toFixed(2)}`:"-";}
function crExpiryState(expiry){
 if(!expiry)return "ok"; const d=new Date(`${expiry}T00:00:00`); if(Number.isNaN(d.getTime()))return "ok";
 const t=new Date();t.setHours(0,0,0,0);const n=new Date(t);n.setDate(n.getDate()+180);return d<t?"expired":d<=n?"near":"ok";
}
async function generateCustomerReportPdf(){
 if(!currentAudit){msg("Select an audit first.");return;}
 if(!window.jspdf?.jsPDF){msg("PDF library not loaded.");return;}
 if(!reconRows.length){await loadRecon();}
 if(!currentStockRows.length){await loadCustomerCurrentStock();}
 const {jsPDF}=window.jspdf; const doc=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
 const navy=[11,60,93],green=[11,143,77],dark=[29,43,54],grey=[102,117,128],pageW=210,margin=15;
 let y=15;
 const logo=await customerLogoDataUrl();
 const header=async(first=false)=>{
  if(logo){try{doc.addImage(logo,"PNG",margin,9,43,13);}catch(e){}}
  doc.setTextColor(...navy);doc.setFont("helvetica","bold");doc.setFontSize(first?16:10);
  doc.text(first?"STOCK AUDIT - FINAL REPORT":"MEDVIKA HEALTHCARE SOLUTIONS",first?margin+49:margin,first?16:12);
  if(first){doc.setFontSize(8);doc.setTextColor(...green);doc.text("Independent verification | Inventory control | Actionable reporting",margin+49,21);}
  doc.setDrawColor(215,225,231);doc.line(margin,27,pageW-margin,27);y=33;
 };
 const addTitle=(title)=>{doc.setTextColor(...navy);doc.setFont("helvetica","bold");doc.setFontSize(11);doc.text(title,margin,y);y+=3;};
 const ensure=(limit=235)=>{if(y>limit){doc.addPage();y=33;return true;}return false;};
 await header(true);
 doc.autoTable({startY:y,head:[["Engagement","Details"]],body:[
  ["Project",currentAudit.project_code||""],["Audit",currentAudit.project_name||""],["Audit Date",currentAudit.audit_date||""],["Location",currentAudit.location||""],["Status",String(currentAudit.status||"").replaceAll("_"," ")]
 ],theme:"grid",styles:{fontSize:8,cellPadding:2.2},headStyles:{fillColor:navy,textColor:[255,255,255]},columnStyles:{0:{fontStyle:"bold",cellWidth:35}}});
 y=doc.lastAutoTable.finalY+7;
 const rows=reconRows||[];
 const matched=rows.filter(r=>String(r.finding||"").toLowerCase().includes("match")).length;
 const short=rows.filter(r=>crN(r.physical_qty)<crN(r.system_qty)).length;
 const excess=rows.filter(r=>crN(r.physical_qty)>crN(r.system_qty)).length;
 const missing=rows.filter(r=>String(r.finding||"").toLowerCase().includes("missing")).length;
 const unlisted=rows.filter(r=>String(r.finding||"").toLowerCase().includes("unlisted")).length;
 const damaged=rows.filter(r=>String(r.condition||"").toLowerCase().includes("damag")).length;
 const expired=rows.filter(r=>String(r.condition||"").toLowerCase().includes("expired")).length;
 const near=rows.filter(r=>String(r.condition||"").toLowerCase().includes("near")).length;
 const shortageLoss=rows.filter(r=>crN(r.physical_qty)<crN(r.system_qty)).reduce((s,r)=>s+Math.abs(crN(r.variance_value)),0);
 const excessValue=rows.filter(r=>crN(r.physical_qty)>crN(r.system_qty)).reduce((s,r)=>s+Math.abs(crN(r.variance_value)),0);
 const net=rows.reduce((s,r)=>s+crN(r.variance_value),0);
 const systemStockValue=currentStockRows.reduce((s,r)=>s+crN(r.system_qty)*crN(r.purchase_rate),0);
 const expiredStock=currentStockRows.filter(r=>crExpiryState(r.expiry_date)==="expired");
 const nearStock=currentStockRows.filter(r=>crExpiryState(r.expiry_date)==="near");
 const expiredValue=expiredStock.reduce((s,r)=>s+crN(r.system_qty)*crN(r.purchase_rate),0);
 const nearValue=nearStock.reduce((s,r)=>s+crN(r.system_qty)*crN(r.purchase_rate),0);
 addTitle("Executive Summary");
 doc.autoTable({startY:y,head:[["Metric","Value","Metric","Value"]],body:[
  ["Reconciled Lines",rows.length,"Matched",matched],["Short",short,"Excess",excess],["Missing",missing,"Unlisted",unlisted],
  ["Damaged Lines",damaged,"Expired Lines",expired],["Near Expiry Lines",near,"Current Stock Lines",currentStockRows.length],
  ["Shortage Loss Ex-GST",crPdfMoney(shortageLoss),"Excess Value Ex-GST",crPdfMoney(excessValue)],
  ["Net Inventory Variance",crPdfMoney(net),"System Stock Value",crPdfMoney(systemStockValue)],
  ["Expired Stock Exposure",crPdfMoney(expiredValue),"Near Expiry Exposure",crPdfMoney(nearValue)]
 ],theme:"grid",styles:{fontSize:8,cellPadding:2},headStyles:{fillColor:green,textColor:[255,255,255]}});y=doc.lastAutoTable.finalY+7;
 if(ensure()){await header(false);} addTitle("Material Reconciliation Exceptions");
 const exceptions=rows.filter(r=>!String(r.finding||"").toLowerCase().includes("match"));
 doc.autoTable({startY:y,head:[["Status","Item","Batch","System","Physical","Variance","Value"]],body:exceptions.map(r=>[
  crSafePdf(r.finding||""),crSafePdf(r.item_name||""),crSafePdf(r.batch_no||"-"),crSafePdf(pharmacyQtyDisplay(r.system_qty,r.pack_size,r.pack_uom||"Pack")),crSafePdf(pharmacyQtyDisplay(r.physical_qty,r.pack_size,r.pack_uom||"Pack")),crSafePdf(varianceUnitDisplay(r.physical_qty,r.system_qty,r.pack_size)),crSafePdf(crPdfMoney(r.variance_value))
 ]),theme:"striped",styles:{fontSize:6.7,cellPadding:1.4,overflow:"linebreak"},headStyles:{fillColor:navy,textColor:[255,255,255]},columnStyles:{1:{cellWidth:43},2:{cellWidth:23}},margin:{left:margin,right:margin,top:31,bottom:15}});y=doc.lastAutoTable.finalY+7;
 if(ensure(225)){await header(false);} addTitle("Expiry & Condition Findings");
 const findings=rows.filter(r=>["damaged","expired","near_expiry"].some(x=>String(r.condition||"").toLowerCase().includes(x.replace("_"," "))));
 doc.autoTable({startY:y,head:[["Item","Batch","Expiry","Physical Qty","Condition"]],body:findings.map(r=>[crSafePdf(r.item_name||""),crSafePdf(r.batch_no||"-"),r.expiry_date||"-",crSafePdf(pharmacyQtyDisplay(r.physical_qty,r.pack_size,r.pack_uom||"Pack")),crSafePdf(r.condition||"")]),theme:"grid",styles:{fontSize:7,cellPadding:1.6},headStyles:{fillColor:green,textColor:[255,255,255]},margin:{left:margin,right:margin,top:31,bottom:15}});y=doc.lastAutoTable.finalY+7;
 if(ensure(220)){await header(false);} addTitle("Current Stock Expiry Exposure");
 doc.autoTable({startY:y,head:[["Item","Batch","Expiry","System Qty","Risk"]],body:[...expiredStock,...nearStock].slice(0,250).map(r=>[crSafePdf(r.item_name||""),crSafePdf(r.batch_no||"-"),r.expiry_date||"-",crSafePdf(pharmacyQtyDisplay(r.system_qty,r.pack_size,r.pack_uom||"Pack")),crExpiryState(r.expiry_date)==="expired"?"Expired":"Near Expiry"]),theme:"grid",styles:{fontSize:7,cellPadding:1.5},headStyles:{fillColor:navy,textColor:[255,255,255]},margin:{left:margin,right:margin,top:31,bottom:15}});y=doc.lastAutoTable.finalY+7;
 if(customerZones.length){if(ensure(220)){await header(false);} addTitle("Zone Completion / Setup");doc.autoTable({startY:y,head:[["Zone","Category","Status"]],body:customerZones.map(z=>[crSafePdf(`${z.zone_code||""} - ${z.zone_name||""}`),crSafePdf(z.category||"-"),crSafePdf(z.status||"-")]),theme:"grid",styles:{fontSize:7.5,cellPadding:1.8},headStyles:{fillColor:navy,textColor:[255,255,255]}});y=doc.lastAutoTable.finalY+7;}
 if(ensure(225)){await header(false);} addTitle("Management Notes");
 doc.setTextColor(...dark);doc.setFont("helvetica","normal");doc.setFontSize(8);
 const notes=doc.splitTextToSize("This report is generated from the selected Medvika customer audit workspace. Quantities use the Smart Quantity normalization selected during import. Financial values use purchase rate excluding GST where available. Detailed item-and-batch reconciliation remains available in the CSV export.",180);doc.text(notes,margin,y);y+=notes.length*4+8;
 doc.setDrawColor(215,225,231);doc.line(margin,y,pageW-margin,y);y+=9;doc.text("Medvika Authorised Signatory: __________________________",margin,y);doc.text("Client Representative: __________________________",110,y);
 const n=doc.getNumberOfPages();for(let i=1;i<=n;i++){doc.setPage(i);doc.setFontSize(7);doc.setTextColor(...grey);doc.text("Confidential - Medvika Healthcare Solutions",margin,290);doc.text(`Page ${i} of ${n}`,pageW-margin,290,{align:"right"});}
 doc.save(`Medvika_Final_Audit_Report_${currentAudit.project_code||"Audit"}.pdf`);
}
$("generateCustomerReportPdfBtn")?.addEventListener("click",generateCustomerReportPdf);
$("exportCustomerReportBtn")?.addEventListener("click",exportCustomerReport);

// ============================================================
// CUSTOMER IMPORTED DATA DELETE / RESET CONTROLS
// Uses owner-checked SECURITY DEFINER RPCs from the companion SQL.
// ============================================================
async function refreshCustomerAuditAfterDataChange(){
  try{
    if(typeof loadSummary==="function") await loadSummary();
    if(typeof loadCustomerCurrentStock==="function") await loadCustomerCurrentStock();
    if(typeof loadCustomerRecentCounts==="function") await loadCustomerRecentCounts();
    if(typeof loadRecon==="function") await loadRecon();
    if(typeof loadCustomerFinalReport==="function") await loadCustomerFinalReport();
    if(window.customerImporter?.history) await window.customerImporter.history();
    if(window.stockAllocation?.loadSummary) await window.stockAllocation.loadSummary();
  }catch(e){ console.warn("Refresh after data change",e); }
}
function setDeleteDataMessage(t){const el=$("deleteDataMessage");if(el)el.textContent=t||"";}
async function customerDeletePhysicalAuditData(){
  if(!currentAudit?.audit_id)return;
  if(!confirm("Delete ALL physical count data for this audit?\n\nPhysical counts, recount/expiry review records and physical-import history will be removed. Current Stock remains.\n\nThis cannot be undone."))return;
  const b=$("deletePhysicalDataButton"); if(b){b.disabled=true;b.textContent="Deleting…";} setDeleteDataMessage("");
  try{
    const {data,error}=await sb.rpc("medvika_customer_delete_physical_audit_data",{p_audit_id:currentAudit.audit_id});
    if(error)throw error;
    setDeleteDataMessage(`Physical data deleted: ${Number(data?.deleted_counts||0)} count rows, ${Number(data?.deleted_imports||0)} import jobs.`);
    msg("Physical count data deleted."); await refreshCustomerAuditAfterDataChange();
  }catch(e){setDeleteDataMessage(e.message);msg(e.message);}finally{if(b){b.disabled=false;b.textContent="Delete Physical Count Data";}}
}
async function customerDeleteSystemAuditData(){
  if(!currentAudit?.audit_id)return;
  if(!confirm("Delete ALL Current Stock data for this audit?\n\nThis removes the imported stock master and Current Stock import history. Physical Counts must be deleted first.\n\nThis cannot be undone."))return;
  const b=$("deleteSystemDataButton"); if(b){b.disabled=true;b.textContent="Deleting…";} setDeleteDataMessage("");
  try{
    const {data,error}=await sb.rpc("medvika_customer_delete_system_audit_data",{p_audit_id:currentAudit.audit_id});
    if(error)throw error;
    setDeleteDataMessage(`Current Stock deleted: ${Number(data?.deleted_stock||0)} rows, ${Number(data?.deleted_imports||0)} import jobs.`);
    msg("Current Stock data deleted."); await refreshCustomerAuditAfterDataChange();
  }catch(e){setDeleteDataMessage(e.message);msg(e.message);}finally{if(b){b.disabled=false;b.textContent="Delete Current Stock Data";}}
}
async function customerResetImportedAuditData(){
  if(!currentAudit?.audit_id)return;
  if(!confirm("RESET ALL IMPORTED AUDIT DATA?\n\nThis removes Current Stock, Physical Counts, allocations, recount/expiry review records and import history.\n\nAudit project, zones and teams remain."))return;
  if(String(prompt("For safety, type RESET to continue:")||"").trim().toUpperCase()!=="RESET"){setDeleteDataMessage("Reset cancelled.");return;}
  const b=$("resetAuditDataButton"); if(b){b.disabled=true;b.textContent="Resetting…";} setDeleteDataMessage("");
  try{
    const {data,error}=await sb.rpc("medvika_customer_reset_imported_audit_data",{p_audit_id:currentAudit.audit_id});
    if(error)throw error;
    setDeleteDataMessage(`Audit data reset: ${Number(data?.deleted_stock||0)} stock rows, ${Number(data?.deleted_counts||0)} counts, ${Number(data?.deleted_allocations||0)} allocations, ${Number(data?.deleted_imports||0)} imports.`);
    msg("Imported audit data reset."); await refreshCustomerAuditAfterDataChange();
  }catch(e){setDeleteDataMessage(e.message);msg(e.message);}finally{if(b){b.disabled=false;b.textContent="Reset Imported Audit Data";}}
}
$("deletePhysicalDataButton")?.addEventListener("click",customerDeletePhysicalAuditData);
$("deleteSystemDataButton")?.addEventListener("click",customerDeleteSystemAuditData);
$("resetAuditDataButton")?.addEventListener("click",customerResetImportedAuditData);
