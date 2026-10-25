// Vercel Serverless Function entry point
// Bridges incoming Vercel serverless requests to the GoErudite backend
const { requestListener } = require("../backend/server");

module.exports = async (req, res) => {
  await requestListener(req, res);
};
