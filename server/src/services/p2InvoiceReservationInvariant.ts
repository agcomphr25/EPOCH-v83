export function requireReservedP2InvoiceNumber(input: {
  packingSlipId: string;
  invoiceNumber: string | null | undefined;
}): string {
  const invoiceNumber = input.invoiceNumber?.trim();
  if (!invoiceNumber) {
    throw new Error(
      `Packing slip ${input.packingSlipId} does not have a reserved invoice number; invoice creation stopped`
    );
  }
  return invoiceNumber;
}

export function assertP2InvoiceHonorsReservation(input: {
  packingSlipId: string;
  reservedInvoiceNumber: string;
  actualInvoiceNumber: string;
}): void {
  if (input.actualInvoiceNumber !== input.reservedInvoiceNumber) {
    throw new Error(
      `Invoice number mismatch for packing slip ${input.packingSlipId}: reserved ${input.reservedInvoiceNumber}, found ${input.actualInvoiceNumber}; invoice creation stopped`
    );
  }
}
