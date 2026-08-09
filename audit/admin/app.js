
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

const $ = id => document.getElementById(id);
let customers = [];
let currentCustomer = null;
let currentAudit = null;
let audits = [];

function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}
function msg(t){ $("msg").textContent = t || ""; }

function showAdmin(){
  $("loginCard").hidden = true;
  $("adminArea").hidden = false;
  $("logoutBtn").hidden = false;
}

function showLogin(){
  $("loginCard").hidden = false;
  $("adminArea").hidden = true;
  $("logoutBtn").hidden = true;
}

async function verifyAdmin(){
  const { data, error } = await sb.rpc("medvika_is_audit_admin");
  if(error) throw error;
  if(data !== true) throw new Error("This account is not enabled as a Medvika Audit Admin.");
  return true;
}

async function loadAdminSession(){
  try{
    const { data, error } = await sb.auth.getSession();
    if(error) throw error;

    if(!data?.session){
      showLogin();
      return;
    }

    await verifyAdmin();
    showAdmin();
    await loadCustomers();
  }catch(err){
    console.error("Admin session error:", err);
    showLogin();
    $("loginMsg").textContent = err.message || "Unable to validate admin access.";
  }
}

$("loginBtn").addEventListener("click", async ()=>{
  const btn = $("loginBtn");
  const loginMsg = $("loginMsg");

  loginMsg.textContent = "";
  btn.disabled = true;
  btn.textContent = "Signing in...";

  try{
    const email = $("email").value.trim();
    const password = $("password").value;

    if(!email || !password) throw new Error("Enter admin email and password.");

    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if(error) throw error;

    if(!data?.session || !data?.user){
      throw new Error("Login succeeded but no active Supabase session was returned.");
    }

    await verifyAdmin();

    showAdmin();
    await loadCustomers();
  }catch(err){
    console.error("Admin login error:", err);
    loginMsg.textContent = err.message || "Unable to sign in.";
  }finally{
    btn.disabled = false;
    btn.textContent = "Admin Sign In";
  }
});

$("logoutBtn").addEventListener("click", async ()=>{
  await sb.auth.signOut();
  sessionStorage.clear();
  location.reload();
});

async function loadCustomers(){
  const { data, error } = await sb.rpc("medvika_admin_customer_list");
  if(error){ msg(error.message); return; }

  customers = data || [];

  $("customerList").innerHTML = customers.length ? customers.map(c=>`
    <div class="audit-row">
      <div>
        <strong>${esc(c.business_name)} — ${esc(c.full_name)}</strong><br>
        <small>${esc(c.email)} • ${esc(c.plan_name || "No plan")} • ${esc(c.status)}
        • Access ${esc(c.access_until || "—")}</small>
      </div>
      <button class="btn secondary open-client" data-id="${c.customer_id}">Manage</button>
    </div>
  `).join("") : '<p class="muted">No customers.</p>';

  document.querySelectorAll(".open-client").forEach(
    b => b.onclick = ()=>openClient(b.dataset.id)
  );
}

async function openClient(id){
  currentCustomer = customers.find(c=>c.customer_id===id);
  $("clientPanel").hidden = false;
  $("clientTitle").textContent = currentCustomer
    ? `${currentCustomer.business_name} — ${currentCustomer.full_name}`
    : "Customer";

  const { data, error } = await sb.rpc("medvika_customer_audits", { p_customer_id:id });
  if(error){ msg(error.message); return; }

  audits = data || [];

  $("clientAudits").innerHTML = audits.length ? audits.map(a=>`
    <div class="audit-row">
      <div>
        <strong>${esc(a.project_code)} — ${esc(a.project_name)}</strong><br>
        <small>${esc(a.location || "")} • ${esc(a.audit_date || "")} • ${esc(a.status)}</small>
      </div>
      <button class="btn secondary open-audit" data-id="${a.audit_id}">Manage Audit</button>
    </div>
  `).join("") : '<p class="muted">No audits assigned.</p>';

  document.querySelectorAll(".open-audit").forEach(
    b => b.onclick = ()=>openAudit(b.dataset.id)
  );
}

$("createAuditBtn").onclick = ()=>{ $("modal").hidden = false; };
$("cancelModal").onclick = ()=>{ $("modal").hidden = true; };

$("confirmAudit").onclick = async ()=>{
  const { data, error } = await sb.rpc("medvika_create_customer_audit", {
    p_customer_id: currentCustomer.customer_id,
    p_project_name: $("newAuditName").value,
    p_location: $("newAuditLocation").value,
    p_audit_date: $("newAuditDate").value,
    p_expected_items: Number($("newAuditItems").value || 20000)
  });

  if(error){ msg(error.message); return; }

  $("modal").hidden = true;
  await openClient(currentCustomer.customer_id);
  await openAudit(data);
};

async function openAudit(id){
  currentAudit = audits.find(a=>a.audit_id===id) || {audit_id:id};
  $("auditManage").hidden = false;
  $("adminAuditTitle").textContent =
    `${currentAudit.project_code || ""} — ${currentAudit.project_name || "Audit"}`;

  await Promise.all([loadSummary(), loadZones(), loadTeams()]);
}

async function loadSummary(){
  const { data, error } = await sb.rpc("medvika_customer_audit_summary", {
    p_customer_id: currentCustomer.customer_id,
    p_audit_id: currentAudit.audit_id
  });

  if(error){ msg(error.message); return; }

  const r = data?.[0] || {};
  $("adminSummary").innerHTML = [
    ["Count Lines",r.total_count_lines],
    ["Variance",r.variance_lines],
    ["Expired",r.expired_lines],
    ["Near Expiry",r.near_expiry_lines],
    ["Damaged",r.damaged_lines],
    ["Progress",Number(r.progress_percent||0).toFixed(1)+"%"]
  ].map(x=>`<div class="stat"><span>${x[0]}</span><strong>${x[1]??0}</strong></div>`).join("");
}

async function loadZones(){
  const { data, error } = await sb.rpc("medvika_customer_zones", {
    p_customer_id: currentCustomer.customer_id,
    p_audit_id: currentAudit.audit_id
  });

  if(error){ msg(error.message); return; }

  const rows = data || [];

  $("zoneList").innerHTML = rows.length ? rows.map(z=>`
    <div class="item-row">
      <div><strong>${esc(z.zone_code)} — ${esc(z.zone_name)}</strong><br>
      <small>${esc(z.category||"")}</small></div>
    </div>
  `).join("") : '<p class="muted">No zones.</p>';

  $("teamZone").innerHTML = rows.map(
    z=>`<option value="${z.id}">${esc(z.zone_code)} — ${esc(z.zone_name)}</option>`
  ).join("");
}

$("addZoneBtn").onclick = async ()=>{
  const { error } = await sb.rpc("medvika_manage_zone", {
    p_customer_id: currentCustomer.customer_id,
    p_audit_id: currentAudit.audit_id,
    p_zone_name: $("zoneName").value,
    p_category: $("zoneCategory").value,
    p_zone_id: null
  });

  if(error){ msg(error.message); return; }

  $("zoneName").value = "";
  $("zoneCategory").value = "";
  await loadZones();
};

async function loadTeams(){
  const { data, error } = await sb.rpc("medvika_customer_teams", {
    p_customer_id: currentCustomer.customer_id,
    p_audit_id: currentAudit.audit_id
  });

  if(error){ msg(error.message); return; }

  const rows = data || [];

  $("teamList").innerHTML = rows.length ? rows.map(t=>`
    <div class="item-row">
      <div>
        <strong>${esc(t.team_code)} — ${esc(t.team_name||"")}</strong><br>
        <small>${esc(t.zone_code||"")} ${esc(t.zone_name||"")} • Login ${esc(t.login_code||"—")}</small>
      </div>
      <button class="btn secondary reset-pin" data-id="${t.team_id}">Reset PIN</button>
    </div>
  `).join("") : '<p class="muted">No teams.</p>';

  document.querySelectorAll(".reset-pin").forEach(b=>{
    b.onclick = async ()=>{
      const pin = prompt("New PIN:");
      if(!pin) return;

      const { error } = await sb.rpc("medvika_reset_customer_team_pin", {
        p_customer_id: currentCustomer.customer_id,
        p_audit_id: currentAudit.audit_id,
        p_team_id: b.dataset.id,
        p_new_pin: pin
      });

      msg(error ? error.message : "PIN reset.");
    };
  });
}

$("addTeamBtn").onclick = async ()=>{
  const { error } = await sb.rpc("medvika_create_customer_team", {
    p_customer_id: currentCustomer.customer_id,
    p_audit_id: currentAudit.audit_id,
    p_zone_id: $("teamZone").value,
    p_team_name: $("teamName").value,
    p_login_code: $("teamLoginCode").value,
    p_pin: $("teamPin").value,
    p_can_add_unlisted: true
  });

  if(error){ msg(error.message); return; }

  $("teamName").value="";
  $("teamLoginCode").value="";
  $("teamPin").value="";
  await loadTeams();
}

loadAdminSession();
