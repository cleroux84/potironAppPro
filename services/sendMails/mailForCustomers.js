// Mail for customers

const fs = require('fs');
const { Client } = require('@microsoft/microsoft-graph-client');
const { signatureAttachement, initiMicrosoftGraphClient } = require('./mailForTeam');
const { getDiscountMailData, removeScheduledMail } = require('../database/scheduled_emails');
const { getAccessTokenMS365, refreshMS365AccessToken } = require('../API/microsoft');
const { checkDiscountCodeUsage } = require('../API/Shopify/priceRules');
require('dotenv').config();
require ('isomorphic-fetch');
const MAILDEV = process.env.MAILDEV;

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

//Send email to customer with label colissmo attached
async function sendReturnDataToCustomer(accessTokenMS365, senderCustomer, pdfBase64Array, parcelNumbers, totalOrder) {
    const client = initiMicrosoftGraphClient(accessTokenMS365);
    // let trackingLinks = '';
    // for (const number of parcelNumbers) {
    //   const packageTrack = `https://www.laposte.fr/outils/suivre-vos-envois?code=${number}`
    //   trackingLinks += `<p>Numéro de colis : ${number} - <a href="${packageTrack}">Suivi du colis</a></p>`; 
    // }
    let labelsText;
    if(parcelNumbers.length === 1) {
      labelsText = `l'étiquette de retour ci-jointe.`;
    } else {
      labelsText = `les étiquettes de retour ci-jointes.`;
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
              <p>A réception de votre colis retour, vous recevrez par mail, le code de réduction/remboursement d'une valeur de ${totalOrder}€ valable 3 mois.
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
    let positiveAmount = Math.abs(totalOrder);
    const message = {
      subject: `Remboursement sur Commande ${orderName}`, 
      body: {
        contentType: 'HTML',
        content: `
          <p>Bonjour ${customerData.first_name} ${nameNoStar}, </p>
          <p style="margin: 0;">Suite à la réception de votre colis retour concernant la commande ${orderName}</p>
          <p style="margin: 0;">Code de réduction: ${discountCode}, d'une valeur de ${positiveAmount}€ valable jusqu'au ${codeEndDate}.</p>
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
  //Send mail to customer 15days berfore expiration date example to test : exemple
const sendEmailDiscountReminder = async (discounCode, totalAmount, codeEndDate, customerMail, orderName) => {
    let accessTokenMS365 = await getAccessTokenMS365();
    if(!accessTokenMS365) {
      await refreshMS365AccessToken();
      accessTokenMS365 = await getAccessTokenMS365();
    }
    console.log("codeenddate from db", codeEndDate);
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
          <p style="margin: 0;">Il ne vous reste plus que 15 jours pour utiliser votre code de réduction: ${discounCode}, d'une valeur de ${totalAmount} valable jusqu'au ${formattedDate}.</p>
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
    sendReturnDataToCustomer,
    sendDiscountCodeAfterReturn,
    checkScheduledEmails
  }