const SHOPIFYREASSORTTOKEN = process.env.SHOPIFYREASSORTTOKEN;
const fetch = require('node-fetch');
const PDFDocument = require('pdfkit');
const fs = require('fs');
// const Handlebars = require('handlebars');
const path = require('path');
const { sendInvoiceReassort } = require('../../sendMails/mailForCustomers');
const { getAccessTokenMS365, refreshMS365AccessToken } = require('../microsoft');

// new customer webhook to create meta data from notes
const createMetaCustomer = async(clientToUpdate, updatedCustomer) => {
    const updateCustomerUrl = `https://gma-reassort.myshopify.com/admin/api/2024-07/customers/${clientToUpdate}.json`
    const updateOptions = {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFYREASSORTTOKEN
          },
          body: JSON.stringify(updatedCustomer)
    };
    try {
        const response = await fetch(updateCustomerUrl, updateOptions);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Erreur lors de la création des meta données sur GMA Reassort', error);
    }
};

const getCustomerMeta = async(customerId) => {
    const metaUrl = `https://gma-reassort.myshopify.com/admin/api/2025-01/customers/${customerId}/metafields.json`
    const metaOptions = {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFYREASSORTTOKEN
        }
    }
    try {
        const response = await fetch(metaUrl, metaOptions);
        if (!response.ok) {
            console.log(`Error while getting meta data by customer id: ${response.statusText}`);
            return {};
        }
        const data = await response.json();
        const metafields = data.metafields;
        if (!Array.isArray(metafields)) {
            console.error("Unexpected data format:", data);
            return {};
        }
        const find = (key) => 
            metafields.find(m => m.namespace === 'custom' && m.key === key)?.value || null
        return {
            company: find('company'),
            siret: find('siret'),
            tva: find('tva')
        }
    } catch (error) {
      console.error('Error to retrieve meta data by customer id', error);
      return {};
    }
};


const extractOrderData = async (order) => {
    const metaData = await getCustomerMeta(order.customer.id)
    // console.log('trié meta', metaData);
    const invoiceData = {
    // TODO construction of invoice number? should be unique
    invoiceNumber: `FA-${order.name}`,
    invoiceDate: new Date(order.processed_at).toLocaleDateString('fr-FR'),

    customer: {
        name: `${order.billing_address.first_name} ${order.billing_address.last_name}`,
        company: order.billing_address.company ? order.billing_address.company : metaData.company,
        address1: order.billing_address.address1,
        address2: order.billing_address.address2,
        zipCity: `${order.billing_address.zip} ${order.billing_address.city}`,
        email: order.email,
        siret: metaData.siret,
        tva: metaData.tva
    },
    totals: {
        subtotal: order.subtotal_price,
        shipping: order.total_shipping_price_set.shop_money.amount,
        tax: order.total_tax,
        total: order.total_price
    },
    items: order.line_items.map(item => ({
        name: item.title,
        quantity: item.quantity,
        price: item.price,
        total: (item.quantity * parseFloat(item.price))
    }))
    }
    return invoiceData;
};

const generateInvoicePdf = async(invoiceData) => {

    const outputPath = path.join(
        __dirname,
        `../../../invoicesreassort/Invoice-${invoiceData.invoiceNumber}.pdf`
    );

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const stream = fs.createWriteStream(outputPath);

        doc.pipe(stream);

        // --- Header
        doc
            .fontSize(20)
            .text('FACTURE', { align: 'right' })
            .moveDown();

        doc
            .fontSize(10)
            .text(`Facture : ${invoiceData.invoiceNumber}`)
            .text(`Date : ${invoiceData.invoiceDate}`)
            .moveDown();

        // --- Customer
        doc
            .fontSize(12)
            .text(invoiceData.customer.name)
            .text(invoiceData.customer.company || '')
            .text(invoiceData.customer.address1)
            .text(invoiceData.customer.zipCity)
            .moveDown();

        // --- Table header
        doc
            .fontSize(10)
            .text('Produit', 50)
            .text('Qté', 300)
            .text('Prix', 350)
            .text('Total', 450);

        doc.moveDown();

        // --- Items
        invoiceData.items.forEach(item => {
            doc
                .text(item.name, 50)
                .text(item.quantity, 300)
                .text(`${item.price} €`, 350)
                .text(`${item.total.toFixed(2)} €`, 450);
            doc.moveDown(0.5);
        });

        doc.moveDown();

        // --- Totals
        doc
            .text(`Sous-total : ${invoiceData.totals.subtotal} €`, { align: 'right' })
            .text(`Livraison : ${invoiceData.totals.shipping} €`, { align: 'right' })
            .text(`TVA : ${invoiceData.totals.tax} €`, { align: 'right' })
            .fontSize(12)
            .text(`TOTAL : ${invoiceData.totals.total} €`, { align: 'right' });

        doc.end();

        stream.on('finish', () => {
            console.log(`📄 Facture PDF générée: ${outputPath}`);
            resolve(outputPath);
        });

        stream.on('error', reject);
    });
    
}

const generateInvoice = async(orderData) => {
    const invoiceData = await extractOrderData(orderData);
    const invoicePdfPath = await generateInvoicePdf(invoiceData);
    let accessTokenMS365 = await getAccessTokenMS365();
            if(!accessTokenMS365) {
              await refreshMS365AccessToken();
              accessTokenMS365 = await getAccessTokenMS365();
            }
    try {
        await sendInvoiceReassort(accessTokenMS365, orderData.email, invoicePdfPath);
        await fs.remove(invoicePdfPath);
        console.log('facture rm')
    } catch (error) {
        
    }
}

module.exports = {
    createMetaCustomer,
    generateInvoice
}