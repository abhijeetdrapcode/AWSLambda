const processStripePaymentMethod = async (container) => {
  const customerId = await getCustomerId(container);
  if (!customerId) return;
  try {
    const { data } = await unSecuredPostCall(
      { customerId, currentPage: window.location.href },
      `payment-methods/create-checkout-session`,
    );

    const { clientSecret, publishedKey } = data;
    localStorage.setItem('stripePublishedKey', publishedKey);
    localStorage.setItem('stripeClientSecret', clientSecret);
  } catch (error) {
    if (error.response) {
      const errMsg = parseValueFromData(error.response, 'data.errors.message');
      toastr.error(errMsg, 'Failed!');
    }
  }
  const fetchClientSecret = () => {
    return localStorage.getItem('stripeClientSecret');
  };
  const stripePublishedKey = localStorage.getItem('stripePublishedKey');
  const stripe = Stripe(stripePublishedKey);
  // Initialize Checkout
  stripe.initEmbeddedCheckout({ fetchClientSecret }).then((checkout) => {
    // Mount Checkout
    checkout.mount('#checkout');
  });
};

const getCustomerId = async (container) => {
  const stripeCollection = container.getAttribute('stripe-customer-id-collection');
  const stripeField = container.getAttribute('stripe-customer-id-field');
  let snippetItemData = container.getAttribute('data-item');
  snippetItemData = snippetItemData ? JSON.parse(snippetItemData) : '';

  let customerId = '';
  if (stripeCollection === 'PAGE_COLLECTION') {
    let itemData = '';
    if (
      snippetItemData &&
      typeof snippetItemData === 'object' &&
      Object.keys(snippetItemData).length
    ) {
      itemData = snippetItemData;
    } else {
      const { itemData: pageItem } = await getPageItemData();
      itemData = pageItem;
    }
    customerId = itemData ? itemData[stripeField] : '';
  } else if (stripeCollection === 'CURRENT_USER') {
    if (isLoggedInUser()) {
      const currentUser = fetchLoggedInUserJson();
      customerId = currentUser[stripeField];
    } else {
      toastr.error('User is not Logged in!', 'Failed!');
    }
  }
  return customerId;
};

const randerPaymentMethodList = async (container) => {
  const containerId = container.getAttribute('id');
  const customerId = await getCustomerId(container);
  if (!customerId) return;
  let tablebodyRow = '';
  const tbodyElement = container.querySelector('tbody');
  const firstRowElements = tbodyElement.rows[0];
  const cells = firstRowElements.cells;
  tbodyElement.innerHTML = '';
  addTablePlaceholder(100, firstRowElements, tbodyElement);
  try {
    const { data } = await publicGetCall(`payment-methods/customer/${customerId}/list`);
    const { paymentMethodsList } = data;

    if (paymentMethodsList.length) {
      paymentMethodsList.forEach((item) => {
        let tableBodyCells = '';
        item.card_number = `XXXX XXXX XXXX ${item.last4}`;
        cells.forEach((cell) => {
          const value = cell.getAttribute('value');
          if (value === 'ACTION') {
            tableBodyCells += `<td value="ACTION">
                              <a href="" class="btn btn-primary btn-sm" style="margin: 0px 2px" data-method-id="${item.id}">Edit</a>
                              <a href="" class="btn btn-danger btn-sm" style="margin: 0px 2px" data-method-id="${item.id}" data-container-id="${containerId}" onclick="deleteStripePaymentMethod(event)" >Delete</a>
                            </td>`;
          } else {
            tableBodyCells += ` <td value="${value}"><div>${item[value]}</div></td>`;
          }
        });
        tablebodyRow += `<tr data-js="row" data-custom-js-row="collection-row" data-row="generated">${tableBodyCells}</tr>`;
      });
      tbodyElement.innerHTML = tablebodyRow;
    } else {
      tbodyElement.innerHTML = `<tr><td class="text-center" colspan="${cells.length}">There is no Payment Method attach to this Customer</td></tr>`;
    }
  } catch (error) {
    console.log('\n error :>> ', error);
    if (error.response) {
      const errMsg = parseValueFromData(error.response, 'data.errors.message');
      toastr.error(errMsg, 'Failed!');
    }
  }
};

const deleteStripePaymentMethod = async (e) => {
  e.preventDefault();
  const targetElement = e.target;
  const methodId = targetElement ? targetElement.getAttribute('data-method-id') : '';
  const containerId = targetElement ? targetElement.getAttribute('data-container-id') : '';

  await swalAlert('Are you sure about deleting this item?').then(async (willDelete) => {
    if (willDelete.isConfirmed) {
      try {
        await unSecuredDeleteCall(`payment-methods/delete/${methodId}`);
        toastr.success('Payment Method Deleted Successfully!', 'Success');
        const container = document.getElementById(containerId);
        await randerPaymentMethodList(container);
      } catch (error) {
        console.log('\n error :>> ', error);
        if (error.response) {
          const errMsg = parseValueFromData(error.response, 'data.errors.message');
          toastr.error(errMsg, 'Failed!');
        }
      }
    } else {
      toastr.error('Error', 'Failed!');
    }
  });
};
