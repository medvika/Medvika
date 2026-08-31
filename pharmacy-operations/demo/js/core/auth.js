window.MedvikaAuth={
 user:{id:"public-demo",email:"demo@medvika.co.in",user_metadata:{full_name:"Demo User"}},
 profile:{user_id:"public-demo",pharmacy_id:"public-demo-pharmacy",full_name:"Demo User",role:"pharmacy_admin",is_active:true,pharmacies:{id:"public-demo-pharmacy",name:"Medvika Demo Pharmacy",legal_name:"Medvika Demo Pharmacy"}},
 permissions:new Map(),
 async initialize(){return true},
 hasPermission(){return true},
 formatRole(role){return String(role||"").replaceAll("_"," ").replace(/\b\w/g,letter=>letter.toUpperCase())},
 getDisplayName(){return"Demo User"},
 getInitials(){return"DU"},
 async logout(){window.location.href="/pharmacy-operations/"}
};