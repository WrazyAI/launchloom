(() => {
  const actions = {
"inline-1": { event: "load", handler: function (event) {
{"@context":"https://schema.org","@type":"HomeAndConstructionBusiness","name":"Northline Garage Door Co.","description":"Northline helps homeowners diagnose garage door problems, compare repair and replacement options, and schedule the right service for the property. Tell us what the door is doing and where you are located to begin.","telephone":"(510) 555-0186","email":"service@northline.example","address":"4240 Thornton Avenue, Fremont, CA 94536","areaServed":["Fremont","Newark","Union City"],"url":"https://northline.example/"}
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
