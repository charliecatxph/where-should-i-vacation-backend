import "dotenv/config";
import axios from "axios";
import { gcpMaps_getHotels } from "../../dependencies/GCP/GetHotels.js";
import {
  gcpMaps_placeDetailsEnterprise,
} from "../../dependencies/GCP/PlaceDetailsEnterprise.js";
import { openAI_4o_mini } from "../../dependencies/openAI_4o_mini.js";
import gcpLimiter from "../../dependencies/rate-limiters/globalGCPlimiter.js";
import cloudinaryLimiter from "../../dependencies/rate-limiters/globalCloudinaryLimiter.js";
import { Timestamp } from "firebase-admin/firestore";
import db from "../../dependencies/firestore.js";
import moment from "moment";
import { v2 as cloudinary } from "cloudinary";

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

const processHotel = async (hotelData, cacheHotel) => {
  // cachePlace === fastAccess
  const cachedData = await db
    .collection("cached_hotels")
    .doc(hotelData.id)
    .get()
    .catch((e) => {
      throw new Error(e.message);
    });

  if (!cachedData.exists) {
    if (cacheHotel) {
      const parsedPhotos = await Promise.all(
        hotelData.photos.map(async (photo, i) => {
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
          Object.entries(hotelData).filter(([k]) => k !== "cached")
        ),
        photos: parsedPhotos,
        photoCount: parsedPhotos.length,
        ttl: Timestamp.fromMillis(moment.utc().add(2, "days").valueOf()),
      };

      await db
        .collection("cached_hotels")
        .doc(hotelData.id)
        .set(normalized, { merge: true })
        .then((d) => { })
        .catch((e) => {
          throw new Error(e.message);
        });

      return {
        ...normalized,
        id: hotelData.id,
        cached: true,
      };
    } else {
      const hotelDetails = await gcpMaps_placeDetailsEnterprise(hotelData.id);
      if (!hotelDetails) {
        return null;
      }

      const photos = hotelDetails?.photos?.slice(0, 1) || [];

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
        ...hotelDetails,
        photos: parsedPhotos,
        photoCount: parsedPhotos.length,
        ttl: Timestamp.fromMillis(moment.utc().add(2, "weeks").valueOf()),
      };

      return {
        ...normalized,
        id: hotelDetails.id,
        cached: false,
      };
    }
  } else {
    const placeData = cachedData.data();
    // check if it is probably stale
    if (placeData.ttl.toMillis() < Timestamp.now().toMillis()) {
      try {
        const result = await processPlace(place, true)
        return result;
      } catch (e) {
        throw new Error(e.message)
      }
    }
    return {
      ...placeData,
      id: placeData.id,
      cached: true,
    };
  }
};

const handleHotelEstimation = async (hydratedHotels, uncachedHotels) => {
  if (uncachedHotels.length === 0) return [];
  try {
    const prompt = `You are a travel pricing assistant.

    Based on the following list of hotels, estimate the average nightly price in USD for 2 adults.
    
    You will be given:
    - id: Hotel ID (you must copy this exactly into the output)
    - name: hotel name
    - location: Latitude and longitude
    - rating: Average rating from 0.0 to 5.0
    
    Use your knowledge of regional hotel pricing to estimate reasonable values. Assume:
    - Hotels rated 4.5 and above are typically more expensive
    - Hotels near city centers or major tourist areas have higher rates
    - Reykjavik, Paris, London, Tokyo, and NYC are high-cost cities
    - Southeast Asia and rural areas are low-cost
    - Adjust based on likely travel demand, country cost index, and star class
    - Estimate accurately even if data is limited — use location and rating
    - Always return an estimatedPrice in USD  
   
    STRICT RULES:
    - The output must be a JSON array, starting with [, and ending with ] STRICTLY, that can be parsed with JSON.parse(). No preliminary text.
    - Do not explain anything, only return JSON.
    
    Input:
    ${JSON.stringify(
      uncachedHotels.map((hotel) => {
        return {
          id: hotel.id,
          name: hotel.displayName.text,
          location: hotel.location,
          rating: hotel?.rating || "N/A",
        };
      })
    )}
    
    Output format:
    [
      { "id": "hotel_id", "estimatedPrice": 123 },
      ...
    ]`;
    const hotelEstimation = JSON.parse(await openAI_4o_mini(prompt));

    return hotelEstimation.map((hotel) => {
      const hotelIndex = hydratedHotels.findIndex((htl) => htl.id === hotel.id);
      return {
        ...hydratedHotels[hotelIndex],
        estimatedPrice: hotel.estimatedPrice,
        displayName: hydratedHotels[hotelIndex]?.displayName.text || "No Name",
      };
    });
  } catch (e) {
    throw new Error(e.message);
  }
};

const getPlaceHotels = async (req, res) => {
  const { lat, lng } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({
      code: "PARAMETERS_INCOMPLETE",
    });
  }
  try {
    const gcpHotelIds = await gcpMaps_getHotels(lat, lng);

    const hydratedHotels = (await Promise.all(
      gcpHotelIds.map(async (hotel, index) => {
        try {
          const dataTemp = await processHotel(hotel, false);
          return dataTemp;
        } catch (e) {
          return null;
        }
      })
    )).filter(Boolean);

    // an uncached hotel means it has not been generated, and doesn't have a est. price yet
    const hotelsUncached = hydratedHotels.filter((hotel) => {
      return !hotel.cached;
    });

    // a cached hotel means it has been generated before
    const hotelsCached = hydratedHotels.filter((hotel) => {
      return hotel.cached;
    });

    const hydratedUncachedHotels = await handleHotelEstimation(
      hydratedHotels,
      hotelsUncached
    );
    const cleanedUncachedHotels = hydratedUncachedHotels.map(
      ({ name, cached, ttl, ...rest }) => rest
    );

    const combinedHotels = [...hotelsCached, ...cleanedUncachedHotels];
    const dedupedHotels = Object.values(
      combinedHotels.reduce((acc, hotel) => {
        acc[hotel.id] = hotel;
        return acc;
      }, {})
    );

    res.json({
      hotels: dedupedHotels,
    });

    try {
      await Promise.all(
        hydratedUncachedHotels.map(async (uncachedHotel, index) => {
          const { name, cached, ...clean } = uncachedHotel;
          const dataTemp = await processHotel(clean, true);

          return dataTemp;
        })
      );
    } catch (e) {
      console.log(
        `[${new Date().toISOString()}] [Hotel Saving] IIFE Exception at ${req.originalUrl}. Error data: ${e.message}`
      );
    }
  } catch (e) {
    console.log(
      `[${new Date().toISOString()}] [Hotel Saving] Exception at ${req.originalUrl}. Error data: ${e.message}`
    );
    return res.status(500).json({
      code: "SERVER_ERROR",
      err: e.message,
    });
  }
};

export { getPlaceHotels };
