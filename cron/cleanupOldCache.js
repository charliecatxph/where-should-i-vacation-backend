const cron = require("node-cron");
const db = require("../dependencies/firestore");
const cloudinaryLimiter = require("../dependencies/rate-limiters/globalCloudinaryLimiter");
const { v2: cloudinary } = require("cloudinary");
const gcpLimiter = require("../dependencies/rate-limiters/globalGCPlimiter");

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

const runCacheCleanup = () => {
  cron.schedule("0 0 * * *", async () => {
    await cleanupPlaces();
  });

  cron.schedule("0 0 * * *", async () => {
    await cleanupHotels();
  });
};

module.exports = { runCacheCleanup };
