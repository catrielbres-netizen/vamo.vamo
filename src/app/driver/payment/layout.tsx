
// This layout ensures that the payment status pages are rendered within the driver's main layout context.
// It doesn't need to add any extra UI, it just passes the children through.
export default function PaymentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
