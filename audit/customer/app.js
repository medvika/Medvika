const URL="https://etevzodzxhsdwidtrmwv.supabase.co";
const KEY="sb_publishable_iKWBOAxrWTZfU6Qb5PYd5Q_0y80GEOw";
const sb=supabase.createClient(URL,KEY,{auth:{storage:window.sessionStorage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
let customerId=null,access=null,audits=[],currentAudit=null,reconRows=[];
let recoveryMode=false;
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function msg(t){if($("msg")) $("msg").textContent=t||"";}
function authMsg(t){if($("authMsg")) $("authMsg").textContent=t||"";}
function showAuth(){$("authCard").hidden=false;$("workspace").hidden=true;$("logoutBtn").hidden=true;$("recoveryCard").hidden=true;}
function showWorkspace(){$("authCard").hidden=true;$("workspace").hidden=false;$("logoutBtn").hidden=false;$("recoveryCard").hidden=true;}
function showRecovery(){recoveryMode=true;$("authCard").hidden=true;$("workspace").hidden=true;$("logoutBtn").hidden=true;$("recoveryCard").hidden=false;}
async function claimAndLoad(){const {data:c,error:ce}=await sb.rpc("medvika_claim_audit_customer_account");if(ce)throw ce;customerId=c;const {data:a,error:ae}=await sb.rpc("medvika_customer_access_row");if(ae)throw ae;access=a?.[0];if(!access)throw new Error("No audit subscription found for this login.");showWorkspace();$("accessBanner").innerHTML=`<span class="eyebrow">Access</span><h3>${access.access_active?"Active":"Inactive"}</h3><p class="muted">Access until ${access.access_until||"—"} • Audit limit ${access.audit_limit} • Team limit ${access.team_limit} • SKU limit ${Number(access.sku_limit||0).toLocaleString("en-IN")}</p>`;await loadAudits();}
async function login(){const email=$("email").value.trim(),password=$("password").value;authMsg("");if(!email||!password){authMsg("Enter your registered email and password.");return;}const btn=$("loginBtn");btn.disabled=true;btn.textContent="Signing in...";try{const {error}=await sb.auth.signInWithPassword({email,password});if(error)throw error;await claimAndLoad();}catch(err){authMsg(err.message||"Unable to sign in.");await sb.auth.signOut().catch(()=>{});showAuth();}finally{btn.disabled=false;btn.textContent="Sign In";}}
async function createLogin(){const email=$("email").value.trim(),password=$("password").value;authMsg("");if(!email){authMsg("Enter the same email used during Medvika Audit registration.");return;}if(!password||password.length<6){authMsg("Create a password of at least 6 characters.");return;}const btn=$("signupBtn");btn.disabled=true;btn.textContent="Creating...";try{const redirectTo=location.origin+"/audit/customer/";const {data,error}=await sb.auth.signUp({email,password,options:{emailRedirectTo:redirectTo}});if(error)throw error;if(data?.session){authMsg("Login created successfully.");await claimAndLoad();}else{authMsg("Login created. Check your email for confirmation, then return here and sign in.");}}catch(err){authMsg("Create Login failed: "+(err.message||"Unable to create login."));}finally{btn.disabled=false;btn.textContent="Create Login";}}
async function forgotPassword(){const email=$("email").value.trim();authMsg("");if(!email){authMsg("Enter your registered email first, then tap Forgot Password.");$("email").focus();return;}const btn=$("forgotBtn");btn.disabled=true;btn.textContent="Sending...";try{const redirectTo=location.origin+"/audit/customer/";const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo});if(error)throw error;authMsg("Password reset email sent. Check Inbox and Spam/Junk.");}catch(err){authMsg("Reset failed: "+(err.message||"Unable to send password reset email."));}finally{btn.disabled=false;btn.textContent="Forgot Password?";}}
async function saveNewPassword(){const p1=$("newPassword").value,p2=$("confirmPassword").value;$("recoveryMsg").textContent="";if(!p1||p1.length<6){$("recoveryMsg").textContent="Password must be at least 6 characters.";return;}if(p1!==p2){$("recoveryMsg").textContent="Passwords do not match.";return;}const btn=$("savePasswordBtn");btn.disabled=true;btn.textContent="Saving...";try{const {error}=await sb.auth.updateUser({password:p1});if(error)throw error;$("recoveryMsg").textContent="Password updated successfully. Opening your customer workspace...";recoveryMode=false;await claimAndLoad();}catch(err){$("recoveryMsg").textContent=err.message||"Unable to update password.";}finally{btn.disabled=false;btn.textContent="Save New Password";}}
$("loginBtn").addEventListener("click",login);$("signupBtn").addEventListener("click",createLogin);$("forgotBtn").addEventListener("click",forgotPassword);$("savePasswordBtn").addEventListener("click",saveNewPassword);$("cancelRecoveryBtn").addEventListener("click",async()=>{recoveryMode=false;await sb.auth.signOut().catch(()=>{});history.replaceState(null,"",location.pathname);showAuth();});$("password").addEventListener("keydown",e=>{if(e.key==="Enter")login();});$("logoutBtn").addEventListener("click",async()=>{await sb.auth.signOut();sessionStorage.clear();location.href=location.origin+"/audit/customer/";});
sb.auth.onAuthStateChange(async(event,session)=>{if(event==="PASSWORD_RECOVERY"){showRecovery();return;}if(event==="SIGNED_OUT"&&!recoveryMode)showAuth();});
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
 await Promise.all([loadSummary(),loadZones(),loadTeams()]); if($("allocationPanel")) $("allocationPanel").hidden=false; if(window.stockAllocation) await window.stockAllocation.loadSummary(); if($("unifiedImportPanel")) $("unifiedImportPanel").hidden=true;
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
$("exportCsvBtn").onclick=()=>{if(!reconRows.length)return;const csv=Papa.unparse(reconRows);const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=`Medvika_Reconciliation_${currentAudit.project_code||"Audit"}.csv`;a.click();};


// Full stock import/reconciliation uses the shared /audit/ engine.




window.stockAllocation=installStockAllocation({sb,esc,msg,getAuditId:()=>currentAudit?.audit_id||null});
(async()=>{try{const {data,error}=await sb.auth.getSession();if(error)throw error;const hash=(location.hash||"").toLowerCase(),search=(location.search||"").toLowerCase();const looksLikeRecovery=hash.includes("type=recovery")||search.includes("type=recovery");if(looksLikeRecovery&&data?.session){showRecovery();return;}if(data?.session){try{await claimAndLoad();}catch(err){authMsg(err.message||"Unable to open customer workspace.");showAuth();}}else showAuth();}catch(err){authMsg(err.message||"Unable to initialize customer login.");showAuth();}})();
