(() => {
  const actions = {
"inline-1": { event: "load", handler: function (event) {
{"@context":"https://schema.org","@type":"LocalBusiness","name":"Willow & Hearth Home Care","description":"Willow & Hearth helps older adults keep familiar routines with personal care, companionship, and practical support at home. Families begin with a conversation about what is needed now and what may change next.","telephone":"(215) 555-0148","email":"hello@willowhearth.example","address":"18 Linden Avenue, Ardmore, PA 19003","areaServed":["Ardmore","Bryn Mawr","Haverford"],"url":"https://willowhearth.example/"}
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
