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
