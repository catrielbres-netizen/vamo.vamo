
// src/app/api/webhooks/mercadopago/route.ts
import { NextRequest, NextResponse } from "next/server";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { FieldValue, serverTimestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminApp } from "@/lib/server/firebase-admin";
import { PlatformTransaction, PaymentIntent } from "@/lib/types";

// Initialize Firebase Admin SDK
const { db } = getFirebaseAdminApp();

// Initialize Mercado Pago SDK
const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN!,
});

export async function POST(req: NextRequest) {
  if (!db) {
      console.error("MP Webhook Error: Firestore not initialized");
      return NextResponse.json({ error: "Internal server misconfiguration" }, { status: 500 });
  }

  try {
    const body = await req.json();

    // 1. Acknowledge non-payment events immediately
    if (body.type !== "payment") {
      return NextResponse.json({ received: true });
    }

    const paymentId = body.data?.id;
    if (!paymentId) {
      return NextResponse.json({ error: "Missing payment id" }, { status: 400 });
    }

    // 2. Fetch the full payment object from Mercado Pago API
    const payment = await new Payment(mpClient).get({ id: paymentId });
    
    // 3. Validate payment status. We only care about approved payments.
    if (payment.status !== "approved") {
      return NextResponse.json({ status: "ignored", reason: `Payment status is ${payment.status}` });
    }

    // 4. Validate and parse our internal reference
    const externalRef = payment.external_reference;
    if (!externalRef || !externalRef.startsWith("payment_intent:")) {
      console.warn(`Webhook received for payment ${paymentId} with invalid external_reference: ${externalRef}`);
      return NextResponse.json({ error: "Invalid or missing external_reference" }, { status: 400 });
    }

    const paymentIntentId = externalRef.replace("payment_intent:", "");
    const paymentIntentRef = db.collection("payment_intents").doc(paymentIntentId);
    
    // ---- ATOMIC TRANSACTION: The Core of the Webhook ----
    await db.runTransaction(async (transaction) => {
      const intentSnap = await transaction.get(paymentIntentRef);

      if (!intentSnap.exists) {
        console.error(`Webhook Error: PaymentIntent with ID ${paymentIntentId} not found.`);
        // Don't throw to avoid retries for a non-existent intent
        return;
      }

      const intent = intentSnap.data() as PaymentIntent;

      // 5. Idempotency Check: If already credited, do nothing.
      if (intent.status === "credited") {
        console.log(`Webhook Info: PaymentIntent ${paymentIntentId} already credited. Ignoring.`);
        return;
      }

      // CRITICAL CHECK: Validate that the paid amount matches the intended amount.
      if (payment.transaction_amount !== intent.amount) {
          console.error(`Webhook Error: Amount mismatch for intent ${paymentIntentId}. Expected ${intent.amount} but received ${payment.transaction_amount}.`);
          // Mark intent as failed to prevent retries with wrong amount.
          transaction.update(paymentIntentRef, {
              status: "rejected",
              note: `Amount mismatch. Expected ${intent.amount}, got ${payment.transaction_amount}.`,
              updatedAt: serverTimestamp(),
          });
          return;
      }


      // 6. Create the ledger entry (platform_transactions)
      const txLogRef = db.collection("platform_transactions").doc();
      const logEntry: Omit<PlatformTransaction, 'createdAt'> & { createdAt: FieldValue } = {
        driverId: intent.driverId,
        amount: intent.amount,
        type: "credit_payment",
        source: "mp_topup",
        referenceId: paymentIntentId, // Link to the intent
        note: `Carga de saldo via Mercado Pago. Payment ID: ${paymentId}`,
        createdAt: serverTimestamp(),
      };
      transaction.set(txLogRef, logEntry);
      
      // 7. Mark the PaymentIntent as credited (final step for idempotency)
      // WE DO NOT TOUCH THE DRIVER'S PROFILE HERE. The balance is derived from the ledger.
      transaction.update(paymentIntentRef, {
        status: "credited",
        mpPaymentId: paymentId,
        updatedAt: serverTimestamp(),
      });
    });
    // ---- END OF ATOMIC TRANSACTION ----

    console.log(`Successfully processed and credited payment_intent ${paymentIntentId}`);
    return NextResponse.json({ status: "ok" });

  } catch (err: any) {
    console.error("MP Webhook - Unhandled Error:", err);
    // Return 500 so Mercado Pago retries later
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
