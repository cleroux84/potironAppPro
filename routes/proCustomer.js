//Routes concerning pro customers
const express = require('express');
const multer = require('multer');
const path = require('path');

const fs = require('fs');

const { getAccessTokenMS365, refreshMS365AccessToken } = require('../services/API/microsoft');
const { sendEmailWithKbis } = require('../services/sendMails/mailForTeam');
const { createProCustomer, getCustomerMetafields, deleteMetafield, updateProCustomer } = require('../services/API/Shopify/customers');
const { sendWelcomeMailPro } = require('../services/sendMails/mailForCustomers');
const router = express.Router();

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
router.post('/upload', upload.single('uploadFile'), (req, res) => {
  uploadedFile = req.file;
  originalFileName = req.file.originalname;
  fileExtension = path.extname(originalFileName); 
  filePath = req.file.path;
  res.status(200).send('Fichier téléchargé avec succès.');
});

//webhook on customer creation : https://potironapppro.onrender.com/proCustomer/createProCustomer
//Send email to potiron team with kbis and create metafields in customer account
router.post('/createProCustomer', async (req, res) => {
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
            let accessTokenMS365 = await getAccessTokenMS365();
            if(!accessTokenMS365) {
              await refreshMS365AccessToken();
              accessTokenMS365 = await getAccessTokenMS365();
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
    // console.log("Création d'un client pro");
    res.status(200).json(updatedCustomer);
  } 
//   else {
//       console.log("nouveau client créé non pro");
//   }
});

//function to extracts notes from shopify customer page 
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

 //update delivery preferences from pages/account-update-delivery
 router.post('/update-delivery-pref', async (req, res) => {
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

//webhook on customer update : https://potironapppro.onrender.com/updatekBis
//send mail to b2B client to confirm his activation and update his account with tags
router.post('/updateKbis', async (req, res) => {
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
            let accessTokenMS365 = await getAccessTokenMS365();
            if(!accessTokenMS365) {
              await refreshMS365AccessToken();
              accessTokenMS365 = await getAccessTokenMS365();
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

  
module.exports = router;
