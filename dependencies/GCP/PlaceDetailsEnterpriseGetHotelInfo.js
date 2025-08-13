const axios = require("axios");
const gcpLimiter = require("../rate-limiters/globalGCPlimiter");

const gcpMaps_placeDetailsEnterpriseGetHotelInfo = async (hotelName) => {
  const googleMapsResponse = await gcpLimiter.schedule(() => {
    return axios.post(
      `https://places.googleapis.com/v1/places:searchText`,
      {
        textQuery: hotelName,
        includedType: "hotel",
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": process.env.X_GOOG_API_KEY,
          "X-Goog-FieldMask":
            "places.displayName,places.formattedAddress,places.types,places.id,places.priceLevel,places.priceRange,places.rating",
        },
      }
    );
  });

  return googleMapsResponse.data.places[0];
};

module.exports = { gcpMaps_placeDetailsEnterpriseGetHotelInfo };
