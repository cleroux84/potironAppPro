const fetch = require('node-fetch');
const API_APP_ID = process.env.API_APP_ID;

//Retrieve shippingbo order ID from ShopifyID or DraftID and send Shippingbo ID in Potiron Paris Shippingbo
const getShippingboOrderDetails = async (accessToken, shopifyOrderId) => {
  console.log("id for shippingbo", shopifyOrderId);
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
  
//update orders origin and origin ref in shippingbo Potiron Paris to add "Commande PRO" and "PRO-"
  const updateShippingboOrder = async (accessToken, shippingboOrderId, originRef) => {
    if(originRef.includes('PRO-') === false)  {
      originRef = "PRO-" + originRef;
    }
    const updatedOrder= {
      id: shippingboOrderId,
      origin: "Commande PRO",
      origin_ref: originRef
  }
    const updateOrderUrl = `https://app.shippingbo.com/orders/${shippingboOrderId}`;
    const updateOrderOptions = {
      method: 'PATCH',
      headers: {
        'Content-type': 'application/json',
        Accept: 'application/json',
        'X-API-VERSION' : '1',
        'X-API-APP-ID': API_APP_ID,
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(updatedOrder)
    };
    try{
          const response = await fetch(updateOrderUrl, updateOrderOptions);
          const data = await response.json();
          if(response.ok) {
            console.log('pro order updated in shippingbo: ', shippingboOrderId);
          }
        } catch (error) {
           console.error('Error updating shippingbo order', error);
        }
  }

//cancel draft order in Shippingbo Potiron if completed if closed in Shopify
  const cancelShippingboDraft = async (accessToken, shippingboOrderId) => {
    const orderToCancel= {
      state: 'canceled'
  }
    const cancelOrderUrl = `https://app.shippingbo.com/orders/${shippingboOrderId}`;
    const cancelOrderOptions = {
      method: 'PATCH',
      headers: {
        'Content-type': 'application/json',
        Accept: 'application/json',
        'X-API-VERSION' : '1',
        'X-API-APP-ID': API_APP_ID,
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(orderToCancel)
    };
    try {
          const response = await fetch(cancelOrderUrl, cancelOrderOptions);
          const data = await response.json();
          if(response.ok) {
            console.log('order cancel in shippingbo Potiron Paris: ', shippingboOrderId);
          }
        } catch (error) {
           console.error('Error updating shippingbo order', error);
        }
  }

  //create draft order in shippingbo when pro draft is created in Shopify
  const createProDraftOrderShippingbo = async (accessToken, shippingBoOrder) => {
    console.log("createDraft", accessToken);
    console.log("shippingorder", shippingBoOrder);
    const createOrderUrl = `https://app.shippingbo.com/orders`;
    const createOrderOptions = {
      method: 'POST',
      headers: {
        'Content-type': 'application/json',
        Accept: 'application/json',
        'X-API-VERSION' : '1',
        'X-API-APP-ID': API_APP_ID,
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(shippingBoOrder)
    };
    try { 
        const responseShippingbo = await fetch(createOrderUrl, createOrderOptions);
        const data = await responseShippingbo.json();
        console.log('draft order created', data.order.id);
        // console.log('response from shippingbo', data)
    } catch (error) {
      console.error('error in creation order from draft shopify', error);
    }
  }

  module.exports = {
    getShippingboOrderDetails,
    updateShippingboOrder,
    cancelShippingboDraft,
    createProDraftOrderShippingbo
  }