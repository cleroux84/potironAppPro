const { response } = require('express');
const fetch = require('node-fetch');
const API_APP_WAREHOUSE_ID = process.env.API_APP_WAREHOUSE_ID;

  const checkIfReturnOrderExist = async (accessTokenWarehouse, originalOrderId) => {
    console.log('original order Id shippingbo', originalOrderId);
    const checkReturnOrderUrl = `https://app.shippingbo.com/return_orders?search[order_id__eq][]=${originalOrderId}`;
    const checkReturnOrderOptions = {
      method: 'GET',
      headers: {
        'Content-type': 'application/json',
        Accept: 'application/json',
        'X-API-VERSION' : '1',
        'X-API-APP-ID': API_APP_WAREHOUSE_ID,
        Authorization: `Bearer ${accessTokenWarehouse}`
      }
    }

    try {
      const response = await fetch(checkReturnOrderUrl, checkReturnOrderOptions);
      if(response.ok){
        const data = await response.json();
        console.log("data.length", data.return_orders.length )

        if(data && data.return_orders.length > 0) {
          console.log('return order already exists')
          return true
        } else {
          console.log('return order does not exist');
          return false
        }
      } else {
        console.log('Failed to check if return order exists')
      }
    } catch (error) {
      console.error('Error checking if return order exists', error);
    }
  }

  module.exports = {
    // getWarehouseOrderDetails,
    // updateWarehouseOrder,
    // getWarehouseOrderToReturn,
    // getshippingDetails,
    checkIfReturnOrderExist
  }