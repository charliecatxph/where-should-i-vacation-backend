const {
  gcpMaps_placeDetailsEnterprise,
} = require("../../dependencies/GCP/PlaceDetailsEnterprise");
const { gcpMaps_textSearch } = require("../../dependencies/GCP/TextSearch");
const { openAI_4o_mini } = require("../../dependencies/openAI_4o_mini");
const { v2: cloudinary } = require("cloudinary");
const db = require("../../dependencies/firestore");
const gcpLimiter = require("../../dependencies/rate-limiters/globalGCPlimiter");
const cloudinaryLimiter = require("../../dependencies/rate-limiters/globalCloudinaryLimiter");
const { Timestamp } = require("firebase-admin/firestore");
const { default: axios } = require("axios");
const moment = require("moment");

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

const processPlace = async (placeData, cachePlace) => {
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
        enterprise: true,
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
      console.log("PLACE ID [NOT CACHED]: ", placeData.id);
      const placeDetails = await gcpMaps_placeDetailsEnterprise(placeData.id);
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
    console.log("PLACE ID [ALREADY CACHED]: ", placeData.id);

    if (!placeData?.enterprise) {
      await db.collection("cached_places").doc(placeData.id).delete();
      return await processPlace({ id: placeData.id });
    }

    return {
      ...placeData,
      id: placeData.id,
      cached: true,
    };
  }
};

const getSphericalCenter = (coords) => {
  if (!coords.length) return null;

  let x = 0,
    y = 0,
    z = 0;

  coords.forEach(({ latitude, longitude }) => {
    const latRad = (latitude * Math.PI) / 180;
    const lngRad = (longitude * Math.PI) / 180;

    x += Math.cos(latRad) * Math.cos(lngRad);
    y += Math.cos(latRad) * Math.sin(lngRad);
    z += Math.sin(latRad);
  });

  const total = coords.length;
  x /= total;
  y /= total;
  z /= total;

  const hyp = Math.sqrt(x * x + y * y);
  const latRad = Math.atan2(z, hyp);
  const lngRad = Math.atan2(y, x);

  return {
    latitude: (latRad * 180) / Math.PI,
    longitude: (lngRad * 180) / Math.PI,
  };
};

const generateItinerary = async (req, res) => {
  const { what, when, where, what_preferred = "", uuid } = req.query;

  if (!uuid.trim()) {
    return res.status(400).json({
      code: "PARAMETERS_INCOMPLETE",
    });
  }

  try {
    const checkGeneration = await db
      .collection("itinerary-generation-history")
      .doc(uuid)
      .get();

    if (checkGeneration.exists) {
      return res.json({
        itinerary: checkGeneration.data(),
        cached: true,
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

    if (userData.itinerary_credits <= 0) {
      return res.status(400).json({
        code: "RAN_OUT_OF_CREDITS",
      });
    }

    const parseForGMAPS_API = `
You are a helpful and friendly AI assistant working for a travel agency.

Your task:  
Given the following inputs:

- where: a location or landmark (can be broad or specific)  
- what: the type of place or activity the user is interested in  
- what_preferred: optional parameters or preferences, separated by commas  

Return a single JSON array with one object, in the exact format below:

{
  query: ["query1", "query2", "query3"],
  actualUserIntent: "Concise interpretation of what the user wants based on the input"
}

Important rules:

- The result must be a valid JSON (parsable via JSON.parse).
- Do NOT return any explanation, formatting, or text outside the object.
- Each query must be uniquely phrased and should result in different types of results in Google Maps.
- Do not repeat the same activity in all queries (e.g., not "surfing" three times).
- Ensure activity diversity in time allocation: combine primary activity with nearby attractions, food spots, cultural or natural experiences.
- If the "where" input is broad (e.g., a country), you may choose different cities/regions for each query.
- If "what" is very specific (e.g., "surfing"), return one surfing-related query, but diversify the other two by suggesting related experiences (e.g., surf towns, surf cafés, or nature spots near surf beaches).
- If input is vague (e.g., "anything" or "surprise me"), use popular and varied activities.

Inputs:  
Where: ${where.trim()}  
What: ${what.trim()}  
What Preferred: ${what_preferred.trim()}
   `;
    const aiResult = await openAI_4o_mini(parseForGMAPS_API);
    let ix = 0,
      ix2 = 0;
    const places = await Promise.all(
      JSON.parse(aiResult).query.map(async (placeId, i) => {
        const x = await gcpMaps_textSearch(placeId, 20);
        ix2++;
        return x;
      })
    );

    if (places.length === 0)
      throw new Error("No places returned from search query.");

    const placesFlatDedupe = [
      ...new Set(
        places
          .map((queryBracket, i) => {
            return queryBracket.map((placeId, i) => {
              return placeId.id;
            });
          })
          .flat()
      ),
    ];

    const placesData = await Promise.all(
      placesFlatDedupe.map(async (placeId, i) => {
        const x = await processPlace({ id: placeId });
        ix++;
        return x;
      })
    );

    const poiList = placesData
      .map((place, i) => {
        return `${i + 1}. ${place.displayName.text} (${
          place.location.latitude
        }, ${place.location.longitude}, ${place?.rating || "N/A"}) [${
          place.id
        }] [${place.types?.join(",") || ""}]`;
      })
      .join("\n");

    const parseForItineraryGeneration = `
You are a travel planning assistant creating travel itineraries for a client.

You will be given a list of ~30+ POIs in this format:
"1. Place Name (latitude, longitude, rating) [place_id] [place_type]"

GUIDELINES:
- Create an array of exactly 1 itinerary.
- Each itinerary must have a "schedule" property containing exactly X amount of days, depending on the Date Range provided.
- Each day object must contain an array of 3-5 activity objects.
- Group POIs by proximity to reduce transit time.
- Exclude hotels and accommodations (filter by place_type; omit anything that implies lodging).
- Favor highly rated places (5.0 is best). Treat "N/A" neutrally.
- Diversify daily experiences based on user intent; avoid clustering highly similar activities on the same day.
- Stay practical: start no earlier than 8:00 AM, end before 6:00 PM. Ignore night-focused activities.

 USER WARNING LOGIC (MUST SET "user_warn" FIELD):
 - Analyze how geographically spread out the provided POIs are using their latitude and longitude (IMPORTANT).
 - If POIs are spread widely across multiple cities/regions (i.e., would imply long transit times between days), or if the input "Where" appears broad (e.g., country/large region), set a friendly warning in "user_warn" to encourage narrowing the search. Example: "Heads up: that location covers a wide area. For a more tailored itinerary, try a specific city or neighborhood (e.g., 'Reykjavík' instead of 'Iceland')."
 - Otherwise, if the user's input seems specific (e.g., a city) and the POIs cluster in one metro area, return an empty string for "user_warn".

HARD CONSTRAINT: UNIQUE place_id ACROSS ENTIRE ITINERARY
- Days must depend on how much days is stated, base on the Date Range input STRICTLY.
- The "id" field in every activity MUST be unique across the entire itinerary (all days combined). No id may appear more than once anywhere in schedule[].activities[].
- Id matching uses exact, case-sensitive string equality.
- Use only ids that exist in the provided POIs list. Do not modify, truncate, reformat, or invent ids.
- Validation procedure you MUST perform before returning JSON:
  1) Create a set S = {}.
  2) Iterate days 1..x days, activities in order. For each activity:
     - If activity.id ∉ S and is present in the POIs list, add it to S and keep the activity.
     - If activity.id ∈ S OR the id is not found in the POIs list, REPLACE it with a different id from the POIs list that is not in S and fits the day's theme/proximity. Update the activity's description/time accordingly.
     - If no unused POI exists, remove the conflicting activity and instead select another unused POI from the list. Maintain 3–5 activities per day where possible. Never reintroduce a duplicate.
  3) After replacements, re-scan all activities across all days and assert there are 0 duplicates. If any duplicate remains, fix it before returning. Never return JSON with duplicate ids.
- Max Date Range input is 7 days.

Output format:
Return an array of 1 object, in this structure:

[
  {
    "user_warn": "",
    "itinerary_title": "Engaging and descriptive title",
    "general_location": "Area or region covered",
    "description": "Summary inviting the user to explore this plan",
    "schedule": [
      {
        "day": 1,
        "activities": [
          {
            "timeInOut": "HH:MM - HH:MM (12h format, e.g., 9:00 AM - 11:00 AM)",
            "description": "Short, vivid summary of the place",
            "userAction": "What the user should do here (reflect user intent)",
            "id": "place_id of the corresponding place"
          },
          ...
        ]
      },
      ...
      // Days depends on X days, through Date Range input.
    ]
  },
]

STRICT OUTPUT RULES:
- OUTPUT ONLY PURE JSON PARSABLE BY JSON.parse(). NO BACKTICKS, NO MARKDOWN, NO EXPLANATIONS. MUST START WITH [ AND END WITH ].
- The "id" values MUST be copied verbatim, STRICTLY from the POIs list. Do not alter characters or casing. Do not invent ids.
- Do NOT include any extra fields or text beyond the structure shown above.
- Max Date Range is 7 days. Always follow the Date Range input.
- Absolutely do not use the activity twice or more on an itinerary. If it is a more active activity, adjust time range as needed.

User Intent:
${JSON.parse(aiResult).actualUserIntent}

POIs:
${poiList}

Date Range:
${when}
    `;

    const itineraryList = await openAI_4o_mini(parseForItineraryGeneration);

    // Parse raw itineraries and perform duplicate ID check on the first itinerary
    const rawItineraries = JSON.parse(itineraryList);

    let itineraries = rawItineraries.map((itinerary) => {
      return {
        ...itinerary,
        schedule: itinerary.schedule.map((day) => {
          return {
            ...day,
            activities: day.activities.map((activity) => {
              const placeIndex = placesData.findIndex(
                (place) => place.id === activity.id
              );
              if (placeIndex === -1) return activity; // fallback if not found
              const { types, name, ...clean } = placesData[placeIndex];
              return {
                ...activity,
                ...clean,
                photos: clean?.photos?.slice(0, 2) || [],
              };
            }),
          };
        }),
      };
    });
    // itineraries.forEach((itinerary, i) => {
    //   itineraries[i].centerPoints = {
    //     ...getSphericalCenter(
    //       itinerary.schedule.flatMap((day) =>
    //         day.activities.map((activity) => ({
    //           latitude: activity.location.latitude,
    //           longitude: activity.location.longitude,
    //         }))
    //       )
    //     ),
    //   };
    // });

    res.json({
      itinerary: itineraries[0],
    });

    try {
      await db
        .collection("users")
        .doc(req.user.id)
        .update({
          ...userData,
          itinerary_credits: userData.itinerary_credits - 1,
          itinerary_credits_ttl: Timestamp.fromMillis(new Date().getTime()),
          updated_at: Timestamp.fromMillis(new Date().getTime()),
        });
      // protection circuit, for informative logs
      let ixxx = 0;
      const placeDataResponse = await Promise.all(
        placesData.map(async (place, i) => {
          const result = await processPlace(place, true).catch((e) => {});

          ixxx++;
          return result;
        })
      );

      await db
        .collection("users")
        .doc(req.user.id)
        .update({
          ...userData,
          itinerary_credits: userData.itinerary_credits - 1,
          itinerary_credits_ttl: Timestamp.fromMillis(new Date().getTime()),
          updated_at: Timestamp.fromMillis(new Date().getTime()),
        });

      await db
        .collection("itinerary-generation-history")
        .doc(uuid)
        .create({
          userId: req.user.id,
          user_warn: itineraries[0].user_warn,
          itinerary_title: itineraries[0].itinerary_title,
          general_location: itineraries[0].general_location,
          description: itineraries[0].description,
          schedule: itineraries[0].schedule,
          created_at: Timestamp.fromMillis(new Date().getTime()),
        });
    } catch (e) {
      console.log(
        `[${new Date().toISOString()}] Something failed in caching.`,
        e.message
      );
    }
  } catch (e) {
    console.log(e);
    return res.status(500).json({
      code: "SERVER_ERROR",
      err: e.message,
    });
  }
};

module.exports = { generateItinerary, getSphericalCenter };
