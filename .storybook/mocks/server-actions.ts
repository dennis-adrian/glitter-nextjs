const success = {
  success: true as const,
  message: "Storybook action completed",
};

export async function deleteFile() {
  return success;
}

export async function submitOrderPaymentVoucher() {
  return success;
}

export async function submitGuestOrderPaymentVoucher() {
  return success;
}

export async function createProduct() {
  return { ...success, productId: 1 };
}

export async function updateProduct() {
  return success;
}

export async function deleteProductImage() {
  return success;
}

export async function createParticipantProduct() {
  return success;
}

export async function submitPurchaseVoucher() {
  return success;
}
