export async function loadInvoice(id: string) {
  const res = await fetch(`/api/invoices/${id}`);
  return res.json();
}
