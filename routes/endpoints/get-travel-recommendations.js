import "dotenv/config";
import { openAI_4o_mini } from "../../dependencies/openAI_4o_mini.js";
import { gcpMaps_textSearch } from "../../dependencies/GCP/TextSearch.js";
import { gcpMaps_placeDetails } from "../../dependencies/GCP/PlaceDetails.js";
import db from "../../dependencies/firestore.js";
import { v2 as cloudinary } from "cloudinary";
import axios from "axios";
import gcpLimiter from "../../dependencies/rate-limiters/globalGCPlimiter.js";
import cloudinaryLimiter from "../../dependencies/rate-limiters/globalCloudinaryLimiter.js";
import moment from "moment";
import { Timestamp } from "firebase-admin/firestore";
import { promisify } from "util";
import { pipeline } from "stream";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pipe = promisify(pipeline);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const processPlace = async (placeData, cachePlace, includeDescription) => {
  // cachePlace === fastAccess
  const cachedData = await db
    .collection("cached_places")
    .doc(placeData.id)
    .get()
    .catch((e) => {
      throw new Error(e.message);
    });

  if (!cachedData.exists) {
    if (cachePlace) {
      // cachePlace is true if it was fetched before
      const parsedPhotos = await Promise.all(
        placeData.photos.map(async (photo, i) => {
          const axios_res = await axios({
            method: "GET",
            url: photo.secure_url,
            responseType: "stream",
            timeout: 30000,
          });

          const fileName = uuidv4();

          await pipe(
            axios_res.data,
            fs.createWriteStream(
              path.join(__dirname, "../../gcp-image-cache", fileName)
            )
          );

          await sharp(path.join(__dirname, "../../gcp-image-cache", fileName))
            .webp({ quality: 80 })
            .toFile(
              path.join(
                __dirname,
                "../../gcp-image-cache-compressed",
                `${fileName}.webp`
              )
            );

          await fs.promises.unlink(
            path.join(__dirname, "../../gcp-image-cache", fileName)
          );

          const cloudinaryUpload = await cloudinaryLimiter.schedule(() => {
            return cloudinary.uploader.upload(
              path.join(
                __dirname,
                "../../gcp-image-cache-compressed",
                `${fileName}.webp`
              ),
              {
                folder: "cached_images",
              }
            );
          });

          await fs.promises.unlink(
            path.join(
              __dirname,
              "../../gcp-image-cache-compressed",
              `${fileName}.webp`
            )
          );

          return {
            public_id: cloudinaryUpload.public_id,
            secure_url: cloudinaryUpload.secure_url,
            authorAttributions: {
              ...photo.authorAttributions,
            },
          };
        })
      );
      const normalized = {
        ...Object.fromEntries(
          Object.entries(placeData).filter(([k]) => k !== "cached")
        ),
        photos: parsedPhotos,
        photoCount: parsedPhotos.length,
        ttl: Timestamp.fromMillis(moment.utc().add(2, "weeks").valueOf()),
        enterprise: false,
      };

      await db
        .collection("cached_places")
        .doc(placeData.id)
        .set(normalized, { merge: true })
        .then((d) => { })
        .catch((e) => {
          throw new Error(e.message);
        });

      return {
        ...normalized,
        id: placeData.id,
        cached: true,
      };
    } else {
      const placeDetails = await gcpMaps_placeDetails(placeData.id);
      if (!placeDetails) {
        return null;
      }

      const photos = placeDetails?.photos?.slice(0, 2) || [];

      const parsedPhotos = await Promise.all(
        photos.map(async (photo, i) => {
          const signedGoogleUrl = await gcpLimiter.schedule(() => {
            return axios({
              url: `https://places.googleapis.com/v1/${photo.name}/media?key=${process.env.X_GOOG_API_KEY}&maxWidthPx=800&skipHttpRedirect=true`,
              method: "GET",
            });
          });

          return {
            secure_url: signedGoogleUrl.data.photoUri,
            authorAttributions: {
              ...photo.authorAttributions,
            },
          };
        })
      );

      const normalized = {
        ...placeDetails,
        photos: parsedPhotos,
        photoCount: parsedPhotos.length,
        ttl: Timestamp.fromMillis(moment.utc().add(2, "weeks").valueOf()),
      };

      return {
        ...normalized,
        id: placeData.id,
        cached: false,
      };
    }
  } else {
    const placeData = cachedData.data();

    return {
      ...placeData,
      id: placeData.id,
      cached: true,
    };
  }
};

const getTravelRecommendations = async (req, res) => {
  const { uuid, when, what, where } = req.query;

  if (!uuid) {
    return res.status(400).json({
      code: "PARAMETERS_INCOMPLETE",
    });
  }

  try {
    const cachedGeneration = await db
      .collection("generation-history")
      .doc(uuid)
      .get();
    if (cachedGeneration.exists) {
      const data = cachedGeneration.data();
      const { userId, ...excluded } = data;

      if (req.user.id !== userId) {
        return res.status(400).json({
          code: "USER_GENERATION_ID_MISMATCH",
        });
      }

      const ttlCheckCachedPlaces = excluded.cachedPlaces.filter(
        (placeCache) => Timestamp.now().toMillis() < placeCache.ttl.toMillis()
      );

      if (ttlCheckCachedPlaces.length !== 0) {
        await db
          .collection("generation-history")
          .doc(uuid)
          .update({ cachedPlaces: ttlCheckCachedPlaces });
      }

      const mergedIds = Array.from(
        new Set([
          ...excluded.generation,
          ...ttlCheckCachedPlaces.map((place) => place.id),
        ])
      );

      const missingIds = [];

      const fetchPlaces = (await Promise.all(
        mergedIds.map(async (id) => {
          try {
            const cacheDoc = await db.collection("cached_places").doc(id).get();

            if (cacheDoc.exists) {
              return cacheDoc.data();
            } else {
              missingIds.push(id);

              const refetched = await processPlace(id);
              return refetched;
            }
          } catch (e) {
            return null;
          }
        })
      )).filter(Boolean);

      if (missingIds.length > 0) {
        const updatedCachedPlaces = ttlCheckCachedPlaces.filter(
          (place) => !missingIds.includes(place.id)
        );

        await db
          .collection("generation-history")
          .doc(uuid)
          .update({ cachedPlaces: updatedCachedPlaces });
      }

      return res.json({
        cached: true,
        interpretation: excluded.interpretation,
        places: fetchPlaces,
        title: excluded.title,
        userQuery: excluded.userQuery,
        extras: { ...excluded.extras },
      });
    }

    if (!when.trim() || !what.trim()) {
      return res.status(400).json({
        code: "PARAMETERS_INCOMPLETE",
      });
    }

    const userCheck = await db.collection("users").doc(req.user.id).get();
    if (!userCheck.exists) {
      return res.status(400).json({
        code: "USER_NOT_EXIST",
      });
    }
    const userData = userCheck.data();
    if (userData.generation_credits <= 0) {
      return res.status(400).json({
        code: "RAN_OUT_OF_CREDITS",
      });
    }

    const parseForGMAPS_API = `
You're a helpful and friendly AI assistant for a travel agency. Given:

- where: a location or landmark (can be empty/blank)
- what: the kind of place or activity the user wants (optional)
- when: the date range of the trip, in the format "YYYY-MM-DD - YYYY-MM-DD"
- user_name: the personal name of the user

Your job is to return touristy or exploratory suggestions in this format:
{
  "interpretation": "A warm, personalized message (ideally with the user's name) that reflects the query and sparks excitement to explore.",
  "gcpQuery": "A clean, concise Google Maps/Places query based on the user's input.",
  "title": "Your catching title for the gcpQuery and interpretation generated.",
  "p_density": "A floating point number from 0.0 (lowest) to 5.0, (highest), describing the amount of people expected on the place and date specified.",
  "p_density_expl": "A helper description, for p_density, which is a textual explanation of how much people is expected.",
  "tr_advice": "A description of how to get around the said place.",
  "expected_weather": {
    "temperature": {
      "min_c": "Minimum temperature in Celsius.",
      "max_c": "Maximum temperature in Celsius.",
      "feels_like_c": "Perceived temperature in Celsius, considering humidity and wind."
    },
    "condition": "Concise label of overall weather (e.g., Clear, Sunny, Partly Cloudy, Overcast, Rain, Thunderstorms, Snow, Fog).",
    "details": "Optional extended description (e.g., Light breeze with scattered clouds, humid, chance of showers).",
    "humidity_percent": "Relative humidity as a percentage (0–100%).",
    "precipitation_mm": "Expected total precipitation in millimeters.",
    "wind": {
      "speed_kph": "Average wind speed in kilometers per hour.",
      "gust_kph": "Maximum wind gust speed in kilometers per hour.",
      "direction_deg": "Wind direction in degrees (0–360, where 0 = North)."
    },
    "cloud_cover_percent": "Estimated cloud coverage as a percentage (0–100%).",
    "uv_index": "UV index (0–11+).",
    "visibility_km": "Average visibility distance in kilometers.",
  }${where.trim() ? '' : ',\n  "gen_where": "The popular destination you chose for the user"'}
}

Guidelines:

- **CRITICAL**: If the [Where] input is empty or blank, you MUST choose a popular, well-known tourist destination (e.g., Paris, Tokyo, New York, London, Rome, Bali, etc.) and include it in the "gen_where" field. Base your choice on what would pair well with the [What] and [When] inputs.
- If the [Where] input is provided, do NOT include a "gen_where" field in your response.
- If the location is broad, widen the scope thoughtfully — don't limit to a single place.
- Do not mention any specific places, or POIs, especially for the KV pairs ["interpretation", "title", "p_density_expl", "tr_advice"]. Only base your generation on historical data.
- For "what", prioritize **physically active and experiential places, unless otherwise stated.
- Always follow this gcpQuery priority unless the user says otherwise:
  1. Top tourist destinations  
  2. Semi-casual or unique experiences  
  3. Food and dining

- If input is vague (e.g., "any", "surprise me") + a broad place (like "Russia"), keep gcpQuery short and focused on top tourist spots only.
- Strictly only output JSON. It must start with { and end with }. Not with \`\`\`json or any other format.

Interpretation Tone: Warm, imaginative, and inviting — always make the user feel excited to travel.

Inputs:  
Where: ${where.trim() || '[EMPTY - Please choose a popular destination]'}  
What: ${what.trim()}  
When: ${when.trim()}
User name: ${req.user.name}
`;

    const aiResult = await openAI_4o_mini(parseForGMAPS_API);

    const googleMapsQuery = JSON.parse(aiResult).gcpQuery;
    const googleMapsPlaces = await gcpMaps_textSearch(googleMapsQuery);

    if (!googleMapsPlaces) {
      return res.status(400).json({
        code: "NO_PLACES",
      });
    }

    const placeDataResponse_quickSign = (
      await Promise.all(
        googleMapsPlaces.map(async (place, i) => {
          try {
            const result = await processPlace(place, false);
            return result;
          } catch (e) {
            return null;
          }
        })
      )
    ).filter(Boolean);

    const { gcpQuery, interpretation, title, ...cx } = JSON.parse(aiResult);

    res.json({
      interpretation: interpretation,
      places: placeDataResponse_quickSign,
      title: title,
      extras: { ...cx },
      userQuery: {
        when: when.trim(),
        what: what.trim(),
        where: where.trim() || JSON.parse(aiResult).gen_where,
      },
    });

    await db
      .collection("users")
      .doc(req.user.id)
      .update({
        ...userData,
        generation_credits: userData.generation_credits - 1,
        generation_credits_ttl: Timestamp.fromMillis(new Date().getTime()),
        updated_at: Timestamp.fromMillis(new Date().getTime()),
      });

    try {
      const placeDataResponse = (
        await Promise.all(
          placeDataResponse_quickSign.map(async (place, i) => {
            try {
              const result = await processPlace(place, true);
              return result;
            } catch (e) {
              return null;
            }
          })
        )
      ).filter(Boolean);

      await db
        .collection("generation-history")
        .doc(uuid)
        .create({
          userId: req.user.id,
          gcpQuery: googleMapsQuery,
          interpretation: interpretation,
          title: title,
          extras: { ...cx },
          generation: placeDataResponse.map((place) => {
            return place.id;
          }),
          cachedPlaces: placeDataResponse.map((place) => {
            return {
              id: place.id,
              ttl: place.ttl,
            };
          }),
          userQuery: {
            when: when.trim(),
            what: what.trim(),
            where: where.trim() || JSON.parse(aiResult).gen_where,
          },
          created_at: Timestamp.fromMillis(new Date().getTime()),
        });
    } catch (e) {
      console.log(
        `[${new Date().toISOString()}] [Get Travel Recommendations] IIFE Exception at ${req.originalUrl}. Error data: ${e.message}`
      );
    }
  } catch (e) {
    console.log(
      `[${new Date().toISOString()}] [Get Travel Recommendations] Exception at ${req.originalUrl}. Error data: ${e.message}`
    );
    return res.status(500).json({
      code: "SERVER_ERROR",
      err: e.message,
    });
  }
};

export { getTravelRecommendations, processPlace };
