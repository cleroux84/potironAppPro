const API_APP_ID = process.env.API_APP_ID;
const fetch = require('node-fetch');

const getShippingboOrderDetails = async (shopifyOrderId) => {
    console.log('accesstoken dans fichier exporté', accessToken);
    const getOrderUrl = `https://app.shippingbo.com/orders?search[source_ref__eq][]=${shopifyOrderId}`;
    const getOrderOptions = {
      method: 'GET',
      headers: {
        'Content-type': 'application/json',
        Accept: 'application/json',
        'X-API-VERSION': '1',
        'X-API-APP-ID': API_APP_ID,
        Authorization: `Bearer ${accessToken}`
      },
    };
   
    try {
      const response = await fetch(getOrderUrl, getOrderOptions);
      const data = await response.json();
      if (data.orders && data.orders.length > 0) {
        const {id, origin_ref} = data.orders[0];
        return {id, origin_ref};
      } else {
        console.log('No data orders found in Shippingbo Potiron Paris');
        return null;
      }
    } catch (err) {
      console.error('Error fetching Shippingbo order ID', err);
      return null;
    }
  };

  module.exports = {
    getShippingboOrderDetails
  }