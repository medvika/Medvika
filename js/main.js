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
function sendQuote(event){

    event.preventDefault();

    let message =
    "New Medvika Quote Request\n\n" +
    "Name: " + document.querySelector("#quoteForm input:nth-child(1)").value + "\n" +
    "Mobile: " + document.querySelector("#quoteForm input:nth-child(2)").value + "\n" +
    "Email: " + document.querySelector("#quoteForm input:nth-child(3)").value;

    let whatsappURL =
    "https://wa.me/918979841035?text=" +
    encodeURIComponent(message);

    window.open(whatsappURL, "_blank");

}
function sendConsultation(event){

    event.preventDefault();

    let message =
    "New Medvika Consultation Request\n\n" +
    "Name: " + document.querySelector("#consultationForm input:nth-child(1)").value + "\n" +
    "Mobile: " + document.querySelector("#consultationForm input:nth-child(2)").value + "\n" +
    "Date: " + document.querySelector("#consultationForm input:nth-child(3)").value;

    let whatsappURL =
    "https://wa.me/918979841035?text=" +
    encodeURIComponent(message);

    window.open(whatsappURL, "_blank");

}
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
