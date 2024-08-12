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
const SHOPIFYAPPTOKEN = process.env.SHOPIFYAPPTOKEN;
const MAILSERVICE = process.env.MAILSERVICE;
const MAILHOST = process.env.MAILHOST;
const MAILPORT = process.env.MAILPORT;
const MAILSENDER = process.env.MAILSENDER;
const MAILSENDERPASS = process.env.MAILSENDERPASS;
const MAILRECIPIENT = process.env.MAILRECIPIENT;
const MAILCOTATION = process.env.MAILCOTATION;

const API_APP_ID = process.env.API_APP_ID;
const YOUR_AUTHORIZATION_CODE = process.env.YOUR_AUTHORIZATION_CODE;

const { getToken, refreshAccessToken } = require('./services/shippingbo/potironParisAuth.js');
const { getTokenWarehouse, refreshAccessTokenWarehouse } = require('./services/shippingbo/gmaWarehouseAuth.js');

const API_APP_WAREHOUSE_ID = process.env.API_APP_WAREHOUSE_ID;
const WAREHOUSE_AUTHORIZATION_CODE = process.env.WAREHOUSE_AUTHORIZATION_CODE;

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


//function to extract data from notes and redistribute in metafields when a b2b customer is created

app.use(cors(corsOptions));
app.use(bodyParser.json());

app.get('/', (req, res) => {
    res.send('Bienvenue sur votre application !');
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
//refreshToken avery 1h50
    setInterval(async () => {
      console.log("auto refresh");
      await refreshAccessToken(); //1h50 
      await refreshAccessTokenWarehouse();
  }, 6600000); //1h50

};
 
initializeTokens();

//update orders origin and origin ref in shippingbo Potiron Paris to add "Commande PRO" and "PRO-"
const updateShippingboOrder = async (shippingboOrderId, originRef) => {
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
//update orders origin and origin ref in shippingbo GMA => Entrepôt to add "Commande PRO" and "PRO-"
const updateWarehouseOrder = async (shippingboOrderId, originRef) => {
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

//Retrieve shippingbo order ID from ShopifyID or DraftID and send Shippingbo ID in Potiron Paris Shippingbo
const getShippingboOrderDetails = async (shopifyOrderId) => {
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
//Retrieve shippingbo order ID from ShopifyID or DraftID and send Shippingbo ID in GMA Shippingbo => Entrepôt
const getWarehouseOrderDetails = async (shippingboId) => {
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
//function ton cancel draft order in Potiron Paris Shippingbo when closed in Shopify
const cancelShippingboDraft = async (shippingboOrderId) => {
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
  try{
        const response = await fetch(cancelOrderUrl, cancelOrderOptions);
        const data = await response.json();
        if(response.ok) {
          console.log('order cancel in shippingbo Potiron Paris: ', shippingboOrderId);
        }
      } catch (error) {
         console.error('Error updating shippingbo order', error);
      }
}

let uploadedFile = null;
let originalFileName = null;
let fileExtension = null;
let filePath = null;

//Send email with kbis to Potiron Team to check and validate company
async function sendEmailWithAttachment(filePath, companyName, fileExtension, firstnameCustomer, nameCustomer, mailCustomer, phone) {
  const transporter = nodemailer.createTransport({
      service: MAILSERVICE,
      host: MAILHOST,
      port: MAILPORT,
      secure: false,
      auth: {
          user: MAILSENDER, 
          pass: MAILSENDERPASS
      },
      tls: {
        ciphers: 'SSLv3'
    }
  });

  const mailOptions = {
      from: '"POTIRON PARIS - Nouveau kBis" <noreply@potiron.com>',
      replyTo: 'bonjour@potiron.com', 
      to: MAILRECIPIENT,
      cc: MAILSENDER,
      subject: 'Nouveau Kbis (' + companyName + ') à vérifier et valider !', 
      html:`
      <p>Bonjour, </p>
      <p>Une nouvelle demande d'inscription pro est arrivée pour <strong>${firstnameCustomer} ${nameCustomer}</strong>.</p>
      <p>Vous trouverez le KBIS de <strong>${companyName}</strong> ci-joint.</p>
      <p>Ce nouveau client est joignable à ${mailCustomer} et au ${phone}.</p>
      <p>Pensez à le valider pour que le client ait accès aux prix destinés aux professionnels.</p>
      <p>Bonne journée,</p>
      <p>Céline Leroux</p>
      <img src='cid:signature'/>
      `,     
      attachments: [
          {
              filename: 'kbis_' + companyName + fileExtension,
              content: fs.createReadStream(filePath)
          },
          {
            filename: 'signature.png',
            path: 'assets/signature.png',
            cid: 'signature'
          }
      ]
  };

  return transporter.sendMail(mailOptions);
}

//Send email to b2b customer when kBis validate
async function sendWelcomeMailPro(firstnameCustomer, nameCustomer, mailCustomer, companyName) {
  const transporter = nodemailer.createTransport({
    service: MAILSERVICE,
    host: MAILHOST,
    port: MAILPORT,
    secure: false,
    auth: {
        user: MAILSENDER, 
        pass: MAILSENDERPASS
    },
    tls: {
      ciphers: 'SSLv3'
    }
  });
  const mailOptions = {
    from: '"POTIRON PARIS PRO" <noreply@potiron.com>',
    replyTo: 'bonjour@potiron.com', 
    to: mailCustomer,
    cc: MAILSENDER,
    subject: 'Accès Pro Potiron Paris', 
    html:`
    <p>Bonjour ${firstnameCustomer} ${nameCustomer},</p>
    <p>Nos équipes ont validé votre KBIS concernant ${companyName}, nous vous souhaitons la bienvenue !</p>
    <p>Vous avez désormais accès, une fois connecté avec votre login et mot de passe, à l'ensemble du site avec les prix dédiés aux professionnels.</p>
    <p><a href="https://potiron.com">Visitez notre boutique</a></p>
    <p>Nous restons à votre entière disposition.</p>
    <p>Très belle journée,</p>
    <p>L'équipe de Potiron</p>
    <img src='cid:signature'/>
    `,     
    attachments: [
        {
          filename: 'signature.png',
          path: 'assets/signature.png',
          cid: 'signature'
        }
    ]
  };
  return transporter.sendMail(mailOptions);
}
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
    const draftDetails = await getShippingboOrderDetails(draftId);
    const orderDetails = await getShippingboOrderDetails(orderId);
    if(draftDetails) {
      const {id: shippingboDraftId} = draftDetails;
      await cancelShippingboDraft(shippingboDraftId);
    }
    if(orderDetails) {
      const {id: shippingboId, origin_ref: shippingboOriginRef} = orderDetails
      await updateShippingboOrder(shippingboId, shippingboOriginRef);
      const warehouseDetails = await getWarehouseOrderDetails(shippingboId);
      if(warehouseDetails) {
        const {id: shippingboIdwarehouse, origin_ref: shippingboWarehouseOriginRef} = warehouseDetails
        await updateWarehouseOrder(shippingboIdwarehouse, shippingboWarehouseOriginRef);
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
      tags_to_add: ["Commande PRO", shippingAddress]
    };
    // await ensureAccessToken();
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
        console.log('data creation shippingbo', data.order.id);
    } catch (error) {
      console.error('error in creation order from draft shopify', error);
    }

 } else {
  console.error('Invalid response structure from Shopify to create draft order for PRO')
 }
    res.status(200).json(data); 
  } catch (error) {
    console.error('Erreur lors de la création du brouillon de commande :', error);
    res.status(500).json({ error: 'Erreur lors de la création du brouillon de commande.' });
  }
});

//Send mail to Potiron Team to ask delivery quote
async function sendNewDraftOrderMail(firstnameCustomer, nameCustomer, draftOrderId, customerMail, customerPhone, shippingAddress) {
  const transporter = nodemailer.createTransport({
    service: MAILSERVICE,
    host: MAILHOST,
    port: MAILPORT,
    secure: false,
    auth: {
        user: MAILSENDER, 
        pass: MAILSENDERPASS
    },
    tls: {
      ciphers: 'SSLv3'
    }
  });
  const mailOptions = {
    from: '"POTIRON PARIS PRO" <noreply@potiron.com>',
    replyTo: 'bonjour@potiron.com', 
    to: MAILCOTATION,
    cc: MAILSENDER,
    subject: 'Nouvelle demande de cotation pour Commande Provisoire ' + draftOrderId, 
    html:`
    <p>Bonjour, </p>
    <p>Une nouvelle commande provisoire a été créée pour le client PRO : ${firstnameCustomer} ${nameCustomer}</p>
    <p>Il est joignable pour valider la cotation à ${customerMail} et au ${customerPhone} </p>
    <p>L'adresse de livraison renseignée est : ${shippingAddress}</p>
    <img src='cid:signature'/>
    `,     
    attachments: [
        {
          filename: 'signature.png',
          path: 'assets/signature.png',
          cid: 'signature'
        }
    ]
  };
  return transporter.sendMail(mailOptions);
}

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

    if (isCompleted === true && isCommandePro) {
      try {
        // await ensureAccessToken();
        const draftDetails = await getShippingboOrderDetails(draftId);
        if(draftDetails) {
          const {id: shippingboDraftId} = draftDetails;
          await cancelShippingboDraft(shippingboDraftId);
        }
      } catch(err) {
        console.log('error shiipingboId', err);
      }
  } else if(isCommandePro && !draftTagExists) {
    try {
      // await ensureAccessToken();
      draftTagArray.push(draftId);
      const updatedOrder = {
        draft_order: {
          id: orderId,
          tags: draftTagArray.join(', ')
        }
       };
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
           console.log('Commande pro maj avec draftId', draftId);  
           res.status(200).send('Order updated');  
         } catch (error) {
           console.error('Error updating order:', error);
           res.status(500).send('Error updating order');
         }
      
    
    } catch(err) {
      console.log('error shiipingboId', err);
    }
  }
})


//webhook on customer update : https://potironapppro.onrender.com/updatekBis
//send mail to b2B client to confirm his activation and update his account with tags
app.post('/updateKbis', (req, res) => {
  var updatedData = req.body;
  const clientUpdated = updatedData.id;

  const metafieldsUrl = `https://potiron2021.myshopify.com/admin/api/2024-07/customers/${clientUpdated}/metafields.json`
  const fetchOptions = {         
    method: 'GET',         
    headers: {             
      'Content-Type': 'application/json',             
      'X-Shopify-Access-Token': SHOPIFYAPPTOKEN 
    } 
  };
  fetch(metafieldsUrl, fetchOptions)
    .then(response => response.json())
    .then(data => {
      if(!data.metafields){
        console.log('no meta');
        return res.status(404).send('No mate found')
      }
      const metafields = data.metafields;

      const checkedKbisField = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'checkedkbis');
      const mailProSentField = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'mailProSent');
      const companyNameField = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'company');

      if(checkedKbisField && mailProSentField) {
        var firstnameCustomer = updatedData.first_name;
        var nameCustomer = updatedData.last_name;
        var mailCustomer = updatedData.email;
        var companyName = companyNameField.value;
        var kbisState = checkedKbisField.value;
        var mailProState = mailProSentField.value;

        if(kbisState === true && mailProState === false) {
          sendWelcomeMailPro(firstnameCustomer, nameCustomer, mailCustomer, companyName)
            .then(() => {
              console.log('mail envoyé au client pro');  
            })
            
            .catch(error => {
              console.error('Erreur lors de l\'envoi de l\'e-mail :', error);
              res.status(500).send('Erreur lors de l\'envoi de l\'e-mail.');
            });

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
            const updateCustomerUrl = `https://potiron2021.myshopify.com/admin/api/2024-07/customers/${clientUpdated}.json`
            const updateOptions = {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': SHOPIFYAPPTOKEN
                  },
                  body: JSON.stringify(updatedCustomerKbis)
            };      
             fetch(updateCustomerUrl, updateOptions)
             .then(response => response.json())
             .then(updatedKebisState => {
              console.log('mise à jour fiche client suite envoie du mail acces PRO')
             })
             .catch(error => {
              console.error('Erreur lors de la mise à jour du client', error);
              res.status(500).send('Erreur lors de la mise à jour des données clients')
             });
        } else if(kbisState === false && mailProState === false) {
          console.log("Kbis à valider");
        } else {
          console.log("mail déjà envoyé");
        }
      }
    })
})

//webhook on customer creation : https://potironapppro.onrender.com/createProCustomer
//Send email to potiron team with kbis and create metafields in customer account
app.post('/createProCustomer', (req, res) => {
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

        // Vérifier si un fichier a été téléchargé
        if (!uploadedFile) {
          res.status(400).send('Aucun fichier téléchargé.');
          return;
        }
        // Envoi du fichier par e-mail
        sendEmailWithAttachment(filePath, companyName, fileExtension, firstnameCustomer, nameCustomer, mailCustomer, phone)
          .then(() => {
            console.log('mail envoyé');
            fs.unlink(uploadedFile.path, (err) => {
              if (err) {
                  console.error('Erreur lors de la suppression du fichier :', err);
              } else {
                  //console.log('Fichier supprimé avec succès.');
              }
          });
            uploadedFile = null; 
            originalFileName = null;
            fileExtension = null;
            
          })
          .catch(error => {
            console.error('Erreur lors de l\'envoi de l\'e-mail :', error);
            res.status(500).send('Erreur lors de l\'envoi de l\'e-mail.');
          });
        
      const updatedCustomerData = {
        customer: {
          id: clientToUpdate,
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
            }
          ]
        }
      };

    const updateCustomerUrl = `https://potiron2021.myshopify.com/admin/api/2024-07/customers/${clientToUpdate}.json`
    const updateOptions = {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFYAPPTOKEN
          },
          body: JSON.stringify(updatedCustomerData)
    };
    fetch(updateCustomerUrl, updateOptions)
      .then(response => response.json())
      .then(updatedCustomer => {
        console.log('nouveau client pro')
        //res.status(200).json(updatedCustomer);
      })
      .catch(error => {
        console.error('Erreur lors de la mise à jour du client :', error);
        res.status(500).send('Erreur lors de la mise à jour du client.');
      });
  } else {
      console.log("nouveau client créé non pro");
  }
});



app.listen(PORT, () => {
  console.log(`Serveur en cours d'écoute sur le port ${PORT}`);
});
