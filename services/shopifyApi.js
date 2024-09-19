const SHOPIFYAPPTOKEN = process.env.SHOPIFYAPPTOKEN;
const Shopify = require('shopify-api-node');
const fetch = require('node-fetch');

const { sendNewDraftOrderMail } = require('./sendMail.js');
const { createProDraftOrderShippingbo } = require('./shippingbo/potironParisCRUD.js');

//Create draft Order in Shopify

const createDraftOrder = async (draftOrder, accessToken) => {
    const draftOrderUrl = `https://potiron2021.myshopify.com/admin/api/2024-07/draft_orders.json`;
    const draftOrderOptions = {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFYAPPTOKEN 
    },
    body: JSON.stringify(draftOrder) 
    };

    const response = await fetch(draftOrderUrl, draftOrderOptions);
    const data = await response.json();

    if(data && data.draft_order && data.draft_order.customer){
        const draftOrderLineItems = data.draft_order.line_items;
        const firstnameCustomer = data.draft_order.customer.first_name;
        const nameCustomer = data.draft_order.customer.last_name;
        const draftOrderName = data.draft_order.name;
        const draftOrderId = 'draft' + draftOrderName.replace('#','');
        const customerMail = data.draft_order.customer.email;
        const customerPhone = data.draft_order.customer.phone;
        const shippingAddress = data.draft_order.shipping_address.address1 + ' ' + data.draft_order.shipping_address.zip + ' ' + data.draft_order.shipping_address.city;
        
        const metafields = await getCustomerMetafields(data.draft_order.customer.id);
        const deliveryPref = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'delivery_pref');
        let dataForShippingboTag;
        const paletteEquipment = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'palette_equipment');
        const paletteAppointment = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'palette_appointment');
        const paletteNotes = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'palette_notes');
        const paletteNotesValue = paletteNotes?.value || "Aucune note complémentaire";
        const paletteEquipmentValue = paletteEquipment?.value || "";

        let appointmentValue = 'Non';
        
        if (deliveryPref.value.includes("palette")) {
          if(paletteAppointment.value === true || paletteAppointment.value === "true") {
            appointmentValue = 'Oui'
          }
        dataForShippingboTag = [
          "Commande PRO", 
          "Adresse : " + shippingAddress, 
          "Préference(s) de livraison : " + deliveryPref.value, 
          "Equipement pour palette : " + paletteEquipment.value,
          "Nécessite un RDV : " + appointmentValue,
          "Notes complémentaires : " + paletteNotesValue
          ]
        } else {
          dataForShippingboTag = [
            "Commande PRO", 
            "Adresse : " + shippingAddress, 
            "Préference(s) de livraison : " + deliveryPref.value
          ]
        }
        await sendNewDraftOrderMail(firstnameCustomer, nameCustomer, draftOrderId, customerMail, customerPhone, shippingAddress, deliveryPref.value, paletteEquipmentValue, appointmentValue, paletteNotesValue);
        
        const shippingBoOrder = {
            order_items_attributes: draftOrderLineItems.map(item => ({
            price_tax_included_cents: item.price * 100,
            price_tax_included_currency: 'EUR',
            product_ref: item.sku,
            product_source: "Shopify-8543",
            product_source_ref: item.variant_id,
            quantity: item.quantity,
            title: item.title,
            source: 'Potironpro'
        })),
        origin: 'Potironpro',
        origin_created_at: new Date(data.draft_order.created_at).toISOString(),
        origin_ref: draftOrderName + 'provisoire',
        shipping_address_id: data.draft_order.shipping_address.id,
        source: 'Potironpro',
        source_ref: draftOrderId,
        state: 'waiting_for_payment',
        total_price_cents: data.draft_order.subtotal_price * 100,
        total_price_currency: 'EUR',
        tags_to_add: dataForShippingboTag
        };
        await createProDraftOrderShippingbo(accessToken, shippingBoOrder);
        return data;
    } else {
        console.error('Invalid response structure from Shopify to create draft order for PRO')
    }
}

const orderById = async (orderName, orderMail, customerId) => {
  console.log("commande recherché", orderName);
  console.log('customerid', customerId);
  const orderUrl = `https://potiron2021.myshopify.com/admin/api/2024-07/customers/${customerId}/orders.json?status=any`;
  const orderOptions = {
    method: 'GET',
    headers: {             
      'Content-Type': 'application/json',             
      'X-Shopify-Access-Token': SHOPIFYAPPTOKEN 
    }
  }
  try {
    const response = await fetch(orderUrl, orderOptions);
    let myOrderData;
    if(!response.ok) {
      console.log(`Error fetching order by name : ${response.statusText}`);
    }
    const ordersData = await response.json();
    // console.log("orders customer", ordersData);
    if (ordersData) {
      myOrderData = ordersData.find(order => order.name === orderName);
      console.log('in', myOrderData);
    }
    console.log("my order data", myOrderData);
    return myOrderData;
  } catch (error) {
    console.error('Error tor retrieve order by name', error);
  }
}

const draftOrderById = async (draftOrderId) => {
  const draftOrderUrl = `https://potiron2021.myshopify.com/admin/api/2024-07/draft_orders/${draftOrderId}.json`;
  const draftOrderOptions = {
    method: 'GET',
    headers: {             
      'Content-Type': 'application/json',             
      'X-Shopify-Access-Token': SHOPIFYAPPTOKEN 
    },
  }
  try {
    const response = await fetch(draftOrderUrl, draftOrderOptions);
    if(!response.ok) {
      console.log(`Error fetching draft orders : ${response.statusText}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error to retrieve draft order by id', error);
  }
}

const lastDraftOrder = async (customerId) => {
  const lastDraftUrl = `https://potiron2021.myshopify.com/admin/api/2024-07/draft_orders.json`;
  const lastDraftOptions = {
    method: 'GET',
    headers: {             
      'Content-Type': 'application/json',             
      'X-Shopify-Access-Token': SHOPIFYAPPTOKEN 
    },
  };

  try {
    const response = await fetch(lastDraftUrl, lastDraftOptions);
    if(!response.ok) {
      console.log(`Error fetching draft orders : ${response.statusText}`);
    }
    const data = await response.json();
    const customerDraftOrders = data.draft_orders.filter(order => order.customer && order.customer.id == customerId);
    if(customerDraftOrders.length > 0) {
      const lastDraftOrder = customerDraftOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      if(lastDraftOrder.status !== 'completed' && lastDraftOrder.status !== 'closed'){
        return { orderNumber : lastDraftOrder.name, orderId: lastDraftOrder.id };
      } else {
        return { message : 'Toutes les commandes sont closes' };
      }
    } else {
      return { message : "Aucune commande provisoire pour ce client"};
    }
  } catch (error) {
    console.error('Error to retrieve draft orders', error);
  }
}

// const getDraftOrderById

const updateDraftOrderWithDraftId = async (updatedOrder, orderId) => {
    const updateOrderUrl = `https://potiron2021.myshopify.com/admin/api/2024-07/draft_orders/${orderId}.json`;
    const updateOptions = {
      method: 'PUT',
      headers: {             
        'Content-Type': 'application/json',             
        'X-Shopify-Access-Token': SHOPIFYAPPTOKEN 
      },
      body: JSON.stringify(updatedOrder)
    };
    try {
      const response = await fetch(updateOrderUrl, updateOptions);
      const data = await response.json();       
      console.log('Draft order updated with draft Id: ', orderId);  
      return data;
    } catch (error) {
      console.error('Error updating draft order:', error);
      res.status(500).send('Error updating order');
    }
}

const getCustomerMetafields = async (clientId) => {
    const metafieldsUrl = `https://potiron2021.myshopify.com/admin/api/2024-07/customers/${clientId}/metafields.json`;
    const fetchOptions = {         
      method: 'GET',         
      headers: {             
        'Content-Type': 'application/json',             
        'X-Shopify-Access-Token': SHOPIFYAPPTOKEN 
      }
    };
  
    try {
      const response = await fetch(metafieldsUrl, fetchOptions);
      const data = await response.json();
      if (!data.metafields) {
        console.log('Error : No metafields found');
      }
      return data.metafields;
    } catch (error) {
      console.error('Error fetching metafields:', error);
      throw error; // Propager l'erreur pour une gestion ultérieure
    }
  };
  
  const updateProCustomer = async (clientId, updatedData) => {
    const updateCustomerUrl = `https://potiron2021.myshopify.com/admin/api/2024-07/customers/${clientId}.json`;
    const updateOptions = {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFYAPPTOKEN
      },
      body: JSON.stringify(updatedData)
    };
  
    try {
      const response = await fetch(updateCustomerUrl, updateOptions);
      const updatedClient = await response.json();
      return updatedClient;
    } catch (error) {
      console.error('Error updating client data:', error);
      throw error; // Propager l'erreur pour une gestion ultérieure
    }
  };

  const deleteMetafield = async (customerId, metafieldId) => {
    const deleteUrl = `https://potiron2021.myshopify.com/admin/api/2024-07/customers/${customerId}/metafields/${metafieldId}.json`;
    const deleteOptions = {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFYAPPTOKEN
      }
    };
   
    try {
      const response = await fetch(deleteUrl, deleteOptions);
      if (response.ok) {
        console.log(`Metafield ${metafieldId} supprimé avec succès.`);
      } else {
        console.error(`Erreur lors de la suppression du metafield ${metafieldId}:`, response.statusText);
      }
    } catch (error) {
      console.error('Erreur lors de la suppression du metafield:', error);
    }
  };

  const createProCustomer = async (clientToUpdate, updatedCustomerData) => {
    const updateCustomerUrl = `https://potiron2021.myshopify.com/admin/api/2024-07/customers/${clientToUpdate}.json`
    const updateOptions = {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFYAPPTOKEN
          },
          body: JSON.stringify(updatedCustomerData)
    };
    try {
        const response = await fetch(updateCustomerUrl, updateOptions);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Erreur lors de la mise à jour du client pro', error);
    }
  }

module.exports = {
    createDraftOrder,
    updateDraftOrderWithDraftId,
    getCustomerMetafields,
    updateProCustomer,
    createProCustomer,
    deleteMetafield,
    lastDraftOrder,
    draftOrderById,
    orderById
}