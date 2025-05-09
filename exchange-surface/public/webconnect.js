window.addEventListener('DOMContentLoaded', async function () {
  // Register service worker to control making site work offline
  await registerServiceWorker();
  checkAndLoadProjectEnv();
  searchQueryFromURL();
  addStylesForSummerNoteEditor();
  await loadDynamicFilterDataIntoElements();
  const { itemData, collectionId, collectionItemId } = await getPageItemData();
  const { constants: projectConstant, environments } = await getProjectDetail();
  const dateFormat = document.getElementById('dateTimeFormat')?.innerText || 'YYYY-MM-DD';
  const dataField = `data-${collectionId}`;
  const dataURLField = `data-url-${collectionId}`;
  const dataImageTag = `data-img-src-${collectionId}`;
  const dataVideoTag = `data-video-src-${collectionId}`;
  const dataAudioTag = `data-audio-src-${collectionId}`;
  const formElements = window.document.querySelectorAll('form');

  let visibilityElements = window.document.querySelectorAll('[data-vis-condition]');
  if (visibilityElements && visibilityElements.length) {
    console.log('🚀 ~ file: webconnect.js:22 ~ Process Component Visibility...');
    visibilityElements.forEach((visibilityElem) => {
      const visConditionJson = parseVisibilityCondition(visibilityElem);
      const visWhenCollectionFrom = visConditionJson['visWhenCollectionFrom'];
      const visWhenBsl = visConditionJson['visWhenBsl'];
      const visWhenBslKey = visConditionJson['visWhenBslKey'];
      if (visWhenCollectionFrom === 'BROWSER_STORAGE') {
        // Get Browser Storage Data Object
        let browserData = {};
        switch (visWhenBsl) {
          case 'SESSION_STORAGE':
            browserData = getBrowserSessionStorageData();
            break;
          case 'LOCAL_STORAGE':
            browserData = getBrowserLocalStorageData();
            break;
          case 'COOKIES':
            browserData = getBrowserCookieData();
            break;
          default:
            break;
        }
        let compVisibilityDataJson = {
          itemData: browserData,
        };
        processComponentVisibilityCondition(visibilityElem, compVisibilityDataJson);
      }
    });
  }

  if (collectionId && collectionItemId && itemData) {
    let hyperLinks = window.document.querySelectorAll('[data-path-collection-name]');
    let imageElements = window.document.querySelectorAll(`[${dataImageTag}]`);
    let videoElements = window.document.querySelectorAll(`[${dataVideoTag}]`);
    let audioElements = window.document.querySelectorAll(`[${dataAudioTag}]`);
    let textContentElements = window.document.querySelectorAll(`[${dataField}], [data-filter-id]`);
    let urlContentElements = window.document.querySelectorAll(`[${dataURLField}]`);
    let allPageButtonsAndLinks = window.document.querySelectorAll('a, button');
    let staticDynamic = window.document.querySelectorAll('[data-gjs="child-data-list"]');
    let childDataGroupFile = window.document.querySelectorAll('[data-js="child-data-group-file"]');
    const iconElement = window.document.querySelectorAll('[data-js="drapcode-icons"]');
    const imgElement = window.document.querySelectorAll('img');
    const pdfViewerElement = window.document.querySelectorAll('[data-pdf-viewer-component]');

    console.log(
      'loadDataTable dataField: ',
      dataField,
      'dataURLField: ',
      dataURLField,
      'urlContentElements: ',
      urlContentElements,
      'itemData::',
      itemData,
      'hyperLinks:::',
      hyperLinks,
      'textContentElements:::',
      textContentElements,
    );
    if (
      (textContentElements ||
        imageElements ||
        hyperLinks ||
        urlContentElements ||
        videoElements ||
        staticDynamic ||
        childDataGroupFile ||
        pdfViewerElement) &&
      collectionId &&
      collectionItemId
    ) {
      if (itemData) {
        textContentElements.forEach((textElement) => {
          getTextContentFieldValue(textElement, dataField, itemData);
        });
        staticDynamic.forEach((element) => {
          let fieldName = element.getAttribute(`data-option-field`);
          getColorBadges(element, fieldName, itemData);
        });
        hyperLinks.forEach((element) => {
          const fieldName = element.getAttribute('data-path-field-name');
          if (fieldName && !element.getAttribute('data-path-collection-item-id-from')) {
            if (
              !(
                element.hasAttribute('data-gjs') &&
                element.getAttribute('data-gjs') === 'data-table-link'
              )
            ) {
              const href = element.getAttribute('href');
              let fieldHref = fieldName ? parseValueFromData(itemData, fieldName) : '';

              if (fieldHref && typeof fieldHref === 'string' && fieldHref.includes(',')) {
                fieldHref = fieldHref.split(', ');
                fieldHref = fieldHref[0];
              }

              const replaceHref = href.replace(fieldName, fieldHref);
              element.setAttribute('href', replaceHref);
            }
          }
        });
        urlContentElements.forEach((element) => {
          const fieldType = element.getAttribute('data-field-type');
          if (fieldType === 'file') {
            replaceContentOfFileLinkElements(itemData, element, dataURLField);
          } else {
            const fieldName = element.getAttribute(dataURLField);
            const href = element.getAttribute(dataURLField);
            const replaceHref = href.replace(fieldName, parseValueFromData(itemData, fieldName));
            element.setAttribute('href', replaceHref);
          }
        });
        imageElements.forEach((imageElement) => {
          const fieldName = imageElement.getAttribute(dataImageTag);
          const previewIcon = elementAttribute(imageElement, 'data-preview-icon');
          let itemImageData = fieldName ? parseValueFromData(itemData, fieldName) : '';
          if (Array.isArray(itemImageData)) {
            itemImageData = itemImageData[0];
          }
          let imageSrcUrl;
          if (itemImageData) {
            if (typeof itemImageData === 'object') {
              const imageKey = itemImageData.key;
              imageSrcUrl = previewIcon
                ? itemImageData[previewIcon]
                : itemImageData.isExternalUrl
                ? itemImageData.url
                : itemImageData.isPrivate === true
                ? `https://drapcode-static.s3.amazonaws.com/img/placeholder-img.png`
                : imageKey
                ? imageServerUrl() + imageKey
                : imageSrcUrl;
            } else if (typeof itemImageData === 'string' && itemImageData.startsWith('http')) {
              imageSrcUrl = itemImageData;
            }
            imageElement.src = imageSrcUrl;
            if (itemImageData.isPrivate === true) {
              addDownloadAttributeForPrivateFiles(imageElement, itemImageData, itemData.uuid);
            }
          }
        });
        videoElements.forEach((videoElement) => {
          const fieldName = videoElement.getAttribute(dataVideoTag);
          const videoType = videoElement.getAttribute('data-video-type');
          let itemVideoData = fieldName ? parseValueFromData(itemData, fieldName) : '';
          if (itemVideoData && ['youtube-nocookie', 'youtube', 'vimeo'].includes(videoType)) {
            const iframeVideoSrc = videoElement.getAttribute('src');
            videoElement.src = iframeVideoSrc
              ? getIframeVideoUrlForYoutubeOrVimeo(iframeVideoSrc, itemVideoData, videoType)
              : '';
          } else if (itemVideoData) {
            videoElement.src = itemVideoData;
          } else {
            videoElement.src = '';
          }
        });
        audioElements.forEach((audioElement) => {
          const fieldName = audioElement.getAttribute(dataAudioTag);
          const audioType = audioElement.getAttribute('data-audio-type');
          const isAutoplay = audioElement.hasAttribute('autoplay')
            ? audioElement.getAttribute('autoplay')
            : false;
          const itemAudioData = fieldName ? parseValueFromData(itemData, fieldName) : '';
          if (itemAudioData) {
            if (audioType === 'file') {
              audioElement.src =
                itemAudioData.isPrivate === true
                  ? `https://drapcode-static.s3.amazonaws.com/img/placeholder-audio.png`
                  : imageServerUrl() + itemAudioData.key;

              if (itemAudioData.isPrivate === true) {
                addDownloadAttributeForPrivateFiles(audioElement, itemAudioData, itemData.uuid);
              }
            } else {
              audioElement.src = itemAudioData;
            }
            if (isAutoplay) {
              audioElement.autoplay = true;
              audioElement.play();
            }
          } else {
            audioElement.src = '';
          }
        });
        allPageButtonsAndLinks.forEach((element) => {
          const isParentIsCMS = element.closest(
            '[data-js="data-table"], [data-js="data-group"], [data-js="child-data-group"], [data-js="data-list"],[data-js="search-form"], [data-js="child-data-group-file"] ',
          );
          if (
            element?.tagName === 'A' &&
            element.getAttribute('data-path-collection-item-id-from') === 'pageCollection'
          ) {
            const elementWithHrefWithItemValue = renderLinkColumnData(itemData, element);
            $(element).replaceWith(elementWithHrefWithItemValue);
          }
          if (!isParentIsCMS) {
            element.setAttribute('data-item-id', itemData['uuid']);
            element.setAttribute('data-collection-id', collectionId);

            const snipCartElem = window.document.getElementById('snipcart');
            const isSnipCartActive = typeof snipCartElem != 'undefined' && snipCartElem != null;
            if (isSnipCartActive && element.classList.contains('snipcart-add-item')) {
              loadSnipcartItemData(element, itemData);
            }
          }
        });
        pdfViewerElement.forEach((element) => {
          const fieldName = element.getAttribute('data-pdf-viewer-field');
          const itemImageData = fieldName ? parseValueFromData(itemData, fieldName) : '';
          renderPdfViewerElements(element, itemImageData, itemData?.uuid);
        });
        [...iconElement, ...imgElement].forEach((elem) => {
          elem.setAttribute('data-item-id', itemData.uuid);
          elem.setAttribute('data-collection-id', collectionId);
          elem.setAttribute('data-item', JSON.stringify(itemData));
        });
        if (childDataGroupFile) {
          childDataGroupFile.forEach((element) => {
            replaceInnerGroupFile(collectionId, itemData, element, stylesMap);
          });

          /* Initialise the magnificPopup on Images */
          $('.child-data-group-file[data-field-type=image]').each(function () {
            let imgElement = this;
            const elementType = imgElement.tagName;
            if (elementType !== 'IMG') {
              imgElement = elementSelector(this, 'img');
            }
            if (imgElement && imgElement.hasAttribute('data-enable-popup')) {
              const anchorParentElem = imgElement.closest('A');
              const hasAnchorParentElem = !!anchorParentElem;
              if (hasAnchorParentElem) {
                // the containers for all your galleries
                $(this).magnificPopup({
                  delegate: 'a', // the selector for gallery item
                  type: 'image',
                  gallery: {
                    enabled: true,
                  },
                });
              }
            }
          });
        }
      }
    }
  }
  // const loggedInUser = isLoggedInUser() ? fetchLoggedInUserJson() : {};
  // const currentTenant = isLoggedInTenant() ? fetchCurrentTenantJson() : {};
  formElements.forEach((elem) => {
    if (collectionItemId) elem.setAttribute('data-item-id', collectionItemId);
    if (collectionId) elem.setAttribute('data-collection-id', collectionId);
    // TODO: Need to review this and modify this general use case
    // const check = !elem.closest('[data-js="data-group"]');
    // if (check) {
    //   replaceItemAndCollectionInForm(elem, itemData, itemData, loggedInUser, currentTenant);
    // }
  });
  if (itemData && itemData !== 'undefined') {
    await addDynamicDataIntoFormElements(itemData);
  } else {
    await addDynamicDataIntoFormElements();
  }
  loadHyperLinkFromEntity();
  loadSessionDataIntoElements();
  loadSessionTenantDataIntoElements();
  loadSessionUserSettingsDataIntoElements();
  loadHyperLinkFromBSL();
  loadPreviousActionResponseDataIntoElements(false, projectConstant, environments);
  replaceContentOfAllProgressBar(itemData, collectionId);
  let allPageButtonsAndLinks = window.document.querySelectorAll('a, button');
  allPageButtonsAndLinks.forEach((element) => {
    element.addEventListener('click', (event) => {
      if (
        element.tagName.toLowerCase() === 'a' &&
        element.hasAttribute('onclick') &&
        element.hasAttribute('href')
      ) {
        console.log('inside if element');
        event.preventDefault();
      }
      preventDoubleClick(event.currentTarget);
    });
  });
});

function preventDoubleClick(element) {
  if (!element) return;
  let { dataset: targetElemDataset } = element;
  let preventDblClick = false;
  if (targetElemDataset.hasOwnProperty('preventDblclick')) {
    preventDblClick = true;
  }
  if (preventDblClick) {
    let timeoutDuration = 5000;
    if (targetElemDataset.hasOwnProperty('disableDuration')) {
      const typeOfDisableDurationValue = typeof Number(targetElemDataset['disableDuration']);
      if (typeOfDisableDurationValue === 'number') {
        timeoutDuration = Number(targetElemDataset['disableDuration']);
      }
    }
    element.style.pointerEvents = 'none';
    element.style.opacity = '0.5';
    setTimeout(() => {
      element.style.pointerEvents = 'auto';
      element.style.opacity = '1';
    }, timeoutDuration);
  }
}

const loadHyperLinkFromEntity = (dataAttrKey = '[data-path-collection-name]') => {
  const DATA_ATTR_KEY = dataAttrKey;

  let hyperLinks = window.document.querySelectorAll(DATA_ATTR_KEY);
  console.log('hyperLinks:::', hyperLinks);
  if (hyperLinks) {
    hyperLinks.forEach((element) => {
      const pathFrom = element.getAttribute('data-path-collection-item-id-from');
      if (
        pathFrom === 'browserStorage' &&
        !(
          element.hasAttribute('data-gjs') && element.getAttribute('data-gjs') === 'data-table-link'
        )
      ) {
        const fieldName = element.getAttribute('data-path-field-name');
        const seoName = element.getAttribute('data-path-field-seo');
        const dataStorageKey = element.getAttribute('data-storage-key');
        let itemData = parseLSJSONStrToJSON(dataStorageKey);
        const href = element.getAttribute('href');
        let fieldHref = fieldName ? parseValueFromData(itemData, fieldName) : '';

        if (fieldHref && typeof fieldHref === 'string' && fieldHref.includes(',')) {
          fieldHref = fieldHref.split(', ');
          fieldHref = fieldHref[0];
        }

        let replaceHref = href.replace(fieldName, fieldHref);
        if (seoName) {
          let seoHref = seoName ? parseValueFromData(itemData, seoName) : '';
          seoHref = slugify(seoHref);
          replaceHref = replaceHref.replace(seoName, seoHref);
        }
        element.setAttribute('href', replaceHref);
      }
    });
  }
};

const loadHyperLinkFromBSL = (isModal = false, query = '') => {
  const BROWSER_STORAGE_LOCATION_KEY = 'data-link-bsl';
  const BROWSER_STORAGE_LOCATION_PATH_KEY = 'data-link-bslp';
  const BROWSER_STORAGE_LOCATION_TEXT_KEY = 'data-link-bslt';
  const BROWSER_STORAGE_LOCATION_TEXT_PATH_KEY = 'data-link-bsltp';
  let bslElems = document.querySelectorAll(`[${BROWSER_STORAGE_LOCATION_KEY}]`);

  if (isModal) {
    const QUERY = query ? query : '[id^=modal-container]';
    bslElems = document.querySelectorAll(`${QUERY} [${BROWSER_STORAGE_LOCATION_KEY}]`);
  }
  if (bslElems) {
    const loggedInUser = fetchLoggedInUserJson();
    bslElems.forEach((element) => {
      const bslKey = element.getAttribute(`${BROWSER_STORAGE_LOCATION_KEY}`);
      const bslKeyPath = element.getAttribute(`${BROWSER_STORAGE_LOCATION_PATH_KEY}`);
      const bslTextKey = element.getAttribute(`${BROWSER_STORAGE_LOCATION_TEXT_KEY}`);
      const bslTextKeyPath = element.getAttribute(`${BROWSER_STORAGE_LOCATION_TEXT_PATH_KEY}`);

      const fieldType = element.getAttribute('data-field-type');

      console.log(
        '🚀 ~ file: webconnect.js:367 ~ bslElems.forEach ~ bslKey:',
        bslKey,
        '~ bslKeyPath:',
        bslKeyPath,
        '~ bslTextKey:',
        bslTextKey,
        '~ bslTextKeyPath:',
        bslTextKeyPath,
        '~ fieldType:',
        fieldType,
      );

      let bslBrowserStorageData = getBSLData(bslKey);
      let bsltBrowserStorageData = getBSLData(bslTextKey);
      console.log(
        '🚀 ~ file: webconnect.js:378 ~ bslElems.forEach ~ bslBrowserStorageData:',
        bslBrowserStorageData,
      );
      console.log(
        '🚀 ~ file: webconnect.js:378 ~ bslElems.forEach ~ bsltBrowserStorageData:',
        bsltBrowserStorageData,
      );

      //TODO:need more reliable way to fix this
      if ((fieldType && fieldType === 'file') || element?.tagName === 'IMG') {
        let itemImageData =
          bslKey && bslKeyPath ? parseValueFromData(bslBrowserStorageData, bslKeyPath) : '';
        if (Array.isArray(itemImageData)) {
          itemImageData = itemImageData[0];
        }
        let imageSrcUrl;
        if (itemImageData) {
          if (typeof itemImageData === 'object') {
            const imageKey = itemImageData.key;
            if (imageKey)
              imageSrcUrl =
                itemImageData.isPrivate === true
                  ? `https://drapcode-static.s3.amazonaws.com/img/placeholder-img.png`
                  : imageServerUrl() + imageKey;
          } else if (typeof itemImageData === 'string' && itemImageData.startsWith('http')) {
            imageSrcUrl = itemImageData;
          }
          element.src = imageSrcUrl;
          if (itemImageData.isPrivate === true) {
            const { uuid, collectionName, collectionField = '', originalName } = itemImageData;
            if (loggedInUser) {
              element.setAttribute(
                'onclick',
                `fetchFile("` +
                  loggedInUser.uuid +
                  `","` +
                  uuid +
                  `","` +
                  collectionName +
                  `","` +
                  collectionField +
                  `","` +
                  originalName +
                  `")`,
              );
            }
          }
        }
      } else {
        if (bslKey && bslKeyPath) {
          element.href = _.get(bslBrowserStorageData, bslKeyPath.trim());
        }
        if (bslTextKey && bslTextKeyPath) {
          element.textContent = _.get(bsltBrowserStorageData, bslTextKeyPath.trim());
          if (element.textContent) {
            //TODO: this style is temporary solution to show hidden element which we hide on proejct build->
            //default text does not appear on page load
            element.style.display = 'block';
          } else {
            element.style.display = 'none';
          }
        }
      }
    });
  }
};

const loadSessionDataIntoElements = (isModal = false, sessionKey = '', query = '') => {
  const SESSION_FIELD_KEY = 'data-session';
  const SESSION_ITEM_FROM_KEY = 'session';
  const SESSION_TEXT_FIELD_KEY = 'data-session-text';
  const SESSION_KEY = sessionKey ? sessionKey : `[${SESSION_FIELD_KEY}]`;
  let sessionAttributes = document.querySelectorAll(`${SESSION_KEY}`);

  if (isModal) {
    const QUERY = query ? query : '[id^=modal-container]';
    sessionAttributes = document.querySelectorAll(`${QUERY} ${SESSION_KEY}`);
  }
  if (sessionAttributes) {
    let loggedInUserData = localStorage.getItem('user') ? localStorage.getItem('user') : '';
    if (loggedInUserData && loggedInUserData !== 'undefined') {
      let loggedInUser = parseLSJSONStrToJSON('user');
      sessionAttributes.forEach((element) => {
        loadDataIntoElements(element, SESSION_FIELD_KEY, SESSION_ITEM_FROM_KEY, loggedInUser);
      });
    }
  }
};

const loadSessionTenantDataIntoElements = (isModal = false, sessionKey = '', query = '') => {
  const SESSION_FIELD_KEY = 'data-session-tenant';
  const SESSION_KEY = sessionKey ? sessionKey : `[${SESSION_FIELD_KEY}]`;
  const SESSION_ITEM_FROM_KEY = 'session-tenant';
  let sessionAttributes = document.querySelectorAll(`${SESSION_KEY}`);

  if (isModal) {
    const QUERY = query ? query : '[id^=modal-container]';
    sessionAttributes = document.querySelectorAll(`${QUERY} ${SESSION_KEY}`);
  }
  if (sessionAttributes) {
    const loggedInUserTenantData = localStorage.getItem('tenant')
      ? localStorage.getItem('tenant')
      : '';
    if (loggedInUserTenantData && loggedInUserTenantData !== 'undefined') {
      let loggedInUserTenant = parseLSJSONStrToJSON('tenant');
      sessionAttributes.forEach((element) => {
        loadDataIntoElements(element, SESSION_FIELD_KEY, SESSION_ITEM_FROM_KEY, loggedInUserTenant);
      });
    }
  }
};

const loadSessionUserSettingsDataIntoElements = (isModal = false, sessionKey = '', query = '') => {
  const SESSION_KEY = sessionKey ? sessionKey : '[data-session-user-settings]';
  const SESSION_FIELD_KEY = 'data-session-user-settings';
  const SESSION_ITEM_FROM_KEY = 'sessionUserSettings';
  let sessionAttrElems = document.querySelectorAll(`${SESSION_KEY}`);
  if (isModal) {
    const QUERY = query ? query : '[id^=modal-container]';
    sessionAttributes = document.querySelectorAll(`${QUERY} ${SESSION_KEY}`);
  }
  if (sessionAttrElems) {
    const loggedInUserSettingsData = localStorage.getItem('userSetting')
      ? localStorage.getItem('userSetting')
      : '';
    if (loggedInUserSettingsData && loggedInUserSettingsData !== 'undefined') {
      let loggedInUserSetting = parseLSJSONStrToJSON('userSetting');
      sessionAttrElems.forEach((element) => {
        loadDataIntoElements(
          element,
          SESSION_FIELD_KEY,
          SESSION_ITEM_FROM_KEY,
          loggedInUserSetting,
        );
      });
    }
  }
};

const loadDataIntoElements = (element, SESSION_FIELD_KEY, SESSION_ITEM_FROM_KEY, data) => {
  const fieldName = element.getAttribute(`${SESSION_FIELD_KEY}`);
  const fieldType = element.getAttribute('data-field-type');
  const previewIcon = elementAttribute(element, 'data-preview-icon');
  const fieldTextName = element.getAttribute('data-session-text');

  //TODO:need more reliable way to fix this
  if ((fieldType && fieldType === 'file') || element?.tagName === 'IMG') {
    let itemImageData = fieldName ? parseValueFromData(data, fieldName) : '';
    if (Array.isArray(itemImageData)) {
      itemImageData = itemImageData[0];
    }
    let imageSrcUrl;
    if (itemImageData) {
      if (typeof itemImageData === 'object') {
        const imageKey = itemImageData.key;
        if (imageKey)
          imageSrcUrl = previewIcon
            ? itemImageData[previewIcon]
            : itemImageData.isPrivate === true
            ? `https://drapcode-static.s3.amazonaws.com/img/placeholder-img.png`
            : imageServerUrl() + imageKey;
      } else if (typeof itemImageData === 'string' && itemImageData.startsWith('http')) {
        imageSrcUrl = itemImageData;
      }
      element.src = imageSrcUrl;
      if (itemImageData.isPrivate === true) {
        addDownloadAttributeForPrivateFiles(element, itemImageData, data.uuid);
      }
      element.textContent = itemImageData.originalName;
      const hiddenInput = element.parentElement.querySelector(
        `input[type="hidden"][name="${fieldName}"]`,
      );
      if (hiddenInput) {
        hiddenInput.value = JSON.stringify(itemImageData);
      } else {
        console.error('Hidden input not found!');
      }
    }
  } else if (
    element?.tagName === 'A' &&
    element.getAttribute('data-path-collection-item-id-from') === SESSION_ITEM_FROM_KEY
  ) {
    const elementWithHrefWithItemValue = renderLinkColumnData(data, element);
    if (fieldTextName) {
      elementWithHrefWithItemValue.textContent = data ? _.get(data, fieldTextName.trim()) : '';
      if (elementWithHrefWithItemValue.textContent) {
        //TODO: this style is temporary solution to show hidden element which we hide on proejct build->
        //default text does not appear on page load
        elementWithHrefWithItemValue.style.display = 'block';
      }
    }
    $(element).replaceWith(elementWithHrefWithItemValue);
  } else {
    //TODO: this style is temporary solution to show hidden element which we hide on proejct build->
    //default text does not appear on page load
    element.style.display = 'block';
    if (fieldName.includes('"') && 'functionType' in JSON.parse(fieldName)) {
      element.textContent = getDerivedFieldData(fieldName, data);
    } else {
      element.textContent = data ? parseValueFromData(data, fieldName) : '';
    }
  }
};

const loadPreviousActionResponseDataIntoElements = (
  isModal = false,
  projectConstant,
  environments,
  query = '',
) => {
  const ACTION_RESPONSE_KEY = 'previousActionResponse';
  const ACTION_FORM_DATA_KEY = 'previousActionFormData';
  const ACTION_RESPONSE_ATTR_KEY = 'data-previous-action-response';
  const ACTION_FORM_DATA_ATTR_KEY = 'data-previous-action-formdata';
  const BROWSER_STORAGE_KEY_ATTR_KEY = 'data-storage-key';
  const BROWSER_STORAGE_ATTR_KEY = 'data-browser-storage';
  const QUERY_PARAMS_ATTR_KEY = 'data-query-params';
  const BROWSER_STORAGE_LOCATION_KEY = 'data-bsl';
  const BROWSER_STORAGE_LOCATION_PATH_KEY = 'data-bslp';

  let previousActionFormDataElems = document.querySelectorAll(`[${ACTION_FORM_DATA_ATTR_KEY}]`);
  let previousActionResponseElems = document.querySelectorAll(`[${ACTION_RESPONSE_ATTR_KEY}]`);
  let browserStorageElems = document.querySelectorAll(`[${BROWSER_STORAGE_ATTR_KEY}]`);
  let queryParamsElems = document.querySelectorAll(`[${QUERY_PARAMS_ATTR_KEY}]`);
  let bslElems = document.querySelectorAll(`[${BROWSER_STORAGE_LOCATION_KEY}]`);

  if (isModal) {
    const QUERY = query ? query : '[id^=modal-container]';
    previousActionFormDataElems = document.querySelectorAll(
      `${QUERY} [${ACTION_FORM_DATA_ATTR_KEY}]`,
    );
    previousActionResponseElems = document.querySelectorAll(
      `${QUERY} [${ACTION_RESPONSE_ATTR_KEY}]`,
    );
    browserStorageElems = document.querySelectorAll(`${QUERY} [${BROWSER_STORAGE_ATTR_KEY}]`);
    queryParamsElems = document.querySelectorAll(`${QUERY} [${QUERY_PARAMS_ATTR_KEY}]`);
    bslElems = document.querySelectorAll(`${QUERY} [${BROWSER_STORAGE_LOCATION_KEY}]`);
  }
  renderBrowserSessionDataIntoElements(
    previousActionResponseElems,
    ACTION_RESPONSE_KEY,
    ACTION_RESPONSE_ATTR_KEY,
  );
  renderBrowserSessionDataIntoElements(
    previousActionFormDataElems,
    ACTION_FORM_DATA_KEY,
    ACTION_FORM_DATA_ATTR_KEY,
  );
  renderBrowserStorageDataIntoElements(
    browserStorageElems,
    BROWSER_STORAGE_KEY_ATTR_KEY,
    BROWSER_STORAGE_ATTR_KEY,
    projectConstant,
    environments,
  );
  renderQueryParamsDataIntoElements(queryParamsElems, QUERY_PARAMS_ATTR_KEY);
  renderBSLDataIntoElements(
    bslElems,
    BROWSER_STORAGE_LOCATION_KEY,
    BROWSER_STORAGE_LOCATION_PATH_KEY,
  );
};

const loadSnipcartItemData = (element, itemData) => {
  const itemName = elementAttribute(element, 'data-item-name');
  const itemPrice = elementAttribute(element, 'data-item-price');
  const itemDescription = elementAttribute(element, 'data-item-description');
  const itemImageURL = elementAttribute(element, 'data-item-image');
  const collectionName = elementAttribute(element, 'data-collection-id');
  const previewIcon = elementAttribute(element, 'data-preview-icon');

  if (itemData[itemName]) {
    element.setAttribute('data-item-name', itemData[itemName]);
  }
  if (itemData[itemPrice]) {
    element.setAttribute('data-item-price', itemData[itemPrice]);
  }
  if (itemData[itemDescription]) {
    element.setAttribute('data-item-description', itemData[itemDescription]);
  }
  if (itemData[itemImageURL]) {
    if (typeof itemData[itemImageURL] === 'object') {
      const imgSrcURL = previewIcon
        ? itemData[itemImageURL][previewIcon]
        : itemData[itemImageURL].isPrivate === true
        ? `https://drapcode-static.s3.amazonaws.com/img/placeholder-img.png`
        : imageServerUrl() + itemData[itemImageURL].key;
      element.setAttribute('data-item-image', imgSrcURL);
      if (itemData[itemImageURL].isPrivate === true) {
        addDownloadAttributeForPrivateFiles(element, itemData[itemImageURL], itemData.uuid);
      }
    } else {
      element.setAttribute('data-item-image', itemData[itemImageURL]);
    }
  }
  if (itemData['uuid'] && itemData[itemPrice]) {
    element.setAttribute(
      'data-item-url',
      `${collectionName}/${itemData['uuid']}/${itemData[itemPrice]}/validate-product.json`,
    );
  }
};

const renderBrowserSessionDataIntoElements = (sessionAttrElems, sessionKey, sessionElemKey) => {
  if (sessionAttrElems) {
    const browserSessionData = sessionStorage.getItem(sessionKey);
    if (browserSessionData && browserSessionData !== 'undefined') {
      const browserSessionDataJson = JSON.parse(browserSessionData);
      sessionAttrElems.forEach((element) => {
        //TODO: this style is temporary solution to show hidden element which we hide on proejct build->
        const isParentDataGroup = !!element.closest(`[data-js="data-group"] `);
        if (!isParentDataGroup) {
          //default text does not appear on page load
          element.style.display = 'block';
          const fieldName = element.getAttribute(sessionElemKey);
          if (element?.tagName === 'IMG' || element?.tagName === 'IFRAME') {
            let imageSrcUrl = fieldName ? _.get(browserSessionDataJson, fieldName.trim()) : '';
            element.src = imageSrcUrl;
          } else {
            let fieldValue =
              browserSessionDataJson && fieldName
                ? _.get(browserSessionDataJson, fieldName.trim())
                : '';
            element.textContent = fieldValue ? fieldValue : '';
          }
        }
      });
    }
  }
};

const renderBrowserStorageDataIntoElements = (
  browserAttrElems,
  storageAttrKey,
  storageElemKey,
  projectConstant,
  environments,
) => {
  if (browserAttrElems) {
    browserAttrElems.forEach((element) => {
      const storageKey = element.getAttribute(storageAttrKey);
      const browserStorageData = localStorage.getItem(storageKey);
      if (browserStorageData && browserStorageData !== 'undefined') {
        let browserStorageDataJson = parseLSJSONStrToJSON(storageKey);
        const isParentDataGroup = !!element.closest(`[data-js="data-group"] `);
        if (!isParentDataGroup) {
          element.style.display = 'block';
          const fieldName = element.getAttribute(storageElemKey);
          if (element?.tagName === 'IMG' || element?.tagName === 'IFRAME') {
            let imageSrcUrl = fieldName ? _.get(browserStorageDataJson, fieldName.trim()) : '';
            element.src = imageSrcUrl;
          } else {
            let fieldValue =
              browserStorageDataJson && fieldName
                ? parseValueFromData(
                    browserStorageDataJson,
                    fieldName.trim(),
                    projectConstant,
                    environments,
                  )
                : '';
            element.textContent = fieldValue ? fieldValue : '';
          }
        }
      }
    });
  }
};

const renderQueryParamsDataIntoElements = (queryParamsElems, queryParamsAttrKey) => {
  try {
    if (!queryParamsElems || !queryParamsElems.length) {
      console.log('No queryParamsElements found.');
      return;
    }
    const urlParams = getURLParams();
    if (!urlParams) return;
    queryParamsElems.forEach((element) => {
      const paramName = element.getAttribute(queryParamsAttrKey);
      const paramValue = urlParams[paramName];
      if (paramValue && paramValue !== 'undefined') {
        const isParentDataGroup = !!element.closest(`[data-js="data-group"]`);
        if (!isParentDataGroup) {
          element.style.display = 'block';
          if (element?.tagName === 'IMG' || element?.tagName === 'IFRAME') {
            element.src = paramValue;
          } else {
            let fieldValue = paramValue ? paramValue : '';
            element.textContent = fieldValue ? fieldValue : '';
          }
        }
      }
    });
  } catch (error) {
    console.error('Error in renderQueryParamsDataIntoElements', error);
  }
};

// Browser Storage Location Data
const renderBSLDataIntoElements = (sessionAttrElems, bslKey, bslPath) => {
  if (sessionAttrElems) {
    sessionAttrElems.forEach((element) => {
      const isParentDataGroup = !!element.closest(`[data-js="data-group"] `);
      if (!isParentDataGroup) {
        let bslDataValue = '';
        const bslKeyValue = element.getAttribute(bslKey);
        const bslPathValue = element.getAttribute(bslPath);
        let browserStorageData = getBSLData(bslKeyValue);
        if (browserStorageData) {
          bslDataValue =
            browserStorageData && bslPathValue
              ? _.get(browserStorageData, bslPathValue.trim())
              : '';
        }
        if (element?.tagName === 'IMG' || element?.tagName === 'IFRAME') {
          let imageSrcUrl = bslDataValue || '';
          element.src = imageSrcUrl;
        } else {
          let fieldValue = bslDataValue || '';
          element.textContent = fieldValue ? fieldValue : '';
        }
        //TODO: this style is temporary solution to show hidden element which we hide on project build->
        element.style.display = 'block';
      }
    });
  }
};

function checkAndLoadProjectEnv() {
  const timezoneElem = document.getElementById('project-timezone');
  const currentEnv = timezoneElem && timezoneElem.getAttribute('data-projectenv');
  if (!localStorage.getItem('environment')) {
    localStorage.setItem('environment', currentEnv);
  }
}

const replaceContentOfAllProgressBar = (pageItemData, pageCollectionId) => {
  // Value Constant
  const PROGRESS_VALUE_PAGE_COLLECTION_KEY = `progress-value-${pageCollectionId}`;
  const PROGRESS_VALUE_SESSION_KEY = 'progress-value-session';
  const PROGRESS_VALUE_SESSION_TENANT_KEY = 'progress-value-session-tenant';
  const PROGRESS_VALUE_ACTION_RESPONSE_KEY = 'progress-value-previous-action-response';
  const PROGRESS_VALUE_ACTION_FORM_DATA_KEY = 'progress-value-previous-action-formdata';
  const PROGRESS_VALUE_BROWSER_STORAGE_KEY_ATTR_KEY = 'progress-value-storage-key';
  const PROGRESS_VALUE_BROWSER_STORAGE_ATTR_KEY = 'progress-value-browser-storage';

  // Total Constant
  const PROGRESS_TOTAL_PAGE_COLLECTION_KEY = `progress-total-${pageCollectionId}`;
  const PROGRESS_TOTAL_SESSION_KEY = 'progress-total-session';
  const PROGRESS_TOTAL_SESSION_TENANT_KEY = 'progress-total-session-tenant';
  const PROGRESS_TOTAL_ACTION_RESPONSE_KEY = 'progress-total-previous-action-response';
  const PROGRESS_TOTAL_ACTION_FORM_DATA_KEY = 'progress-total-previous-action-formdata';
  const PROGRESS_TOTAL_BROWSER_STORAGE_KEY_ATTR_KEY = 'progress-total-storage-key';
  const PROGRESS_TOTAL_BROWSER_STORAGE_ATTR_KEY = 'progress-total-browser-storage';

  const query = `[${PROGRESS_VALUE_PAGE_COLLECTION_KEY}], [${PROGRESS_VALUE_SESSION_KEY}],[${PROGRESS_VALUE_SESSION_TENANT_KEY}],[${PROGRESS_VALUE_ACTION_RESPONSE_KEY}],[${PROGRESS_VALUE_ACTION_FORM_DATA_KEY}],[${PROGRESS_VALUE_BROWSER_STORAGE_ATTR_KEY}],[${PROGRESS_VALUE_BROWSER_STORAGE_KEY_ATTR_KEY}]`;
  const progressBarHtml = document.querySelectorAll(query);
  if (progressBarHtml.length) {
    let loggedInUser = parseLSJSONStrToJSON('user');
    let loggedInTenant = parseLSJSONStrToJSON('tenant');
    let loggedInUserSetting = parseLSJSONStrToJSON('userSetting');

    const browserSessionResponseData = sessionStorage.getItem('data-previous-action-response')
      ? JSON.parse(sessionStorage.getItem('data-previous-action-response'))
      : '';
    const browserSessionFormData = sessionStorage.getItem('data-previous-action-response')
      ? JSON.parse(sessionStorage.getItem('data-previous-action-response'))
      : '';

    [
      {
        item: pageItemData,
        valueKey: PROGRESS_VALUE_PAGE_COLLECTION_KEY,
        totalKey: PROGRESS_TOTAL_PAGE_COLLECTION_KEY,
      },
      {
        item: loggedInUser,
        valueKey: PROGRESS_VALUE_SESSION_KEY,
        totalKey: PROGRESS_TOTAL_SESSION_KEY,
      },
      {
        item: loggedInTenant,
        valueKey: PROGRESS_VALUE_SESSION_TENANT_KEY,
        totalKey: PROGRESS_TOTAL_SESSION_TENANT_KEY,
      },
      {
        item: loggedInUserSetting,
        valueKey: PROGRESS_VALUE_SESSION_TENANT_KEY,
        totalKey: PROGRESS_TOTAL_SESSION_TENANT_KEY,
      },
      {
        item: browserSessionResponseData,
        valueKey: PROGRESS_VALUE_ACTION_RESPONSE_KEY,
        totalKey: PROGRESS_TOTAL_ACTION_RESPONSE_KEY,
      },
      {
        item: browserSessionFormData,
        valueKey: PROGRESS_VALUE_ACTION_FORM_DATA_KEY,
        totalKey: PROGRESS_TOTAL_ACTION_FORM_DATA_KEY,
      },
    ].forEach(({ item, valueKey, totalKey }) => {
      if (item && item !== 'undefined')
        replaceContentOfProgressBarFromItem(item, valueKey, totalKey);
    });
    replaceContentOfProgressBarFromEntity(
      PROGRESS_VALUE_BROWSER_STORAGE_KEY_ATTR_KEY,
      PROGRESS_VALUE_BROWSER_STORAGE_ATTR_KEY,
      PROGRESS_TOTAL_BROWSER_STORAGE_KEY_ATTR_KEY,
      PROGRESS_TOTAL_BROWSER_STORAGE_ATTR_KEY,
    );
    progressBarHtml.forEach((element) => {
      let value = element.getAttribute('value');
      let total = element.getAttribute('total');
      replaceContentOfProgressBar(element, value, total);
    });
  }
};
const replaceContentOfProgressBarFromEntity = (
  valueStorageAttrKey,
  valueStorageElemKey,
  totalStorageAttrKey,
  totalStorageElemKey,
) => {
  let valueElems = document.querySelectorAll(`[${valueStorageAttrKey}]`);
  let totalElems = document.querySelectorAll(`[${totalStorageAttrKey}]`);
  let attrElems = [...new Set([...valueElems, ...totalElems])];
  if (attrElems) {
    attrElems.forEach((element) => {
      const valueStorageKey = element.getAttribute(valueStorageAttrKey);
      const totalStorageKey = element.getAttribute(totalStorageAttrKey);
      let valueBrowserStorageDataJson,
        totalBrowserStorageDataJson = '';
      if (valueStorageKey === totalStorageKey) {
        const browserStorageData = localStorage.getItem(valueStorageKey);
        valueBrowserStorageDataJson =
          browserStorageData && browserStorageData !== 'undefined'
            ? JSON.parse(browserStorageData)
            : '';
        totalBrowserStorageDataJson = valueBrowserStorageDataJson;
      } else {
        const valueBrowserStorageData = localStorage.getItem(valueStorageKey);
        const totalBrowserStorageData = localStorage.getItem(totalStorageKey);
        valueBrowserStorageDataJson =
          valueBrowserStorageData && valueBrowserStorageData !== 'undefined'
            ? JSON.parse(valueBrowserStorageData)
            : '';
        totalBrowserStorageDataJson =
          totalBrowserStorageData && totalBrowserStorageData !== 'undefined'
            ? JSON.parse(totalBrowserStorageData)
            : '';
      }
      const progressValue = element.getAttribute(`${valueStorageElemKey}`);
      const progressTotal = element.getAttribute(`${totalStorageElemKey}`);
      const value =
        progressValue && progressValue !== 'undefined' && valueBrowserStorageDataJson[progressValue]
          ? valueBrowserStorageDataJson[progressValue]
          : '';
      const total =
        progressTotal && progressTotal !== 'undefined' && totalBrowserStorageDataJson[progressTotal]
          ? totalBrowserStorageDataJson[progressTotal]
          : '';
      if (value) element.setAttribute('value', value);
      if (total) element.setAttribute('total', total);
    });
  }
};

const replaceContentOfProgressBarFromItem = (itemData, valueKey, totalKey) => {
  let valueElems = document.querySelectorAll(`[${valueKey}]`);
  let totalElems = document.querySelectorAll(`[${totalKey}]`);
  let attrElems = [...new Set([...valueElems, ...totalElems])];
  if (attrElems) {
    if (itemData && itemData !== 'undefined') {
      attrElems.forEach((element) => {
        const progressValue = element.getAttribute(`${valueKey}`);
        const progressTotal = element.getAttribute(`${totalKey}`);
        const value =
          progressValue && progressValue !== 'undefined' && itemData[progressValue]
            ? itemData[progressValue]
            : '';
        const total =
          progressTotal && progressTotal !== 'undefined' && itemData[progressTotal]
            ? itemData[progressTotal]
            : '';
        if (value) element.setAttribute('value', value);
        if (total) element.setAttribute('total', total);
      });
    }
  }
};

const replaceContentOfProgressBar = (htmlElement, value, total) => {
  if (!total) {
    const PROGRESS_VALUE_TOTAL_KEY = 'progress-total';
    const progressTotal = htmlElement.getAttribute(PROGRESS_VALUE_TOTAL_KEY);
    total = progressTotal ? progressTotal : 100;
  }
  if (!value) value = 0;
  let progressPercentage = 0;
  progressPercentage = (100 * value) / total;
  progressPercentage = progressPercentage ? progressPercentage.toFixed(2) : 0;
  htmlElement.setAttribute('style', `width:${progressPercentage}% !important`);
};

const getHostnameShort = () => {
  const urlObj = new URL(window.location.href);
  let { hostname } = urlObj || '';
  hostname = hostname ? hostname.split('.')[0] : '';
  return hostname;
};

const populateBrowserStorageKeyToReset = (key, isDetailPage = false) => {
  const RESET_SESSION_KEYS = isDetailPage ? '__resetK_dp' : '__resetK';
  let sessionResetKey = sessionStorage.getItem(RESET_SESSION_KEYS);
  if (sessionResetKey) {
    let resetKeys = sessionResetKey;
    if (!sessionResetKey.includes(key)) {
      resetKeys += `,${key}`;
    }
    sessionStorage.setItem(RESET_SESSION_KEYS, resetKeys);
  } else {
    sessionStorage.setItem(RESET_SESSION_KEYS, key);
  }
};
// TODO: Need to review this and modify this general use case
// const replaceItemAndCollectionInForm = (
//   form,
//   dataGroupData,
//   pageData,
//   userData = {},
//   tenantData = {},
// ) => {
//   let getDataItemIdFrom = form.getAttribute('getdataitemidfrom');
//   let method = form.getAttribute('method');
//   let itemIdField = form.getAttribute('itemidfield');
//   let itemIdAttr = '';
//   let itemData = null;
//   if (method && method.toUpperCase() === 'PUT' && getDataItemIdFrom) {
//     switch (getDataItemIdFrom) {
//       case 'PAGE_COLLECTION':
//         itemData = pageData;
//         break;
//       case 'CURRENT_USER_FIELD':
//         itemData = userData;
//         break;
//       case 'CURRENT_TENANT_FIELD':
//         itemData = tenantData;
//         break;
//       default:
//         itemData = dataGroupData;
//         break;
//     }
//   }
//   if (itemIdField) {
//     if (itemData) {
//       if (itemIdField.includes('.')) {
//         let itemIdFieldArr = itemIdField.split('.');
//         let itemFieldName = itemIdFieldArr[0];
//         if (itemData[itemFieldName]) {
//           if (typeof itemData[itemFieldName][0] === 'object') {
//             itemIdField = itemIdFieldArr.join('.0.');
//             itemIdAttr = _.get(itemData, itemIdField);
//           } else {
//             itemIdAttr = itemData[itemFieldName][0] ? itemData[itemFieldName][0] : '';
//           }
//         } else itemIdAttr = '';
//       } else itemIdAttr = _.get(itemData, 'uuid');
//     } else itemIdAttr = '';
//   } else itemIdAttr = itemData ? _.get(itemData, 'uuid') : '';

//   let collectionId = form.getAttribute('data-form-collection');
//   collectionId = collectionId ? collectionId : '';
//   const allButtons = form.querySelectorAll('a, button');
//   allButtons.forEach((elem) => {
//     if (itemIdAttr) elem.setAttribute('data-item-id', itemIdAttr);
//     if (collectionId) elem.setAttribute('data-collection-id', collectionId);
//   });
// };
