const client = require('../db.js');
const fetch = require('node-fetch');
const CLIENT_ID_WAREHOUSE = process.env.CLIENT_ID_WAREHOUSE;
const CLIENT_SECRET_WAREHOUSE = process.env.CLIENT_SECRET_WAREHOUSE;
let accessTokenWarehouse = null;
let refreshTokenWarehouse = null;

const saveRefreshTokenWarehouseDb = async (token) => {
    try {
      await client.query('UPDATE tokens SET refresh_token_warehouse = $1 WHERE id = 1', [token]);
      console.log('RefreshToken saved in db for GMA Warehouse');
    } catch (error) {
      console.error('Error saving refreshTokenWarehouse in db', error);
    }
  }
  
  const getRefreshTokenWarehouseFromDb = async () => {
    try {
      const res = await client.query('SELECT refresh_token_warehouse FROM tokens LIMIT 1');
      return res.rows[0].refresh_token_warehouse;
    } catch (error) {
      console.log('Error retrieving refresh_token_warehouse', error);
      return null;
    }
  }

  const getTokenWarehouse = async (authorizationCode) => {
    const tokenUrl = 'https://oauth.shippingbo.com/oauth/token';
    const tokenOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID_WAREHOUSE,
        client_secret: CLIENT_SECRET_WAREHOUSE,
        code: authorizationCode,
        redirect_uri: 'urn:ietf:wg:oauth:2.0:oob'
      })
    };
   
    try {
      const response = await fetch(tokenUrl, tokenOptions);
      const data = await response.json();
      if(data.error) {
        console.log('Refresh GMA Warehouse Access Token');
        await refreshAccessTokenWarehouse();
      } else {
        accessTokenWarehouse = data.access_token;
        refreshTokenWarehouse = data.refresh_token;
        await saveRefreshTokenWarehouseDb(refreshTokenWarehouse);
      }
      return {
        accessTokenWarehouse,
        refreshTokenWarehouse
      };
    } catch (error) {
      console.error('Error obtaining access token Warehouse:', error);
    }
  };

  const refreshAccessTokenWarehouse = async () => {
    refreshTokenWarehouse = await getRefreshTokenWarehouseFromDb();
    const refreshUrl = 'https://oauth.shippingbo.com/oauth/token';
    const refreshOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID_WAREHOUSE,
        client_secret: CLIENT_SECRET_WAREHOUSE,
        refresh_token: refreshTokenWarehouse
      })
    };
   
    try {
      const response = await fetch(refreshUrl, refreshOptions);
      const data = await response.json();
      accessTokenWarehouse = data.access_token;
      refreshTokenWarehouse = data.refresh_token;
      await saveRefreshTokenWarehouseDb(refreshTokenWarehouse);
      return {
        accessTokenWarehouse,
        refreshTokenWarehouse
      };
    } catch (error) {
      console.error('Error refreshing access token WAREHOUSE:', error);
    }
  };
   


  module.exports = {
    getTokenWarehouse,
    refreshAccessTokenWarehouse
  };