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
document.addEventListener("DOMContentLoaded", function () {
    const menuToggle = document.getElementById("menuToggle");
    const navbar = document.getElementById("mainNavigation");
    const navLinks = navbar
        ? navbar.querySelectorAll("a")
        : [];

    if (!menuToggle || !navbar) {
        return;
    }

    function closeMenu() {
        menuToggle.classList.remove("active");
        navbar.classList.remove("active");
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.setAttribute(
            "aria-label",
            "Open navigation menu"
        );
    }

    menuToggle.addEventListener("click", function () {
        const menuIsOpen = navbar.classList.toggle("active");

        menuToggle.classList.toggle("active", menuIsOpen);
        menuToggle.setAttribute(
            "aria-expanded",
            String(menuIsOpen)
        );
        menuToggle.setAttribute(
            "aria-label",
            menuIsOpen
                ? "Close navigation menu"
                : "Open navigation menu"
        );
    });

    navLinks.forEach(function (link) {
        link.addEventListener("click", closeMenu);
    });

    document.addEventListener("click", function (event) {
        if (
            !navbar.contains(event.target) &&
            !menuToggle.contains(event.target)
        ) {
            closeMenu();
        }
    });

    window.addEventListener("resize", function () {
        if (window.innerWidth > 768) {
            closeMenu();
        }
    });
});
