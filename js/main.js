function searchMedicine() {

    let medicine = document.getElementById("medicineSearch").value;
    let result = document.getElementById("searchResult");

    if (medicine.trim() === "") {
        result.innerHTML = "Please enter medicine name.";
    } else {
        result.innerHTML = 
        "Search request received for: <b>" + medicine + "</b><br>" +
        "Medicine database will be available soon.";
    }

}
async function submitMedvikaLead(event,type){
 event.preventDefault();
 const form=event.currentTarget;
 const inputs=form.querySelectorAll("input");
 const name=inputs[0].value.trim(), phone=inputs[1].value.trim();
 const email=type==="request_a_quote"?inputs[2].value.trim():"";
 const date=type==="book_consultation"?inputs[2].value:"";
 const service=form.querySelector("select").value;
 const requirement=form.querySelector("textarea").value.trim();
 const message=(type==="request_a_quote"?"New Medvika Quote Request":"New Medvika Consultation Request")+"\n\n"+
  "Name: "+name+"\nMobile: "+phone+
  (email?"\nEmail: "+email:"")+(date?"\nPreferred Date: "+date:"")+
  "\nService: "+service+"\nRequirement: "+requirement;
 const url="https://wa.me/918979841035?text="+encodeURIComponent(message);
 // Open in the direct submit gesture to avoid pop-up blocking after network awaits.
 const whatsapp=window.open("about:blank","_blank");
 const btn=form.querySelector('button[type="submit"]');
 if(btn)btn.disabled=true;
 let saved=false;
 try{
  const response=await fetch("/api/leads",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({type,name,phone,email,service,requirement,preferred_date:date})});
  const data=await response.json();
  saved=response.ok&&data.saved===true;
 }catch(error){console.warn("CRM submission unavailable",error)}
 if(whatsapp&&!whatsapp.closed){whatsapp.location.replace(url)}else{window.location.href=url}
 if(!saved){console.warn("Medvika inquiry opened in WhatsApp, but CRM saving was not confirmed.");}
 if(btn)btn.disabled=false;
}
function sendQuote(event){return submitMedvikaLead(event,"request_a_quote")}
function sendConsultation(event){return submitMedvikaLead(event,"book_consultation")}
function toggleMenu() {
    const menuToggle = document.getElementById("menuToggle");
    const mainNavigation = document.getElementById("mainNavigation");

    if (!menuToggle || !mainNavigation) {
        return;
    }

    mainNavigation.classList.toggle("active");
    menuToggle.classList.toggle("active");

    const isOpen = mainNavigation.classList.contains("active");

    menuToggle.setAttribute(
        "aria-expanded",
        isOpen ? "true" : "false"
    );
}

document.querySelectorAll(".faq-question").forEach(function (question) {
    question.addEventListener("click", function () {
        const faqItem = question.closest(".faq-item");
        const faqAnswer = faqItem.querySelector(".faq-answer");
        const isOpen = faqItem.classList.contains("active");

        document.querySelectorAll(".faq-item.active").forEach(function (item) {
            item.classList.remove("active");
            item.querySelector(".faq-answer").style.maxHeight = null;
        });

        if (!isOpen) {
            faqItem.classList.add("active");
            faqAnswer.style.maxHeight = faqAnswer.scrollHeight + "px";
        }
    });
});
