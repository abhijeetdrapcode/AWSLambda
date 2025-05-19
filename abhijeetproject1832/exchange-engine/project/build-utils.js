import fs from 'fs';
import { formatCustomCSSClasses, replaceValueFromSource } from 'drapcode-utility';
import { plugins } from 'drapcode-plugin';
import { parse } from 'node-html-parser';
import hbs from 'hbs';
import {
  replaceNbsps,
  defaultHeaderJS,
  defaultHeaderCSS,
  defaultMetaTags,
  defaultFonts,
  getAssetLink,
  primaryBodyJS,
} from 'drapcode-constant';
import { dynamicSort } from '../utils/appUtils';
import UglifyJS from 'uglify-js';
const CleanCSS = require('clean-css');
export const regex = /<script\b[^>]*>([\s\S]*?)<\/script>/gm;
const path = require('path');

export const socialScript = `<script>
      // Can be Refactor Further
const unpacker = (str) => {
  const mess = str.replace(/-/g, '+').replace(/_/g, '/').replace(/,/g, '=');
  const text = atob(mess);
  return JSON.parse(text);
};
window.addEventListener('load', () => {
  const currentUrl = window.location.href;
  const url = new URL(currentUrl);
  const params = url.searchParams;
  const errorValue = params.get('error');
  if (errorValue) {
    const errorData = unpacker(errorValue);
    const { error } = errorData;
    toastr.error(error ? error : 'Failed to Authenticate', 'Error');
    window.open('/login', '_self');
  }
  const infoValue = params.get('info');
  const infoData = unpacker(infoValue);
  const { data } = infoData;
  if (data) {
    const { token,oAuthAccessToken, projectId, role, tenant, userSetting, userDetails, eventConfig, error } = data;
    const {
      type,
      successRedirectUrl,
      errorRedirectUrl,
      successMessage,
      errorMessage,
      successRedirectRules,
    } = eventConfig;
    if (!error) {
      let localStorage = window.localStorage;
      localStorage.setItem('token', token);
      localStorage.setItem('oAuthAccessToken', oAuthAccessToken);
      localStorage.setItem('projectId', projectId);
      localStorage.setItem('role', role);
      setJsonInLocalStorage('user', userDetails);
      removeCookie('__dc_tId');
      if (tenant) {
        setJsonInLocalStorage('tenant', tenant);
        setCookie('__dc_tId', tenant.uuid, 1);
      } else localStorage.removeItem('tenant');
      if (userSetting) {
        setJsonInLocalStorage('userSetting', userSetting);
      } else localStorage.removeItem('userSetting');
       
      let successMSG = 'User Logged In Successfully.';
      let redirectURL = '';
      if (successMessage) successMSG = successMessage;
      toastr.success(successMSG, 'Success');
      if (type === 'SIGNUP') {
        redirectURL = successRedirectUrl;
      } else if (type === 'LOGIN') {
        const rule = successRedirectRules.find((red) => red.key === role);
        redirectURL = rule.value;
      }
      window.open(redirectURL, '_self');
    } else {
      let errorMSG = error ? error.message : 'Failed to ' + type[0] + type.slice(1).toLowerCase();
      if (errorMessage) errorMSG = errorMessage;
      toastr.error(errorMSG, 'Error');
      window.open(errorRedirectUrl, '_self');
    }
  }
});
      </script>`;

export const renderHeadSection = (
  mainPath,
  pluginsWithCssAndJs,
  plugins,
  page,
  project,
  environment,
  data,
) => {
  const { name, titleTag, description, pageImage, extraMetaTag } = page;
  // console.log('*** Preparing head section for a page:', name);
  const { loadingIconKey, notificationSetting } = project;
  let titleOfPage = 'DrapCode';
  if (titleTag) {
    titleOfPage = titleTag;
  } else {
    titleOfPage = `${name}`;
  }

  /**
   * Generate Meta Tags
   */
  const metaTags = [
    ...defaultMetaTags,
    ...createSocialSEOTags(
      titleOfPage,
      description,
      pageImage,
      `/${page.slug}.html`,
      project,
      data,
    ),
    extraMetaTag ? extraMetaTag : '<meta charset="UTF-8">',
  ];

  /**
   * Generate Header JS
   */
  let headerJS = [];
  headerJS.push(`<script>
      console.log('==> Going to remove __ssr_ keys from session storage...');
      Object.keys(window.sessionStorage).map(sessionKey => {
        if(sessionKey.startsWith('__ssr_')) {
        window.sessionStorage.removeItem(sessionKey);
        }
      })
    </script>`);
  if (loadingIconKey) {
    headerJS.push(`<script>
    window.addEventListener('DOMContentLoaded', (event) => {
      window.localStorage.setItem('loadingIconKey', '${loadingIconKey}')
  });
    </script>`);
  }
  if (notificationSetting) {
    headerJS.push(`<script>
    window.addEventListener('DOMContentLoaded', (event) => {
      window.localStorage.setItem('notificationSetting', '${JSON.stringify(notificationSetting)}')
  });
    </script>`);
  }
  addProjectCustomJSCdnToHeader(project, headerJS);

  if (!project.toggleUnloadDefaultJS) {
    headerJS.push(
      `<script type="text/javascript" src="${getAssetLink('js/jquery.min.js')}"></script>`,
    );
    headerJS.push(
      `<script src="https://code.jquery.com/ui/1.13.3/jquery-ui.min.js" integrity="sha256-sw0iNNXmOJbQhYFuC9OF2kOlD5KQKe1y5lfBn4C9Sjg=" crossorigin="anonymous"></script>`,
    );
  }

  const managedHeaderJS = [];
  handleDefaultHeaderJS(project, managedHeaderJS);
  headerJS.push(...managedHeaderJS);

  if (plugins.mapPlugin) {
    let { api_key } = plugins.mapPlugin.setting;
    api_key = replaceValueFromSource(api_key, environment, null);
    headerJS.push(
      `<script src="https://maps.googleapis.com/maps/api/js?key=${api_key}&libraries=&v=weekly" defer></script>`,
    );
  }

  if (pluginsWithCssAndJs) {
    // console.log('*** Adding pluginsWithCssAndJs...');
    pluginsWithCssAndJs.forEach((plugin) => {
      plugin.headerJs && plugin.headerJs.forEach((code) => headerJS.push(code));
    });
  }

  /**
   * Generate Header theme CSS
   */
  let headerThemeCSS = [];

  /**
   * Generate Fonts
   */
  let headerFonts = [];
  headerFonts.push(...defaultFonts);
  /**
   * Generate Header CSS
   */
  let headerCSS = [];

  const managedHeaderCSS = [];
  handleDefaultHeaderCSS(project, managedHeaderCSS);
  headerCSS.push(...managedHeaderCSS);

  //To add condition Js And Css on bases of component
  if (plugins.snipcartPlugin) {
    headerCSS.push(
      "<link rel='stylesheet' href='https://cdn.snipcart.com/themes/v3.3.1/default/snipcart.css' />",
    );
  }
  if (plugins.bngPaymentPlugin) {
    let {
      setting: { checkoutKey },
    } = plugins.bngPaymentPlugin;
    checkoutKey = replaceValueFromSource(checkoutKey, environment, null);
    headerJS.push(`<script src="https://secure.bngpaymentgateway.com/token/CollectCheckout.js" data-checkout-key="${checkoutKey}">
    </script>`);
  }

  if (page && page.content && page.content['nocode-html']) {
    let pageContent = page.content['nocode-html']
      ? page.content['nocode-html'].replace(regex, '')
      : '';
    pageContent = replaceNbsps(pageContent);
    const hasDynamicDataTable = pageContent.includes('data-js="data-table-dynamic"');
    if (hasDynamicDataTable) {
      headerCSS.push(
        '<link rel="stylesheet" href="https://cdn.datatables.net/1.13.2/css/jquery.dataTables.min.css" />',
      );
      headerCSS.push(
        '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/5.2.0/css/bootstrap.min.css" />',
      );
      headerCSS.push(
        '<link rel="stylesheet" href="https://cdn.datatables.net/1.13.2/css/dataTables.bootstrap5.min.css" />',
      );
    }
    headerCSS.push(
      '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/timepicker@1.14.1/jquery.timepicker.min.css" />',
    );
  }

  if (project.enablePWA) {
    headerCSS.push("<link rel='manifest' href='/manifest.webmanifest.json/'>");
  }

  addProjectCustomCSSCdn(project, headerCSS, headerThemeCSS);

  //Add CSS file if Project has Custom CSS or Custom CSS Classes
  addProjectCustomCSSContent(project, headerCSS, mainPath);

  return {
    headerFonts,
    headerCSS,
    headerJS,
    metaTags,
    titleOfPage,
    headerThemeCSS,
  };
};

const addProjectCustomCSSContent = (project, headerCSS, filePath) => {
  try {
    const { content, customCSSClasses } = project;
    let projectCustomCSS = content && content.customCSS ? `${content.customCSS}` : '';
    let projectCustomCSSMinified = new CleanCSS().minify(projectCustomCSS);

    let projectCustomCSSClasses = customCSSClasses ? customCSSClasses : [];
    let projectCustomCSSClassesMinified = new CleanCSS().minify(
      formatCustomCSSClasses(projectCustomCSSClasses),
    );

    if (projectCustomCSSMinified || projectCustomCSSClassesMinified) {
      const fileName = `${project.seoName}-custom.min.css`;
      const refStaticPath = `${filePath}views`;
      if (!fs.existsSync(refStaticPath)) {
        fs.mkdirSync(refStaticPath);
      }
      const refPath = `${refStaticPath}/${project.uuid}`;
      if (!fs.existsSync(refPath)) {
        fs.mkdirSync(refPath);
      }

      if (fs.existsSync(`${refPath}/${fileName}`)) {
        fs.unlinkSync(`${refPath}/${fileName}`);
      }

      fs.writeFileSync(
        `${refPath}/${fileName}`,
        projectCustomCSSMinified.styles + projectCustomCSSClassesMinified.styles,
        (err) => {
          if (err) {
            console.error('Failed to save file ', err);
            return;
          }
        },
      );

      headerCSS.push(
        `<link rel='stylesheet' type='text/css' href=${`/static/${project.uuid}/${fileName}`}>`,
      );
    }
  } catch (error) {
    console.error(error);
  }
};
export const cleanProjectFolder = (folder, projectPath) => {
  const refPath = `${folder}views/${projectPath}`;
  if (fs.existsSync(refPath)) {
    fs.rmSync(refPath, { recursive: true, force: true });
    fs.mkdirSync(refPath);
  }
};
export const filterExtension = (extensions) => {
  console.log('extensions', JSON.stringify(extensions));
  const pluginsWithCssAndJs = [];

  extensions.forEach((obj1) => {
    let isExist;
    plugins.some((obj2) => {
      if (obj1.code === obj2.code) {
        isExist = obj2;
      }
    });
    if (isExist) pluginsWithCssAndJs.push(isExist);
  });
  return pluginsWithCssAndJs;
};
export const extractHtmlCssAndJsFromSnippets = (snippets) => {
  const newSnippets = [];
  snippets.forEach((snippet) => {
    const { uuid, snippetType, content, name } = snippet;
    if (content) {
      const htmlContent = content['nocode-html'];
      if (htmlContent && htmlContent !== 'undefined') {
        let snippetContent = htmlContent.replace(regex, '');
        snippetContent = replaceNbsps(snippetContent);
        const snippetCss = content['nocode-css'];
        const snippetScripts = regex.exec(htmlContent);

        let cleanedScripts = snippetScripts && snippetScripts.length ? snippetScripts[1] : '';
        if (snippetType === 'SNIPPET') {
          const { customScript } = snippet || {};
          if (typeof customScript !== 'undefined') {
            cleanedScripts += customScript;
          }
        }
        newSnippets.push({
          uuid,
          snippetType,
          name,
          snippetContent,
          snippetScript: cleanedScripts,
          snippetCss,
        });
      }
    }
  });
  return newSnippets;
};
const createSocialSEOTags = (title, description, pageImage, url, project, data) => {
  const metaTags = [`<meta property="og:type" content="website">`];
  if (title) {
    metaTags.push(`<meta name="title" content="${title}">`);
    metaTags.push(`<meta property="og:title" content="${title}">`);
    metaTags.push(`<meta property="twitter:title" content="${title}">`);
  }

  const pageDescription = description ? description : project.description;

  if (pageDescription) {
    metaTags.push(`<meta name="description" content="${pageDescription}">`);
    metaTags.push(`<meta property="og:description" content="${pageDescription}">`);
    metaTags.push(`<meta property="twitter:description" content="${pageDescription}">`);
  }

  let seoImage = 'https://drapcode.com/img/DrapCode-Icon-Dark.png';
  if (pageImage) {
    seoImage = `${process.env.S3_BUCKET_URL}/${pageImage}`;
  } else if (data && data.projectLogoKeyName) {
    seoImage = `${process.env.S3_BUCKET_URL}/${data.projectLogoKeyName}`;
  } else if (project.projectLogoKeyName) {
    seoImage = `${process.env.S3_BUCKET_URL}/${project.projectLogoKeyName}`;
  }

  if (seoImage) {
    metaTags.push(`<meta property="og:image" content="${seoImage}">`);
    metaTags.push(`<meta property="twitter:image" content="${seoImage}">`);
  }

  if (url) {
    metaTags.push(`<meta property="og:url" content="${url}">`);
    metaTags.push(`<meta property="twitter:url" content="${url}">`);
  }

  return metaTags;
};

const addProjectCustomJSCdnToHeader = (project, headerJS) => {
  // console.log('*** Adding project custom js cdns to head...');
  try {
    project.customJsCdns &&
      project.customJsCdns.sort(dynamicSort('sortOrder')).map((customJsCdn) => {
        if (customJsCdn.addToHead && customJsCdn.urlOrTag.startsWith('<script')) {
          headerJS.push(customJsCdn.urlOrTag);
        } else if (
          (customJsCdn.addToHead && customJsCdn.urlOrTag.startsWith('http')) ||
          customJsCdn.urlOrTag.startsWith('ftp')
        ) {
          headerJS.push(`<script src='${customJsCdn.urlOrTag}' defer></script>`);
        }
      });
  } catch (error) {
    console.error(error);
  }
};

const handleDefaultHeaderJS = (project, managedHeaderJS) => {
  let systemDefaultBootstrapJsExists = false;

  project.customJsCdns.forEach((customJsCdn) => {
    if (
      customJsCdn.customType === 'SYSTEM_DEFAULT' &&
      customJsCdn.urlOrTag.includes('bootstrap.bundle.min.js')
    ) {
      systemDefaultBootstrapJsExists = true;
    }
  });

  defaultHeaderJS.forEach((headerJS) => {
    if (headerJS.includes('bootstrap.min.js')) {
      if (
        !systemDefaultBootstrapJsExists &&
        !(project.toggleUnloadDefaultJS && project.toggleUnloadDefaultCSS)
      ) {
        switch (project.uiFrameworkVersion) {
          case '4.5':
            managedHeaderJS.push(
              '<script type="text/javascript" src="https://cdn.jsdelivr.net/npm/bootstrap@4.5.3/dist/js/bootstrap.bundle.min.js" defer></script>',
            );
            break;
          case '4.6':
            managedHeaderJS.push(
              '<script type="text/javascript" src="https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/js/bootstrap.bundle.min.js" defer></script>',
            );
            break;
          case '5.2':
            managedHeaderJS.push(
              '<script type="text/javascript" src="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/js/bootstrap.bundle.min.js" defer></script>',
            );
            break;
          default:
            managedHeaderJS.push(headerJS);
            break;
        }
      }
    } else {
      /**
       * Polyfill JS is flagged by Google for security issue
       * resulting in disapproving Google Ads
       * TODO: Remove polyfill.min.js from common modules after testing.
       *  */
      if (!headerJS.includes('polyfill.min.js')) {
        managedHeaderJS.push(headerJS);
      }
    }
  });
};
const handleDefaultHeaderCSS = (project, managedHeaderCSS) => {
  let systemDefaultBootstrapExists = false;
  let systemDefaultDcCustomExists = false;
  let globalThemeExist = false;
  project.customCssCdns.forEach((customCssCdn) => {
    if (customCssCdn.customType === 'SYSTEM_DEFAULT') {
      if (customCssCdn.urlOrTag.includes('bootstrap.min.css')) {
        systemDefaultBootstrapExists = true;
      }
      if (customCssCdn.urlOrTag.includes('dc-custom.min.css')) {
        systemDefaultDcCustomExists = true;
      }
    }

    if (customCssCdn.customType === 'GLOBAL_THEME') {
      globalThemeExist = true;
    }
  });

  defaultHeaderCSS.forEach((headerCSS) => {
    if (headerCSS.includes('bootstrap.min.css')) {
      if (!systemDefaultBootstrapExists && !project.toggleUnloadDefaultCSS && !globalThemeExist) {
        switch (project.uiFrameworkVersion) {
          case '4.5':
            managedHeaderCSS.push(
              '<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/bootstrap@4.5.3/dist/css/bootstrap.min.css">',
            );
            break;
          case '4.6':
            managedHeaderCSS.push(
              '<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/css/bootstrap.min.css">',
            );
            break;
          case '5.2':
            managedHeaderCSS.push(
              '<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/css/bootstrap.min.css">',
            );
            break;
          default:
            managedHeaderCSS.push(headerCSS);
            break;
        }
      }
    } else if (headerCSS.includes('dc-custom.min.css')) {
      if (!systemDefaultDcCustomExists) {
        managedHeaderCSS.push(headerCSS);
      }
    } else {
      managedHeaderCSS.push(headerCSS);
    }
  });
};
export const generateCustomThemeCSS = (theme) => {
  return `
  body{color:${theme.body.color};background-color:${theme.body.backgroundColor}}a{color:${theme.body.anchor}}a:hover{color:${theme.body.anchorHover}}h1,h2,h3,h4,h5,h6{font-family:${theme.headingFont.value}}body{font-family:${theme.bodyFont.value}}.btn-primary{background-color:${theme.colors.primary}}.btn-primary:hover{background-color:${theme.hoverColors.primary}}.btn-danger{background-color:${theme.colors.danger}}.btn-danger:hover{background-color:${theme.hoverColors.danger}}.btn-success{background-color:${theme.colors.success}}.btn-success:hover{background-color:${theme.hoverColors.success}}.btn-warning{background-color:${theme.colors.warning}}.btn-warning:hover{background-color:${theme.hoverColors.warning}}.btn-info{background-color:${theme.colors.info}}.btn-info:hover{background-color:${theme.hoverColors.info}}.btn-light{background-color:${theme.colors.light}}.btn-light:hover{background-color:${theme.hoverColors.light}}.btn-dark{background-color:${theme.colors.dark}}.btn-dark:hover{background-color:${theme.hoverColors.dark}}.btn-link{color:${theme.colors.link}}.btn-link:hover{color:${theme.hoverColors.link}}
  `;
};
const addProjectCustomCSSCdn = (project, headerCSS, headerThemeCSS) => {
  // console.log('*** Adding project custom css cdns...', project);
  try {
    const { customCssCdns, customThemeProps } = project;
    if (customCssCdns) {
      const sortedCssCdns = project.customCssCdns.sort(dynamicSort('sortOrder'));

      sortedCssCdns.forEach((customCssCdn) => {
        if (customCssCdn.customType === 'SYSTEM_DEFAULT') {
          headerCSS.unshift(`<link rel="stylesheet" href='${customCssCdn.urlOrTag}' crossorigin/>`);
        } else {
          if (customCssCdn.urlOrTag.startsWith('<link')) {
            headerCSS.push(customCssCdn.urlOrTag);
          } else if (
            customCssCdn.urlOrTag.startsWith('http') ||
            customCssCdn.urlOrTag.startsWith('ftp')
          ) {
            headerCSS.push(`<link rel="stylesheet" href='${customCssCdn.urlOrTag}' crossorigin/>`);
          }
        }
      });
    }
    if (customThemeProps && Object.keys(customThemeProps).length > 0) {
      const themeCSS = generateCustomThemeCSS(customThemeProps);
      headerThemeCSS.push(`<style>${themeCSS}</style>`);
    }
  } catch (error) {
    console.error('Error adding project custom CSS CDNs:', error);
  }
};
export const atomChatPluginScript = (api_id, auth_key) => {
  return `<script>
      let user = localStorage.getItem('user');
      console.log('user :>> ', user);
      user = JSON.parse(user);
      if (user) {
        const { userRoles, userName, uuid, first_name, last_name } = user;
        var chat_appid = '${api_id}';
        var chat_auth = '${auth_key}';
        var chat_id = user.uuid;
        var chat_name = user.first_name + ' ' + user.last_name;
        var chat_role = user.userRoles[0];
  
        var chat_js = document.createElement('script'); 
        chat_js.type = 'text/javascript'; 
        chat_js.src = 'https://fast.cometondemand.net/'+chat_appid+'x_xchatx_xcorex_xembedcode.js';
        chat_js.onload = function() {
          var chat_iframe = {};
          chat_iframe.module="synergy";
          chat_iframe.style="min-height:100%; min-width:100%;";
          chat_iframe.src='https://'+chat_appid+'.cometondemand.net/cometchat_embedded.php'; 
          if(typeof(addEmbedIframe)=="function"){addEmbedIframe(chat_iframe);}
        }
        var chat_script = document.getElementsByTagName('script')[0];
        chat_script.parentNode.insertBefore(chat_js, chat_script);
      }
      </script>`;
};

export const checkAndExtractComponent = (pageContent) => {
  if (pageContent === undefined || pageContent === null) {
    return [];
  }
  if (pageContent['nocode-components'] === undefined || !pageContent['nocode-components']) {
    return [];
  }
  const components = JSON.parse(pageContent['nocode-components']);
  if (!components || components.length === 0) {
    return [];
  }
  const listComponents = [];
  extractAllComponent(listComponents, components);
  return listComponents;
};

const extractAllComponent = (listComponent, components) => {
  if (components) {
    components.forEach((component) => {
      if (component.components) {
        extractAllComponent(listComponent, component.components);
      }
      listComponent.push(component);
    });
  }
};

export const checkAndCreateValidationJS = (collections, listComponents) => {
  const allFormWithValidationAttrs = listComponents.filter((comp) => {
    if (comp && comp.attributes) {
      return Object.keys(comp.attributes).includes('data-form-validation');
    }
  });
  if (!allFormWithValidationAttrs) {
    return [];
  }
  const allValidations = [];
  allFormWithValidationAttrs.forEach((form) => {
    const { attributes } = form;
    const formId = attributes['id'];
    const collectionName = attributes['data-form-collection'];
    const validationUUID = attributes['data-form-validation'];
    const validation = findValidationOfCollection(collections, collectionName, validationUUID);
    if (validation) {
      const { validationRules } = validation;
      const rules = {};
      const messages = {};

      validationRules.forEach((valRul) => {
        const checkAlreadyExistRule = rules[valRul.field];

        if (checkAlreadyExistRule) {
          checkAlreadyExistRule[valRul.key] = valRul.value;
          rules[valRul.field] = checkAlreadyExistRule;
        } else {
          rules[valRul.field] = {
            [valRul.key]: valRul.value,
          };
        }
        const checkAlreadyExistMessage = messages[valRul.field];
        if (checkAlreadyExistMessage) {
          checkAlreadyExistMessage[valRul.key] = valRul.message;
          messages[valRul.field] = checkAlreadyExistMessage;
        } else {
          messages[valRul.field] = {
            [valRul.key]: valRul.message,
          };
        }
      });

      const validationDetail = { rules, messages };
      const formValidationStr = `$("#${formId}").validate(${JSON.stringify(validationDetail)});`;
      allValidations.push(`${formValidationStr}`);
    }
  });
  return allValidations;
};

const findValidationOfCollection = (collections, collectionName, validationUUID) => {
  const selectedCollection = collections.find(
    (collection) => collection.collectionName === collectionName,
  );
  if (selectedCollection) {
    const selectedValidation = selectedCollection.validations.find(
      (validation) => validation.uuid === validationUUID,
    );
    return selectedValidation;
  }
  return null;
};

export const findSnippetAndReplace = (htmlContent, snippets, componentScripts, componentStyles) => {
  if (snippets) {
    snippets.forEach((snippet) => {
      if (snippet) {
        const { uuid, snippetContent, snippetScript, snippetCss } = snippet;
        const root = parse(htmlContent);
        const snippetRef = root.querySelector(`[data-snippet-id=${uuid}]`);
        if (snippetRef) {
          const snippetRoot = parse(snippetContent);
          snippetRef.appendChild(snippetRoot);
          htmlContent = root.toString();
          if (snippetScript) {
            componentScripts.push(snippetScript);
          }
          if (snippetCss) {
            componentStyles.push(snippetCss);
          }
        }
      }
    });
  }

  return htmlContent;
};
export const addStyleNoneToCMS = (htmlContent) => {
  const root = parse(htmlContent);
  const dataGroups = root.querySelectorAll(
    `[data-js=data-group], [data-js=data-list], [data-row=generated]`,
  );
  if (dataGroups) {
    dataGroups.forEach((dgp) => {
      dgp.setAttribute('style', 'display:none;');
    });
  }

  return root.toString();
};

export const addLocalizationDataIntoElements = (htmlContent, localization) => {
  const LOCALIZATION_ELEMENT_KEY = 'data-localization-key';
  const root = parse(htmlContent);
  const localizationElements = root.querySelectorAll(`[${LOCALIZATION_ELEMENT_KEY}]`);
  if (localizationElements && localization) {
    localizationElements.forEach((element) => {
      const key = element.getAttribute(LOCALIZATION_ELEMENT_KEY);
      const value = key ? replaceValueFromLocalization(key, localization) : '';
      element.textContent = value ? value : '';
      element.setAttribute('style', 'display:;');
    });
  }

  return root.toString();
};
const replaceValueFromLocalization = (key, localization) => {
  const { languageKeyValues } = localization;
  const valueObj = languageKeyValues.find((obj) => obj.key === key);
  return valueObj ? valueObj.value : key;
};

export const addPageLayoutToPage = (pageLayoutContent, pageContent) => {
  let finalContent = pageContent;
  if (pageLayoutContent && pageContent) {
    let htmlContent = pageLayoutContent['nocode-html'].replace(regex, '');
    if (htmlContent) {
      htmlContent = replaceNbsps(htmlContent);
      const root = parse(htmlContent);
      if (root) {
        let pagePlaceholder = root.querySelectorAll(`[id="page-placeholder"]`);
        pagePlaceholder = pagePlaceholder[0];
        if (pagePlaceholder) {
          pagePlaceholder.innerHTML = finalContent;
          finalContent = root.toString();
        }
      }
    }
  }
  return finalContent;
};

export const renderScriptSection = (pluginsWithCssAndJs, pluginsWithAutoAddToBody) => {
  console.log('Render SCRIPT Section');
  let bodyJS = [];
  /**
   * TODO: Load Login Action JS when Login plugin is installed
   * Remove from primaryBodyJS
   */
  bodyJS.push(...primaryBodyJS);
  if (pluginsWithCssAndJs) {
    pluginsWithCssAndJs.forEach((plugin) => {
      console.log('ADD BODY JS::plugin.bodyJs', plugin.bodyJs);
      plugin.bodyJs &&
        plugin.bodyJs.forEach((code) => {
          console.log('ADD BODY JS::code', code);
          if (!code.includes('/resources/action')) {
            bodyJS.push(code.replace('/action', '/resources/action'));
          } else {
            bodyJS.push(code);
          }
        });
    });
  }

  pluginsWithAutoAddToBody &&
    pluginsWithAutoAddToBody.length &&
    pluginsWithAutoAddToBody.forEach((plugin) => {
      const { setting } = plugin;
      if (setting.code) {
        if (!setting.code.includes('/resources/action')) {
          bodyJS.push(setting.code.replace('/action', '/resources/action'));
        } else {
          bodyJS.push(setting.code);
        }
      }
    });

  return bodyJS;
};

export const addEventsScript = async (events, bodySectionOfPage, page) => {
  const { mainContent } = bodySectionOfPage;
  const { eventName } = page;
  const eventsContent = [];

  if (mainContent && events) {
    let pageContent = mainContent;

    if (pageContent && pageContent !== 'undefined') {
      // console.log('*** Adding events in a page...');
      events.forEach((event) => {
        let pageHasEvent = eventName && eventName === event.eventName;
        if (pageContent.includes(event.eventName) || pageHasEvent) {
          let eventScript = `async function ${event.eventName}(ev, url_params={}){
                            let element,targetElement, formID; 
                            if(ev){
                              element =  ev.target|| ev.srcElement ;
                              targetElement = ev.currentTarget ;
                              ev.preventDefault();
                              formID = element && element.id ? $("#"+element.id):'';
                            }
                            const ifValidToProcess = ev && ev.type === "submit" ? formID && formID.valid() && formID.validate().pendingRequest === 0 : true;
                            let formSubmitBtn;
                            let formSubmitBtnText;
                            if(formID){
                             formSubmitBtn = formID.find(':button[type=submit]');
                             formSubmitBtnText = formSubmitBtn.html()
                            }
                if(ifValidToProcess) {
                  let { dataset: targetElemDataset } = element || {};
                  let preventDblClick = false;
                  if (targetElemDataset && targetElemDataset.hasOwnProperty('preventDblclick')) {
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
                  formSubmitBtn && formSubmitBtn.prop('disabled', true);
                  formSubmitBtn && formSubmitBtn.empty().append("<i class='fa fa-spinner fa-spin'></i>");
                  let response= null;
                  try{`;
          event.actions
            .filter((action) => !!action.step)
            .sort((a, b) => {
              return a.step > b.step ? 1 : a.step == b.step ? 0 : -1;
            })
            .forEach((action) => {
              const { parameters, label } = action;
              let { enabledEnvironments, defaultEnabled, source } = action;
              defaultEnabled = typeof defaultEnabled === 'undefined' ? true : defaultEnabled;
              enabledEnvironments =
                typeof enabledEnvironments === 'undefined' ? [] : enabledEnvironments;
              source = source ? source : '';
              let args = {};
              parameters.forEach((parameter) => {
                args[parameter.name] = parameter.value;
              });
              const actionCalling = `
            if(response && response.status==='error' && ${action.name !== 'showAlertMessage'}){
              formSubmitBtn && formSubmitBtn.prop('disabled', false);
              formSubmitBtn && formSubmitBtn.html(formSubmitBtnText);
                         return;
                   }
            response = await ${action.name}({parameters:${JSON.stringify(
                args,
              )},response:response?response.data:'',element:element, targetElement:targetElement, url_params:url_params,defaultEnabled:${defaultEnabled},externalSource:'${source}',enabledEnvironments:${JSON.stringify(
                enabledEnvironments,
              )},actionLabel:'${label}'});`;
              eventScript += `\n  ${actionCalling}
            console.log(response);`;
            });
          eventScript += `
            formSubmitBtn && formSubmitBtn.prop('disabled', false);
            formSubmitBtn && formSubmitBtn.html(formSubmitBtnText);
          }
          catch(error){
            formSubmitBtn && formSubmitBtn.prop('disabled', false);
            formSubmitBtn && formSubmitBtn.html(formSubmitBtnText);  
              console.log("error", error);  
            }
          } else {
            console.log("I am submit event and not valid");
          }
        }`;

          eventScript = UglifyJS.minify(eventScript, { ie8: true });
          const eventTemplate = fs.readFileSync(
            path.join(__dirname, '../views/event.hbs'),
            'utf-8',
          );
          const eventContent = hbs.compile(eventTemplate);
          const finalEventContent = eventContent({
            eventScript: eventScript.code,
          });

          eventsContent.push(finalEventContent);
        }
      });
    }
  }

  return eventsContent;
};
export const addProjectCustomJSCdn = (project, bodyJS) => {
  try {
    if (project.customJsCdns) {
      const sortedCdns = project.customJsCdns.sort(dynamicSort('sortOrder'));
      sortedCdns.forEach((customJsCdn) => {
        if (customJsCdn.customType === 'SYSTEM_DEFAULT') {
          bodyJS.unshift(`<script src='${customJsCdn.urlOrTag}' async defer></script>`);
        } else if (!customJsCdn.addToHead) {
          if (customJsCdn.urlOrTag.startsWith('<script')) {
            bodyJS.push(customJsCdn.urlOrTag);
          } else if (
            (!customJsCdn.addToHead && customJsCdn.urlOrTag.startsWith('http')) ||
            customJsCdn.urlOrTag.startsWith('ftp')
          ) {
            bodyJS.push(`<script src='${customJsCdn.urlOrTag}' async defer></script>`);
          }
        }
      });
    }
  } catch (error) {
    console.error(error);
  }
};

export const addProjectCustomScriptContent = (project, bodyJS) => {
  // console.log('*** Adding project custom js content...');
  try {
    const { content } = project;
    let projectCustomJS = content.customJS ? content.customJS : '';

    if (projectCustomJS) {
      let customScriptContent = projectCustomJS.trim();
      let clearScriptTags = customScriptContent.startsWith('<script>')
        ? customScriptContent.replace('<script>', '')
        : customScriptContent;
      clearScriptTags = clearScriptTags.endsWith('</script>')
        ? clearScriptTags.replace('</script>', '')
        : clearScriptTags;
      bodyJS.push(`<script>${clearScriptTags.trim()}</script>`);
    }
  } catch (error) {
    console.error(error);
  }
};
export const addPageExternalScriptUrl = (page, bodyJS) => {
  try {
    if (page.externalScriptURL) {
      const externalScriptURLs =
        page && page.externalScriptURL ? page.externalScriptURL.split(',') : '';

      externalScriptURLs &&
        externalScriptURLs.forEach((externalScriptURL) => {
          bodyJS.push(`<script src=${externalScriptURL.trim()} defer></script>`);
        });
    }
  } catch (error) {
    console.error(error);
  }
};

export const addPageCustomScript = (page, bodyJS) => {
  try {
    if (page.customScript) {
      let customScriptContent = page.customScript.trim();
      let clearScriptTags = customScriptContent.startsWith('<script>')
        ? customScriptContent.replace('<script>', '')
        : customScriptContent;
      clearScriptTags = clearScriptTags.endsWith('</script>')
        ? clearScriptTags.replace('</script>', '')
        : clearScriptTags;
      bodyJS.push(`<script>${clearScriptTags.trim()}</script>`);
    }
  } catch (error) {
    console.error(error);
  }
};
export const addSnipcartElement = (snipcartPlugin, pageContent, environment) => {
  if (snipcartPlugin) {
    const { setting } = snipcartPlugin;
    let { secret_key, config_modal_style } = setting;
    secret_key = replaceValueFromSource(secret_key, environment, null);
    config_modal_style = replaceValueFromSource(config_modal_style, environment, null);

    pageContent += `<div id="snipcart" data-config-modal-style="${config_modal_style}" data-api-key="${secret_key}" data-config-add-product-behaviour="none" hidden></div>`;
  }
  return pageContent;
};

export const renderForPageExternalAPI = (page, pageContent, pageExternalAPI) => {
  if (page.collectionFrom && page.collectionFrom === 'EXTERNAL_API') {
    const externalApiId = page.externalApiId;
    if (externalApiId) {
      let externalApiPropertyString = `data-external-api-id="${externalApiId}"`;
      const { responseDataMapping, bodyDataFrom, collectionMapping } = pageExternalAPI
        ? pageExternalAPI
        : '';
      if (bodyDataFrom && bodyDataFrom === 'NON_PERSISTENT_COLLECTION') {
        externalApiPropertyString += ` data-external-api-data-from="${bodyDataFrom}"`;
      }
      const { selectedMapping } = responseDataMapping ? responseDataMapping : '';
      if (selectedMapping) {
        const uniqueItemKey = selectedMapping['_data_source_rest_api_primary_id']
          ? selectedMapping['_data_source_rest_api_primary_id']
          : '';
        if (uniqueItemKey) {
          externalApiPropertyString += ` data-external-api-unique-key="${uniqueItemKey}"`;
        }

        externalApiPropertyString += ` data-external-api-response-mapping="${JSON.stringify(
          selectedMapping,
        ).replace(/"/g, "'")}"`;
      }
      const { itemsPath } = responseDataMapping ? responseDataMapping : '';
      if (itemsPath) {
        externalApiPropertyString += ` data-external-api-item-path="${itemsPath}"`;
      }

      if (collectionMapping) {
        externalApiPropertyString += ` data-external-api-request-mapping="${JSON.stringify(
          collectionMapping,
        ).replace(/"/g, "'")}"`;
      }

      pageContent += `<span id="project-page-external-api" style="display:none;" ${externalApiPropertyString}></span>`;
    }
  }

  return pageContent;
};

export const saveFile = (content, projectPath, pageName, fileName) => {
  console.log('projectPath', projectPath);
  if (!fs.existsSync(projectPath)) {
    fs.mkdirSync(projectPath);
  }
  const projectPagePath = `${projectPath}/${pageName}`;
  if (!fs.existsSync(projectPagePath)) {
    try {
      fs.mkdirSync(projectPagePath);
    } catch (error) {
      console.log('error project path', error);
    }
  }

  if (fs.existsSync(`${projectPagePath}/${fileName}`)) {
    fs.unlinkSync(`${projectPagePath}/${fileName}`);
  }
  fs.writeFileSync(`${projectPagePath}/${fileName}`, content, (err) => {
    if (err) {
      console.error('Failed to save file ', err);
      return;
    }
  });
};
