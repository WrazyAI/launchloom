import { expect, it } from "vitest";
import { resolvePrimaryCityFromGeocode } from "../worker/src/coverage-areas";

const result = (state: string, stateLong: string) => ({
  place_id: `coral-${state}`, types:["locality","political"],
  address_components:[
    {long_name:"Coral",short_name:"Coral",types:["locality"]},
    {long_name:stateLong,short_name:state,types:["administrative_area_level_1"]},
    {long_name:"United States",short_name:"US",types:["country"]},
  ],geometry:{location:{lat:36,lng:-85}},
});

it("does not treat a city-name substring as a state code when resolving ambiguity", () => {
  const candidates=[result("OR","Oregon"),result("FL","Florida")];
  expect(resolvePrimaryCityFromGeocode("Coral",candidates)).toEqual({code:"ambiguous_city"});
  expect(resolvePrimaryCityFromGeocode("Coral, Oregon",candidates)).toMatchObject({resolution:{state:"OR"}});
});
