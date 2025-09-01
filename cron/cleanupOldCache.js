import cron from "node-cron";
import db from "../dependencies/firestore.js";
import cloudinaryLimiter from "../dependencies/rate-limiters/globalCloudinaryLimiter.js";
import { v2 as cloudinary } from "cloudinary";
import gcpLimiter from "../dependencies/rate-limiters/globalGCPlimiter.js";

const cleanupPlaces = async () => {
  try {
    const oldCache = await db
      .collection("cached_places")
      .where("ttl", "<", new Date())
      .get();
    if (oldCache.empty) return;
    let ix = 0;
    await Promise.all(
      oldCache.docs.map(async (place, i) => {
        const data = place.data();
        const id = place.id;

        if (data.photos.length !== 0) {
          await data.photos.map(async (photo, i) => {
            cloudinaryLimiter.schedule(() => {
              cloudinary.uploader.destroy(photo.public_id);
            });
          });
        }

        await gcpLimiter.schedule(() => {
          db.collection("cached_places").doc(id).delete();
        });
        ix++;
      })
    );
  } catch (e) {
    // ignore errors
    console.log(e);
  }
};

const cleanupHotels = async () => {
  try {
    const oldCache = await db
      .collection("cached_hotels")
      .where("ttl", "<", new Date())
      .get();
    if (oldCache.empty) return;
    let ix = 0;
    await Promise.all(
      oldCache.docs.map(async (place, i) => {
        const data = place.data();
        const id = place.id;

        if (data.photos.length !== 0) {
          await data.photos.map(async (photo, i) => {
            cloudinaryLimiter.schedule(() => {
              cloudinary.uploader.destroy(photo.public_id);
            });
          });
        }

        await gcpLimiter.schedule(() => {
          db.collection("cached_hotels").doc(id).delete();
        });
        ix++;
      })
    );
  } catch (e) {
    // ignore errors
    console.log(e);
  }
};

const cleanupUnverifiedUsers = async () => {
  try {
    const oldCache = await db
      .collection("users")
      .where("verified", "==", false)
      .get();
    if (oldCache.empty) return;
    let ix = 0;
    await Promise.all(
      oldCache.docs.map(async (user, i) => {
        const data = user.data();
        const id = user.id;

        if (data.verification_ttl.toMillis() < Date.now()) {
          await gcpLimiter.schedule(() => {
            db.collection("users").doc(id).delete();
          });
        }
        ix++;
      })
    );
  } catch (e) {
    // ignore errors
    console.log(e);
  }
};

const runCacheCleanup = () => {
  cron.schedule("0 0 * * *", async () => {
    await cleanupPlaces();
  });

  cron.schedule("0 0 * * *", async () => {
    await cleanupHotels();
  });

  cron.schedule("0 0 * * *", async () => {
    await cleanupUnverifiedUsers();
  });
};

export { runCacheCleanup };
