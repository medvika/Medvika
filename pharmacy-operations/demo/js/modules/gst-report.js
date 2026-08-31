window.initGstReportModule=async function(){
  const router=window.MedvikaRouter;
  document.querySelectorAll("[data-gst-route]").forEach(button=>{
    button.onclick=()=>router.navigate(button.dataset.gstRoute);
  });
};
