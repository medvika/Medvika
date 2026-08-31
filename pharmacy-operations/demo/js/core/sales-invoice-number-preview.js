(function(){
  let busy=false;

  async function refresh(){
    const field=document.getElementById('invoiceNumber');
    if(!field||busy) return;
    if(field.dataset.standardPreview==='1' && !/^SAL-/i.test(field.value||'')) return;
    if(!window.supabaseClient?.rpc) return;

    busy=true;
    try{
      const {data,error}=await supabaseClient.rpc('preview_my_document_number_v1',{p_document_type:'S'});
      if(error) throw error;
      if(data){
        field.value=data;
        field.readOnly=true;
        field.dataset.standardPreview='1';
        field.title='Final invoice number is confirmed when the sale is saved.';
      }
    }catch(err){
      console.warn('Invoice number preview unavailable',err);
    }finally{
      busy=false;
    }
  }

  const observer=new MutationObserver(()=>{
    if(document.getElementById('invoiceNumber')) setTimeout(refresh,0);
  });

  document.addEventListener('DOMContentLoaded',()=>{
    observer.observe(document.body,{childList:true,subtree:true});
    refresh();
  });

  document.addEventListener('click',()=>setTimeout(refresh,20),true);
  window.addEventListener('hashchange',()=>setTimeout(refresh,100));
})();