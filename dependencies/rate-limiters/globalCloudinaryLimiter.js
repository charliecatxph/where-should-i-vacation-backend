import "dotenv/config";
import Bottleneck from "bottleneck";

const cloudinaryLimiter = new Bottleneck({
  reservior: parseInt(process.env.CLOUDINARY_BOTTLENECK_RESERVOIR),
  reservoirRefreshAmount: parseInt(process.env.CLOUDINARY_BOTTLENECK_RESERVOIR),
  reservoirRefreshInterval: 60 * 60 * 1000,

  maxConcurrent: parseInt(process.env.CLOUDINARY_BOTTLENECK_MAX_CONCURRENT),
  minTime: parseInt(process.env.CLOUDINARY_BOTTLENECK_MIN_TIME),
});

export default cloudinaryLimiter;
