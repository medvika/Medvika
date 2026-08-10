const SUPABASE_URL="https://etevzodzxhsdwidtrmwv.supabase.co";
const SUPABASE_KEY="sb_publishable_iKWBOAxrWTZfU6Qb5PYd5Q_0y80GEOw";
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{
  auth:{storage:window.sessionStorage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
});
const $=id=>document.getElementById(id);
let customerId=null,access=null,audits=[],currentAudit=null,reconRows=[];

function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function msg(t){const e=$("msg");if(e)e.textContent=t||"";}
function authMsg(t){const e=$("authMsg");if(e)e.textContent=t||"";}
function showAuth(){ $("authCard").hidden=false; $("workspace").hidden=true; $("logoutBtn").hidden=true; $("recoveryCard").hidden=true; }
function showWorkspace(){ $("authCard").hidden=true; $("workspace").hidden=false; $("logoutBtn").hidden=false; $("recoveryCard").hidden=true; }
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
  $("accessBanner").innerHTML=`<span class="eyebrow">Access</span><h3>${access.access_active?"Active":"Inactive"}</h3><p class="muted">Access until ${access.access_until||"—"} • Audit limit ${access.audit_limit} • Team limit ${access.team_limit} • SKU limit ${Number(access.sku_limit||0).toLocaleString("en-IN")}</p>`;
  await loadAudits();
}

async function doLogin(){
  authMsg("Signing in...");
  const email=$("email").value.trim(),password=$("password").value;
  if(!email||!password){authMsg("Enter email and password.");return;}
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
  sessionStorage.setItem("medvika_password_recovery","1");
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
  history.replaceState(null,"",location.origin+"/audit/customer/");
  try{await claimAndLoad();}catch(e){$("recoveryMsg").textContent=e.message;}
}

document.addEventListener("DOMContentLoaded",async()=>{
  authMsg("Login system loaded.");
  $("loginBtn").addEventListener("click",doLogin);
  $("signupBtn").addEventListener("click",doSignup);
  $("forgotBtn").addEventListener("click",doForgot);
  $("savePasswordBtn").addEventListener("click",savePassword);
  $("cancelRecoveryBtn").addEventListener("click",async()=>{sessionStorage.removeItem("medvika_password_recovery");await sb.auth.signOut();history.replaceState(null,"",location.pathname);showAuth();});
  $("logoutBtn").addEventListener("click",async()=>{await sb.auth.signOut();sessionStorage.clear();location.href=location.origin+"/audit/customer/";});

  sb.auth.onAuthStateChange((event,session)=>{
    if(event==="PASSWORD_RECOVERY"){
      sessionStorage.setItem("medvika_password_recovery","1");
      showRecovery();
      return;
    }
    if(event==="SIGNED_IN" && (sessionStorage.getItem("medvika_password_recovery")==="1" || new URLSearchParams(location.search).get("recovery")==="1")){
      showRecovery();
      return;
    }
    if(event==="SIGNED_OUT") showAuth();
  });

  const {data,error}=await sb.auth.getSession();
  if(error){authMsg(error.message);showAuth();return;}
  const params=new URLSearchParams(location.search);
  const recovery=params.get("recovery")==="1" || sessionStorage.getItem("medvika_password_recovery")==="1" || (location.hash||"").includes("type=recovery") || (location.search||"").includes("type=recovery");
  if(recovery){
    sessionStorage.setItem("medvika_password_recovery","1");
    showRecovery();
    return;
  }
  if(data?.session){try{await claimAndLoad();}catch(e){authMsg(e.message);showAuth();}} else showAuth();
});

async function loadAudits(){
 const {data,error}=await sb.rpc("medvika_customer_audits",{p_customer_id:customerId});if(error){msg(error.message);return;}audits=data||[];
 $("auditList").innerHTML=audits.length?audits.map(a=>`<div class="audit-row"><div><strong>${esc(a.project_code)} — ${esc(a.project_name)}</strong><br><small>${esc(a.location||"")} • ${esc(a.audit_date||"")} • ${esc(a.status)}</small></div><div class="audit-actions"><button class="btn secondary open-audit" data-id="${a.audit_id}">Teams & Setup</button><a class="btn primary" href="../?audit=${encodeURIComponent(a.audit_id)}">Open Audit Workspace</a></div></div>`).join(""):'<p class="muted">No audits yet.</p>';
 document.querySelectorAll(".open-audit").forEach(b=>b.onclick=()=>openAudit(b.dataset.id));
}
$("newAuditBtn").onclick=()=>{$("modal").hidden=false;};
$("cancelModal").onclick=()=>{$("modal").hidden=true;};
$("createAuditConfirm").onclick=async()=>{
 const {data,error}=await sb.rpc("medvika_create_customer_audit",{p_customer_id:customerId,p_project_name:$("newAuditName").value,p_location:$("newAuditLocation").value,p_audit_date:$("newAuditDate").value,p_expected_items:Number($("newAuditItems").value||20000)});
 if(error){msg(error.message);return;}$("modal").hidden=true;await loadAudits();await openAudit(data);
};
async function openAudit(id){
 currentAudit=audits.find(a=>a.audit_id===id)||{audit_id:id}; $("auditPanel").hidden=false;$("auditTitle").textContent=`${currentAudit.project_code||""} — ${currentAudit.project_name||"Audit"}`;
 await Promise.all([loadSummary(),loadZones(),loadTeams(),loadCustomerRecentCounts()]); if($("allocationPanel")) $("allocationPanel").hidden=false; if(window.stockAllocation) await window.stockAllocation.loadSummary(); if($("unifiedImportPanel")) $("unifiedImportPanel").hidden=true;
}
async function loadSummary(){
 const {data,error}=await sb.rpc("medvika_customer_audit_summary",{p_customer_id:customerId,p_audit_id:currentAudit.audit_id});if(error){msg(error.message);return;}const r=data?.[0]||{};
 $("summaryGrid").innerHTML=[["Count Lines",r.total_count_lines],["Variance",r.variance_lines],["Expired",r.expired_lines],["Near Expiry",r.near_expiry_lines],["Damaged",r.damaged_lines],["Progress",(Number(r.progress_percent||0).toFixed(1)+"%")]].map(x=>`<div class="stat"><span>${x[0]}</span><strong>${x[1]??0}</strong></div>`).join("");
}
async function loadZones(){
 const {data,error}=await sb.rpc("medvika_customer_zones",{p_customer_id:customerId,p_audit_id:currentAudit.audit_id});if(error){msg(error.message);return;}const rows=data||[];
 $("zoneList").innerHTML=rows.map(z=>`<div class="item-row"><div><strong>${esc(z.zone_code)} — ${esc(z.zone_name)}</strong><br><small>${esc(z.category||"")}</small></div></div>`).join("")||'<p class="muted">No zones.</p>';
 $("teamZone").innerHTML=rows.map(z=>`<option value="${z.id}">${esc(z.zone_code)} — ${esc(z.zone_name)}</option>`).join(""); if($("allocationZone")) $("allocationZone").innerHTML='<option value="">-- No Zone --</option>'+rows.map(z=>`<option value="${z.id}">${esc(z.zone_code)} — ${esc(z.zone_name)}</option>`).join(""); if($("unifiedPhysicalZone")) $("unifiedPhysicalZone").innerHTML=rows.map(z=>`<option value="${z.id}">${esc(z.zone_code)} — ${esc(z.zone_name)}</option>`).join("");
}
$("addZoneBtn").onclick=async()=>{if(!currentAudit)return;const {error}=await sb.rpc("medvika_manage_zone",{p_customer_id:customerId,p_audit_id:currentAudit.audit_id,p_zone_name:$("zoneName").value,p_category:$("zoneCategory").value,p_zone_id:null});if(error){msg(error.message);return;}$("zoneName").value="";$("zoneCategory").value="";await loadZones();};

async function loadTeams(){
 const {data,error}=await sb.rpc("medvika_customer_teams",{p_customer_id:customerId,p_audit_id:currentAudit.audit_id});if(error){msg(error.message);return;}const rows=data||[]; if($("allocationTeam")) $("allocationTeam").innerHTML='<option value="">-- No Team --</option>'+rows.map(t=>`<option value="${t.team_id}">${esc(t.team_code)} — ${esc(t.team_name||"")}</option>`).join("");
 $("teamList").innerHTML=rows.map(t=>`<div class="item-row"><div><strong>${esc(t.team_code)} — ${esc(t.team_name||"")}</strong><br><small>${esc(t.zone_code||"")} ${esc(t.zone_name||"")} • Login ${esc(t.login_code||"—")}</small></div><button class="btn secondary reset-pin" data-id="${t.team_id}">Reset PIN</button></div>`).join("")||'<p class="muted">No teams.</p>';
 if($("unifiedPhysicalTeam")) $("unifiedPhysicalTeam").innerHTML=rows.map(t=>`<option value="${t.team_id}">${esc(t.team_code)} — ${esc(t.team_name||"")}</option>`).join("");
 document.querySelectorAll(".reset-pin").forEach(b=>b.onclick=async()=>{const pin=prompt("Enter new PIN (4+ digits):");if(!pin)return;const {error}=await sb.rpc("medvika_reset_customer_team_pin",{p_customer_id:customerId,p_audit_id:currentAudit.audit_id,p_team_id:b.dataset.id,p_new_pin:pin});msg(error?error.message:"PIN reset successfully.");});
}
$("addTeamBtn").onclick=async()=>{if(!currentAudit)return;const {error}=await sb.rpc("medvika_create_customer_team",{p_customer_id:customerId,p_audit_id:currentAudit.audit_id,p_zone_id:$("teamZone").value,p_team_name:$("teamName").value,p_login_code:$("teamLoginCode").value,p_pin:$("teamPin").value,p_can_add_unlisted:$("allowUnlisted").checked});if(error){msg(error.message);return;}$("teamName").value="";$("teamLoginCode").value="";$("teamPin").value="";await loadTeams();};

async function loadRecon(){
 const {data,error}=await sb.rpc("medvika_customer_reconciliation",{p_customer_id:customerId,p_audit_id:currentAudit.audit_id});if(error){msg(error.message);return;}reconRows=data||[];
 $("reconTable").innerHTML=`<div class="table-wrap"><table><thead><tr><th>Finding</th><th>Item</th><th>Batch</th><th>System</th><th>Physical</th><th>Variance</th><th>Rate Ex-GST</th><th>Variance Value</th><th>Condition</th></tr></thead><tbody>${reconRows.slice(0,500).map(r=>`<tr><td>${esc(r.finding)}</td><td>${esc(r.item_name)}</td><td>${esc(r.batch_no||"")}</td><td>${esc(r.system_qty)}</td><td>${esc(r.physical_qty)}</td><td>${esc(r.variance_qty)}</td><td>${r.purchase_rate??"—"}</td><td>${r.variance_value??"—"}</td><td>${esc(r.condition||"")}</td></tr>`).join("")}</tbody></table></div>`;
}

function cleanDisplayQty(v){
 const n=Number(v); return Number.isFinite(n)?String(Number(n.toFixed(6))):(v??"—");
}
async function loadCustomerRecentCounts(){
 if(!currentAudit?.audit_id||!$("customerRecentCounts")) return;
 $("customerRecentCounts").innerHTML='<p class="muted">Loading counts…</p>';
 const {data,error}=await sb.rpc("medvika_customer_recent_counts",{p_audit_id:currentAudit.audit_id,p_limit:50});
 if(error){$("customerRecentCounts").innerHTML=`<p class="muted">${esc(error.message)}</p>`;return;}
 const rows=data||[];
 $("customerRecentCounts").innerHTML=rows.length?rows.map(r=>{
   const variance=(r.system_qty===null||r.system_qty===undefined)?null:Number((Number(r.physical_qty)-Number(r.system_qty)).toFixed(9));
   return `<div class="count-control-row"><div><strong>${esc(r.item_name||"Item")}</strong><small> • ${esc(r.item_code||"No code")} • Batch ${esc(r.batch_no||"—")} • ${esc(r.counted_at||"")}</small><div class="qty-line">Physical ${esc(cleanDisplayQty(r.physical_qty))} · System ${esc(cleanDisplayQty(r.system_qty))}${variance===null?"":` · Variance ${esc(cleanDisplayQty(variance))}`}</div></div><button class="btn danger-soft count-delete" type="button" data-count-id="${r.id}">Delete Count</button></div>`;
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

$("exportCsvBtn").onclick=()=>{if(!reconRows.length)return;const csv=Papa.unparse(reconRows);const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=`Medvika_Reconciliation_${currentAudit.project_code||"Audit"}.csv`;a.click();};


// Full stock import/reconciliation uses the shared /audit/ engine.




window.stockAllocation=installStockAllocation({sb,esc,msg,getAuditId:()=>currentAudit?.audit_id||null});
