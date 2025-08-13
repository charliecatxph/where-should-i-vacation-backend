const { openAI_4o_mini } = require("../../dependencies/openAI_4o_mini");
const { gcpMaps_textSearch } = require("../../dependencies/GCP/TextSearch");
const { gcpMaps_placeDetails } = require("../../dependencies/GCP/PlaceDetails");
const db = require("../../dependencies/firestore");
const { v2: cloudinary } = require("cloudinary");
const { default: axios } = require("axios");
const gcpLimiter = require("../../dependencies/rate-limiters/globalGCPlimiter");
const ora = require("ora");
const cloudinaryLimiter = require("../../dependencies/rate-limiters/globalCloudinaryLimiter");
const moment = require("moment");
const { Timestamp } = require("firebase-admin/firestore");
const { promisify } = require("util");
const { pipeline } = require("stream");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const sharp = require("sharp");

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
      throw new Error("Fail to fetch place.");
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

          fs.unlinkSync(
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

          fs.unlinkSync(
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
        .then((d) => {})
        .catch((e) => {
          console.log(e);
          throw new Error("Fail to cache place.");
        });

      return {
        ...normalized,
        id: placeData.id,
        cached: true,
      };
    } else {
      // means fast access
      const placeDetails = await gcpMaps_placeDetails(placeData.id);
      if (!placeDetails) {
        // place doesnt exist at all
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

      const fetchPlaces = await Promise.all(
        mergedIds.map(async (id) => {
          const cacheDoc = await db.collection("cached_places").doc(id).get();

          if (cacheDoc.exists) {
            return cacheDoc.data();
          } else {
            missingIds.push(id);

            const refetched = await processPlace(id);
            return refetched;
          }
        })
      );

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
      });
    }

    if (!when.trim() || !what.trim() || !where.trim()) {
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
You’re a helpful and friendly AI assistant for a travel agency. Given:

- where: a location or landmark  
- what: the kind of place or activity the user wants  

Your job is to return touristy or exploratory suggestions in this format:
{
  "interpretation": "A warm, personalized message (ideally with the user's name) that reflects the query and sparks excitement to explore.",
  "gcpQuery": "A clean, concise Google Maps/Places query based on the user's input.",
  "title": "Your catching title for the gcpQuery and interpretation generated."
}

Guidelines:

- If the location is broad, widen the scope thoughtfully — don’t limit to a single place.
- For “what”, prioritize **physically active and experiential places, unless otherwise stated.
- Always follow this gcpQuery priority unless the user says otherwise:
  1. Top tourist destinations  
  2. Semi-casual or unique experiences  
  3. Food and dining

- If input is vague (e.g., “any”, “surprise me”) + a broad place (like “Russia”), keep gcpQuery short and focused on top tourist spots only.

Interpretation Tone: Warm, imaginative, and inviting — always make the user feel excited to travel.

Inputs:  
Where: ${where.trim()}  
What: ${what.trim()}  
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
          const result = await processPlace(place, false);

          return result;
        })
      )
    ).filter(Boolean);

    res.json({
      interpretation: JSON.parse(aiResult).interpretation,
      places: placeDataResponse_quickSign,
      title: JSON.parse(aiResult).title,
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
      // protection circuit, for informative logs

      const placeDataResponse = (
        await Promise.all(
          placeDataResponse_quickSign.map(async (place, i) => {
            const result = await processPlace(place, true).catch((e) => {
              console.log(e);
            });

            return result;
          })
        )
      ).filter(Boolean);

      await db
        .collection("generation-history")
        .doc(uuid)
        .create({
          userId: req.user.id,
          gcpQuery: googleMapsQuery,
          interpretation: JSON.parse(aiResult).interpretation,
          title: JSON.parse(aiResult).title,
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
            where: where.trim(),
          },
          created_at: Timestamp.fromMillis(new Date().getTime()),
        });
    } catch (e) {
      console.log(
        `[${new Date().toISOString()}] Something failed in caching.`,
        e.message
      );
    }
  } catch (e) {
    ora().fail(`Error: ${e.message}`);
    return res.status(500).json({
      code: "SERVER_ERROR",
      err: e.message,
    });
  }
};

module.exports = { getTravelRecommendations, processPlace };
