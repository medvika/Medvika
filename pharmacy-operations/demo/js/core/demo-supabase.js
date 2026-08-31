(function(){
  const result={data:[],error:null,count:0};
  const makeQuery=()=>new Proxy({},{
    get(_target,prop){
      if(prop==="then")return(resolve)=>Promise.resolve(result).then(resolve);
      if(prop==="maybeSingle"||prop==="single")return async()=>({data:null,error:null});
      return()=>makeQuery();
    }
  });
  window.supabaseClient={
    from(){return makeQuery()},
    rpc:async()=>({data:[],error:null}),
    auth:{
      getSession:async()=>({data:{session:null},error:null}),
      signOut:async()=>({error:null}),
      signInWithPassword:async()=>({data:null,error:{message:"Public demo does not use sign-in."}})
    }
  };
})();