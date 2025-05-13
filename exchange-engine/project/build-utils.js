import fs from 'fs';
import { formatCustomCSSClasses, replaceValueFromSource } from 'drapcode-utility';
import { plugins } from 'drapcode-plugin';
import { parse } from 'node-html-parser';
import {
  replaceNbsps,
  defaultHeaderJS,
  defaultHeaderCSS,
  defaultMetaTags,
  defaultFonts,
  getAssetLink,
  primaryBodyJS,
  PROJECT_COLLECTIONS,
  PROJECT_DETAIL,
} from 'drapcode-constant';
import { dynamicSort } from '../utils/appUtils';
import UglifyJS from 'uglify-js';
const CleanCSS = require('clean-css');
export const regex = /<script\b[^>]*>([\s\S]*?)<\/script>/gm;

//TODO: Can be moved to drapcode-constant
export const EXCHANGE = 'exchange/';
export const PROJECT_EVENTS = 'project-events';
export const PROJECT_EXTERNAL_APIS = 'project-external-apis';
export const PROJECT_CUSTOM_COMPONENTS = 'project-custom-components';
export const PROJECT_CUSTOM_DATA_MAPPINGS = 'project-custom-data-mappings';
export const PROJECT_PLUGINS = 'project-plugins';
export const PROJECT_TEMPLATES = 'project-templates';
export const PROJECT_SNIPPETS = 'project-snippets';
export const PROJECT_LOCALIZATIONS = 'project-localizations';

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
      setCookie('oAuthAccessToken', oAuthAccessToken, 1);
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
  publishTimestamp,
  projectCustomCSSURL,
  environment,
  data,
) => {
  const { name, titleTag, description, pageImage, extraMetaTag } = page;
  // console.log('*** Preparing head section for a page:', name);
  const { loadingIconKey, notificationSetting, debugMode, loaderScreen } = project;
  const { isEnabled: fullScreenLoaderIsEnabled, opacity: fullScreenLoaderOpacity } =
    loaderScreen || {};
  const fullScreenLoaderHasOpacity =
    typeof fullScreenLoaderOpacity !== 'undefined' &&
    fullScreenLoaderOpacity !== '' &&
    fullScreenLoaderOpacity !== null;
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
  const publishTimestampJS = `
  <script>
      const publishTimestamp = ${publishTimestamp ? `'${publishTimestamp}'` : ''};
      if (publishTimestamp) {
        const currentTimestamp = new Date().toISOString().replace(/[-:.]/g, "");
        // Convert timestamps to valid ISO 8601 format
        const formattedPublishTimestamp = publishTimestamp.replace(
          /(\\d{8}T\\d{6})\\d+Z/,
          "$1Z"
        );
        const formattedCurrentTimestamp = currentTimestamp.replace(
          /(\\d{8}T\\d{6})\\d+Z/,
          "$1Z"
        );
        // Convert to proper Date format (YYYY-MM-DDTHH:MM:SSZ)
        const isoPublishTimestamp = formattedPublishTimestamp.replace(
          /(\\d{4})(\\d{2})(\\d{2})T(\\d{2})(\\d{2})(\\d{2})Z/,
          "$1-$2-$3T$4:$5:$6Z"
        );
        const isoCurrentTimestamp = formattedCurrentTimestamp.replace(
          /(\\d{4})(\\d{2})(\\d{2})T(\\d{2})(\\d{2})(\\d{2})Z/,
          "$1-$2-$3T$4:$5:$6Z"
        );
        // Parse timestamps into Date objects
        const publishDate = new Date(isoPublishTimestamp);
        const currentDate = new Date(isoCurrentTimestamp);
        // Check for Invalid Date
        if (isNaN(publishDate) || isNaN(currentDate)) {
          console.error("Invalid Date detected!");
        }
        // Calculate time difference in milliseconds
        const diffMs = Math.abs(currentDate - publishDate);
        // Convert milliseconds to hours
        const diffHours = diffMs / (1000 * 60 * 60);
        const publishTimeSuffix = diffHours > 1 ? "hours" : "minutes";
        const publishTimeMessage =
          diffHours.toFixed(2) + " " + publishTimeSuffix + " ago...";
        console.log("==> Published " + publishTimeMessage);
      }
    </script>
  `;
  headerJS.push(publishTimestampJS);
  headerJS.push(`<script>
      console.log('==> Removing __ssr_ keys from session storage...');
      Object.keys(window.sessionStorage).map(sessionKey => {
        if(sessionKey.startsWith('__ssr_')) {
        window.sessionStorage.removeItem(sessionKey);
        }
      });
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
  if (debugMode) {
    const { envType } = environment || {};
    const isEnabled = envType && debugMode.includes(envType);
    headerJS.push(`<script>
      window.localStorage.setItem('debugMode', '${isEnabled}');
      if (!${isEnabled}) {
        console.log('==> Disabling console log|info...');
        console.log = function () {};
        console.info = function () {};
      }
    </script>`);
  }

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
  addProjectCustomJSCdnToHeader(project, headerJS);

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

  const fullScreenLoaderCSS = fullScreenLoaderIsEnabled
    ? `
  <style>
    #dc-loader-${project.uuid} {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, ${fullScreenLoaderHasOpacity ? fullScreenLoaderOpacity : 0.6});
        display: flex;
        align-items: center;
        justify-content: center;
        overflow-x: hidden;
        overflow-y: auto;
        flex-direction: column;
        z-index: 1050;
    }
    #dc-loader-${project.uuid} .gear-icon {
        font-size: 1.5rem;
        color: white;
        animation: spin 2s linear infinite;
    }
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    #dc-loader-${project.uuid} .fade-out {
        opacity: 0;
        transition: opacity 0.5s ease-out;
    }
  </style>`
    : '';

  headerCSS.push(fullScreenLoaderCSS);
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
    let pageHtmlContent = page.content['nocode-html'] || '';
    let pageContent = pageHtmlContent ? pageHtmlContent.replace(regex, '') : '';
    pageContent = replaceNbsps(pageContent);
    const hasDynamicDataTable = pageContent
      ? pageContent.includes('data-js="data-table-dynamic"')
      : false;
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
  if (projectCustomCSSURL && projectCustomCSSURL.trim()) {
    headerCSS.push(projectCustomCSSURL);
  }
  return {
    headerFonts,
    headerCSS,
    headerJS,
    metaTags,
    titleOfPage,
    headerThemeCSS,
  };
};
export const cleanProjectFolder = (folder, projectPath) => {
  const refPath = `${folder}views/${projectPath}`;
  if (fs.existsSync(refPath)) {
    fs.rmSync(refPath, { recursive: true, force: true });
    fs.mkdirSync(refPath);
  }
};
export const filterExtension = (extensions) => {
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
      const htmlContent = content['nocode-html'] || '';
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
  const generateButtonSpacingStyles = () => {
    let buttonStyles = '';

    if (theme && theme.Margin) {
      buttonStyles += `.btn { margin: ${theme.Margin}; }`;
    } else if (theme.MarginTop || theme.MarginRight || theme.MarginBottom || theme.MarginLeft) {
      buttonStyles += `.btn { 
        margin: ${theme.MarginTop || '0'} ${theme.MarginRight || '0'} ${
        theme.MarginBottom || '0'
      } ${theme.MarginLeft || '0'}; 
      }`;
    }

    if (theme && theme.Padding) {
      buttonStyles += `.btn { padding: ${theme.Padding}; }`;
    } else if (theme.PaddingTop || theme.PaddingRight || theme.PaddingBottom || theme.PaddingLeft) {
      buttonStyles += `.btn { 
        padding: ${theme.PaddingTop || '0'} ${theme.PaddingRight || '0'} ${
        theme.PaddingBottom || '0'
      } ${theme.PaddingLeft || '0'}; 
      }`;
    }

    if (theme && theme.Border) {
      buttonStyles += `.btn { border: ${theme.Border} solid currentColor; }`;
    } else if (theme.BorderTop || theme.BorderRight || theme.BorderBottom || theme.BorderLeft) {
      buttonStyles += `.btn { 
        border-width: ${theme.BorderTop || '0'} ${theme.BorderRight || '0'} ${
        theme.BorderBottom || '0'
      } ${theme.BorderLeft || '0'}; 
        border-style: solid; 
        border-color: currentColor; 
      }`;
    }

    if (theme && theme.BorderRadius) {
      buttonStyles += `.btn { border-radius: ${theme.BorderRadius}; }`;
    } else {
      const borderRadius = [
        theme.BorderRadiusTop || '0',
        theme.BorderRadiusRight || '0',
        theme.BorderRadiusBottom || '0',
        theme.BorderRadiusLeft || '0',
      ].join(' ');

      if (borderRadius.trim() !== '0 0 0 0') {
        buttonStyles += `.btn { border-radius: ${borderRadius}; }`;
      }
    }

    return buttonStyles;
  };

  return `
body {
  ${theme && theme.body && theme.body.color ? `color: ${theme.body.color};` : ''}
  ${
    theme && theme.body && theme.body.backgroundColor
      ? `background-color: ${theme.body.backgroundColor};`
      : ''
  }
  ${theme && theme.bodyFont && theme.bodyFont.value ? `font-family: ${theme.bodyFont.value};` : ''}
}
a {
  ${theme && theme.body && theme.body.anchor ? `color: ${theme.body.anchor};` : ''}
}
a:hover {
  ${theme && theme.body && theme.body.anchorHover ? `color: ${theme.body.anchorHover};` : ''}
}

${['h1', 'h2', 'h3', 'h4', 'h5', 'h6']
  .map(
    (tag) => `
    ${
      theme && theme[tag + 'Font'] && theme[tag + 'Font'].value
        ? `${tag} { font-family: ${theme[tag + 'Font'].value}; }`
        : ''
    }
    ${theme && theme[tag + 'FontSize'] ? `${tag} { font-size: ${theme[tag + 'FontSize']}; }` : ''}
    ${theme && theme[tag + 'Color'] ? `${tag} { color: ${theme[tag + 'Color']}; }` : ''}
  `,
  )
  .join('')}

${['primary', 'danger', 'success', 'warning', 'info', 'light', 'dark', 'link']
  .map(
    (color) => `
    ${
      theme && theme.colors && theme.colors[color]
        ? `.btn-${color} { background-color: ${theme.colors[color]}; }`
        : ''
    }
    ${
      theme && theme.hoverColors && theme.hoverColors[color]
        ? `.btn-${color}:hover { background-color: ${theme.hoverColors[color]}; }`
        : ''
    }
  `,
  )
  .join('')}

${generateButtonSpacingStyles()}
`
    .replace(/\s+/g, ' ')
    .trim();
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
        const root = htmlContent ? parse(htmlContent) : '';
        const snippetRef = root ? root.querySelector(`[data-snippet-id=${uuid}]`) : '';
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
    let htmlContent = pageLayoutContent['nocode-html']
      ? pageLayoutContent['nocode-html'].replace(regex, '')
      : '';
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
  let bodyJS = [];
  /**
   * TODO: Load Login Action JS when Login plugin is installed
   * Remove from primaryBodyJS
   */
  bodyJS.push(...primaryBodyJS);
  if (pluginsWithCssAndJs) {
    pluginsWithCssAndJs.forEach((plugin) => {
      plugin.bodyJs &&
        plugin.bodyJs.forEach((code) => {
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

export const generateEventScript = (event) => {
  let eventScript = `async function ${event.eventName}(ev, url_params={}){
    let element, targetElement, formID; 
    if (ev) {
      element = ev.target || ev.srcElement;
      targetElement = ev.currentTarget;
      ev.preventDefault();
      formID = element && element.id ? $("#"+element.id) : '';
    }
    const ifValidToProcess = ev && ev.type === "submit" ? formID && formID.valid() && formID.validate().pendingRequest === 0 : true;
    let formSubmitBtn;
    let formSubmitBtnText;
    if (formID) {
      formSubmitBtn = formID.find(':button[type=submit]');
      formSubmitBtnText = formSubmitBtn.html();
    }
    if (ifValidToProcess) {
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
      let response = null;
      try {`;

  event.actions
    .filter((action) => !!action.step)
    .sort((a, b) => (a.step > b.step ? 1 : a.step === b.step ? 0 : -1))
    .forEach((action) => {
      const { parameters, label } = action;
      let { enabledEnvironments, defaultEnabled, source } = action;
      defaultEnabled = typeof defaultEnabled === 'undefined' ? true : defaultEnabled;
      enabledEnvironments = typeof enabledEnvironments === 'undefined' ? [] : enabledEnvironments;
      source = source ? source : '';
      let args = {};
      parameters.forEach((parameter) => {
        args[parameter.name] = parameter.value;
      });
      const actionCalling = `
        if (response && response.status === 'error' && ${action.name !== 'showAlertMessage'}) {
          formSubmitBtn && formSubmitBtn.prop('disabled', false);
          formSubmitBtn && formSubmitBtn.html(formSubmitBtnText);
          return;
        }
        response = await ${action.name}({
          parameters: ${JSON.stringify(args)},
          response: response ? response.data : '',
          element: element,
          targetElement: targetElement,
          url_params: url_params,
          defaultEnabled: ${defaultEnabled},
          externalSource: '${source}',
          enabledEnvironments: ${JSON.stringify(enabledEnvironments)},
          actionLabel: '${label}'
        });
        console.log(response);`;
      eventScript += `\n  ${actionCalling}`;
    });

  eventScript += `
        formSubmitBtn && formSubmitBtn.prop('disabled', false);
        formSubmitBtn && formSubmitBtn.html(formSubmitBtnText);
      } catch (error) {
        formSubmitBtn && formSubmitBtn.prop('disabled', false);
        formSubmitBtn && formSubmitBtn.html(formSubmitBtnText);
        console.log("error", error);
      }
    } else {
      console.log("I am submit event and not valid");
    }
  }`;

  return minifyJs(eventScript);
};
export const addLinkToBodyJS = (bodySectionOfPage, jsLink) => {
  const { bodyJS } = bodySectionOfPage;
  if (bodyJS && jsLink) {
    bodyJS.push(jsLink);
  }
};
export const addLinkToHeaderJS = (headerSectionOfPage, jsLink) => {
  const { headerJS } = headerSectionOfPage;
  if (headerJS && jsLink) {
    headerJS.push(jsLink);
  }
};
export const addLinkToHeaderCSS = (headerSectionOfPage, cssLink) => {
  const { headerCSS } = headerSectionOfPage;
  if (headerCSS && cssLink) {
    headerCSS.push(cssLink);
  }
};
export const addProjectCustomJSCdn = (project, bodyJS) => {
  try {
    if (project.customJsCdns) {
      const sortedCdns = project.customJsCdns.sort(dynamicSort('sortOrder'));
      sortedCdns.forEach((customJsCdn) => {
        if (customJsCdn.customType === 'SYSTEM_DEFAULT') {
          if (
            customJsCdn.customType === 'SYSTEM_DEFAULT' &&
            !customJsCdn.urlOrTag.includes('bootstrap.bundle.min.js')
          ) {
            bodyJS.unshift(`<script src='${customJsCdn.urlOrTag}' defer></script>`);
          }
        } else if (!customJsCdn.addToHead) {
          if (customJsCdn.urlOrTag.startsWith('<script')) {
            bodyJS.push(customJsCdn.urlOrTag);
          } else if (
            (!customJsCdn.addToHead && customJsCdn.urlOrTag.startsWith('http')) ||
            customJsCdn.urlOrTag.startsWith('ftp')
          ) {
            bodyJS.push(`<script src='${customJsCdn.urlOrTag}' defer></script>`);
          }
        }
      });
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
export const generateProjectEventLink = (publishTimestamp, project, events) => {
  let eventURL = '';
  let eventLinkURL = '';
  try {
    const filePath = process.env.BUILD_FOLDER;
    if (events && events.length > 0) {
      const eventsContentList = [];
      if (events && events.length) {
        events.forEach((event) => {
          const eventScript = generateEventScript(event);
          eventsContentList.push(eventScript);
        });
      }
      let eventsContentCode = '';
      eventsContentList.forEach((eventContent) => {
        eventsContentCode += eventContent ? eventContent.code : '';
      });
      if (eventsContentCode && eventsContentCode.trim()) {
        const fileName = `${project.seoName}-events-${publishTimestamp}.min.js`;
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

        fs.writeFileSync(`${refPath}/${fileName}`, eventsContentCode, (err) => {
          if (err) {
            console.error('Failed to save file ', err);
            return;
          }
        });
        eventLinkURL = `<link rel='preload' href=${`/static/${project.uuid}/${fileName}`} as='script'></link>`;
        eventURL = `<script src=${`/static/${project.uuid}/${fileName}`} defer></script>`;
        return { eventLinkURL, eventURL };
      }
    }
  } catch (error) {
    console.error('~ generateProjectEventLink error:', error);
    return { eventLinkURL, eventURL };
  }
};
export const generateProjectCustomCSSContentLink = (publishTimestamp, project) => {
  let projectCustomCSSURL = '';
  try {
    const filePath = process.env.BUILD_FOLDER;
    const { content, customCSSClasses } = project;
    let projectCustomCSS = content && content.customCSS ? `${content.customCSS}` : '';
    let projectCustomCSSMinified = new CleanCSS().minify(projectCustomCSS);

    let projectCustomCSSClasses = customCSSClasses ? customCSSClasses : [];
    let projectCustomCSSClassesMinified = new CleanCSS().minify(
      formatCustomCSSClasses(projectCustomCSSClasses),
    );

    if (projectCustomCSSMinified || projectCustomCSSClassesMinified) {
      const fileName = `${project.seoName}-custom-${publishTimestamp}.min.css`;
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

      projectCustomCSSURL = `<link rel='stylesheet' type='text/css' href=${`/static/${project.uuid}/${fileName}`}>`;
      return projectCustomCSSURL;
    }
  } catch (error) {
    console.error('~ generateProjectCustomCSSContentLink error:', error);
    return projectCustomCSSURL;
  }
};
export const generateProjectCustomScriptContentLink = (publishTimestamp, project) => {
  let customScriptURL = '';
  let customScriptLinkURL = '';
  try {
    const filePath = process.env.BUILD_FOLDER;
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

      if (clearScriptTags && clearScriptTags.trim()) {
        const minifiedScript = minifyJs(clearScriptTags);
        const minifiedScriptCode = minifiedScript ? minifiedScript.code : '';
        if (minifiedScriptCode && minifiedScriptCode.trim()) {
          const fileName = `${project.seoName}-custom-${publishTimestamp}.min.js`;
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

          fs.writeFileSync(`${refPath}/${fileName}`, minifiedScriptCode, (err) => {
            if (err) {
              console.error('Failed to save file ', err);
              return;
            }
          });
          customScriptLinkURL = `<link rel='preload' href=${`/static/${project.uuid}/${fileName}`} as='script'></link>`;
          customScriptURL = `<script src=${`/static/${project.uuid}/${fileName}`} defer></script>`;
          return { customScriptURL, customScriptLinkURL };
        }
      }
    }
  } catch (error) {
    console.error('~ generateProjectCustomScriptContentLink error:', error);
    return { customScriptURL, customScriptLinkURL };
  }
};
export const minifyJs = (js) => {
  return UglifyJS.minify(js, { ie8: true });
};
export const saveFile = (content, projectPath, pageName, fileName) => {
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

export const getExchangeRedisKey = (qString, rkey) => {
  let redisKey = '';
  switch (rkey) {
    case PROJECT_DETAIL:
      redisKey = `${EXCHANGE}${PROJECT_DETAIL}/${qString}`;
      break;
    case PROJECT_COLLECTIONS:
      redisKey = `${EXCHANGE}${PROJECT_COLLECTIONS}/${qString}`;
      break;
    case PROJECT_EVENTS:
      redisKey = `${EXCHANGE}${PROJECT_EVENTS}/${qString}`;
      break;
    case PROJECT_CUSTOM_COMPONENTS:
      redisKey = `${EXCHANGE}${PROJECT_CUSTOM_COMPONENTS}/${qString}`;
      break;
    case PROJECT_CUSTOM_DATA_MAPPINGS:
      redisKey = `${EXCHANGE}${PROJECT_CUSTOM_DATA_MAPPINGS}/${qString}`;
      break;
    case PROJECT_PLUGINS:
      redisKey = `${EXCHANGE}${PROJECT_PLUGINS}/${qString}`;
      break;
    case PROJECT_EXTERNAL_APIS:
      redisKey = `${EXCHANGE}${PROJECT_EXTERNAL_APIS}/${qString}`;
      break;
    case PROJECT_TEMPLATES:
      redisKey = `${EXCHANGE}${PROJECT_TEMPLATES}/${qString}`;
      break;
    case PROJECT_SNIPPETS:
      redisKey = `${EXCHANGE}${PROJECT_SNIPPETS}/${qString}`;
      break;
    case PROJECT_LOCALIZATIONS:
      redisKey = `${EXCHANGE}${PROJECT_LOCALIZATIONS}/${qString}`;
      break;
    default:
      break;
  }
  return redisKey;
};
