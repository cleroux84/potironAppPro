const client = require('../db.js');
const fetch = require('node-fetch');

const CLIENT_ID = process.env.CLIENT_ID_SHIPPINGBO;
const CLIENT_SECRET = process.env.CLIENT_SECRET_SHIPPINGBO;

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
  const getToken = async (authorizationCode) => {
    const tokenUrl = 'https://oauth.shippingbo.com/oauth/token';
    const tokenOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: authorizationCode,
        redirect_uri: 'urn:ietf:wg:oauth:2.0:oob'
      })
    };
   
    try {
      const response = await fetch(tokenUrl, tokenOptions);
      const data = await response.json();
      if(data.error){
        console.log('Refresh Potiron Paris Access Token');
        await refreshAccessToken();
      } else {
        accessToken = data.access_token;
        refreshToken = data.refresh_token;
        console.log("getToken with auhorizationCode");
        await saveRefreshTokenDb(refreshToken);
      }
      return {
        accessToken,
        refreshToken
      };
    } catch (error) {
      console.error('Error obtaining access token getToken:', error);
    }
  };
  const refreshAccessToken = async () => {
    refreshToken = await getRefreshTokenFromDb();
    console.log('actual refreshToken for loop : ', refreshToken);
    const refreshUrl = 'https://oauth.shippingbo.com/oauth/token';
    const refreshOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: refreshToken
      })
    };
   
    try {
      const response = await fetch(refreshUrl, refreshOptions);
      const data = await response.json();
      accessToken = data.access_token;
      refreshToken = data.refresh_token;
      await saveRefreshTokenDb(refreshToken);
      return {
        accessToken,
        refreshToken
      };
    } catch (error) {
      console.error('Error refreshing access token:', error);
    }
  };
  module.exports = {
    getToken,
    refreshAccessToken
  }