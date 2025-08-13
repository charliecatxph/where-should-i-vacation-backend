const { Timestamp } = require("firebase-admin/firestore");
const {
  gcpMaps_placeDetailsEnterprise_FILLER,
} = require("../../dependencies/GCP/PlaceDetailsEnterpriseFiller");
const { processPlace } = require("./get-travel-recommendations");
const db = require("../../dependencies/firestore");
const moment = require("moment");

const viewPlace = async (req, res) => {
  const { id } = req.query;

  if (!id.trim()) {
    return res.status(400).json({
      code: "PARAMETERS_INCOMPLETE",
    });
  }

  try {
    const place = await processPlace({ id: id.trim() }, false);
    if (!place) {
      return res.status(400).json({
        code: "PLACE_NOT_EXIST",
      });
    }

    // check if place has a rating, editorialSummary, and generativeSummary
    let fill;
    if (!place.description && !place.rating) {
      const filler = await gcpMaps_placeDetailsEnterprise_FILLER(id.trim());
      fill = {
        description:
          filler.editorialSummary?.text ??
          filler.generativeSummary ??
          "No description.",
        rating: filler.rating || "N/A",
      };
    }

    const {
      cached,
      id: ctx_dd1,
      ttl,
      ...clean
    } = {
      ...place,
      ...fill,
    };

    res.json({
      place: clean,
    });

    if (!place.description && !place.rating) {
      await db
        .collection("cached_places")
        .doc(id)
        .set(
          {
            ...Object.fromEntries(
              Object.entries(place).filter(([k]) => k !== "cached")
            ),
            ...fill,
            ttl: Timestamp.fromMillis(moment.utc().add(2, "weeks").valueOf()),
            enterprise: false,
          },
          { merge: true }
        )
        .then((d) => {
          console.log("PLACE RECAHCED");
        })
        .catch((e) => {
          console.log(e);
          throw new Error("Fail to cache place.");
        });
    }

    if (!place.cached) {
      try {
        await processPlace(place, true);
        console.log("PLACE CACHED.");
      } catch (e) {
        // masking error
        console.log(e);
      }
    }
  } catch (e) {
    console.log(e);
    return res.status(500).json({
      code: "SERVER_ERROR",
      err: e.message,
    });
  }
};

module.exports = { viewPlace };
