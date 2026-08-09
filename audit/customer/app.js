
const URL="https://etevzodzxhsdwidtrmwv.supabase.co",KEY="sb_publishable_iKWBOAxrWTZfU6Qb5PYd5Q_0y80GEOw";
const sb=supabase.createClient(URL,KEY); const $=id=>document.getElementById(id);
let customerId=null,access=null,audits=[],currentAudit=null,reconRows=[];

function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function msg(t){$("msg").textContent=t||"";}
async function claimAndLoad(){
  const {data:c,error:ce}=await sb.rpc("medvika_claim_audit_customer_account"); if(ce){msg(ce.message);return;}
  customerId=c;
  const {data:a,error:ae}=await sb.rpc("medvika_customer_access_row"); if(ae){msg(ae.message);return;}
  access=a?.[0]; if(!access){msg("No audit subscription found.");return;}
  $("authCard").hidden=true;$("workspace").hidden=false;$("logoutBtn").hidden=false;
  $("accessBanner").innerHTML=`<span class="eyebrow">Access</span><h3>${access.access_active?"Active":"Inactive"}</h3><p class="muted">Access until ${access.access_until||"—"} • Audit limit ${access.audit_limit} • Team limit ${access.team_limit} • SKU limit ${Number(access.sku_limit||0).toLocaleString("en-IN")}</p>`;
  await loadAudits();
}
$("loginBtn").onclick=async()=>{const {error}=await sb.auth.signInWithPassword({email:$("email").value,password:$("password").value});if(error){$("authMsg").textContent=error.message;return;}await claimAndLoad();};
$("signupBtn").onclick=async()=>{const {error}=await sb.auth.signUp({email:$("email").value,password:$("password").value});$("authMsg").textContent=error?"Signup failed: "+error.message:"Login created. If email confirmation is enabled, confirm your email, then sign in.";};
$("logoutBtn").onclick=async()=>{await sb.auth.signOut();location.reload();};

async function loadAudits(){
 const {data,error}=await sb.rpc("medvika_customer_audits",{p_customer_id:customerId});if(error){msg(error.message);return;}audits=data||[];
 $("auditList").innerHTML=audits.length?audits.map(a=>`<div class="audit-row"><div><strong>${esc(a.project_code)} — ${esc(a.project_name)}</strong><br><small>${esc(a.location||"")} • ${esc(a.audit_date||"")} • ${esc(a.status)}</small></div><button class="btn secondary open-audit" data-id="${a.audit_id}">Open</button></div>`).join(""):'<p class="muted">No audits yet.</p>';
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
 await Promise.all([loadSummary(),loadZones(),loadTeams(),loadRecon()]);
}
async function loadSummary(){
 const {data,error}=await sb.rpc("medvika_customer_audit_summary",{p_customer_id:customerId,p_audit_id:currentAudit.audit_id});if(error){msg(error.message);return;}const r=data?.[0]||{};
 $("summaryGrid").innerHTML=[["Count Lines",r.total_count_lines],["Variance",r.variance_lines],["Expired",r.expired_lines],["Near Expiry",r.near_expiry_lines],["Damaged",r.damaged_lines],["Progress",(Number(r.progress_percent||0).toFixed(1)+"%")]].map(x=>`<div class="stat"><span>${x[0]}</span><strong>${x[1]??0}</strong></div>`).join("");
}
async function loadZones(){
 const {data,error}=await sb.rpc("medvika_customer_zones",{p_customer_id:customerId,p_audit_id:currentAudit.audit_id});if(error){msg(error.message);return;}const rows=data||[];
 $("zoneList").innerHTML=rows.map(z=>`<div class="item-row"><div><strong>${esc(z.zone_code)} — ${esc(z.zone_name)}</strong><br><small>${esc(z.category||"")}</small></div></div>`).join("")||'<p class="muted">No zones.</p>';
 $("teamZone").innerHTML=rows.map(z=>`<option value="${z.id}">${esc(z.zone_code)} — ${esc(z.zone_name)}</option>`).join("");
}
$("addZoneBtn").onclick=async()=>{if(!currentAudit)return;const {error}=await sb.rpc("medvika_manage_zone",{p_customer_id:customerId,p_audit_id:currentAudit.audit_id,p_zone_name:$("zoneName").value,p_category:$("zoneCategory").value,p_zone_id:null});if(error){msg(error.message);return;}$("zoneName").value="";$("zoneCategory").value="";await loadZones();};

async function loadTeams(){
 const {data,error}=await sb.rpc("medvika_customer_teams",{p_customer_id:customerId,p_audit_id:currentAudit.audit_id});if(error){msg(error.message);return;}const rows=data||[];
 $("teamList").innerHTML=rows.map(t=>`<div class="item-row"><div><strong>${esc(t.team_code)} — ${esc(t.team_name||"")}</strong><br><small>${esc(t.zone_code||"")} ${esc(t.zone_name||"")} • Login ${esc(t.login_code||"—")}</small></div><button class="btn secondary reset-pin" data-id="${t.team_id}">Reset PIN</button></div>`).join("")||'<p class="muted">No teams.</p>';
 document.querySelectorAll(".reset-pin").forEach(b=>b.onclick=async()=>{const pin=prompt("Enter new PIN (4+ digits):");if(!pin)return;const {error}=await sb.rpc("medvika_reset_customer_team_pin",{p_customer_id:customerId,p_audit_id:currentAudit.audit_id,p_team_id:b.dataset.id,p_new_pin:pin});msg(error?error.message:"PIN reset successfully.");});
}
$("addTeamBtn").onclick=async()=>{if(!currentAudit)return;const {error}=await sb.rpc("medvika_create_customer_team",{p_customer_id:customerId,p_audit_id:currentAudit.audit_id,p_zone_id:$("teamZone").value,p_team_name:$("teamName").value,p_login_code:$("teamLoginCode").value,p_pin:$("teamPin").value,p_can_add_unlisted:$("allowUnlisted").checked});if(error){msg(error.message);return;}$("teamName").value="";$("teamLoginCode").value="";$("teamPin").value="";await loadTeams();};

async function loadRecon(){
 const {data,error}=await sb.rpc("medvika_customer_reconciliation",{p_customer_id:customerId,p_audit_id:currentAudit.audit_id});if(error){msg(error.message);return;}reconRows=data||[];
 $("reconTable").innerHTML=`<div class="table-wrap"><table><thead><tr><th>Finding</th><th>Item</th><th>Batch</th><th>System</th><th>Physical</th><th>Variance</th><th>Rate Ex-GST</th><th>Variance Value</th><th>Condition</th></tr></thead><tbody>${reconRows.slice(0,500).map(r=>`<tr><td>${esc(r.finding)}</td><td>${esc(r.item_name)}</td><td>${esc(r.batch_no||"")}</td><td>${esc(r.system_qty)}</td><td>${esc(r.physical_qty)}</td><td>${esc(r.variance_qty)}</td><td>${r.purchase_rate??"—"}</td><td>${r.variance_value??"—"}</td><td>${esc(r.condition||"")}</td></tr>`).join("")}</tbody></table></div>`;
}
$("exportCsvBtn").onclick=()=>{if(!reconRows.length)return;const csv=Papa.unparse(reconRows);const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=`Medvika_Reconciliation_${currentAudit.project_code||"Audit"}.csv`;a.click();};

(async()=>{const {data}=await sb.auth.getSession();if(data.session)await claimAndLoad();})();
