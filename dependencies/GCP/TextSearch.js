import "dotenv/config";
import axios from "axios";
import gcpLimiter from "../rate-limiters/globalGCPlimiter.js";

const gcpMaps_textSearch = async (dataBlock, pageSize) => {
  const googleMapsResponse = await gcpLimiter.schedule(() => {
    return axios.post(
      "https://places.googleapis.com/v1/places:searchText",
      {
        textQuery: dataBlock.query,
        pageSize: pageSize,
        locationBias: {
          circle: {
            center: {
              latitude: dataBlock.lat,
              longitude: dataBlock.lng
            },
            radius: dataBlock.rad
          }
        }
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

export { gcpMaps_textSearch };
