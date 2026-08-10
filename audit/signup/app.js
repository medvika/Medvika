const SUPABASE_URL="https://etevzodzxhsdwidtrmwv.supabase.co";
const SUPABASE_ANON_KEY="sb_publishable_iKWBOAxrWTZfU6Qb5PYd5Q_0y80GEOw";
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
const $=id=>document.getElementById(id);

const params=new URLSearchParams(location.search);
const paidMode=params.get("plans")==="1";
const PILOT_PLAN_CODE="FREE_PILOT";
let loadedPlans=[];

function money(v){
  return "₹"+Number(v||0).toLocaleString("en-IN",{maximumFractionDigits:2});
}

function setMode(){
  if(!paidMode){
    $("pilotPlan").hidden=false;
    $("plans").hidden=true;
    $("paidPlanLabel").hidden=true;
    $("planCode").required=false;
    $("pageTitle").textContent="Start Your Free Pilot Workspace";
    $("pageIntro").textContent="Create your account for Medvika's limited-period Stock Audit Pilot. No package selection or online payment is required during the pilot.";
    $("submitBtn").textContent="Create Free Pilot Account";
    return;
  }

  $("pilotPlan").hidden=true;
  $("plans").hidden=false;
  $("paidPlanLabel").hidden=false;
  $("planCode").required=true;
  $("pageTitle").textContent="Start Your Stock Audit Workspace";
  $("pageIntro").textContent="Choose a commercial audit access plan and submit your registration. Medvika will review your request and payment status.";
  $("submitBtn").textContent="Create Account & Submit Registration";
  $("pilotNote").textContent="Commercial package access is activated after Medvika verifies the applicable payment.";
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
  if(!paidMode) return;

  $("msg").textContent="";
  const {data,error}=await sb
    .from("medvika_audit_plans")
    .select("plan_code,plan_name,amount,validity_days,sku_limit,team_limit,audit_limit")
    .eq("active",true)
    .neq("plan_code",PILOT_PLAN_CODE)
    .order("amount",{ascending:true});

  if(error){
    console.error("Plan load error:",error);
    $("planCode").innerHTML='<option value="">Plans unavailable</option>';
    $("plans").innerHTML='<div class="card"><p class="muted">Plans could not be loaded. Please contact Medvika or try again shortly.</p></div>';
    $("msg").textContent="Plan loading error: "+error.message;
    return;
  }

  if(!data || !data.length){
    $("planCode").innerHTML='<option value="">No active commercial plans</option>';
    $("plans").innerHTML='<div class="card"><p class="muted">No commercial audit plans are currently available.</p></div>';
    return;
  }

  renderPlans(data);
}

$("planCode")?.addEventListener("change",()=>{
  document.querySelectorAll(".plan").forEach(x=>x.classList.toggle("selected",x.dataset.code===$("planCode").value));
});

$("signupForm").addEventListener("submit",async e=>{
  e.preventDefault();

  const btn=$("submitBtn");
  const plan=paidMode ? $("planCode").value : PILOT_PLAN_CODE;
  const fullName=$("fullName").value.trim();
  const businessName=$("businessName").value.trim();
  const email=$("email").value.trim().toLowerCase();
  const mobile=$("mobile").value.trim();
  const password=$("password").value;
  const confirmPassword=$("confirmPassword").value;

  if(paidMode && !plan){ $("msg").textContent="Please select a plan."; return; }
  if(!email){ $("msg").textContent="Enter a valid email address."; return; }
  if(!password || password.length<6){ $("msg").textContent="Password must be at least 6 characters."; return; }
  if(password!==confirmPassword){ $("msg").textContent="Passwords do not match."; return; }

  btn.disabled=true;
  btn.textContent="Creating account...";
  $("msg").textContent="Creating your secure login...";
  $("successBox").style.display="none";

  try{
    const {data:authData,error:authError}=await sb.auth.signUp({
      email,
      password,
      options:{
        emailRedirectTo:location.origin+"/audit/customer/",
        data:{
          full_name:fullName,
          business_name:businessName,
          mobile,
          source:paidMode ? "medvika_audit_paid_signup" : "medvika_audit_free_pilot"
        }
      }
    });
    if(authError) throw authError;

    btn.textContent="Saving registration...";
    $("msg").textContent=paidMode ? "Login created. Saving audit registration..." : "Login created. Saving Free Pilot request...";

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

    if(paidMode){
      location.href="../payment/?signup="+encodeURIComponent(signupId);
      return;
    }

    // FREE PILOT: no package/payment page.
    $("msg").textContent="";
    $("successBox").style.display="block";
    btn.textContent="Free Pilot Registration Submitted";
    $("signupForm").querySelectorAll("input,select").forEach(el=>el.disabled=true);
    btn.disabled=true;
    window.scrollTo({top:document.body.scrollHeight,behavior:"smooth"});
  }catch(err){
    console.error("Audit signup error:",err);
    const text=String(err?.message||err||"Unable to complete signup.");
    if(/already registered|already exists|user already/i.test(text)){
      $("msg").textContent="This email already has a login. Use the Customer Portal with your existing account, or use another email.";
    }else if(/FREE_PILOT|foreign key|plan/i.test(text)){
      $("msg").textContent="Free Pilot plan is not configured in Supabase yet. Run the supplied FREE_PILOT SQL once, then retry.";
    }else{
      $("msg").textContent=text;
    }
    btn.disabled=false;
    btn.textContent=paidMode ? "Create Account & Submit Registration" : "Create Free Pilot Account";
  }
});

setMode();
loadPlans();
