import "dotenv/config";
import axios from "axios";
import gcpLimiter from "../rate-limiters/globalGCPlimiter.js";

const gcpMaps_placeDetailsEnterprise = async (id) => {
  const googleMapsResponse = await gcpLimiter.schedule(() => {
    return axios.get(`https://places.googleapis.com/v1/places/${id}`, {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": process.env.X_GOOG_API_KEY,
        "X-Goog-FieldMask":
          "id,name,photos,displayName.text,formattedAddress,location,rating",
      },
    });
  });

  return googleMapsResponse.data;
};

export { gcpMaps_placeDetailsEnterprise };
