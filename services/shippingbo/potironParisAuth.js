const client = require('../db.js');

const saveRefreshTokenDb = async (token) => {
    try {
      await client.query('UPDATE tokens SET refresh_token = $1 WHERE id = 1', [token]);
      console.log('RefreshToken saved in db for Potiron Paris');
    } catch (error) {
      console.error('Error saving refreshToken in db', error);
    }
  }

  const getRefreshTokenFromDb = async () => {
    try {
      const res = await client.query('SELECT refresh_token FROM tokens LIMIT 1');
      return res.rows[0].refresh_token;
    } catch (error) {
      console.log('Error retrieving refresh token', error);
      return null;
    }
  }

  module.exports = {
    saveRefreshTokenDb,
    getRefreshTokenFromDb
  }