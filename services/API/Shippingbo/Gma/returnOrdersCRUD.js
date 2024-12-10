//Requests to shippingbo GMA RETURN ORDERS API (warehouse)

const { response } = require('express');
const fetch = require('node-fetch');
const { getshippingDetails } = require('./ordersCRUD');
const API_APP_WAREHOUSE_ID = process.env.API_APP_WAREHOUSE_ID;

//Check if a return order already exists for an original order id
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

  //Create a new return order
  const createReturnOrder = async (accessTokenWarehouse, orderId, returnAll, productSku, shopifyOrderId, optionChoose) => {
    const shopifyIdString = shopifyOrderId.toString();
    console.log('shopify orderId', shopifyIdString);

    const originalOrder = await getshippingDetails(accessTokenWarehouse, orderId); 
    const createReturnUrl = `https://app.shippingbo.com/return_orders`;
 
    const returnOrderExpectedItemsAttributes = returnAll 
        ? originalOrder.order.order_items.map(item => ({
            quantity: item.quantity,
            user_ref: item.product_ref
        })) 
        : originalOrder.order.order_items
            .filter(item => 
                // Vérifie si `product_user_ref` dans `productSku` correspond à `item.product_ref`
                productSku.some(sku => sku.product_user_ref === item.product_ref)
            )
            .map(item => {
                // Trouver l’objet `sku` correspondant
                const matchedSku = productSku.find(sku => sku.product_user_ref === item.product_ref);
                return {
                    quantity: matchedSku ? matchedSku.quantity : item.quantity, // Utilise la quantité de `productSku` si trouvée
                    user_ref: item.product_ref
                };
            });
            let optionChooseData;
            if(optionChoose === 'option1') {
              optionChooseData = 'Retour Auto ASSET';
            } else if(optionChoose === 'option2') {
              optionChooseData = 'Retour AUTO REFUND';
            }
    const returnOrder = {
        "order_id": orderId,
        "reason": optionChooseData,
        "reason_ref": shopifyIdString,
        "return_order_expected_items_attributes": returnOrderExpectedItemsAttributes,
        "return_order_type": "return_order_label",
        "skip_expected_items_creation": true,
        "source": originalOrder.order.source,
        "source_ref": originalOrder.order.source_ref
    };
 
    const createReturnOptions = {
        method: 'POST',
        headers: {
            'Content-type': 'application/json',
            Accept: 'application/json',
            'X-API-VERSION': '1',
            'X-API-APP-ID': API_APP_WAREHOUSE_ID,
            Authorization: `Bearer ${accessTokenWarehouse}`
        },
        body: JSON.stringify(returnOrder)
    };
 
    try {
        const response = await fetch(createReturnUrl, createReturnOptions);
        const data = await response.json();
 
        // Vérifie si la requête est réussie avant de retourner les données
        if (response.ok) {
            console.log('Return created in GMA Shippingbo for order:', orderId);
        } else {
            console.error('Error in creating return order:', data);
        }
 
        return data;
 
    } catch (error) {
        console.error('Error creating GMA Shippingbo return order:', error);
    }
};
// Update a return order with parcelNumber is not possible yet
// const updateReturnOrder = async (accessTokenWarehouse, orderId, parcelNumber) => {
//     //retour support shippingbo : shiping_ref n'existe pas en écriture sur les commandes retours - en cours !
//     const updatedData = {
//         "id": orderId,
//         "state": "new",
//         // "reason": "test to change"
//         // "shipping_ref": parcelNumber,
//         // "shipping_method_id": 220,
//         // "user_mail": "c.leroux@potiron.com"
//     }
//     const updateReturnUrl = `https://app.shippingbo.com/return_orders/${orderId}`;
//     const updateReturnOptions = {
//         method: 'PATCH',
//         headers: {
//         'Content-type': 'application/json',
//         Accept: 'application/json',
//         'X-API-VERSION' : '1',
//         'X-API-APP-ID': API_APP_WAREHOUSE_ID,
//         Authorization: `Bearer ${accessTokenWarehouse}`
//       },
//       body: JSON.stringify(updatedData)
//     };
//     try {
//         const response = await fetch(updateReturnUrl, updateReturnOptions);
//         const data = await response.json();
//         console.log('response status', response.status, 'body', data)
//         if(response.ok) {
//           console.log('updated return order in shippingbo warehouse with colissimo data: ', data);
//         }
//       } catch (error) {
//          console.error('Error updating shippingbo order', error);
//       }

// }

  module.exports = {
    checkIfReturnOrderExist,
    createReturnOrder,
    // updateReturnOrder
  }