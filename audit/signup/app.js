
const SUPABASE_URL="https://etevzodzxhsdwidtrmwv.supabase.co";
const SUPABASE_ANON_KEY="sb_publishable_iKWBOAxrWTZfU6Qb5PYd5Q_0y80GEOw";
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
const $=id=>document.getElementById(id);

let loadedPlans=[];

function money(v){
  return "₹"+Number(v||0).toLocaleString("en-IN",{maximumFractionDigits:2});
}

function renderPlans(plans){
  loadedPlans=plans||[];
  $("plans").innerHTML=loadedPlans.map(p=>`
    <div class="plan" data-code="${p.plan_code}">
      <h3>${p.plan_name}</h3>
      <strong>${money(p.amount)}</strong>
      <p class="muted">${p.validity_days} days • ${Number(p.sku_limit||0).toLocaleString("en-IN")} SKUs • ${p.team_limit} teams • ${p.audit_limit} audit(s)</p>
    </div>
  `).join("");

  $("planCode").innerHTML='<option value="">Select a plan</option>'+loadedPlans.map(
    p=>`<option value="${p.plan_code}">${p.plan_name} — ${money(p.amount)}</option>`
  ).join("");

  document.querySelectorAll(".plan").forEach(card=>{
    card.addEventListener("click",()=>{
      $("planCode").value=card.dataset.code;
      document.querySelectorAll(".plan").forEach(x=>x.classList.remove("selected"));
      card.classList.add("selected");
    });
  });
}

async function loadPlans(){
  $("msg").textContent="";
  const {data,error}=await sb
    .from("medvika_audit_plans")
    .select("plan_code,plan_name,amount,validity_days,sku_limit,team_limit,audit_limit")
    .eq("active",true)
    .order("amount",{ascending:true});

  if(error){
    console.error("Plan load error:",error);
    $("planCode").innerHTML='<option value="">Plans unavailable</option>';
    $("plans").innerHTML='<div class="card"><p class="muted">Plans could not be loaded. Please contact Medvika or try again shortly.</p></div>';
    $("msg").textContent="Plan loading error: "+error.message;
    return;
  }

  if(!data || !data.length){
    $("planCode").innerHTML='<option value="">No active plans</option>';
    $("plans").innerHTML='<div class="card"><p class="muted">No active audit plans are configured yet.</p></div>';
    $("msg").textContent="No active Medvika Audit plans found.";
    return;
  }

  renderPlans(data);
}

$("planCode").addEventListener("change",()=>{
  document.querySelectorAll(".plan").forEach(x=>x.classList.toggle("selected",x.dataset.code===$("planCode").value));
});

$("signupForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const btn=$("submitBtn");
  const plan=$("planCode").value;
  const fullName=$("fullName").value.trim();
  const businessName=$("businessName").value.trim();
  const email=$("email").value.trim().toLowerCase();
  const mobile=$("mobile").value.trim();
  const password=$("password").value;
  const confirmPassword=$("confirmPassword").value;

  if(!plan){ $("msg").textContent="Please select a plan."; return; }
  if(!email){ $("msg").textContent="Enter a valid email address."; return; }
  if(!password || password.length<6){ $("msg").textContent="Password must be at least 6 characters."; return; }
  if(password!==confirmPassword){ $("msg").textContent="Passwords do not match."; return; }

  btn.disabled=true;
  btn.textContent="Creating account...";
  $("msg").textContent="Creating your secure login...";

  try{
    // 1) Create the Supabase Auth user automatically. This removes the old
    // manual step of creating a user in Supabase Authentication.
    const {data:authData,error:authError}=await sb.auth.signUp({
      email,
      password,
      options:{
        emailRedirectTo:location.origin+"/audit/customer/",
        data:{
          full_name:fullName,
          business_name:businessName,
          mobile,
          source:"medvika_audit_signup"
        }
      }
    });
    if(authError) throw authError;

    btn.textContent="Saving registration...";
    $("msg").textContent="Login created. Saving audit registration...";

    // 2) Save the commercial/signup request in the audit tables.
    const {data:signupId,error:signupError}=await sb.rpc("medvika_audit_submit_signup",{
      p_full_name:fullName,
      p_business_name:businessName,
      p_email:email,
      p_mobile:mobile,
      p_city:$("city").value.trim(),
      p_state:$("state").value.trim(),
      p_plan_code:plan
    });
    if(signupError) throw signupError;

    sessionStorage.setItem("medvika_signup_id",signupId);
    if(authData?.user?.id) sessionStorage.setItem("medvika_auth_user_id",authData.user.id);
    location.href="../payment/?signup="+encodeURIComponent(signupId);
  }catch(err){
    console.error("Audit signup error:",err);
    const text=String(err?.message||err||"Unable to complete signup.");
    if(/already registered|already exists|user already/i.test(text)){
      $("msg").textContent="This email already has a login. Use Customer Portal Sign In/Forgot Password, or use another email.";
    }else{
      $("msg").textContent=text;
    }
    btn.disabled=false;
    btn.textContent="Create Account & Submit Registration";
  }
});

loadPlans();
