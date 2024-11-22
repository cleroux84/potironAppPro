//Routes concerning pro customers
const express = require('express');
const fs = require('fs');

const { getAccessTokenMS365, refreshMS365AccessToken } = require('../services/API/microsoft');
const { sendEmailWithKbis } = require('../services/sendMails/mailForTeam');
const { createProCustomer } = require('../services/API/Shopify/customers');
const router = express.Router();



//webhook on customer creation : https://potironapppro.onrender.com/createProCustomer
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
  
module.exports = router;
