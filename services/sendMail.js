const nodemailer = require('nodemailer'); 
const fs = require('fs');
require('dotenv').config();
const { ConfidentialClientApplication } = require('@azure/msal-node');
const { Client } = require('@microsoft/microsoft-graph-client');
require ('isomorphic-fetch');
const path = require('path');
const client = require('./db.js');
const { checkDiscountCodeUsage } = require('./return.js');
const { getAccessTokenMS365, refreshMS365AccessToken } = require('./microsoftAuth.js');

const MAILRECIPIENT = process.env.MAILRECIPIENT;
const MAILCOTATION = process.env.MAILCOTATION;
const MAILDEV = process.env.MAILDEV;

const signatureAttachement =  {
  '@odata.type': '#microsoft.graph.fileAttachment',
  name: 'signature.png',
  contentId: 'signature', 
  isInline: true,
  contentType: 'image/png',
  contentBytes: fs.readFileSync('assets/signature.png').toString('base64')
} 

const initiMicrosoftGraphClient = (accessTokenMS365) => {
  return Client.init({
    authProvider: (done) => {
        done(null, accessTokenMS365); 
    }
  });
}
//Send email with kbis to Potiron Team (Magalie) from bonjour@potiron.com to check and validate company
async function sendEmailWithKbis(accessTokenMS365, filePath, companyName, fileExtension, firstnameCustomer, nameCustomer, mailCustomer, phone, isUpgrade) {
  const client = initiMicrosoftGraphClient(accessTokenMS365);
  let nameNoStar = nameCustomer.replace(/⭐/g, '').trim();
  let mailObjectkBis = `Nouveau Kbis pour ${companyName} à vérifier et valider`;
  if(isUpgrade) {
    mailObjectkBis = `Demande Upgrade Compte professionnel pour ${companyName}`;
  }
  const message = {
      subject: mailObjectkBis,
      body: {
          contentType: 'HTML',
          content: `
        <p>Bonjour, </p>
        <p style="margin: 0;">Une nouvelle demande d'inscription pro est arrivée pour <strong>${firstnameCustomer} ${nameNoStar}</strong>.</p>
        <p style="margin: 0;">Vous trouverez le KBIS de <strong>${companyName}</strong> ci-joint.</p>
        <p style="margin: 0;">Ce nouveau client est joignable à ${mailCustomer} et au ${phone}.</p>
        <p style="margin: 0;">Pensez à le valider pour que le client ait accès aux prix destinés aux professionnels.</p>
        <p>Bonne journée !</p>
        <img src='cid:signature'/>
          `
      },
      toRecipients: [
          {
              emailAddress: {
                  address: MAILRECIPIENT
              }
          }
      ],
      bccRecipients: [
        {
            emailAddress: {
                address: MAILDEV
            }
        }
      ],
      attachments: [
          {
              '@odata.type': '#microsoft.graph.fileAttachment',
              name: `kbis_${companyName}.pdf`,
              contentBytes: fs.readFileSync(filePath).toString('base64') 
          },
          signatureAttachement
        ]
    };
  try {
      await client.api('/me/sendMail').post({ message });
      console.log('Email KBIS envoyé avec succès');
  } catch (error) {
    if(error.response) {
      console.log('erreur API', error.response.data);
    } else {
      console.log('Erreur lors de l\'envoi de l\'email : ', error);
      }
  }
}

//Send email to b2b customer when kBis validate
async function sendWelcomeMailPro(accessTokenMS365, firstnameCustomer, nameCustomer, mailCustomer, companyName, deliveryPref, paletteEquipment, paletteAppointment, paletteNotes) {
  const client = initiMicrosoftGraphClient(accessTokenMS365);
  let paletteNotesValue;
  let nameNoStar = nameCustomer.replace(/⭐/g, '').trim();
  if(paletteNotes !== undefined && paletteNotes !== "undefined") {
    paletteNotesValue = `<p style="margin: 0;">Notes complémentaires concernant la livraison : ${paletteNotes}</p>`;
  } else {
    paletteNotesValue = '';
  }
  let deliveryTextIfPalette = '';
    if(deliveryPref.includes("palette")) {
      deliveryTextIfPalette = `<p style="margin: 0;"> Equipement nécessaire : ${paletteEquipment}</p>
      <p style="margin: 0;">Nécessité de prendre RDV pour la livraison : ${paletteAppointment}</p>
      ${paletteNotesValue}
      `
    }
  const message = {
    subject: 'Validation de votre espace pro - Pro Potiron Paris', 
    body: {
      contentType: 'HTML',
      content: `
        <p>Bonjour ${firstnameCustomer} ${nameNoStar},</p>
        <p style="margin: 0;">Nous vous souhaitons la bienvenue chez Potiron Paris - Espace Pro !</p>
        <p style="margin: 0;">Une fois connecté avec votre login et votre mot de passe, vous aurez accès à l'ensemble de nos produits aux tarifs pour professionnels.</p>
        <p><a href="https://potiron.com">Visitez notre boutique</a></p>
        <p style="text-decoration: underline;">Rappel de vos préférences de livraison : </p>
        <p style="margin: 0;">Possibilité(s) de livraison : ${deliveryPref}</p>
        ${deliveryTextIfPalette}
        <p>Vous pouvez modifier ces informations directement sur votre compte client.</p>
        <p style="margin: 0;">Nous restons à votre entière disposition.</p>
        <p style="margin: 0;">Très belle journée,</p>
        <p>L'équipe de Potiron Paris</p>
        <img src='cid:signature'/>
      `
    },
    toRecipients: [
      {
        emailAddress: {
          address: mailCustomer
        }
      }
    ],
    bccRecipients: [
      {
          emailAddress: {
              address: MAILDEV
          }
      }
    ],
    attachments: [
      signatureAttachement
    ]
  };
  try {
    await client.api('/me/sendMail').post({ message });
    console.log('Email to welcome pro customer send successfully');
  } catch (error) {
    console.error('Error send welcome pro mail', error);
  }  
}

//Send mail to Potiron Team to ask delivery quote
  async function sendNewDraftOrderMail(accessTokenMS365, firstnameCustomer, nameCustomer, draftOrderId, customerMail, customerPhone, shippingAddress, deliveryPrefValue, paletteEquipmentValue, appointmentValue, paletteNotes) {
    const client = initiMicrosoftGraphClient(accessTokenMS365);
    let deliveryTextIfPalette = '';
    if(deliveryPrefValue.includes("palette")) {
      deliveryTextIfPalette = `<p style="margin: 0;"> Equipement nécessaire : ${paletteEquipmentValue}</p>
      <p style="margin: 0;">Nécessité de prendre RDV pour la livraison : ${appointmentValue}</p>
      <p style="margin: 0;">Notes complémentaires concernant la livraison : ${paletteNotes}</p>
      `
    }
    let nameNoStar = nameCustomer.replace(/⭐/g, '').trim();

    const message = {
      subject: 'Nouvelle demande de cotation pour Commande Provisoire ' + draftOrderId, 
      body: {
        contentType: 'HTML',
        content: `
          <p>Bonjour, </p>
          <p style="margin: 0;">Une nouvelle commande provisoire a été créée pour le client PRO : ${firstnameCustomer} ${nameNoStar}</p>
          <p style="margin: 0;">Si besoin, il est joignable à ${customerMail} et au ${customerPhone} </p>
          <p style="margin: 0;">L'adresse de livraison renseignée est : ${shippingAddress}</p>
          <p>Préférence(s) de livraison : ${deliveryPrefValue}</p>
          ${deliveryTextIfPalette}
          <p>Bonne journée ! </p>
          <img src='cid:signature'/>
        `
      },
      toRecipients: [
        {
          emailAddress: {
            address: MAILCOTATION
          }
        }
      ],
      bccRecipients: [
        {
            emailAddress: {
                address: MAILDEV
            }
        }
      ],
      attachments: [
        signatureAttachement
      ]
    };
    try {
      await client.api('/me/sendMail').post({ message });
      console.log("Email for cotation sucessfully sent");
    } catch (error) {
      console.error('error sending cotation message', error);
    }
  }
  //Send email to Magalie with parcelNumber when automated return
  async function sendReturnDataToSAV(accessTokenMS365, senderCustomer, parcelNumbers, returnOrderId, totalOrder) {
    const client = initiMicrosoftGraphClient(accessTokenMS365);
    let trackingLinks = '';
    for (const number of parcelNumbers) {
      const packageTrack = `https://www.laposte.fr/outils/suivre-vos-envois?code=${number}`
      trackingLinks += `<p>Numéro de colis : ${number} - <a href="${packageTrack}">Suivi du colis</a></p>`; 
    }
    
    const message = {
      subject: 'Nouvelle demande de retour automatisé', 
      body: {
        contentType: 'HTML',
        content: `
          <p>Bonjour, </p>
          <p style="margin: 0;">Une nouvelle commande demande de retour a été créée pour le client : ${senderCustomer.name}</p>
          <p style="margin: 0;">Une commande retour a été créée dans Shippingbo GMA : ${returnOrderId}</p>
          <p style="margin: 0;">La commande d'origine Shopify est : ${senderCustomer.origin_ref}</p>
          <p>A réception de son colis, un code de réduction/remboursement lui sera automatiquement envoyé par mail, d'une valeur de ${totalOrder} </p>
          ${trackingLinks}
          <p>Bonne journée ! </p>
          <img src='cid:signature'/>
        `
      },
      toRecipients: [
        {
          emailAddress: {
            address: "c.leroux@potiron.com"
          }
        }
      ],
      bccRecipients: [
        {
            emailAddress: {
                address: MAILDEV
            }
        }
      ],
      attachments: [
        signatureAttachement
      ]
    };
    try {
      await client.api('/me/sendMail').post({ message });
      console.log("Email SAv after automated return sucessfully sent");
    } catch (error) {
      console.error('error sending cotation message', error);
    }
  }

  //Send email to customer with label colissmo attached
  async function sendReturnDataToCustomer(accessTokenMS365, senderCustomer, pdfBase64Array, parcelNumbers, totalOrder) {
    const client = initiMicrosoftGraphClient(accessTokenMS365);
    let trackingLinks = '';
    for (const number of parcelNumbers) {
      const packageTrack = `https://www.laposte.fr/outils/suivre-vos-envois?code=${number}`
      trackingLinks += `<p>Numéro de colis : ${number} - <a href="${packageTrack}">Suivi du colis</a></p>`; 
    }
    const pdfAttachments = pdfBase64Array.map((pdfBase64, index) => ({  
      '@odata.type': '#microsoft.graph.fileAttachment',   
      name: `etiquette_retour_colissimo_${index + 1}.pdf`,
      contentType: 'application/pdf',
      contentBytes: pdfBase64.replace(/^data:application\/pdf;base64,/, '')
    }))
    // const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, '');
    // const packageTrack = "https://www.laposte.fr/outils/suivre-vos-envois?code=" + parcelNumber;
    const message = {
        subject: 'Votre demande de retour Potiron Paris', 
        body: {
            contentType: 'HTML',
            content: `
              <p>Bonjour ${senderCustomer.name},</p>
              <p>Votre demande de retour a bien été prise en compte.</p>
              <p>Vous trouverez l'étiquette de retour ci-jointe, il suffit de l'imprimer pour votre colis.</p>
              <p>TEXTE A VOIR</p>
              ${trackingLinks}
              <p><a href="${packageTrack}">Suivre mon colis</a></p>
              <p>A réception de votre colis retour, vous recevrez par mail, le code de réduction/remboursement d'une valeur de ${totalOrder} valable 3 mois.
              <p>Très belle journée,</p>
              <p>L'équipe de Potiron Paris</p>
              <img src='cid:signature'/>
            `
        },
        toRecipients: [
            {
                emailAddress: {
                    address: "c.leroux@potiron.com"
                }
            }
        ],
        bccRecipients: [
            {
                emailAddress: {
                    address: MAILDEV
                }
            }
        ],
        attachments: [
            ...pdfAttachments,
            signatureAttachement
        ]
    };
 
    try {
        await client.api('/me/sendMail').post({ message });
        console.log("Email for customer return order successfully sent");
    } catch (error) {
        console.error('Error sending return order message', error);
    }
}

//send mail to customer with discount code after reception of return order + so retrieve customer + trigger sendEmailDiscountReminder with param
async function sendDiscountCodeAfterReturn(accessTokenMS365, customerData, orderName, discountCode, totalOrder, codeEndDate) {
  const client = initiMicrosoftGraphClient(accessTokenMS365);
  let nameNoStar = customerData.last_name.replace(/⭐/g, '').trim();

  const message = {
    subject: `Remboursement sur Commande ${orderName}`, 
    body: {
      contentType: 'HTML',
      content: `
        <p>Bonjour ${customerData.first_name} ${nameNoStar}, </p>
        <p style="margin: 0;">Suite à la réception de votre colis retour concernant la commande ${orderName}</p>
        <p style="margin: 0;">Code de réduction: ${discountCode}, d'une valeur de ${totalOrder} valable jusqu'au ${codeEndDate}</p>
        <p>Très belle journée,</p>
        <p>L'équipe de Potiron Paris</p>
        <img src='cid:signature'/>
      `
    },
    //TODO : mail client : customerData.email
    toRecipients: [
      {
        emailAddress: {
          address: "c.leroux@potiron.com"
        }
      }
    ],
    bccRecipients: [
      {
          emailAddress: {
              address: MAILDEV
          }
      }
    ],
    attachments: [
      signatureAttachement
    ]
  };
  try {
    await client.api('/me/sendMail').post({ message });
    console.log("Email discountCode automated return sucessfully sent");
  } catch (error) {
    console.error('error sending discountcode message', error);
  }
}

//Record Data customer and discount code in DB to send scheduled mail
const saveDiscountMailData = async (email, orderName, discountCode, totalAmount, endDate, discountCodeId, PriceRuleId) => {
  const sendDate = new Date(endDate);
  sendDate.setDate(sendDate.getDate() - 15);

  const query = `
    INSERT INTO scheduled_emails (customer_email, order_name, discount_code, total_order, code_end_date, send_date, discount_code_id, price_rule_id )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `
  const values = [email, orderName, discountCode, totalAmount, endDate, sendDate, discountCodeId, PriceRuleId];

  try {
    const result = await client.query(query, values);
    console.log("Data pour email programmé enregistré en DB");
  } catch (error) {
    console.error('Error recording discount data in scheduled emails table', error);
  }
}

//Retrieve Data from DB in scheduled_emails table 
const getDiscountMailData = async () => {
  const today = new Date().toISOString().split('T')[0];
  const query = `
    SELECT * FROM scheduled_emails WHERE send_date::date = $1 
  `;
  const values = [today];
  try {
    const result = await client.query(query, values);
    return result.rows;
  } catch (error) {
    console.error("Error retrieving data from scheduled emails table", error);
    return [];
  }
}


//check if send mail to remind discount code and delete line in schedule_emails table 
const checkScheduledEmails = async () => {
  const scheduledEmails = await getDiscountMailData();

  if(scheduledEmails.length === 0) {
    console.log("Aucun mail programmé pour aujourd'hui");
    return;
  }

  for (const emailData of scheduledEmails) {
    const { customer_email, order_name, discount_code, total_order, code_end, discount_code_id, price_rule_id } = emailData;
    // console.log('emailData', emailData);
    const isUsedCode = await checkDiscountCodeUsage(emailData.price_rule_id, emailData.discount_code_id);
    if(!isUsedCode) {
      console.log('send email to remind discount code and delete line in db');
      await sendEmailDiscountReminder(emailData.discount_code, emailData.total_order, emailData.code_end, emailData.customer_email, emailData.order_name);
    } else {
      console.log('delete discount code already used');
    }
    await removeScheduledMail(emailData.id);

  }
}

const removeScheduledMail = async (lineId) => {
  const query = `DELETE FROM scheduled_emails WHERE id = $1`;
  const values = [lineId];
 
  try {
    const result = await client.query(query, values);
    console.log(`Ligne avec id ${lineId} supprimée`, result.rowCount);
    return result.rowCount > 0;
  } catch (error) {
    console.error("Erreur lors de la suppression de la ligne :", error);
  }
};

//Send mail to customer 15days berfore expiration date example to test : exemple
const sendEmailDiscountReminder = async (discounCode, totalAmount, codeEndDate, customerMail, orderName) => {
  let accessTokenMS365 = await getAccessTokenMS365();
  if(!accessTokenMS365) {
    await refreshMS365AccessToken();
    accessTokenMS365 = await getAccessTokenMS365();
  }
  const discountEnd = new Date(codeEndDate);
  const formattedDate = discountEnd.toLocaleDateString('fr-FR', {     day: 'numeric',     month: 'long',     year: 'numeric' });
  const client = initiMicrosoftGraphClient(accessTokenMS365);
  const message = {
    subject: `Rappel Code de réduction`, 
    body: {
      contentType: 'HTML',
      content: `
        <p>Bonjour, </p>
        <p style="margin: 0;">Suite à la réception de votre colis retour concernant la commande ${orderName}</p>
        <p style="margin: 0;">Il ne vous reste plus que 15 jours pour utiliser votre code de réduction: ${discounCode}, d'une valeur de ${totalAmount} valable jusqu'au ${formattedDate}</p>
        <p>Très belle journée,</p>
        <p>L'équipe de Potiron Paris</p>
        <img src='cid:signature'/>
      `
    },
    //TODO : mail client : customerMail
    toRecipients: [
      {
        emailAddress: {
          address: "c.leroux@potiron.com"
        }
      }
    ],
    bccRecipients: [
      {
          emailAddress: {
              address: MAILDEV
          }
      }
    ],
    attachments: [
      signatureAttachement
    ]
  };
  try {
    await client.api('/me/sendMail').post({ message });
    console.log("Email Remind discountCode automated return sucessfully sent");
  } catch (error) {
    console.error('error sending discountcode message', error);
  }
}
  
  module.exports = {
    sendWelcomeMailPro,
    sendNewDraftOrderMail,
    sendEmailWithKbis,
    sendReturnDataToCustomer,
    sendReturnDataToSAV,
    sendDiscountCodeAfterReturn,
    saveDiscountMailData,
    checkScheduledEmails
  }