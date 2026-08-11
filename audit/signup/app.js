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

    msg.textContent = "";
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
