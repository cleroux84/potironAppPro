const client = require('../database/db.js');
const fetch = require('node-fetch');
const { saveAccessAndRefreshTokenDb, getRefreshTokenFromDb } = require('../database/tokens/potiron_shippingbo.js');
const CLIENT_ID = process.env.CLIENT_ID_SHIPPINGBO;
const CLIENT_SECRET = process.env.CLIENT_SECRET_SHIPPINGBO;
let accessToken = null;
let refreshToken = null;

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
        await saveAccessAndRefreshTokenDb(accessToken, refreshToken);
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
    console.log('refresh before refresh', refreshToken);
    console.log('token before refresh', accessToken);
    refreshToken = await getRefreshTokenFromDb();
    console.log('refresh after refresh', refreshToken);
    console.log('token after refresh', accessToken);
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
      if(data.access_token && data.refresh_token) {
        accessToken = data.access_token;
        refreshToken = data.refresh_token;
        console.log('BUG NEW ACCESS', data)
        await saveAccessAndRefreshTokenDb(accessToken, refreshToken);
      } else {
        console.error('refresh failed here', data)
      }
    } catch (error) {
      console.error('Error refreshing access token:', error);
    }
  };
  
  module.exports = {
    getToken,
    refreshAccessToken,
  }