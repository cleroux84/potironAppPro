//Requests for tokens table concerning GMA Shippingbo (warehouse)
const client = require('../db.js');

// Get access token from DB
const getAccessTokenWarehouseFromDb = async () => {
    try {
      const res = await client.query('SELECT token_warehouse FROM tokens LIMIT 1');
      return res.rows[0].token_warehouse;
    } catch (error) {
      console.log('Error retrieving token from db', error);
      return null;
    }
  }

  // Get refresh token from DB
  const getRefreshTokenWarehouseFromDb = async () => {
    try {
      const res = await client.query('SELECT refresh_token_warehouse FROM tokens LIMIT 1');
      return res.rows[0].refresh_token_warehouse;
    } catch (error) {
      console.log('Error retrieving refresh_token_warehouse', error);
      return null;
    }
  }

  //savec access and refresh token in DB
  const saveAccessAndRefreshTokenWarehouseDb = async (tokenWarehouse, refreshTokenWarehouse) => {
    try {
      await client.query('UPDATE tokens SET refresh_token_warehouse = $1 WHERE id = 1', [refreshTokenWarehouse]);
      await client.query('UPDATE tokens SET token_warehouse = $1 WHERE id = 1', [tokenWarehouse]);
    } catch (error) {
      console.error('Error saving refreshTokenWarehouse in db', error);
    }
  }

  module.exports = {
    getAccessTokenWarehouseFromDb,
    getRefreshTokenWarehouseFromDb,
    saveAccessAndRefreshTokenWarehouseDb
  }