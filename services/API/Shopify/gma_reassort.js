const SHOPIFYREASSORTTOKEN = process.env.SHOPIFYREASSORTTOKEN;
const fetch = require('node-fetch');
const fs = require('fs-extra');
const puppeteer = require('puppeteer');
const Handlebars = require('handlebars');
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

const generateInvoicePdf = async(invoiceData, outpath = 'invoice.pdf') => {

    const outputPath = path.join(__dirname, `../../../invoicesreassort/Invoice-${invoiceData.invoiceNumber}.pdf`);

    const templatePath = path.join(__dirname, '../../sendMails/invoiceTemplate.hbs');
    const templateHtml = await fs.readFile(templatePath, 'utf-8');
    const template = Handlebars.compile(templateHtml);
    const finalHtml = template(invoiceData);
   const browser = await puppeteer.launch({
    headless: 'new',  // mieux sur les versions récentes
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',  // important sur Render (mémoire partagée)
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote'
    ]
    });
    const page = await browser.newPage();
    await page.setContent(finalHtml, { waitUntil: 'networkidle0' });
    await page.pdf({ path: outputPath, format: 'A4', printBackground: true });
    await browser.close();

    console.log(`PDF généré: ${outputPath}`)
    return outputPath;
    
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