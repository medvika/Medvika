
const SUPABASE_URL = "https://etevzodzxhsdwidtrmwv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_iKWBOAxrWTZfU6Qb5PYd5Q_0y80GEOw";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth:{storage:window.sessionStorage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
});

const $=id=>document.getElementById(id);
let customers=[],currentCustomer=null,currentAudit=null,audits=[];

function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function msg(t){$("msg").textContent=t||"";}

function closeAuditModal(){const m=$("modal");if(!m)return;m.hidden=true;m.setAttribute("aria-hidden","true");}
function openAuditModal(){if(!currentCustomer){msg("Select a customer first.");return;}const m=$("modal");m.hidden=false;m.setAttribute("aria-hidden","false");}
function showAdmin(){$("loginCard").hidden=true;$("adminArea").hidden=false;$("logoutBtn").hidden=false;}
function showLogin(){$("loginCard").hidden=false;$("adminArea").hidden=true;$("logoutBtn").hidden=true;}

async function verifyAdmin(){
  const {data,error}=await sb.rpc("medvika_is_audit_admin");
  if(error) throw error;
  if(data!==true) throw new Error("This account is not enabled as a Medvika Audit Admin.");
}

async function loadAdminSession(){
  try{
    const {data,error}=await sb.auth.getSession();
    if(error) throw error;
    if(!data?.session){showLogin();return;}
    await verifyAdmin();
    showAdmin();
    await loadAll();
  }catch(err){
    showLogin();
    $("loginMsg").textContent=err.message||"Unable to validate admin access.";
  }
}

$("loginBtn").onclick=async()=>{
  const btn=$("loginBtn");btn.disabled=true;btn.textContent="Signing in...";$("loginMsg").textContent="";
  try{
    const {data,error}=await sb.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});
    if(error) throw error;
    if(!data?.session) throw new Error("No active session returned.");
    await verifyAdmin();
    showAdmin();
    await loadAll();
  }catch(err){$("loginMsg").textContent=err.message||"Unable to sign in.";}
  finally{btn.disabled=false;btn.textContent="Admin Sign In";}
};

$("logoutBtn").onclick=async()=>{await sb.auth.signOut();sessionStorage.clear();location.reload();};
$("reloadBtn").onclick=loadAll;

async function loadAll(){await Promise.all([loadSignupRequests(),loadCustomersAndAccess()]);}

async function loadSignupRequests(){
  const {data,error}=await sb
    .from("medvika_audit_signup_requests")
    .select("id,full_name,business_name,email,mobile,city,state,plan_code,status,created_at")
    .order("created_at",{ascending:false})
    .limit(100);

  if(error){
    $("signupList").innerHTML=`<p class="muted">${esc(error.message)}</p>`;
    return;
  }

  const rows=data||[];
  $("signupList").innerHTML=rows.length?rows.map(r=>`
    <div class="signup-row">
      <div>
        <strong>${esc(r.business_name)} — ${esc(r.full_name)}</strong>
        <small>${esc(r.email)} • ${esc(r.mobile||"")} • ${esc(r.city||"")} • Plan ${esc(r.plan_code)}</small>
        <small><span class="${r.status==="processed"?"status-processed":"status-new"}">${esc(r.status)}</span></small>
      </div>
      ${r.status==="processed"
        ? '<span class="muted">Customer created</span>'
        : `<button class="btn primary create-customer" data-id="${r.id}">Create Customer</button>`}
    </div>
  `).join(""):'<p class="muted">No signup requests yet.</p>';

  document.querySelectorAll(".create-customer").forEach(b=>{
    b.onclick=async()=>{
      b.disabled=true;b.textContent="Creating...";
      const {data,error}=await sb.rpc("medvika_audit_admin_create_customer",{p_signup_id:b.dataset.id});
      if(error){msg(error.message);b.disabled=false;b.textContent="Create Customer";return;}
      msg(`Customer created. Customer ID: ${data}`);
      await loadAll();
    };
  });
}

async function loadCustomersAndAccess(){
  const {data,error}=await sb.rpc("medvika_admin_subscription_list");
  if(error){
    $("customerList").innerHTML=`<p class="muted">${esc(error.message)}</p>`;
    return;
  }

  customers=data||[];

  $("customerList").innerHTML=customers.length?customers.map(c=>{
    const status=String(c.customer_status||"pending").toLowerCase();
    const badgeClass=status==="active"?"active":status==="suspended"?"suspended":status==="expired"?"expired":"pending";
    const canActivate=c.payment_status!=="approved" || status!=="active";
    return `
      <div class="customer-access-card">
        <div class="customer-access-head">
          <div>
            <strong>${esc(c.business_name)} — ${esc(c.full_name)}</strong>
            <div class="customer-access-meta">
              ${esc(c.email)} • ${esc(c.mobile||"")}<br>
              ${esc(c.plan_name||"No plan")} • ₹${Number(c.amount||0).toLocaleString("en-IN")} • ${esc(c.validity_days||"")} days
            </div>
          </div>
          <span class="badge ${badgeClass}">${esc(status)}</span>
        </div>

        <div class="customer-access-meta" style="margin-top:8px">
          Payment: <strong>${esc(c.payment_status||"pending")}</strong><br>
          Access Until: <span class="access-date">${esc(c.access_until||"Not activated")}</span>
        </div>

        <div class="access-actions">
          ${canActivate?`<button class="btn primary activate" data-sub="${c.subscription_id}">Verify Payment & Activate</button>`:""}
          <button class="btn secondary extend" data-sub="${c.subscription_id}">Extend Access</button>
          ${status==="suspended"
            ? `<button class="btn secondary restore" data-customer="${c.customer_id}">Restore Access</button>`
            : `<button class="btn danger suspend" data-customer="${c.customer_id}">Suspend</button>`}
          <button class="btn secondary open-client" data-id="${c.customer_id}">Manage Audits</button>
        </div>
      </div>`;
  }).join(""):'<p class="muted">No customers.</p>';

  document.querySelectorAll(".activate").forEach(b=>b.onclick=async()=>{
    const ok=confirm("Confirm payment has been received and verified? This will activate the customer's paid access.");
    if(!ok)return;
    b.disabled=true;b.textContent="Activating...";
    const {error}=await sb.rpc("medvika_audit_admin_activate_subscription",{p_subscription_id:b.dataset.sub});
    msg(error?error.message:"Payment verified and access activated.");
    await loadCustomersAndAccess();
  });

  document.querySelectorAll(".extend").forEach(b=>b.onclick=async()=>{
    const days=prompt("Extend access by how many days?","30");
    if(!days)return;
    const n=Number(days);
    if(!Number.isFinite(n)||n<1){msg("Enter valid extension days.");return;}
    const {data,error}=await sb.rpc("medvika_audit_admin_extend_access",{p_subscription_id:b.dataset.sub,p_days:n});
    msg(error?error.message:`Access extended until ${data}`);
    await loadCustomersAndAccess();
  });

  document.querySelectorAll(".suspend").forEach(b=>b.onclick=async()=>{
    const ok=confirm("Suspend this customer's audit access?");
    if(!ok)return;
    const {error}=await sb.rpc("medvika_audit_admin_suspend_customer",{p_customer_id:b.dataset.customer});
    msg(error?error.message:"Customer access suspended.");
    await loadCustomersAndAccess();
  });

  document.querySelectorAll(".restore").forEach(b=>b.onclick=async()=>{
    const {error}=await sb.rpc("medvika_audit_admin_restore_customer",{p_customer_id:b.dataset.customer});
    msg(error?error.message:"Customer access restored according to subscription validity.");
    await loadCustomersAndAccess();
  });

  document.querySelectorAll(".open-client").forEach(b=>b.onclick=()=>openClient(b.dataset.id));
}
async function openClient(id){
  currentCustomer=customers.find(c=>c.customer_id===id);
  $("clientPanel").hidden=false;
  $("clientTitle").textContent=currentCustomer?`${currentCustomer.business_name} — ${currentCustomer.full_name}`:"Customer";
  const {data,error}=await sb.rpc("medvika_customer_audits",{p_customer_id:id});
  if(error){msg(error.message);return;}
  audits=data||[];
  $("clientAudits").innerHTML=audits.length?audits.map(a=>`
    <div class="audit-row">
      <div><strong>${esc(a.project_code)} — ${esc(a.project_name)}</strong><br>
      <small>${esc(a.location||"")} • ${esc(a.audit_date||"")} • ${esc(a.status)}</small></div>
      <div class="audit-actions">
        <div class="audit-actions"><button class="btn secondary open-audit" data-id="${a.audit_id}">Teams & Setup</button><a class="btn primary" href="/audit/?audit=${encodeURIComponent(a.audit_id)}" target="_blank" rel="noopener">Open Audit Workspace</a>${String(a.status||"").toLowerCase()==="planning"?`<button class="btn danger delete-audit" data-id="${a.audit_id}" data-code="${esc(a.project_code)}">Delete</button>`:""}</div>
        ${String(a.status||"").toLowerCase()==="planning"
          ? `<button class="btn danger delete-audit" data-id="${a.audit_id}" data-code="${esc(a.project_code)}">Delete</button>`
          : ""}
      </div>
    </div>`).join(""):'<p class="muted">No audits assigned.</p>';
  document.querySelectorAll(".open-audit").forEach(b=>b.onclick=()=>openAudit(b.dataset.id));
  document.querySelectorAll(".delete-audit").forEach(b=>b.onclick=async()=>{
    const ok=confirm(`Delete ${b.dataset.code}? This is only allowed for an empty planning audit and cannot be undone.`);
    if(!ok) return;

    b.disabled=true;
    b.textContent="Deleting...";

    const {error}=await sb.rpc("medvika_admin_delete_audit",{p_audit_id:b.dataset.id});

    if(error){
      msg(error.message);
      b.disabled=false;
      b.textContent="Delete";
      return;
    }

    msg("Planning audit deleted successfully.");
    currentAudit=null;
    $("auditManage").hidden=true;
    await openClient(currentCustomer.customer_id);
  });
}

$("createAuditBtn").onclick=openAuditModal;
$("cancelModal").onclick=closeAuditModal;

$("confirmAudit").onclick=async()=>{
  const {data,error}=await sb.rpc("medvika_create_customer_audit",{
    p_customer_id:currentCustomer.customer_id,
    p_project_name:$("newAuditName").value,
    p_location:$("newAuditLocation").value,
    p_audit_date:$("newAuditDate").value,
    p_expected_items:Number($("newAuditItems").value||20000)
  });
  if(error){msg(error.message);return;}
  closeAuditModal();await openClient(currentCustomer.customer_id);await openAudit(data);
};

async function openAudit(id){
  currentAudit=audits.find(a=>a.audit_id===id)||{audit_id:id};
  $("auditManage").hidden=false;
  $("adminAuditTitle").textContent=`${currentAudit.project_code||""} — ${currentAudit.project_name||"Audit"}`;
  await Promise.all([loadSummary(),loadZones(),loadTeams()]); if($("allocationPanel")) $("allocationPanel").hidden=false; if(window.stockAllocation) await window.stockAllocation.loadSummary(); if($("unifiedImportPanel")) $("unifiedImportPanel").hidden=true;
}
async function loadSummary(){
  const {data,error}=await sb.rpc("medvika_customer_audit_summary",{p_customer_id:currentCustomer.customer_id,p_audit_id:currentAudit.audit_id});
  if(error){msg(error.message);return;}
  const r=data?.[0]||{};
  $("adminSummary").innerHTML=[["Count Lines",r.total_count_lines],["Variance",r.variance_lines],["Expired",r.expired_lines],["Near Expiry",r.near_expiry_lines],["Damaged",r.damaged_lines],["Progress",Number(r.progress_percent||0).toFixed(1)+"%"]].map(x=>`<div class="stat"><span>${x[0]}</span><strong>${x[1]??0}</strong></div>`).join("");
}
async function loadZones(){
  const {data,error}=await sb.rpc("medvika_customer_zones",{p_customer_id:currentCustomer.customer_id,p_audit_id:currentAudit.audit_id});
  if(error){msg(error.message);return;}
  const rows=data||[];
  $("zoneList").innerHTML=rows.length?rows.map(z=>`<div class="item-row"><div><strong>${esc(z.zone_code)} — ${esc(z.zone_name)}</strong><br><small>${esc(z.category||"")}</small></div></div>`).join(""):'<p class="muted">No zones.</p>';
  $("teamZone").innerHTML=rows.map(z=>`<option value="${z.id}">${esc(z.zone_code)} — ${esc(z.zone_name)}</option>`).join(""); if($("allocationZone")) $("allocationZone").innerHTML='<option value="">-- No Zone --</option>'+rows.map(z=>`<option value="${z.id}">${esc(z.zone_code)} — ${esc(z.zone_name)}</option>`).join(""); if($("unifiedPhysicalZone")) $("unifiedPhysicalZone").innerHTML=rows.map(z=>`<option value="${z.id}">${esc(z.zone_code)} — ${esc(z.zone_name)}</option>`).join("");
}
$("addZoneBtn").onclick=async()=>{
  const {error}=await sb.rpc("medvika_manage_zone",{p_customer_id:currentCustomer.customer_id,p_audit_id:currentAudit.audit_id,p_zone_name:$("zoneName").value,p_category:$("zoneCategory").value,p_zone_id:null});
  if(error){msg(error.message);return;}
  $("zoneName").value="";$("zoneCategory").value="";await loadZones();
};
async function loadTeams(){
  const {data,error}=await sb.rpc("medvika_customer_teams",{p_customer_id:currentCustomer.customer_id,p_audit_id:currentAudit.audit_id});
  if(error){msg(error.message);return;}
  const rows=data||[]; if($("allocationTeam")) $("allocationTeam").innerHTML='<option value="">-- No Team --</option>'+rows.map(t=>`<option value="${t.team_id}">${esc(t.team_code)} — ${esc(t.team_name||"")}</option>`).join("");
  $("teamList").innerHTML=rows.length?rows.map(t=>`<div class="item-row"><div><strong>${esc(t.team_code)} — ${esc(t.team_name||"")}</strong><br><small>${esc(t.zone_code||"")} ${esc(t.zone_name||"")} • Login ${esc(t.login_code||"—")}</small></div><button class="btn secondary reset-pin" data-id="${t.team_id}">Reset PIN</button></div>`).join(""):'<p class="muted">No teams.</p>';
  if($("unifiedPhysicalTeam")) $("unifiedPhysicalTeam").innerHTML=rows.map(t=>`<option value="${t.team_id}">${esc(t.team_code)} — ${esc(t.team_name||"")}</option>`).join("");
  document.querySelectorAll(".reset-pin").forEach(b=>b.onclick=async()=>{
    const pin=prompt("New PIN:");if(!pin)return;
    const {error}=await sb.rpc("medvika_reset_customer_team_pin",{p_customer_id:currentCustomer.customer_id,p_audit_id:currentAudit.audit_id,p_team_id:b.dataset.id,p_new_pin:pin});
    msg(error?error.message:"PIN reset.");
  });
}
$("addTeamBtn").onclick=async()=>{
  const {error}=await sb.rpc("medvika_create_customer_team",{p_customer_id:currentCustomer.customer_id,p_audit_id:currentAudit.audit_id,p_zone_id:$("teamZone").value,p_team_name:$("teamName").value,p_login_code:$("teamLoginCode").value,p_pin:$("teamPin").value,p_can_add_unlisted:true});
  if(error){msg(error.message);return;}
  $("teamName").value="";$("teamLoginCode").value="";$("teamPin").value="";await loadTeams();
};


window.unifiedImporter=installUnifiedImporter({
  sb,esc,msg,
  getAuditId:()=>currentAudit?.audit_id||null,
  getCustomerId:()=>currentCustomer?.customer_id||null,
  reloadAfterImport:async()=>{if(currentAudit) await loadSummary();},
  zoneProvider:()=>[],
  teamProvider:()=>[]
});


window.stockAllocation=installStockAllocation({
  sb,esc,msg,
  getAuditId:()=>currentAudit?.audit_id||null
});

closeAuditModal();
loadAdminSession();
