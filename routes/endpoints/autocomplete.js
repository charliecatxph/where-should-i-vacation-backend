const { gcpMaps_autocomplete } = require("../../dependencies/GCP/Autocomplete");

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
    return res.status(500).json({
      code: "SERVER_ERROR",
      err: err.message,
    });
  }
};

module.exports = { getLocations };
