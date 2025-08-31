import "dotenv/config";
import axios from "axios";
import gcpLimiter from "../rate-limiters/globalGCPlimiter.js";

const gcpMaps_placeDetails = async (id) => {
  const googleMapsResponse = await gcpLimiter
    .schedule(() => {
      return axios.get(`https://places.googleapis.com/v1/places/${id}`, {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": process.env.X_GOOG_API_KEY,
          "X-Goog-FieldMask":
            "id,name,photos,displayName,formattedAddress,location",
        },
      });
    })
    .catch(() => { });
  return googleMapsResponse?.data || null;
};

export { gcpMaps_placeDetails };
