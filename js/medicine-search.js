
document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("medicineSearchForm");
    const type = document.getElementById("medicineSearchType");
    const input = document.getElementById("medicineSearchInput");
    const title = document.getElementById("medicineResultTitle");
    const text = document.getElementById("medicineResultText");
    const whatsapp = document.getElementById("medicineWhatsAppLink");

    if (!form || !type || !input || !title || !text || !whatsapp) return;

    form.addEventListener("submit", function (event) {
        event.preventDefault();

        const searchTerm = input.value.trim();
        const searchType = type.value;

        if (!searchTerm) {
            input.focus();
            return;
        }

        title.textContent = 'Request received for "' + searchTerm + '"';
        text.textContent =
            "The full medicine database is being expanded. You can send this search " +
            "request to Medvika for assistance.";

        const message =
            "Hello Medvika, I need medicine information.%0A%0A" +
            "Search type: " + encodeURIComponent(searchType) + "%0A" +
            "Search term: " + encodeURIComponent(searchTerm);

        whatsapp.href = "https://wa.me/918979841035?text=" + message;
        whatsapp.focus();
    });
});
