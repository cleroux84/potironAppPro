const fetch = require('node-fetch');
const { refreshMS365AccessToken } = require('./microsoftAuth');
const { refreshAccessToken, getToken } = require('./shippingbo/potironParisAuth');
const { refreshAccessTokenWarehouse, getTokenWarehouse } = require('./shippingbo/gmaWarehouseAuth');
const YOUR_AUTHORIZATION_CODE = process.env.YOUR_AUTHORIZATION_CODE;
const WAREHOUSE_AUTHORIZATION_CODE = process.env.WAREHOUSE_AUTHORIZATION_CODE;

const initializeTokens = async () => {
    console.log("heeeeeeeeeeere")
    try {
      if(YOUR_AUTHORIZATION_CODE){
        const tokens = await getToken(YOUR_AUTHORIZATION_CODE);
        let accessToken = tokens.accessToken;
        let refreshToken = tokens.refreshToken;
    } else {
      console.log('ppl initialtoken')
        await refreshAccessToken();
    }   
  } catch (error) {
    console.error('Failed to initialize token', error);
  }
    try {
      if(WAREHOUSE_AUTHORIZATION_CODE){
        const tokensWarehouse = await getTokenWarehouse(WAREHOUSE_AUTHORIZATION_CODE);
        let accessTokenWarehouse = tokensWarehouse.accessTokenWarehouse;
        let refreshTokenWarehouse = tokensWarehouse.refreshTokenWarehouse;
    } else {
        await refreshAccessTokenWarehouse();
    }   
  } catch (error) {
    console.error('Failed to initialize warehouse tokens', error);
  }
  //refreshToken every 1h50
      setInterval(async () => {
        await refreshAccessToken(); 
        await refreshAccessTokenWarehouse();
    }, 6600000); //1h50
    //refreshToken every 1h15 for MS365
    setInterval(async () => {
      console.log('auto refresh MS365 token');
      await refreshMS365AccessToken();
     }, 4500000); //1h15
    // }, 300000);
  };

module.exports = {
    initializeTokens
}