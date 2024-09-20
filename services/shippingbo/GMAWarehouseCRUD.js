const { response } = require('express');
const fetch = require('node-fetch');
const API_APP_WAREHOUSE_ID = process.env.API_APP_WAREHOUSE_ID;

//Retrieve shippingbo order ID from Shippingbo Potiron Paris order ID
const getWarehouseOrderDetails = async (accessTokenWarehouse, shippingboId) => {
    const getOrderUrl = `https://app.shippingbo.com/orders?search[source_ref__eq][]=${shippingboId}`;
    const getOrderOptions = {
      method: 'GET',
      headers: {
        'Content-type': 'application/json',
        Accept: 'application/json',
        'X-API-VERSION': '1',
        'X-API-APP-ID': API_APP_WAREHOUSE_ID,
        Authorization: `Bearer ${accessTokenWarehouse}`
      },
    };
    try {
      const response = await fetch(getOrderUrl, getOrderOptions);
      const data = await response.json();
      if (data.orders && data.orders.length > 0) {
        const {id, origin_ref} = data.orders[0];
        return {id, origin_ref};
      } else {
        console.log('No data orders found in warehouse');
        return null;
      }
    } catch (err) {
      console.error('Error fetching Shippingbo order ID Warehouse', err);
      return null;
    }
  };

  const getWarehouseOrderToReturn = async (accessTokenWarehouse, shippingboId) => {
    const getOrderUrl = `https://app.shippingbo.com/orders?search[source_ref__eq][]=${shippingboId}`;
    const getOrderOptions = {
      method: 'GET',
      headers: {
        'Content-type': 'application/json',
        Accept: 'application/json',
        'X-API-VERSION': '1',
        'X-API-APP-ID': API_APP_WAREHOUSE_ID,
        Authorization: `Bearer ${accessTokenWarehouse}`
      },
    };
    try {
      const response = await fetch(getOrderUrl, getOrderOptions);
      const data = await response.json();
      if (data.orders && data.orders.length > 0) {
        return data.orders[0];
      } else {
        console.log('No data orders found in warehouse');
        return null;
      }
    } catch (err) {
      console.error('Error fetching Shippingbo order ID Warehouse', err);
      return null;
    }
  };

  //get shipments detail of an order
  const getshippingDetails = async (accessTokenWarehouse, shippingboId) => {
    const getShipmentUrl = `https://app.shippingbo.com/shipments?search[order_id__eq][]=${shippingboId}`;
    const getShipmentOptions = {
      method: 'GET',
      headers: {
        'Content-type': 'application/json',
        Accept: 'application/json',
        'X-API-VERSION': '1',
        'X-API-APP-ID': API_APP_WAREHOUSE_ID,
        Authorization: `Bearer ${accessTokenWarehouse}`
      },
    }
      try {
        const response = await fetch(getShipmentUrl, getShipmentOptions);
        const data = await response.json();
        if(data.shipments && data.shipments.length > 0) {
          const shipment = data.shipment[0];
          console.log('shipment', shipment);
          return shipment;
        } else {
          console.log("no shipment result");
          return null;
        }
        
      } catch (error) {
        console.error("error fetching shipment details", error);
        return null;
      }
  }

//update orders origin and origin ref in shippingbo GMA => Entrepôt to add "Commande PRO" and "PRO-"
  const updateWarehouseOrder = async (accessTokenWarehouse, shippingboOrderId, originRef) => {
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
        'X-API-APP-ID': API_APP_WAREHOUSE_ID,
        Authorization: `Bearer ${accessTokenWarehouse}`
      },
      body: JSON.stringify(updatedOrder)
    };
    try{
          const response = await fetch(updateOrderUrl, updateOrderOptions);
          const data = await response.json();
          if(response.ok) {
            console.log('pro order updated in shippingbo warehouse: ', shippingboOrderId);
          }
        } catch (error) {
           console.error('Error updating shippingbo order', error);
        }
  }

  module.exports = {
    getWarehouseOrderDetails,
    updateWarehouseOrder,
    getWarehouseOrderToReturn,
    getshippingDetails
  }