const axios = require("axios");
const gcpLimiter = require("../rate-limiters/globalGCPlimiter");

const gcpMaps_textSearch = async (query, pageSize) => {
  const googleMapsResponse = await gcpLimiter.schedule(() => {
    return axios.post(
      "https://places.googleapis.com/v1/places:searchText",
      {
        textQuery: query,
        pageSize: pageSize,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": process.env.X_GOOG_API_KEY,
          "X-Goog-FieldMask": "places.id",
        },
      }
    );
  });
  return googleMapsResponse.data.places;
};

module.exports = { gcpMaps_textSearch };
