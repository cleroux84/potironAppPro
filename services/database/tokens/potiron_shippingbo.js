//Requests for tokens table concerning Potiron Shippingbo
const client = require('../db.js');

// Get access token from DB
const getAccessTokenFromDb = async () => {
    try {
      const res = await client.query('SELECT token FROM tokens LIMIT 1');
      return res.rows[0].token;
    } catch (error) {
      console.log('Error retrieving token from db', error);
      return null;
    }
  }

  
//Get refresh token from DB
const getRefreshTokenFromDb = async () => {
    try {
      const res = await client.query('SELECT refresh_token FROM tokens LIMIT 1');
      return res.rows[0].refresh_token;
    } catch (error) {
      console.error('Error retrieving refresh token', error);
      return null;
    }
  }

  const saveAccessAndRefreshTokenDb = async (token, refreshToken) => {
    try {
      await client.query('UPDATE tokens SET refresh_token = $1 WHERE id = 1', [refreshToken]);
      await client.query('UPDATE tokens SET token = $1 WHERE id = 1', [token]);
    } catch (error) {
      console.error('Error saving refreshToken in db', error);
    }
  }

  module.exports = {
    getAccessTokenFromDb,
    getRefreshTokenFromDb,
    saveAccessAndRefreshTokenDb
  }