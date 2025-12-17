const express = require('express');
const { createMetaCustomer } = require('../services/API/Shopify/gma_reassort');

const router = express.Router();

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
// webhook on customer creation from gma-reassort
router.post('/createCustomer', async (req, res) => {
    var data = req.body;
    // console.log('data:', data);
    const clientToUpdate = data.id;
    const company = extractInfoFromNote(data.note, 'Entreprise');
    const siret = extractInfoFromNote(data.note, 'Siret');
    const tva = extractInfoFromNote(data.note, 'TVA');

    const updatedCustomer = {
        customer: {
            id: clientToUpdate,
            note: '',
            metafields: [
                {
                    key: 'company',
                    value: company,
                    type: 'single_line_text_field',
                    namespace: 'custom'
                },
                {
                    key: 'siret',
                    value: siret,
                    type: 'single_line_text_field',
                    namespace: 'custom'
                },
                {
                    key: 'tva',
                    value: tva,
                    type: 'single_line_text_field',
                    namespace: 'custom'
                },
            ]
        }
    };
    const updatedCustomerData = await createMetaCustomer(clientToUpdate, updatedCustomer);
    // console.log('client update', updatedCustomerData);
    res.status(200).json(updatedCustomerData);
}) 

// webhook on customer update from gma-reassort
router.post('/updateCustomer', async (req, res) => {
    var data = req.body;
    // console.log('data:', data);
    const clientToUpdate = data.id;
    const company = extractInfoFromNote(data.note, 'Entreprise');
    const siret = extractInfoFromNote(data.note, 'Siret');
    const tva = extractInfoFromNote(data.note, 'TVA');

    const updatedCustomer = {
        customer: {
            id: clientToUpdate,
            note: '',
            metafields: [
                {
                    key: 'company',
                    value: company,
                    type: 'single_line_text_field',
                    namespace: 'custom'
                },
                {
                    key: 'siret',
                    value: siret,
                    type: 'single_line_text_field',
                    namespace: 'custom'
                },
                {
                    key: 'tva',
                    value: tva,
                    type: 'single_line_text_field',
                    namespace: 'custom'
                },
            ]
        }
    };
    const updatedCustomerData = await createMetaCustomer(clientToUpdate, updatedCustomer);
    // console.log('client update', updatedCustomerData);
    res.status(200).json(updatedCustomerData);
}) 

module.exports = router;
