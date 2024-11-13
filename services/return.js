const SHOPIFYAPPTOKEN = process.env.SHOPIFYAPPTOKEN;
const API_APP_WAREHOUSE_ID = process.env.API_APP_WAREHOUSE_ID;
const Shopify = require('shopify-api-node');
const fetch = require('node-fetch');
const { getshippingDetails } = require('./shippingbo/GMAWarehouseCRUD');

const createReturnOrder = async (accessTokenWarehouse, orderId, returnAll, productSku, shopifyOrderId) => {
    console.log('productSku to create order', productSku);
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
 
    const returnOrder = {
        "order_id": orderId,
        "reason": "Retour en ligne",
        "reason_ref": "Retour Automatisé",
        "return_order_expected_items_attributes": returnOrderExpectedItemsAttributes,
        "return_order_type": "return_order_label",
        "skip_expected_items_creation": true,
        "source": originalOrder.order.source,
        "source_ref": originalOrder.order.source_ref,
        "user_email": shopifyOrderId.toString()
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
const createPriceRule = async (customerId, orderName, totalOrder) => {
    const createPriceRuleUrl = `https://potiron2021.myshopify.com/admin/api/2024-07/price_rules.json`
    const nowDate = new Date().toISOString();
    const OneWeekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const discountRule = {
        "price_rule": {
            "title": `Retour auto ${orderName}`,
            "target_type": "line_item",
            "target_selection": "all",
            "allocation_method": "across",
            "value_type": "fixed_amount",
            "value": `-${totalOrder}`,
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

    try {
        const response = await fetch(createPriceRuleUrl, createPriceRuleOptions);
        if(!response.ok) {
            console.log('error fetching price rules', response)
        } else {
            const priceRule = await response.json();
            return await createDiscountCode(customerId, priceRule, discountRule);
        }
    } catch (error) {
        console.error('error creating price rules', error);
    }
    
}

const createDiscountCode = async (customerId, priceRule, discountRule) => {
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
    try {
        const discountResponse = await fetch(discountCodeUrl, discountCodeOptions);
        if(!discountResponse) {
            console.log('error fetching discount code');
        }
        const discountData = await discountResponse.json();
        return {
            discountData: discountData,
            discountRule: discountRule
        }
    } catch (error) {
        console.error('Error creating discount code', error);
    }
}

const checkIfPriceRuleExists = async (orderName) => {
    const checkPriceRuleUrl = `https://potiron2021.myshopify.com/admin/api/2024-07/price_rules.json`;
    const checkPriceRuleOptions = {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFYAPPTOKEN 
        }
    }
    try {
        const response = await fetch(checkPriceRuleUrl, checkPriceRuleOptions);
        if(response.ok) {
            const data = await response.json();
            const existingRule = data.price_rules.find(
                rule => rule.title === `Retour auto ${orderName}`
            );
            return existingRule ? true : false;
        } else {
            console.log('Error checking if price rule exists');
        }
    } catch (error) {
        console.error("Error checking price rule exists", error);
    }
}

module.exports = {
    createPriceRule,
    createReturnOrder,
    updateReturnOrder,
    checkIfPriceRuleExists
}