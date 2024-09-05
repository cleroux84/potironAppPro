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
        const paletteEquipment = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'palette_equipment');
        const paletteAppointment = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'palette_appointment');
        const paletteNotes = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'palette_notes');
        console.log("deliveryPref", deliveryPref.value);
        console.log("paletteEquipment", paletteEquipment.value);
        console.log("paletteAppointment", paletteAppointment.value);
        console.log("paletteNotes", paletteNotes.value);
        await sendNewDraftOrderMail(firstnameCustomer, nameCustomer, draftOrderId, customerMail, customerPhone, shippingAddress);
        
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
        tags_to_add: ["Commande PRO", shippingAddress, "preference de livraison: " + deliveryPref.value, "équipement palette" + paletteEquipment.value ]
        };
        await createProDraftOrderShippingbo(accessToken, shippingBoOrder);
        return data;
    } else {
        console.error('Invalid response structure from Shopify to create draft order for PRO')
    }
}


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
        throw new Error('No metafields found');
      }
      return data.metafields;
    } catch (error) {
      console.error('Error fetching metafields:', error);
      throw error; // Propager l'erreur pour une gestion ultérieure
    }
  };
  
  const updateCustomerToValidateKbis = async (clientId, updatedData) => {
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
    updateCustomerToValidateKbis,
    createProCustomer
}