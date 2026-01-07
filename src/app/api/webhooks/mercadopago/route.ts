
// src/app/api/webhooks/mercadopago/route.ts
import { NextRequest, NextResponse } from "next/server";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { FieldValue } from 'firebase-admin/firestore';
import { getFirebaseAdminApp } from "@/lib/server/firebase-admin";
import { PlatformTransaction, PaymentIntent } from "@/lib/types";

// Force Node.js runtime for App Hosting compatibility with server-side SDKs
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Initialize SDKs and configurations *inside* the handler
  const { db } = getFirebaseAdminApp();
  
  if (!db) {
      console.error("MP Webhook Error: Firestore not initialized");
      return NextResponse.json({ error: "Internal server misconfiguration" }, { status: 500 });
  }

  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
      console.error("MP Webhook Error: MERCADOPAGO_ACCESS_TOKEN is not set.");
      return NextResponse.json({ error: "Internal server misconfiguration" }, { status: 500 });
  }

  const mpClient = new MercadoPagoConfig({ accessToken });

  try {
    const body = await req.json();

    if (body.type !== "payment") {
      return NextResponse.json({ received: true });
    }

    const paymentId = body.data?.id;
    if (!paymentId) {
      return NextResponse.json({ error: "Missing payment id" }, { status: 400 });
    }

    const payment = await new Payment(mpClient).get({ id: paymentId });
    
    if (payment.status !== "approved") {
      return NextResponse.json({ status: "ignored", reason: `Payment status is ${payment.status}` });
    }

    const externalRef = payment.external_reference;
    if (!externalRef || !externalRef.startsWith("payment_intent:")) {
      console.warn(`Webhook received for payment ${paymentId} with invalid external_reference: ${externalRef}`);
      return NextResponse.json({ error: "Invalid or missing external_reference" }, { status: 400 });
    }

    const paymentIntentId = externalRef.replace("payment_intent:", "");
    const paymentIntentRef = db.collection("payment_intents").doc(paymentIntentId);
    
    await db.runTransaction(async (transaction) => {
      const intentSnap = await transaction.get(paymentIntentRef);

      if (!intentSnap.exists) {
        console.error(`Webhook Error: PaymentIntent with ID ${paymentIntentId} not found.`);
        return;
      }

      const intent = intentSnap.data() as PaymentIntent;

      if (intent.status === "credited") {
        console.log(`Webhook Info: PaymentIntent ${paymentIntentId} already credited. Ignoring.`);
        return;
      }

      if (payment.transaction_amount !== intent.amount) {
          console.error(`Webhook Error: Amount mismatch for intent ${paymentIntentId}. Expected ${intent.amount} but received ${payment.transaction_amount}.`);
          transaction.update(paymentIntentRef, {
              status: "rejected",
              note: `Amount mismatch. Expected ${intent.amount}, got ${payment.transaction_amount}.`,
              updatedAt: FieldValue.serverTimestamp(),
          });
          return;
      }

      const txLogRef = db.collection("platform_transactions").doc();
      const logEntry: Omit<PlatformTransaction, 'createdAt'> & { createdAt: FieldValue } = {
        driverId: intent.driverId,
        amount: intent.amount,
        type: "credit_payment",
        source: "mp_topup",
        referenceId: paymentIntentId,
        note: `Carga de saldo via Mercado Pago. Payment ID: ${paymentId}`,
        createdAt: FieldValue.serverTimestamp(),
      };
      transaction.set(txLogRef, logEntry);
      
      transaction.update(paymentIntentRef, {
        status: "credited",
        mpPaymentId: paymentId,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    console.log(`Successfully processed and credited payment_intent ${paymentIntentId}`);
    return NextResponse.json({ status: "ok" });

  } catch (err: any) {
    console.error("MP Webhook - Unhandled Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
