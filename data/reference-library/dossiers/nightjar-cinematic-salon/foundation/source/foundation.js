(() => {
  const actions = {
"inline-1": { event: "load", handler: function (event) {

      {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Store",
            "@id": "https://nightjarrecords.example/#store",
            "name": "Nightjar Records & Listening Room",
            "description": "An independent vinyl record store and listening room in Austin, Texas.",
            "url": "https://nightjarrecords.example/",
            "telephone": "+1-512-555-0148",
            "image": "https://nightjarrecords.example/images/nightjar-hero.webp",
            "address": {
              "@type": "PostalAddress",
              "@id": "https://nightjarrecords.example/#address",
              "streetAddress": "1701 Nightjar Court",
              "addressLocality": "Austin",
              "addressRegion": "TX",
              "postalCode": "78702",
              "addressCountry": "US"
            },
            "areaServed": "Austin, Texas",
            "hasMap": "https://www.google.com/maps/search/?api=1&query=1701+Nightjar+Court+Austin+TX+78702"
          },
          {
            "@type": "MusicVenue",
            "@id": "https://nightjarrecords.example/#listening-room",
            "name": "The Listening Room at Nightjar",
            "url": "https://nightjarrecords.example/#sessions",
            "isPartOf": { "@id": "https://nightjarrecords.example/#store" },
            "address": { "@id": "https://nightjarrecords.example/#address" }
          }
        ]
      }
    
} }
  };
  const bind = () => {
    for (const [id, action] of Object.entries(actions)) {
      for (const element of document.querySelectorAll(`[data-foundation-action="${id}"]`)) {
        if (action.event === "load") {
          action.handler.call(element);
          continue;
        }
        element.addEventListener(action.event, (event) => {
          if (action.handler.call(element, event) === false) event.preventDefault();
        });
      }
    }
  };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  else bind();
})();
