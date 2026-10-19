const SUPABASE_URL = "https://etevzodzxhsdwidtrmwv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_iKWBOAxrWTZfU6Qb5PYd5Q_0y80GEOw";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = id => document.getElementById(id);

$("trialForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const btn = $("submitBtn");
  const msg = $("msg");

  const fullName = $("fullName").value.trim();
  const businessName = $("businessName").value.trim();
  const email = $("email").value.trim().toLowerCase();
  const mobile = $("mobile").value.trim();
  const city = $("city").value.trim();
  const state = $("state").value.trim();

  if (!fullName || !businessName || !email || !mobile) {
    msg.textContent = "Please complete all required fields.";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Submitting request...";
  msg.textContent = "Saving your trial request...";
  $("successBox").hidden = true;

  try {
    const { data, error } = await sb.rpc("medvika_audit_submit_signup", {
      p_full_name: fullName,
      p_business_name: businessName,
      p_email: email,
      p_mobile: mobile,
      p_city: city,
      p_state: state,
      p_plan_code: "FREE_PILOT"
    });

    if (error) throw error;

    if (data) sessionStorage.setItem("medvika_trial_request_id", String(data));

    // Trial request is already saved by the Supabase RPC. CRM syncing must not
    // cause a second trial signup or undo the successful request.
    let crmSynced = false;
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({
          type: "audit_trial", name: fullName, phone: mobile, email,
          business_name: businessName, city, state,
          service: "Pharmacy Stock Audit Trial",
          requirement: "Requested 3-day audit trial access",
          trial_request_id: String(data || "")
        })
      });
      const result = await response.json();
      crmSynced = response.ok && result.saved === true;
      if (!crmSynced) console.warn("Trial saved; CRM sync not confirmed", result.error || response.status);
    } catch (syncError) {
      console.warn("Trial saved; CRM sync unavailable", syncError);
    }

    msg.textContent = crmSynced ? "" : "Trial request received. CRM follow-up sync is pending; Medvika can still review your request.";
    $("successBox").hidden = false;
    btn.textContent = "Request Submitted";
    btn.disabled = true;

    $("trialForm").querySelectorAll("input").forEach(el => el.disabled = true);

  } catch (err) {
    console.error("Trial request error:", err);

    const text = String(err?.message || err || "Unable to submit request.");

    if (/FREE_PILOT|plan|foreign key/i.test(text)) {
      msg.textContent = "Trial request plan is not configured. Please contact Medvika.";
    } else {
      msg.textContent = text;
    }

    btn.disabled = false;
    btn.textContent = "Request Trial Access";
  }
});
