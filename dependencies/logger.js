import dotenv from "dotenv";
dotenv.config();

const logger = (message, route) => {
    if (process.env.VERBOSE === "true") {
        console.log(`[${new Date().toISOString()}] | [${route}] ${message}`);
    }
};

export default logger;