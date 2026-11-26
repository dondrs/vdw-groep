/* Van der Wal Groep - eigen JS (sitebreed geladen via jsDelivr)
   Alleen wat niet in Webflow zelf kan. */
(function () {
  'use strict';

  /* 1. Formulierknoppen
     De verzendknoppen in de nieuwsbrief- en contactformulieren zijn
     Button-icon-componenten (links), geen echte submit-knoppen. Webflow kan
     een link niet als submit instellen, dus vangen we de klik hier af en
     versturen we het omliggende formulier. Validatie (required-velden) blijft
     werken via requestSubmit(). */
  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('form .btn-icon-link');
    if (!link) return;
    var form = link.closest('form');
    if (!form) return;
    e.preventDefault();
    if (typeof form.requestSubmit === 'function') {
      form.requestSubmit();
    } else if (form.reportValidity()) {
      form.submit();
    }
  });
})();
