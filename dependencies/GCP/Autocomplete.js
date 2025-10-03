import "dotenv/config";
import axios from "axios";
import gcpLimiter from "../rate-limiters/globalGCPlimiter.js";

const gcpMaps_autocomplete = async (input) => {
  const googleMapsResponse = await gcpLimiter
    .schedule(() => {
      return axios.post(
        `https://places.googleapis.com/v1/places:autocomplete`,
        {
          input: input,
          includedPrimaryTypes: [
            "locality", // Covers cities and municipalities like Malay
            "sublocality", // Covers barangays like Balabag, Manoc-Manoc
            "colloquial_area", // Covers informal names like "Boracay"
            "natural_feature", // Captures islands, mountains, beaches, etc.
            "country", // Covers countries like "Philippines"
          ],
        },
        {
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": process.env.X_GOOG_API_KEY,
          },
        }
      );
    })
    .catch((e) => {
      console.log(e.response.data);
    });

  const processedLocations =
    googleMapsResponse.data.suggestions?.map((suggestion) => {
      return suggestion.placePrediction.text.text;
    }) || [];

  return processedLocations.slice(0, 5);
};

export { gcpMaps_autocomplete };
