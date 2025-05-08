const purchaseItem = async (event) => {
  event.preventDefault();
  const formData = event.target;
  const quantityField = formData.elements['quantity-field'].value;
  const priceField = formData.elements['price-field'].value;
  const nameField = formData.elements['name-field'].value;
  const descriptionField = formData.elements['description-field'].value;
  const productUuid = formData.elements['productId'].value;
  const collectionName = formData.elements['collectionName'].value;
  const quantity = formData.elements['quantity'].value;
  if (!quantityField) {
    toastr.error('Quantity Field is blank', 'Error');
    return;
  }
  if (!priceField) {
    toastr.error('Price Field is blank', 'Error');
    return;
  }
  if (!nameField) {
    toastr.error('Name Field is blank', 'Error');
    return;
  }
  if (!descriptionField) {
    toastr.error('Description Field is blank', 'Error');
    return;
  }
  if (!productUuid) {
    toastr.error('Product Field is blank', 'Error');
    return;
  }
  if (!quantity) {
    toastr.error('Quantity is blank', 'Error');
    return;
  }
  if (!collectionName) {
    toastr.error('Collection Name is blank', 'Error');
    return;
  }

  let apiData = await securedPostCall(
    {
      productUuid,
      quantityField,
      priceField,
      collectionName,
      quantity,
      nameField,
      descriptionField,
    },
    `marketplace-cart/create`,
  );
  if (apiData) {
    const createPurchaseItem = apiData.data;
    if (createPurchaseItem.status === 'failed') {
      toastr.error(createPurchaseItem.message, 'Error');
    }
    if (createPurchaseItem.status === 'success') {
      toastr.success(createPurchaseItem.message, 'Success');
      if (createPurchaseItem.redirectURL)
        window.location.href = `/${createPurchaseItem.redirectURL}`;
    }
  }
};

const processPurchase = async (event, stripeApiKey, projectId) => {
  event.preventDefault();
  let localStorage = window.localStorage;
  const accessToken = localStorage.getItem('token');
  const header = {
    headers: {
      'Content-Type': 'application/json',
      'x-project-id': projectId,
      authorization: accessToken,
    },
  };

  const serverUrl = getBackendServerUrl();
  if (serverUrl && serverUrl.length > 0) {
    const stripe = Stripe(stripeApiKey);
    axios
      .post(`${serverUrl}marketplace-cart/process-checkout`, {}, header)
      .then((response) => {
        const session = response.data;
        return stripe.redirectToCheckout({ sessionId: session.id });
      })
      .then((result) => {
        if (result.error) {
          toastr.error(result.error.message, 'Payment Failed');
        }
      })
      .catch((error) => {
        toastr.error(error.message, 'Payment Failed');
      });
  }
};

const addToCart = (productUuid) => {
  alert('ecommerce ' + productUuid);
};
