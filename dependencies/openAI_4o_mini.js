// const axios = require("axios");

// const openAI_4o_mini = async (query) => {
//   const openAI_response = await axios.request({
//     method: "POST",
//     url: "https://gpt-4o-mini2.p.rapidapi.com/v1/chat/completions",
//     headers: {
//       "x-rapidapi-key": "RX",
//       "x-rapidapi-host": "gpt-4o-mini2.p.rapidapi.com",
//       "Content-Type": "application/json",
//     },
//     data: {
//       model: "gpt-4o-mini",
//       messages: [
//         {
//           role: "user",
//           content: query,
//         },
//       ],
//       stream: false,
//     },
//   });
//   return openAI_response.data.choices[0].message.content;
// };

// module.exports = { openAI_4o_mini };

import "dotenv/config";
import OpenAI from "openai";

const client = new OpenAI();

const openAI_4o_mini = async (query) => {
  const response = await client.responses.create({
    model: "gpt-4o-mini",
    input: query,
  });
  return response.output_text;
};

export { openAI_4o_mini };
