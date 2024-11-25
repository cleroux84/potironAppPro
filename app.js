const express = require('express');
const cron = require('node-cron');
const multer = require('multer');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const nodemailer = require('nodemailer'); 
const path = require('path');
const fs = require('fs');
const { from } = require('form-data');
const { type } = require('os');
const { error } = require('console');
const Shopify = require('shopify-api-node');
const cors = require('cors');
require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 300;
const { refreshMS365AccessToken, getAccessTokenMS365 } = require('./services/API/microsoft.js');
const { createLabel } = require('./services/API/colissimo.js');
const { initializeTokens } = require('./services/API/manageTokens.js');
const { saveDiscountMailData } = require('./services/database/scheduled_emails.js');
const { sendEmailWithKbis, sendReturnDataToSAV } = require('./services/sendMails/mailForTeam.js');
const { sendWelcomeMailPro, sendReturnDataToCustomer, sendDiscountCodeAfterReturn, checkScheduledEmails } = require('./services/sendMails/mailForCustomers.js');
const { getAccessTokenFromDb } = require('./services/database/tokens/potiron_shippingbo.js');
const { getAccessTokenWarehouseFromDb } = require('./services/database/tokens/gma_shippingbo.js');
const { getShippingboOrderDetails, updateShippingboOrder, cancelShippingboDraft } = require('./services/API/Shippingbo/Potiron/ordersCRUD.js');
const { getWarehouseOrderDetails, updateWarehouseOrder, getWarehouseOrderToReturn, getshippingDetails } = require('./services/API/Shippingbo/Gma/ordersCRUD.js');
const { checkIfReturnOrderExist, createReturnOrder, updateReturnOrder } = require('./services/API/Shippingbo/Gma/returnOrdersCRUD.js');
const { setupShippingboWebhook, deleteWebhook, deleteAllWebhooks, getWebhooks } = require('./services/API/Shippingbo/webhook.js');
const { orderById, createProCustomer, updateProCustomer, getCustomerMetafields, deleteMetafield } = require('./services/API/Shopify/customers.js');
const { getOrderByShopifyId, updateOrder } = require('./services/API/Shopify/orders.js');
const { createDraftOrder, draftOrderById, lastDraftOrder, updateDraftOrderWithDraftId } = require('./services/API/Shopify/draftOrders.js');
const { getProductWeightBySku } = require('./services/API/Shopify/products.js');
const { createPriceRule, checkIfPriceRuleExists, isReturnableDate } = require('./services/API/Shopify/priceRules.js');

const corsOptions = {
  origin: "https://potiron.com",
  method: 'GET, HEAD, PUT, PATCH, POST, DELETE',
  credentials: true,
  optionSuccessStatus: 204
}

app.set('appName', 'potironAppPro');
app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(cors({
  origin: "https://potiron.com",
  methods: 'GET, HEAD, PUT, PATCH, POS, DELETE',
  credentials: true,
  optionsSuccessStatus: 204
}))

const returnOrderRoute = require('./routes/returnOrder.js');
const proCustomerRoute = require('./routes/proCustomer.js')
app.use('/returnOrder', returnOrderRoute);
app.use('/proCustomer', proCustomerRoute);

// Initialisation des tokens 
initializeTokens();
// deleteAllWebhooks();
// setupShippingboWebhook();
getWebhooks();

//CHECK Scheduled emails in DB every day
cron.schedule('0 9 * * *', checkScheduledEmails, { //9h00
//cron.schedule('50 10 * * *', checkScheduledEmails, { //10h50
  schedule: true,
  timezone: "Europe/Paris"
});

//webhook on order update : https://potironapppro.onrender.com/proOrder
//Check if a tag starts with "draft" to update shippingbo Potiron Paris AND GMA Entrepôt order and cancel shippingbo draft order 
app.post('/proOrder', async (req, res) => {
  var orderData = req.body;
  var orderId = orderData.id;
  var orderTags = orderData.tags;
  const tagsArr = orderData.customer.tags.split(', ');
  const tagsArray = orderTags.split(', ').map(tag => tag.trim());
  const draftTagExists = tagsArray.some(tag => tag.startsWith('draft'));
  let draftId = '';
  if(draftTagExists) {
    draftId = tagsArray.find(tag => tag.startsWith('draft'));
  }
  const isCommandePro = tagsArray.includes('Commande PRO');
  const isB2B = tagsArr.includes('PRO validé');
  let accessToken = await getAccessTokenFromDb();
  let accessTokenWarehouse = await getAccessTokenWarehouseFromDb();
  if(isB2B && isCommandePro) {
    const draftDetails = await getShippingboOrderDetails(accessToken, draftId);
    const orderDetails = await getShippingboOrderDetails(accessToken, orderId);
    if(draftDetails) {
      const {id: shippingboDraftId} = draftDetails;
      await cancelShippingboDraft(accessToken, shippingboDraftId);
    }
    if(orderDetails) {
      const {id: shippingboId, origin_ref: shippingboOriginRef} = orderDetails
      await updateShippingboOrder(accessToken, shippingboId, shippingboOriginRef);
      const warehouseDetails = await getWarehouseOrderDetails(accessTokenWarehouse, shippingboId);
      if(warehouseDetails) {
        const {id: shippingboIdwarehouse, origin_ref: shippingboWarehouseOriginRef} = warehouseDetails
        await updateWarehouseOrder(accessTokenWarehouse, shippingboIdwarehouse, shippingboWarehouseOriginRef);
        } else {
          console.log("empty warehouse details")
        }
    }
  } else {
    console.log('update order pour client non pro');
  }
});

//create draft order from cart page if b2B is connected
app.post('/create-pro-draft-order', async (req, res) => {
  try {
    const orderData = req.body; 
    const items = orderData.items;
    const lineItems = items.map(item => ({
      title: item.title,
      price: (item.price / 100).toFixed(2),
      quantity: item.quantity,
      variant_id: item.variant_id,
    }));

    const draftOrder = {
      draft_order: {
        line_items: lineItems,
        customer: {
          id: orderData.customer_id 
        },
        use_customer_default_address: true,
        tags: "Commande PRO"
      }
    };
    let accessToken = await getAccessTokenFromDb();
    const data = await createDraftOrder(draftOrder, accessToken);
    res.status(200).json(data); 
  } catch (error) {
    console.error('Erreur lors de la création du brouillon de commande :', error);
    res.status(500).json({ error: 'Erreur lors de la création du brouillon de commande.' });
  }
});

//webhook on update draft order : https://potironapppro.onrender.com/updatedDraftOrder
app.post('/updatedDraftOrder', async (req, res) => {
  const updatedDraftData= req.body;
  const draftTagString = updatedDraftData.tags || '';
  const draftTagArray = draftTagString.split(',').map(tag => tag.trim());
  const draftTagExists = draftTagArray.some(tag => tag.startsWith("draft"));
  const isCommandePro = draftTagArray.includes('Commande PRO');
  const isCompleted = updatedDraftData.status;
  const draftName = updatedDraftData.name;
  const draftId = "draft" + draftName.replace('#','');
  const orderId = updatedDraftData.id;
  const metafields = await getCustomerMetafields(updatedDraftData.customer.id);
  let deliveryPref;
  let deliveryPrefTag;
  let deliveryPrefValue;
  if(metafields) {
    deliveryPref = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'delivery_pref');
    if(deliveryPref) {  
      deliveryPrefValue = deliveryPref.value;
      deliveryPrefTag = "Livraison : " + deliveryPrefValue;
    }
  }
  let deliveryEquipment;
  let deliveryEquipmentValue;
  let deliveryEquipmentTag;
  let deliveryAppointment;
  let deliveryAppointmentValue;
  let deliveryAppointmentTag;
  let deliveryNotes;
  let deliveryNotesValue;
  let deliveryNotesTag;
  if( deliveryPref && deliveryPrefValue.includes('palette')) {
    deliveryEquipment = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'palette_equipment');
    deliveryAppointment = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'palette_appointment');
    deliveryEquipmentValue = deliveryEquipment ? deliveryEquipment.value : '';
    deliveryEquipmentTag = "Equipement : " + deliveryEquipmentValue;
    deliveryAppointmentValue = deliveryAppointment ? (deliveryAppointment.value === true ? "Oui": deliveryAppointment.value === false ? "Non" : deliveryAppointment.value): null;
    deliveryAppointmentTag = "Rendez-vous : " + deliveryAppointmentValue;
    deliveryNotes = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'palette_notes');
    deliveryNotesValue = deliveryNotes ? deliveryNotes.value : '';
    const deliveryNotesEncoded = deliveryNotesValue.replace(/,/g, '-');
    deliveryNotesTag = 'Notes : ' + deliveryNotesEncoded;
  }
  let accessToken = await getAccessTokenFromDb();
    if (isCompleted === true && isCommandePro) {
      try {
        const draftDetails = await getShippingboOrderDetails(accessToken, draftId);
        if(draftDetails) {
          const {id: shippingboDraftId} = draftDetails;
          await cancelShippingboDraft(accessToken, shippingboDraftId);
        }
      } catch(err) {
        console.log('error shippingboId', err);
      }
  } else if(isCommandePro && !draftTagExists) {
    try {
      draftTagArray.push(draftId);
      draftTagArray.push(deliveryPrefTag);
      if(deliveryEquipment && deliveryEquipmentValue !== '') {
        draftTagArray.push(deliveryEquipmentTag);
      }
      if(deliveryAppointment && deliveryAppointmentValue !== null) {
        draftTagArray.push(deliveryAppointmentTag);
      }
      if(deliveryNotes && deliveryNotesValue !== '') {
        draftTagArray.push(deliveryNotesTag)
      }
      const updatedOrder = {
        draft_order: {
          id: orderId,
          tags: draftTagArray.join(', ')
        }
       };
      await updateDraftOrderWithDraftId(updatedOrder, orderId);
      res.status(200).send('Order updated');
    } catch(err) {
      console.log('error shippingboId', err);
    }
  }
})

//webhook on customer update : https://potironapppro.onrender.com/updatekBis
//send mail to b2B client to confirm his activation and update his account with tags
// app.post('/updateKbis', async (req, res) => {
//   var updatedData = req.body;
//   const clientUpdated = updatedData.id;
//   let checkedKbisField;
//   let mailProSentField;
//   let companyNameField;
//   let deliveryPrefField;
//   let deliveryPref;

//   try {
//     const metafields = await getCustomerMetafields(clientUpdated);
//     if(metafields) {
//       checkedKbisField = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'checkedkbis');
//       mailProSentField = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'mailProSent');
//       companyNameField = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'company');
//       deliveryPrefField = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'delivery_pref');
//       deliveryPref = deliveryPrefField && deliveryPrefField.value ? deliveryPrefField.value : null;
//     }
//     // console.log("deliverypref updatekbis", deliveryPref)
//     let paletteEquipment;
//     let paletteAppointment;
//     let paletteNotes;

//     if(deliveryPrefField && deliveryPref.includes('palette')) {
//       const paletteEquipmentField = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'palette_equipment'); 
//       const paletteAppointmentField = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'palette_appointment'); 
//       const paletteNotesField = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'palette_notes'); 

//       if(paletteEquipmentField && paletteEquipmentField.value !== "") {
//         paletteEquipment = paletteEquipmentField.value;
//       }
//       if(paletteAppointmentField && paletteAppointmentField.value !== null) {
//         if(paletteAppointmentField.value === true) {
//           paletteAppointment = "Oui";
//         } else {
//           paletteAppointment = "Non";
//         }
//       }
//       if(paletteNotesField && paletteNotesField.value !== '') {
//         paletteNotes = paletteNotesField.value;
//       }
//     }
//       if(checkedKbisField && mailProSentField) {
//         var firstnameCustomer = updatedData.first_name;
//         var nameCustomer = updatedData.last_name;
//         var mailCustomer = updatedData.email;
//         var companyName = companyNameField.value;
//         var kbisState = checkedKbisField.value;
//         var mailProState = mailProSentField.value;
        
//         if(kbisState === true && mailProState === false) {
//           try {
//             let accessTokenMS365 = await getAccessTokenMS365();
//             if(!accessTokenMS365) {
//               await refreshMS365AccessToken();
//               accessTokenMS365 = await getAccessTokenMS365();
//             }
//             await sendWelcomeMailPro(accessTokenMS365, firstnameCustomer, nameCustomer, mailCustomer, companyName, deliveryPref, paletteEquipment, paletteAppointment, paletteNotes)
//             console.log('Mail de bienvenue après validation du kbis envoyé au client pro', clientUpdated);  
//             const updatedCustomerKbis = {
//                     customer: {
//                       id: clientUpdated,
//                       tags: "VIP, PRO validé",
//                       metafields: [
//                         {
//                           id: mailProSentField.id,
//                           key: 'mailProSent',
//                           value: true,
//                           type: 'boolean',
//                           namespace: 'custom'
//                         }
//                       ]
//                     }
//                   };  
//                   await updateProCustomer(clientUpdated, updatedCustomerKbis);
//                   console.log('mise à jour fiche client suite envoie du mail acces PRO')
//                 } catch (error) {
//                   console.error('Erreur lors de la mise à jour du client kbis')
//                 }
//         } else if(kbisState === false && mailProState === false) {
//             console.log("Kbis à valider");
//           } else {
//             console.log("mail déjà envoyé");
//           }

//     }
//   } catch (error) {
//     console.error('erreur lors de la récuperation des metafields ou de la maj du client')
//     console.error('Détail', error);
//   }
// });

// function extractInfoFromNote(note, infoLabel) {
//   if(note) {
//     const lines = note.split('\n');
//     for (const line of lines) {
//         if (line.startsWith(`${infoLabel}: `)) {
//             return line.substring(infoLabel.length + 2);
//         }
//     }
//     return null;
//   }
// }

//get last draft order with customer id
app.get('/last-draft-order/:customer_id', async (req, res) => {
  const customerId = req.params.customer_id;
  try {
    const lastDraft = await lastDraftOrder(customerId);
    res.json(lastDraft);
  } catch (error) {
    res.status(500).send('Error retrieving last draft order by customer id');
  }
})

//get draft order by order id
app.get('/getDraftOrder/:draftOrderId', async (req, res) => {
  const draftOrderId = req.params.draftOrderId;
  try {
    const draftOrderData = await draftOrderById(draftOrderId); 
    res.json(draftOrderData);
  } catch (error) {
    res.status(500).send('Error retrieving draft order by id');
  }
})

app.get('/getOrderById', async (req, res) => {
  let accessToken = await getAccessTokenFromDb();
  let accessTokenWarehouse = await getAccessTokenWarehouseFromDb();
  const orderName = req.query.getOrder_name;
  const orderMail = req.query.getOrder_mail;
  const customerId = req.query.customer_id;
  try {
    // const orderData = await orderById(orderName, orderMail, 6406535905430); // pas colissimo #8021
    // const orderData = await orderById(orderName, orderMail, 8063057985864); //4 colissimo #8012
    // const orderData = await orderById(orderName, orderMail, 8074569285960); //1 colissimo #8058
    // const orderData = await orderById(orderName, orderMail, 8174393917768); //4 articles identiques colissimo #8294
    // const orderData = await orderById(orderName, orderMail, 8045312737608); //3 articles colissimo #7865
    // const orderData = await orderById(orderName, orderMail, 8076398264648); //3 articles colissimo #8102
    
    const orderData = await orderById(orderName, orderMail, customerId); //moi livré : #6989
    const shopifyOrderId = orderData.id;
    const shippingboDataPotiron = await getShippingboOrderDetails(accessToken, shopifyOrderId); 
    const shippingboDataWarehouse = await getWarehouseOrderToReturn(accessTokenWarehouse, shippingboDataPotiron.id);
    const closeOrderDelivery = shippingboDataWarehouse.closed_at
    //Check if withdrawal period is ok
    const isReturnable = await isReturnableDate(closeOrderDelivery);
    console.log("is returnable ?", isReturnable);
    // if(isReturnable) {
      const orderDetails = await getshippingDetails(accessTokenWarehouse, shippingboDataWarehouse.id);
      const shipmentDetails = orderDetails.order.shipments;
      const orderItems = orderDetails.order.order_items;
      const orderWarehouseId = orderDetails.order.id;
      if(orderData.tags.includes('Commande PRO')) {
        return res.status(200).json({
          success: false,
          orderItems: orderItems,
          orderName: orderName,
          orderDetails: orderDetails,
          message: 'Contacter le SAV'
        })
      }
      res.status(200).json({
        success: true,
        orderItems: orderItems,
        orderId: orderWarehouseId,
        shopifyOrderId: shopifyOrderId
      });
      //TODO gérer coté front délai dépassé => !isReturnable
  } catch (error) {
    res.status(500).send('Error retrieving order warehouse by id');
  }
})

let quantitiesByRefs;

app.get('/checkIfsReturnPossible', async (req, res) => {
  const orderId = req.query.warehouseOrderId;
  const itemsToReturn = req.query.return_items.split(',');
  quantitiesByRefs = JSON.parse(req.query.quantities);
  console.log('ref & qties to check', quantitiesByRefs);
  let accessTokenWarehouse = await getAccessTokenWarehouseFromDb();
  try {
    const warehouseOrder = await getshippingDetails(accessTokenWarehouse, orderId);
    // console.log("warehouseOrder", warehouseOrder);
    const shipments = warehouseOrder.order.shipments;
    let allItemsHaveColissimo = true;
 
    itemsToReturn.forEach(ref => {
      const foundItem = shipments.find((shipment, index) => {
        // const quantity = quantitiesByRefs[ref];
        const item = shipment.order_items_shipments.find(item => item.order_item_id.toString() === ref);
        if (item) {
          const shippingMethod = shipment.shipping_method_name;
          if (shippingMethod && shippingMethod.includes("Colissimo")) {
            console.log(`Référence ${ref} trouvée dans l'expédition ${index} avec la méthode d'expédition : ${shippingMethod}`);
          } else {
            console.log(`Référence ${ref} trouvée dans l'expédition ${index} mais sans méthode d'expédition "colissimo".`);
            allItemsHaveColissimo = false;
          }
          return true;
        }
        return false;
      });
 
      if (!foundItem) {
        console.log(`Référence ${ref} non trouvée dans les expéditions.`);
        allItemsHaveColissimo = false;
      }
    });
    if(!allItemsHaveColissimo) {
      return res.status(200).json({
        success: false,
        message: 'Contacter le SAV'
      })
    }
    res.json({
      success: true,
      message: 'Articles colissimo !',
      order: warehouseOrder,
      productRefs: req.query.return_items
    });
  } catch (error) {
    console.error('Erreur lors de la vérification des expéditions:', error);
    res.status(500).send('Erreur lors de la vérification des expéditions');
  }
});

app.post('/returnProduct', async (req, res) => {
  let accessTokenWarehouse = await getAccessTokenWarehouseFromDb();
  const customerId = req.body.customerId;
  const orderName = req.body.orderName;
  const productRefs = req.body.productRefs.split(',');
  const productSku = req.body.productSku;
  const optionChosen = req.body.returnOption;
  const orderId = req.body.orderId;
  const returnAll = req.body.returnAllOrder;
  const shopifyOrderId = req.body.shopifyOrderId;
  console.log('return all', returnAll);

  

  if (optionChosen === "option1") {
    //Retrieve data from initial order
    const warehouseOrder = await getshippingDetails(accessTokenWarehouse, orderId);
    const senderCustomer = {
      'name': warehouseOrder.order.shipping_address.fullname,
      'address': warehouseOrder.order.shipping_address.street1,
      'address2': warehouseOrder.order.shipping_address.street2,
      'city': warehouseOrder.order.shipping_address.city,
      "postalCode": warehouseOrder.order.shipping_address.zip,
      "country": warehouseOrder.order.shipping_address.country,
      "email": warehouseOrder.order.shipping_address.email,
      "phone": warehouseOrder.order.shipping_address.phone1,
      "origin_ref": warehouseOrder.order.origin_ref
    };
    let weightToReturn = 0;
    let totalOrder = 0;
    let parcel;
    let createLabelData = [];
    let parcelNumbers = [];
    let pdfBase64 = [];
    const initialNumberOfPackages = warehouseOrder.order.shipments.length;
    console.log('nombre de colis dans la commande initiale: ', initialNumberOfPackages);
    const shipments = warehouseOrder.order.shipments;
    //Set values if return all product in order or selected items
    if(returnAll) {
      if(initialNumberOfPackages === 1) {
        weightToReturn = warehouseOrder.order.shipments
        .reduce((total, shipment) => total + (shipment.total_weight / 1000), 0);
        parcel = {
          "weight": weightToReturn,
          "insuranceAmount": 0,
          "insuranceValue": 0,
          "nonMachinable": false,
          "returnReceipt": false
        };
        const labelData = await createLabel(senderCustomer, parcel);
        if(labelData) {
          createLabelData.push(labelData);
          parcelNumbers = createLabelData.map(data => data.parcelNumber);
          pdfBase64 = createLabelData.map(data => data.pdfData);
        }

      } else {
        const parcels = shipments.map(shipment => ({
          "weight": shipment.total_weight / 1000,
          "insuranceAmount": 0,
          "insuranceValue": 0,
          "nonMachinable": false,
          "returnReceipt": false
        }));

        for(parcel of parcels) {
          const labelData = await createLabel(senderCustomer, parcel);
          if(labelData) { 
            createLabelData.push(labelData);
            parcelNumbers = createLabelData.map(data => data.parcelNumber);
            pdfBase64 = createLabelData.map(data => data.pdfData);
          }
        }
        console.log('return all mais plusieurs colis => plusieurs étiquettes à imprimer');
      }
      
      totalOrder = req.body.totalOrder;
      totalOrder = (totalOrder / 100).toFixed(2);
    } else {
      //return weight by weight => problem about number of packages !  
      for (const sku of productSku) {
        const productFoundSku = await getProductWeightBySku(sku.product_user_ref);
        if(productFoundSku) {
          weightToReturn += productFoundSku.weight * sku.quantity;
          totalOrder += sku.unit_price * sku.quantity;
        }
    }
      parcel = {
      "weight": weightToReturn,
      "insuranceAmount": 0,
      "insuranceValue": 0,
      "nonMachinable": false,
      "returnReceipt": false
    };
    totalOrder = totalOrder.toFixed(2);
  }

    //create object from initial order for label and weight and totalOrder if returnAll or not
    // const senderCustomer = {
    //   'name': warehouseOrder.order.shipping_address.fullname,
    //   'address': warehouseOrder.order.shipping_address.street1,
    //   'address2': warehouseOrder.order.shipping_address.street2,
    //   'city': warehouseOrder.order.shipping_address.city,
    //   "postalCode": warehouseOrder.order.shipping_address.zip,
    //   "country": warehouseOrder.order.shipping_address.country,
    //   "email": warehouseOrder.order.shipping_address.email,
    //   "phone": warehouseOrder.order.shipping_address.phone1,
    //   "origin_ref": warehouseOrder.order.origin_ref
    // };
    // const parcel = {
    //   "weight": weightToReturn,
    //   "insuranceAmount": 0,
    //   "insuranceValue": 0,
    //   "nonMachinable": false,
    //   "returnReceipt": false
    // };
    //Check if return order exists in shippingbo warehouse
    const returnOrderExists = await checkIfReturnOrderExist(accessTokenWarehouse, warehouseOrder.order.id);
    console.log('returnOrderExists ?', returnOrderExists);
    
    // Create discount code in shopify
    // if(!ruleExists) {
    //   if(!returnOrderExists){
        // priceRules = await createPriceRule(customerId, orderName, totalOrder);
        // const discountCode = priceRules.discountData.discount_code.code;
        // const discountAmount = priceRules.discountRule.price_rule.value;
        // const discountEnd = priceRules.discountRule.price_rule.ends_at;
        // const discountDate = new Date(discountEnd);
        // const formattedDate = discountDate.toLocaleDateString('fr-FR', {     day: 'numeric',     month: 'long',     year: 'numeric' });
        
    //     //create a return order in shippingbo warehouse
        const returnOrderData = await createReturnOrder(accessTokenWarehouse, orderId, returnAll, productSku, shopifyOrderId);
        const returnOrderId = returnOrderData.return_order.id;
        // const shopifyId = returnOrderData.return_order.reason_ref;
        // const attributes = [
        //   // {name: "warehouseId", value: warehouseOrder.order.id},
        //   {name: "customerId", value: customerId},
        //   {name: "totalOrderReturn", value: totalOrder}
        // ];
        // const updatedAttributes = {
        //   order: {
        //     id: orderId,
        //     note_attributes: attributes
        //   }
        // }
        //update shopify order with attributes to have discount data for future creation
        // updateOrder(updatedAttributes ,shopifyId)

    //     // create a return label with colissimo API
        // const createLabelData = await createLabel(senderCustomer, parcel);
        // const parcelNumber = createLabelData.parcelNumber;

      let accessTokenMS365 = await getAccessTokenMS365();
      if(!accessTokenMS365) {
        await refreshMS365AccessToken();
        accessTokenMS365 = await getAccessTokenMS365();
      }
    //   //send email to Magalie with parcel number and shopify Id and return order Id
      // await sendReturnDataToSAV(accessTokenMS365, senderCustomer, parcelNumbers, returnOrderId, totalOrder)
    //   //send email to customer with link to dwld label and parcel number
      await sendReturnDataToCustomer(accessTokenMS365, senderCustomer, pdfBase64, parcelNumbers, totalOrder);

        return res.status(200).json({
          // success: true,
          // data: priceRules,
          // getOrder: warehouseOrder,
          // returnOrder: returnOrderData,
          // label: createLabelData
        })
    //   } else {
    //     console.log('return order already exists : contact SAV !');
    //     return res.status(200).json({
    //       success: false,
    //       message: 'Contacter le SAV - un return order existe déjà pour cette commande'
    //     }) 
    //   }
    // } else {
    //   console.log('price rule already exists : contact SAV !');
    //   return res.status(200).json({
    //     success: false,
    //     message: 'Contacter le SAV - un price rule existe déjà pour cette commande'
    //   })      
    // }
   
    //update the return order with parcel number (numéro de colis) from colissimo - WIP
    const updateReturnOrderWithLabel = await updateReturnOrder(accessTokenWarehouse, returnOrderId, parcelNumber)
   
  } else if( optionChosen === "option2") {

    console.log("generate label + remboursement ? + mail à  ??")
  }
  
})

app.post('/upgrade-account', async (req, res) => {
  var customerData = req.body;
  var b2BState = customerData['customer[tags]'];
  console.log("b2bstate", b2BState)
  if (b2BState && b2BState.includes("VIP")) {
        const clientToUpdate = customerData['customer[id]'];
        const siret = customerData['customer[note][siret]'];
        const companyName = customerData['customer[note][company_name]'];
        const tva = customerData['customer[note][tva]'];
        const phone = customerData['customer[note][phone]'];
        const sector = customerData['customer[note][sector]'];
        const mailCustomer = customerData['customer[email]'];
        const nameCustomer = customerData['customer[last_name]']
        const firstnameCustomer = customerData['customer[first_name]']
        const address1 = customerData['customer[note][address1]'];
        const address2 = customerData['customer[note][address2]'];
        const zip = customerData['customer[note][zip]']
        const city = customerData['customer[note][city]'];
        const deliveryPackage = customerData['customer[note][package]'];
        const deliveryPalette = customerData['customer[note][palette]'];
        let paletteEquipment = null;
        let paletteAppointment = null;
        let paletteNotes = '';

        if(deliveryPalette === 'on') {
          paletteEquipment = customerData['customer[note][palette_equipment]'];
          paletteAppointment = customerData['customer[note][palette_appointment]']; //bool
          paletteNotes = customerData['customer[note][palette_added_notes]']; //textarea
        }
        let deliveryPref = '';
        if(deliveryPackage === 'on' && deliveryPalette === 'on') {
          deliveryPref = "Au colis et en palette";
        } else if(deliveryPackage === 'on' && (deliveryPalette === null || deliveryPalette === undefined)) {
          deliveryPref = "Au colis uniquement";
        } else if(deliveryPackage === null && deliveryPalette === 'on') {
          deliveryPref = "En palette uniquement"
        }
        if (!uploadedFile) {
          res.status(400).send('Aucun fichier téléchargé.');
          return;
        }
        try {
          let accessTokenMS365 = await getAccessTokenMS365();
          if(!accessTokenMS365) {
            await refreshMS365AccessToken();
            accessTokenMS365 = await getAccessTokenMS365();
          }
          let isUpgrade = true
          await sendEmailWithKbis(accessTokenMS365, filePath, companyName, fileExtension, firstnameCustomer, nameCustomer, mailCustomer, phone, isUpgrade);
          fs.unlink(uploadedFile.path, (err) => {
                  if (err) {
                      console.error('Erreur lors de la suppression du fichier :', err);
                  }
              });
      } catch (error) {
        console.error('Erreur lors de l\'envoi de l\'e-mail :', error);
      }

      const upgradedCustomer = {
        customer: {
          id: clientToUpdate,
          last_name: nameCustomer + " ⭐ ",
          phone: phone,
          note: '', 
          tags: 'VIP',
          addresses: [
            {
              customer_id: clientToUpdate,
              address1: address1,
              address2: address2,
              city: city,
              zip: zip,
              country: 'France',
              first_name: firstnameCustomer,
              last_name: nameCustomer,
              default: true
            }
          ],
          
          metafields: [
            {
              key: 'company',
              value: companyName,
              type: 'single_line_text_field',
              namespace: 'custom'
            },
            {
              key: 'sector',
              value: sector,
              type: 'single_line_text_field',
              namespace: 'custom'
            },
            {
              key: 'siret',
              value: Number(siret),
              type: 'number_integer',
              namespace: 'custom'
            },
            {
              key: 'tva',
              value: tva,
              type: 'single_line_text_field',
              namespace: 'custom'
            },
            {
              key: 'checkedkbis',
              value: false,
              type: 'boolean',
              namespace: 'custom'
            },
            {
              key: 'mailProSent',
              value: false,
              type: 'boolean',
              namespace: 'custom'
            },
            {
              key: 'delivery_pref',
              value: deliveryPref,
              type: 'single_line_text_field',
              namespace: 'custom'
            },
            {
              key: 'palette_equipment',
              value: paletteEquipment,
              type: 'single_line_text_field',
              namespace: 'custom'
            },
            {
              key: 'palette_appointment',
              value: paletteAppointment,
              type: 'boolean',
              namespace: 'custom'
            },
            {
              key: 'palette_notes',
              value: paletteNotes,
              type: 'single_line_text_field',
              namespace: 'custom'
            }
          ]
        }
      }
      try {
        const updatedCustomer = await createProCustomer(clientToUpdate, upgradedCustomer);
        console.log("Update for Pro account", clientToUpdate);
        res.status(200).json(updatedCustomer);
      } catch (error) {
        console.error('erreur upgraded customer', error);
      }
     

  }

})

app.listen(PORT, () => {
  console.log(`Serveur en cours d'écoute sur le port ${PORT}`);
});
