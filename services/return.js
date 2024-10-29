const SHOPIFYAPPTOKEN = process.env.SHOPIFYAPPTOKEN;
const API_APP_WAREHOUSE_ID = process.env.API_APP_WAREHOUSE_ID;
const Shopify = require('shopify-api-node');
const fetch = require('node-fetch');
const { getshippingDetails } = require('./shippingbo/GMAWarehouseCRUD');

const createReturnOrder = async (accessTokenWarehouse, orderId) => {
    const originalOrder = await getshippingDetails(accessTokenWarehouse, orderId); 
    console.log('originalOrder', originalOrder.id);
    const createReturnUrl = `https://app.shippingbo.com/return_orders`;
    const orderItem = originalOrder.order.order_items[0];
    const returnOrder = {
        "order_id": orderId,
        "reason" : "Retour en ligne",
        "reason_ref" : "Retour Automatisé",
        "return_order_expected_items_attributes": originalOrder.order.order_items.map(item => ({
            quantity: item.quantity,
            user_ref: item.product_ref
        })),
        "return_order_type": "return_order_label",
        "skip_expected_items_creation" : true,
        "source": originalOrder.order.source,
        "source_ref": originalOrder.order.source_ref    }
    // console.log('object to create return', returnOrder);
    const createReturnOptions = {
        method: 'POST',
        headers: {
        'Content-type': 'application/json',
        Accept: 'application/json',
        'X-API-VERSION' : '1',
        'X-API-APP-ID': API_APP_WAREHOUSE_ID,
        Authorization: `Bearer ${accessTokenWarehouse}`
      },
      body: JSON.stringify(returnOrder)
    };
    try {
        const response = await fetch(createReturnUrl, createReturnOptions);
        const data = await response.json();
        console.log("return created", data);
        const returnId = data.id;
        // const shipmentData = await createShipment(accessTokenWarehouse, returnId);
        return data;
        if(response.ok) {
            console.log('return create in GMA Shippingbo for order: ', orderId);
          }
    } catch (error) {
        console.error('Error creatring GMA shippingbo return order', error);
    }
}

const updateReturnOrder = async (accessTokenWarehouse, orderId, parcelNumber) => {
    //retour support shippingbo : shiping_ref n'existe pas en écriture sur les commandes retours - en cours !
    const updatedData = {
        "id": orderId,
        "state": "new",
        // "reason": "test to change"
        // "shipping_ref": parcelNumber,
        // "shipping_method_id": 220,
        // "user_mail": "c.leroux@potiron.com"
    }
    const updateReturnUrl = `https://app.shippingbo.com/return_orders/${orderId}`;
    const updateReturnOptions = {
        method: 'PATCH',
        headers: {
        'Content-type': 'application/json',
        Accept: 'application/json',
        'X-API-VERSION' : '1',
        'X-API-APP-ID': API_APP_WAREHOUSE_ID,
        Authorization: `Bearer ${accessTokenWarehouse}`
      },
      body: JSON.stringify(updatedData)
    };
    try {
        const response = await fetch(updateReturnUrl, updateReturnOptions);
        const data = await response.json();
        console.log('response status', response.status, 'body', data)
        if(response.ok) {
          console.log('updated return order in shippingbo warehouse with colissimo data: ', data);
        }
      } catch (error) {
         console.error('Error updating shippingbo order', error);
      }

}

const createShipment = async (accessTokenWarehouse, returnId) => {
    const createShipmentUrl = `https://app.shippingbo.com/shipments`;
    const shipmentToCreate = {
        "shipment": {
            "carrier_id" : 1,
            "order_id": returnId,
            "shipping_method_id" : 63,
            "shipment_type" : "return_label"
        }
    }
    const createShipmentOptions = {
        method: 'POST',
        headers: {
        'Content-type': 'application/json',
        Accept: 'application/json',
        'X-API-VERSION' : '1',
        'X-API-APP-ID': API_APP_WAREHOUSE_ID,
        Authorization: `Bearer ${accessTokenWarehouse}`
    },
    body: JSON.stringify(shipmentToCreate)
    };

    try {
        const response = await fetch(createShipmentUrl, createShipmentOptions);
        const shipmentData = await response.json();
        console.log('shipment created', shipmentData);
    } catch (error) {
        console.error('error creating shipment', error);
    }
} 

const getReturnOrderDetails = async (accessTokenWarehouse, returnOrderId) => {
    const returnOrderUrl = `https://app.shippingbo.com/return_orders/${returnOrderId}`;
    const returnOrderOptions = {
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
        const response = await fetch(returnOrderUrl, returnOrderOptions);
        const data = await response.json();
        console.log('return order:', data);
    } catch (error) {
        console.error('error getting return order', error);
    }
}

const createDiscountCode = async (customerId, totalOrder) => {
    const createPriceRuleUrl = `https://potiron2021.myshopify.com/admin/api/2024-07/price_rules.json`
    const nowDate = new Date().toISOString();
    const OneWeekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const discountRule = {
        "price_rule": {
            "title": `Retour auto ${customerId}`,
            "target_type": "line_item",
            "target_selection": "all",
            "allocation_method": "across",
            "value_type": "fixed_amount",
            "value": `-${(totalOrder / 100).toFixed(2)}`,
            "customer_selection": "prerequisite",
            "prerequisite_customer_ids": [customerId],
            "starts_at": nowDate,
            "ends_at": OneWeekLater,
            "once_per_customer": true,
            "usage_limit": 1,
            "currency": "EUR"
         }
    }
    const createPriceRuleOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFYAPPTOKEN 
        },
        body: JSON.stringify(discountRule)
    };

    // console.log("total", totalOrder);
    try {
        const response = await fetch(createPriceRuleUrl, createPriceRuleOptions);
        if(!response.ok) {
            console.log('error fetching price rules', response)
        }
        const priceRule = await response.json();
        // console.log("created price rules", data);
        const discountCodeUrl = `https://potiron2021.myshopify.com/admin/api/2024-07/price_rules/${priceRule.price_rule.id}/discount_codes.json`
        const discountCode = {
            "discount_code": {
                "code": `RETURN-${customerId}`
            }
        }
        const discountCodeOptions = {
            method: 'POST',
            headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFYAPPTOKEN 
            },
            body: JSON.stringify(discountCode)
        }
        const discountResponse = await fetch(discountCodeUrl, discountCodeOptions);
        if(!discountResponse) {
            console.log('error fetching discount code');
        }
        const discountData = await discountResponse.json();
        return {
            discountData: discountData,
            discountule: discountRule
        }

    } catch (error) {
        console.error('erreur creation code de reduction');
    }
    
}

module.exports = {
    createDiscountCode,
    createReturnOrder,
    getReturnOrderDetails,
    updateReturnOrder
}