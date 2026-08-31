(function(){
  const blockedWords=/\b(save|post|delete|remove|submit|import|upload|approve|cancel invoice|complete purchase|create user|add user|invite user|write[- ]?off|settle claim|transfer stock)\b/i;
  const restrictedRoutes=/\b(users?|permissions?|backup|configuration|company settings|organization|store assignment|username accounts?)\b/i;

  function notify(message){
    if(window.MedvikaUI?.toast) window.MedvikaUI.toast(message,"info");
    else alert(message);
  }

  function labelSandbox(){
    const name=document.getElementById("userName"),role=document.getElementById("userRole");
    if(name) name.textContent="Demo Visitor";
    if(role) role.textContent="Public Sandbox";
    document.body.classList.add("public-demo-sandbox");
    if(!document.getElementById("publicDemoBanner")){
      const bar=document.createElement("div");
      bar.id="publicDemoBanner";
      bar.innerHTML='<strong>PUBLIC SANDBOX</strong><span>Explore workflows using sample data. Changes are not permanently saved.</span><a href="/pharmacy-operations/#plans">View subscription plans</a>';
      document.body.prepend(bar);
    }
  }

  document.addEventListener("submit",function(event){
    const form=event.target;
    const text=(form?.innerText||"")+" "+(event.submitter?.innerText||"");
    if(blockedWords.test(text)||form?.querySelector('[type="submit"]')){
      event.preventDefault();event.stopImmediatePropagation();
      notify("Public sandbox: this action is disabled and no information was saved.");
    }
  },true);

  document.addEventListener("click",function(event){
    const target=event.target.closest("button,a");
    if(!target)return;
    const text=(target.innerText||target.getAttribute("aria-label")||target.title||"").trim();
    const route=(target.dataset?.route||target.dataset?.dashboardRoute||target.getAttribute("href")||"");
    if(restrictedRoutes.test(text+" "+route)){
      event.preventDefault();event.stopImmediatePropagation();
      notify("This administrative area is disabled in the public sandbox.");
      return;
    }
    if(blockedWords.test(text)&&!/^new sale$|^purchase$|^add medicine$/i.test(text)){
      event.preventDefault();event.stopImmediatePropagation();
      notify("Public sandbox: this action is disabled and no information was saved.");
    }
  },true);

  const observer=new MutationObserver(labelSandbox);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener("DOMContentLoaded",labelSandbox);
  setTimeout(labelSandbox,250);
})();