import "dotenv/config";
import axios from "axios";
import gcpLimiter from "../rate-limiters/globalGCPlimiter.js";

const gcpMaps_getHotels = async (lat, lng) => {
  const googleMapsResponse = await gcpLimiter.schedule(() => {
    return axios.post(
      "https://places.googleapis.com/v1/places:searchText",
      {
        textQuery: "hotels",
        locationBias: {
          circle: {
            center: {
              latitude: lat,
              longitude: lng,
            },
            radius: 5000,
          },
        },
        includedType: "lodging",
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

export { gcpMaps_getHotels };
