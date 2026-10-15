
// Set current year in footer automatically on every page
document.getElementById("year").textContent = new Date().getFullYear();

// FAQ accordion behaviour (only runs where .faq-item exists, e.g. Home page)
const faqItems = document.querySelectorAll(".faq-item");

faqItems.forEach((item) => {
  const question = item.querySelector(".faq-question");

  question.addEventListener("click", () => {
    item.classList.toggle("open");
  });
});