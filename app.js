const express = require('express');
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
const YOUR_AUTHORIZATION_CODE = process.env.YOUR_AUTHORIZATION_CODE;
const WAREHOUSE_AUTHORIZATION_CODE = process.env.WAREHOUSE_AUTHORIZATION_CODE;
const { getToken, refreshAccessToken } = require('./services/shippingbo/potironParisAuth.js');
const { getTokenWarehouse, refreshAccessTokenWarehouse } = require('./services/shippingbo/gmaWarehouseAuth.js');
const { getShippingboOrderDetails, updateShippingboOrder, cancelShippingboDraft } = require('./services/shippingbo/potironParisCRUD.js');
const { getWarehouseOrderDetails, updateWarehouseOrder, getWarehouseOrderToReturn, getshippingDetails } = require('./services/shippingbo/GMAWarehouseCRUD.js');
const { sendEmailWithKbis, sendWelcomeMailPro, sendReturnDataToCustomer, sendReturnDataToSAV } = require('./services/sendMail.js');
const { createDraftOrder, updateDraftOrderWithTags, getCustomerMetafields, updateProCustomer, createProCustomer, deleteMetafield, updateDraftOrderWithDraftId, lastDraftOrder, draftOrderById, orderById } = require('./services/shopifyApi.js');
const { createDiscountCode, createReturnOrder, getReturnOrderDetails, updateReturnOrder } = require('./services/return.js');
const { refreshMS365AccessToken, getAccessTokenMS365 } = require('./services/microsoftAuth.js');
const { createLabel } = require('./services/colissimoApi.js');

let accessToken = null;
let refreshToken = null;
let accessTokenWarehouse = null;
let refreshTokenWarehouse = null;

const corsOptions = {
  origin: "https://potiron.com",
  method: 'GET, HEAD, PUT, PATCH, POST, DELETE',
  credentials: true,
  optionSuccessStatus: 204
}

app.set('appName', 'potironAppPro');
app.use(cors(corsOptions));
app.use(bodyParser.json());

app.get('/', (req, res) => {
    res.send('Bienvenue sur potironAppPro !');
});

// Initialisation des tokens avec YOUR_AUTHORIZATION_CODE
const initializeTokens = async () => {
  try {
    if(YOUR_AUTHORIZATION_CODE){
      const tokens = await getToken(YOUR_AUTHORIZATION_CODE);
      accessToken = tokens.accessToken;
      refreshToken = tokens.refreshToken;
  } else {
      await refreshAccessToken();
  }   
} catch (error) {
  console.error('Failed to initialize token', error);
}
  try {
    if(WAREHOUSE_AUTHORIZATION_CODE){
      const tokensWarehouse = await getTokenWarehouse(WAREHOUSE_AUTHORIZATION_CODE);
      accessTokenWarehouse = tokensWarehouse.accessTokenWarehouse;
      refreshTokenWarehouse = tokensWarehouse.refreshTokenWarehouse;
  } else {
      await refreshAccessTokenWarehouse();
  }   
} catch (error) {
  console.error('Failed to initialize warehouse tokens', error);
}
//refreshToken every 1h50
    setInterval(async () => {
      console.log("auto refresh shippingbo Token");
      await refreshAccessToken(); //1h50 
      await refreshAccessTokenWarehouse();
  }, 6600000); //1h50
  //refreshToken every 1h15 for MS365
  setInterval(async () => {
    console.log('auto refresh MS365 token');
    await refreshMS365AccessToken();
   }, 4500000); //1h15
  // }, 300000);
};
 
initializeTokens();

let uploadedFile = null;
let originalFileName = null;
let fileExtension = null;
let filePath = null;

const upload = multer({ 
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
      cb(null, file.originalname)
    }
  })
});

//record kBis in code before send and remove it
app.post('/upload', upload.single('uploadFile'), (req, res) => {
  uploadedFile = req.file;
  originalFileName = req.file.originalname;
  fileExtension = path.extname(originalFileName); 
  filePath = req.file.path;
  res.status(200).send('Fichier téléchargé avec succès.');
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
    const data = await createDraftOrder(draftOrder, accessToken);
    res.status(200).json(data); 
  } catch (error) {
    console.error('Erreur lors de la création du brouillon de commande :', error);
    res.status(500).json({ error: 'Erreur lors de la création du brouillon de commande.' });
  }
});

//update delivery preferences from pages/account-update-delivery
app.post('/update-delivery-pref', async (req, res) => {
  try {
    const deliveryData = req.body;
    const deliveryPackage = deliveryData.package;
    const deliveryPalette = deliveryData.palette;
    let paletteEquipment = null;
    let paletteAppointment = null;
    let paletteNotes = '';
    let deliveryPref = '';
 
    if (deliveryPalette === 'on') {
      paletteEquipment = deliveryData.palette_equipment;
      paletteAppointment = deliveryData.palette_appointment; // bool
      paletteNotes = deliveryData.palette_notes; // textarea
    }
    if (deliveryPackage === 'on' && deliveryPalette === 'on') {
      deliveryPref = "Au colis et en palette";
    } else if (deliveryPackage === 'on' && deliveryPalette === undefined) {
      deliveryPref = "Au colis uniquement";
    } else if (deliveryPackage === undefined && deliveryPalette === 'on') {
      deliveryPref = "En palette uniquement"
    }
    const clientToUpdate = deliveryData.customer_id;
    const metafields = await getCustomerMetafields(clientToUpdate);
    const deliveryPrefField = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'delivery_pref');
    const paletteEquipmentField = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'palette_equipment');
    const paletteAppointmentField = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'palette_appointment');
    const paletteNotesField = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'palette_notes');
 
    let updatedDeliveryData;
    if (deliveryPalette !== 'on') {
      if (paletteEquipmentField) await deleteMetafield(clientToUpdate, paletteEquipmentField.id);
      if (paletteAppointmentField) await deleteMetafield(clientToUpdate, paletteAppointmentField.id);
      if (paletteNotesField) await deleteMetafield(clientToUpdate, paletteNotesField.id);

      updatedDeliveryData = {
        customer: {
          id: clientToUpdate,
          metafields: [
            {
              id: deliveryPrefField.id,
              key: 'delivery_pref',
              value: deliveryPref,
              type: 'single_line_text_field',
              namespace: 'custom'
            }
          ]
        }
      };
    } else {
      updatedDeliveryData = {
        customer: {
          id: clientToUpdate,
          metafields: [
            {
              id: deliveryPrefField.id,
              key: 'delivery_pref',
              value: deliveryPref,
              type: 'single_line_text_field',
              namespace: 'custom'
            },
            paletteEquipmentField ? {
              id: paletteEquipmentField.id,
              key: 'palette_equipment',
              value: paletteEquipment,
              type: 'single_line_text_field',
              namespace: 'custom'
            } : {
              key: 'palette_equipment',
              value: paletteEquipment,
              type: 'single_line_text_field',
              namespace: 'custom'
            },
            paletteAppointmentField ? {
              id: paletteAppointmentField.id,
              key: 'palette_appointment',
              value: paletteAppointment,
              type: 'boolean',
              namespace: 'custom'
            } : {
              key: 'palette_appointment',
              value: paletteAppointment,
              type: 'boolean',
              namespace: 'custom'
            },
            paletteNotesField ? {
              id: paletteNotesField.id,
              key: 'palette_notes',
              value: paletteNotes,
              type: 'single_line_text_field',
              namespace: 'custom'
            } : {
              key: 'palette_notes',
              value: paletteNotes,
              type: 'single_line_text_field',
              namespace: 'custom'
            }
          ]
        }
      };
    }
    await updateProCustomer(clientToUpdate, updatedDeliveryData);
    console.log('update delivery pref for customer: ', clientToUpdate);
    res.status(200).json({ message: "Préférences de livraison mises à jour avec succès" });
  } catch (error) {
    console.error("Erreur lors de la mise à jour des préférences de livraison", error);
    res.status(500).json({ error: "Erreur lors de la mise à jour des préférences de livraison" });
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
app.post('/updateKbis', async (req, res) => {
  var updatedData = req.body;
  const clientUpdated = updatedData.id;
  let checkedKbisField;
  let mailProSentField;
  let companyNameField;
  let deliveryPrefField;
  let deliveryPref;

  try {
    const metafields = await getCustomerMetafields(clientUpdated);
    if(metafields) {
      checkedKbisField = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'checkedkbis');
      mailProSentField = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'mailProSent');
      companyNameField = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'company');
      deliveryPrefField = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'delivery_pref');
      deliveryPref = deliveryPrefField && deliveryPrefField.value ? deliveryPrefField.value : null;
    }
    // console.log("deliverypref updatekbis", deliveryPref)
    let paletteEquipment;
    let paletteAppointment;
    let paletteNotes;

    if(deliveryPrefField && deliveryPref.includes('palette')) {
      const paletteEquipmentField = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'palette_equipment'); 
      const paletteAppointmentField = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'palette_appointment'); 
      const paletteNotesField = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'palette_notes'); 

      if(paletteEquipmentField && paletteEquipmentField.value !== "") {
        paletteEquipment = paletteEquipmentField.value;
      }
      if(paletteAppointmentField && paletteAppointmentField.value !== null) {
        if(paletteAppointmentField.value === true) {
          paletteAppointment = "Oui";
        } else {
          paletteAppointment = "Non";
        }
      }
      if(paletteNotesField && paletteNotesField.value !== '') {
        paletteNotes = paletteNotesField.value;
      }
    }
      if(checkedKbisField && mailProSentField) {
        var firstnameCustomer = updatedData.first_name;
        var nameCustomer = updatedData.last_name;
        var mailCustomer = updatedData.email;
        var companyName = companyNameField.value;
        var kbisState = checkedKbisField.value;
        var mailProState = mailProSentField.value;
        
        if(kbisState === true && mailProState === false) {
          try {
            let accessTokenMS365 = getAccessTokenMS365();
            if(!accessTokenMS365) {
              await refreshMS365AccessToken();
              accessTokenMS365 = getAccessTokenMS365();
            }
            await sendWelcomeMailPro(accessTokenMS365, firstnameCustomer, nameCustomer, mailCustomer, companyName, deliveryPref, paletteEquipment, paletteAppointment, paletteNotes)
            console.log('Mail de bienvenue après validation du kbis envoyé au client pro', clientUpdated);  
            const updatedCustomerKbis = {
                    customer: {
                      id: clientUpdated,
                      tags: "VIP, PRO validé",
                      metafields: [
                        {
                          id: mailProSentField.id,
                          key: 'mailProSent',
                          value: true,
                          type: 'boolean',
                          namespace: 'custom'
                        }
                      ]
                    }
                  };  
                  await updateProCustomer(clientUpdated, updatedCustomerKbis);
                  console.log('mise à jour fiche client suite envoie du mail acces PRO')
                } catch (error) {
                  console.error('Erreur lors de la mise à jour du client kbis')
                }
        } else if(kbisState === false && mailProState === false) {
            console.log("Kbis à valider");
          } else {
            console.log("mail déjà envoyé");
          }

    }
  } catch (error) {
    console.error('erreur lors de la récuperation des metafields ou de la maj du client')
    console.error('Détail', error);
  }
});

function extractInfoFromNote(note, infoLabel) {
  if(note) {
    const lines = note.split('\n');
    for (const line of lines) {
        if (line.startsWith(`${infoLabel}: `)) {
            return line.substring(infoLabel.length + 2);
        }
    }
    return null;
  }
}

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
  const orderName = req.query.getOrder_name;
  const orderMail = req.query.getOrder_mail;
  const customerId = req.query.customer_id;
  try {
    // const orderData = await orderById(orderName, orderMail, 6406535905430); // pas colissimo #8021
    // const orderData = await orderById(orderName, orderMail, 8063057985864); //4 colissimo #8012
    // const orderData = await orderById(orderName, orderMail, 8074569285960); //1 colissimo #8058
    // const orderData = await orderById(orderName, orderMail, 6261023539528); //6 colissimo #8295
    const orderData = await orderById(orderName, orderMail, 6264550031688); //3 colissimo #8315
        
    // const orderData = await orderById(orderName, orderMail, customerId); //moi livré : #6989
    // console.log("orderdata", orderData);
    
    const shopifyOrderId = orderData.id;
    const shippingboDataPotiron = await getShippingboOrderDetails(accessToken, shopifyOrderId); 
    const shippingboDataWarehouse = await getWarehouseOrderToReturn(accessTokenWarehouse, shippingboDataPotiron.id);
    // console.log('warehouse data', shippingboDataWarehouse);
    const orderDetails = await getshippingDetails(accessTokenWarehouse, shippingboDataWarehouse.id);
    const shipmentDetails = orderDetails.order.shipments;
    const orderItems = orderDetails.order.order_items;
    const orderWarehouseId = orderDetails.order.id;
    if(orderData.tags.includes('Commande PRO')) {
      return res.status(200).json({
        success: false,
        orderItems: orderItems,
        orderName: orderName,
        message: 'Contacter le SAV'
      })
    }//
    res.status(200).json({
      success: true,
      orderItems: orderItems,
      orderId: orderWarehouseId
    });
  } catch (error) {
    res.status(500).send('Error retrieving order warehouse by id');
  }
})

app.get('/checkIfsReturnPossible', async (req, res) => {
  const orderId = req.query.warehouseOrderId;
  const itemsToReturn = req.query.return_items.split(',');
 
  try {
    const warehouseOrder = await getshippingDetails(accessTokenWarehouse, orderId);
    // console.log("warehouseOrder", warehouseOrder);
    const shipments = warehouseOrder.order.shipments;
    let allItemsHaveColissimo = true;
 
    itemsToReturn.forEach(ref => {
      const foundItem = shipments.find((shipment, index) => {
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
  const customerId = req.body.customerId;
  const totalOrder = req.body.totalOrder;
  const productRefs = req.body.productRefs.split(',');
  const optionChosen = req.body.returnOption;
  const orderId = req.body.orderId;
  const weightProduct = req.body.weightToReturn;
  
  if (optionChosen === "option1") {
  console.log("weight to return", weightProduct)


    //Create discount code in shopify
    // const priceRules = await createDiscountCode(customerId, totalOrder);
    // const discountCode = priceRules.discountData.discount_code.code;
    // const discountAmount = priceRules.discountRule.price_rule.value;
    // const discountEnd = priceRules.discountRule.price_rule.ends_at;
    // const discountDate = new Date(discountEnd);
    // const formattedDate = discountDate.toLocaleDateString('fr-FR', {     day: 'numeric',     month: 'long',     year: 'numeric' });

    //Retrieve data from initial order
    const warehouseOrder = await getshippingDetails(accessTokenWarehouse, orderId);
    // console.log("warehouse", warehouseOrder); 

    //create object from initial order for label
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
    const parcel = {
      "weight": warehouseOrder.order.shipments[0].total_weight / 1000,
      "insuranceAmount": 0,
      "insuranceValue": 0,
      "nonMachinable": false,
      "returnReceipt": false
    };
    //create a return order in shippingbo warehouse
    // const returnOrderData = await createReturnOrder(accessTokenWarehouse, orderId);
    // const returnOrderId = returnOrderData.return_order.id;

    //create a return label with colissimo API
    // const createLabelData = await createLabel(senderCustomer, parcel);
    // const parcelNumber = createLabelData.parcelNumber;

    //update the return order with parcel number (numéro de colis) from colissimo - WIP
    // const updateReturnOrderWithLabel = await updateReturnOrder(accessTokenWarehouse, returnOrderId, parcelNumber)
    let accessTokenMS365 = getAccessTokenMS365();
    if(!accessTokenMS365) {
      await refreshMS365AccessToken();
      accessTokenMS365 = getAccessTokenMS365();
    }
    //send email to Magalie with parcel number and shopify Id and return order Id
    // await sendReturnDataToSAV(accessTokenMS365, senderCustomer, parcelNumber, returnOrderId, discountCode, discountAmount, formattedDate)
    //send email to customer with link to dwld label and parcel number
    // await sendReturnDataToCustomer(accessTokenMS365, senderCustomer, createLabelData.pdfData, parcelNumber, discountCode, discountAmount, formattedDate);

    return res.status(200).json({
      success: true,
      // data: priceRules,
      getOrder: warehouseOrder,
      // returnOrder: returnOrderData,
      // label: createLabelData
    })
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
          let accessTokenMS365 = getAccessTokenMS365();
          if(!accessTokenMS365) {
            await refreshMS365AccessToken();
            accessTokenMS365 = getAccessTokenMS365();
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

//webhook on customer creation : https://potironapppro.onrender.com/createProCustomer
//Send email to potiron team with kbis and create metafields in customer account
app.post('/createProCustomer', async (req, res) => {
    var myData = req.body;
    var b2BState = myData.tags;
    if (b2BState && b2BState.includes("VIP")) {
        const clientToUpdate = myData.id;
        const siret = extractInfoFromNote(myData.note, 'siret');
        const companyName = extractInfoFromNote(myData.note, 'company_name');
        const tva = extractInfoFromNote(myData.note, 'tva');
        const phone = extractInfoFromNote(myData.note, 'phone');
        const sector = extractInfoFromNote(myData.note, 'sector');
        const mailCustomer = myData.email;
        const nameCustomer = myData.last_name;
        const firstnameCustomer = myData.first_name;
        const address1 = extractInfoFromNote(myData.note, 'address1');
        const address2 = extractInfoFromNote(myData.note, 'address2');
        const zip = extractInfoFromNote(myData.note, 'zip');
        const city = extractInfoFromNote(myData.note, 'city');
        const deliveryPackage = extractInfoFromNote(myData.note, 'package');
        const deliveryPalette = extractInfoFromNote(myData.note, 'palette');
        let paletteEquipment = null;
        let paletteAppointment = null;
        let paletteNotes = '';

        if(deliveryPalette === 'on') {
          paletteEquipment = extractInfoFromNote(myData.note, 'palette_equipment');
          paletteAppointment = extractInfoFromNote(myData.note, 'palette_appointment'); //bool
          paletteNotes = extractInfoFromNote(myData.note, 'palette_added_notes'); //textarea
        }
        let deliveryPref = '';
        if(deliveryPackage === 'on' && deliveryPalette === 'on') {
          deliveryPref = "Au colis et en palette";
        } else if(deliveryPackage === 'on' && deliveryPalette === null) {
          deliveryPref = "Au colis uniquement";
        } else if(deliveryPackage === null && deliveryPalette === 'on') {
          deliveryPref = "En palette uniquement"
        }
        if (!uploadedFile) {
          res.status(400).send('Aucun fichier téléchargé.');
          return;
        }
        try {
            let accessTokenMS365 = getAccessTokenMS365();
            if(!accessTokenMS365) {
              await refreshMS365AccessToken();
              accessTokenMS365 = getAccessTokenMS365();
            }
            await sendEmailWithKbis(accessTokenMS365, filePath, companyName, fileExtension, firstnameCustomer, nameCustomer, mailCustomer, phone);
            fs.unlink(uploadedFile.path, (err) => {
                    if (err) {
                        console.error('Erreur lors de la suppression du fichier :', err);
                    }
                });
        } catch (error) {
          console.error('Erreur lors de l\'envoi de l\'e-mail :', error);
        }
      const updatedCustomerData = {
        customer: {
          id: clientToUpdate,
          last_name: nameCustomer + " ⭐ ",
          phone: phone,
          note: '', 
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
      };
    const updatedCustomer = await createProCustomer(clientToUpdate, updatedCustomerData);
    console.log("Création d'un client pro");
    res.status(200).json(updatedCustomer);
  } else {
      console.log("nouveau client créé non pro");
  }
});

app.listen(PORT, () => {
  console.log(`Serveur en cours d'écoute sur le port ${PORT}`);
});
