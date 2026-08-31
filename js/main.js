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

/* Homepage hero refresh: realistic pharmacy photo + responsive header fix. */
document.addEventListener("DOMContentLoaded", function () {
    const heroImage = document.querySelector(".hero-image");

    if (heroImage) {
        const originalSrc = heroImage.getAttribute("src");
        heroImage.src = "https://images.pexels.com/photos/13119975/pexels-photo-13119975.jpeg?auto=compress&cs=tinysrgb&w=1200";
        heroImage.alt = "Pharmacy professional inside a well-stocked modern pharmacy";
        heroImage.style.objectFit = "cover";
        heroImage.style.aspectRatio = "4 / 5";
        heroImage.style.width = "100%";
        heroImage.style.height = "auto";

        heroImage.addEventListener("error", function () {
            if (originalSrc && heroImage.src.indexOf(originalSrc) === -1) {
                heroImage.src = originalSrc;
            }
        }, { once: true });
    }

    const quoteButton = document.querySelector(".quote-btn");
    if (quoteButton) {
        quoteButton.textContent = "Request Demo";
        quoteButton.setAttribute("aria-label", "Request a Medvika demo");
    }

    const style = document.createElement("style");
    style.id = "medvika-hero-header-fix";
    style.textContent = `
        .hero-visual {
            overflow: visible;
        }

        .hero-image {
            min-height: 520px;
            max-height: 650px;
            object-fit: cover !important;
            object-position: center;
            border-radius: 20px;
        }

        @media (max-width: 1180px) and (min-width: 769px) {
            body {
                padding-top: 92px;
            }

            .nav-container {
                min-height: 92px !important;
                gap: 14px !important;
            }

            .logo img {
                width: 185px !important;
                max-height: 70px !important;
            }

            .menu-toggle {
                display: block !important;
                margin-left: auto;
                flex: 0 0 auto;
            }

            .navbar {
                position: absolute;
                top: 100%;
                left: 4%;
                right: 4%;
                width: auto;
                padding: 0 18px;
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 0 0 16px 16px;
                box-shadow: 0 16px 30px rgba(15, 23, 42, 0.12);
                max-height: 0;
                overflow: hidden;
                visibility: hidden;
                opacity: 0;
                transition: max-height 0.35s ease, opacity 0.25s ease, visibility 0.25s ease;
            }

            .navbar.active {
                max-height: 560px;
                padding-top: 10px;
                padding-bottom: 16px;
                visibility: visible;
                opacity: 1;
            }

            .navbar ul {
                flex-direction: column;
                align-items: stretch;
                gap: 0 !important;
            }

            .navbar li {
                border-bottom: 1px solid #eef2f7;
            }

            .navbar li:last-child {
                border-bottom: 0;
            }

            .navbar a {
                display: block;
                padding: 12px 4px;
            }

            .navbar a::after {
                display: none !important;
            }

            .quote-btn {
                display: inline-flex !important;
                min-height: 44px !important;
                padding: 10px 15px !important;
                font-size: 14px !important;
                border-radius: 10px !important;
                flex: 0 0 auto;
            }

            .menu-toggle.active span:nth-child(1) {
                transform: translateY(8px) rotate(45deg);
            }

            .menu-toggle.active span:nth-child(2) {
                opacity: 0;
            }

            .menu-toggle.active span:nth-child(3) {
                transform: translateY(-8px) rotate(-45deg);
            }
        }

        @media (max-width: 768px) {
            .nav-container {
                gap: 8px !important;
            }

            .logo img {
                width: 142px !important;
            }

            .quote-btn {
                display: inline-flex !important;
                order: 2;
                min-height: 40px !important;
                padding: 8px 11px !important;
                font-size: 12px !important;
                border-radius: 9px !important;
                margin-left: auto;
            }

            .menu-toggle {
                order: 3;
                margin-left: 0 !important;
                width: 40px;
                height: 40px;
                padding: 7px;
            }

            .navbar {
                order: 4;
            }

            .hero-right {
                width: 100%;
            }

            .hero-visual {
                width: min(100%, 520px);
                margin-inline: auto;
            }

            .hero-image {
                min-height: 0;
                max-height: none;
                aspect-ratio: 4 / 5;
            }
        }

        @media (max-width: 390px) {
            .logo img {
                width: 126px !important;
            }

            .quote-btn {
                padding-inline: 9px !important;
                font-size: 11px !important;
            }

            .menu-toggle {
                width: 38px;
                height: 38px;
            }
        }
    `;

    if (!document.getElementById(style.id)) {
        document.head.appendChild(style);
    }
});
