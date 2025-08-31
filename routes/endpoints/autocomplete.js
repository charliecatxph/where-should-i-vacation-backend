import { gcpMaps_autocomplete } from "../../dependencies/GCP/Autocomplete.js";

const getLocations = async (req, res) => {
  const { query } = req.query;

  if (!query.trim()) {
    return res.status(400).json({
      code: "PARAMETERS_INCOMPLETE",
    });
  }

  try {
    const suggestions = await gcpMaps_autocomplete(query.trim());
    res.json({
      suggestions,
    });
  } catch (e) {
    console.log(
      `[${new Date().toISOString()}] [Autocomplete] Exception at ${req.originalUrl}. Error data: ${e.message}`
    );
    return res.status(500).json({
      code: "SERVER_ERROR",
      err: e.message,
    });
  }
};

export { getLocations };
