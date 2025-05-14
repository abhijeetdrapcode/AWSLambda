import fs from 'fs';
import hbs from 'hbs';
import { replaceValueFromSource } from 'drapcode-utility';
import {
  brandMessage,
  pageNotFound,
  getTimezoneOffset,
  replaceNbsps,
  pluginCode,
  getAssetLink, //TODO: Verify it
} from 'drapcode-constant';
import UglifyJS from 'uglify-js';
import {
  loadProjectCollection,
  loadProjectDetail,
  loadProjectEvents,
  loadProjectPages,
  loadProjectPlugins,
  loadProjectSnippets,
  loadProjectExternalApis,
  loadProjectWebhooks,
  loadProjectTemplates,
  loadLocalizations,
  loadCustomComponents,
  loadCustomDataMapping,
  loadTaskScheduling,
  loadProjectDevapis,
} from './project.service';
import { extractEnvironment } from '../config/envUtil';
import { logger } from 'drapcode-logger';
import {
  addLocalizationDataIntoElements,
  addPageCustomScript,
  addPageExternalScriptUrl,
  addPageLayoutToPage,
  addProjectCustomJSCdn,
  addSnipcartElement,
  addStyleNoneToCMS,
  atomChatPluginScript,
  checkAndCreateValidationJS,
  checkAndExtractComponent,
  cleanProjectFolder,
  extractHtmlCssAndJsFromSnippets,
  filterExtension,
  findSnippetAndReplace,
  generateProjectCustomCSSContentLink,
  generateProjectCustomScriptContentLink,
  generateProjectEventLink,
  renderForPageExternalAPI,
  renderHeadSection,
  renderScriptSection,
  saveFile,
  socialScript,
  addLinkToHeaderCSS,
} from './build-utils';
import { findTemplate } from '../email-template/snippet.service';
const brand_msg = process.env.BRAND_MSG || 'Made with DrapCode';
const path = require('path');
let regex = /<script\b[^>]*>([\s\S]*?)<\/script>/gm;

export const deleteProject = async (req, res) => {
  const { projectId } = req;
  const refPath = `${process.env.BUILD_FOLDER}views/${projectId}`;
  fs.rmdirSync(refPath, { recursive: true });
  res.status(200).json({});
};

/**
 * TODO
 * 1. Need to add recaptcha
 * 2. Need to add shopping cart js
 * 4. Filter Model on the basis of events
 */
export const buildProject = async (req, res) => {
  const { params, builderDB, body } = req;
  const { projectId, version } = params;
  const { subscription } = body;
  const project = await loadProjectDetail(builderDB, projectId, version, subscription);
  if (!project) {
    return res.send('No Project found with this ID').status(400);
  }
  const environment = extractEnvironment(project.environments);
  /**
   * Clean Project Folder
   */
  cleanProjectFolder(process.env.BUILD_FOLDER, projectId);
  console.log('**************************************************************************');
  logger.info('Making build...', { label: `${projectId}/${project.seoName}`, color: 'yellow' });
  console.log('**************************************************************************');
  try {
    const pages = await loadProjectPages(builderDB, projectId, version);
    const localizations = await loadLocalizations(builderDB, projectId);
    const extensions = await loadProjectPlugins(builderDB, projectId, version);
    const collections = await loadProjectCollection(builderDB, projectId, version);
    await loadProjectDevapis(builderDB, projectId, version);
    // Filter Plugins with auto add to body
    const pluginsAutoAddToBody = extensions.filter((plugin) => {
      return plugin.autoAddToBody;
    });
    //Filter Plugins With CSS and JS
    const pluginsWithCssAndJs = filterExtension(extensions);

    const mapPlugin = extensions.find((plugin) => plugin.code === pluginCode.GOOGLE_MAP);
    const atomChatPlugin = extensions.find((plugin) => plugin.code === pluginCode.ATOM_CHAT);
    const snipcartPlugin = extensions.find((plugin) => plugin.code === pluginCode.SNIPCART);
    const bngPaymentPlugin = extensions.find((plugin) => plugin.code === pluginCode.BNG_PAYMENT);
    const fluidPayPlugin = extensions.find((plugin) => plugin.code === pluginCode.FLUID_PAY);
    const plugins = { mapPlugin, atomChatPlugin, snipcartPlugin, bngPaymentPlugin, fluidPayPlugin };
    const faviconUrl = project.faviconKeyName
      ? `${process.env.S3_BUCKET_URL}/${project.faviconKeyName}`
      : 'https://drapcode.com/favicon.png';
    let snippets = await loadProjectSnippets(builderDB, projectId, version);
    snippets = extractHtmlCssAndJsFromSnippets(snippets);
    const onlySnippets = snippets.filter((snippet) => snippet.snippetType === 'SNIPPET');
    const events = await loadProjectEvents(builderDB, projectId, version);
    const externalAPIs = await loadProjectExternalApis(builderDB, projectId, version);
    await loadProjectWebhooks(builderDB, projectId, version);
    await loadProjectTemplates(builderDB, projectId, version);
    await loadCustomComponents(builderDB, projectId, version);
    await loadCustomDataMapping(builderDB, projectId, version);
    await loadTaskScheduling(builderDB, projectId, version);
    const timeZone = getTimezoneOffset(project.timezone);
    const publishTimestamp = new Date().toISOString().replace(/[-:.]/g, '');
    const projectCustomCSSURL = generateProjectCustomCSSContentLink(publishTimestamp, project);
    const projectCustomJSURL = generateProjectCustomScriptContentLink(publishTimestamp, project);
    const projectEventURL = generateProjectEventLink(publishTimestamp, project, events);
    logger.info('Processing pages...', {
      label: `${projectId}/${project.seoName}`,
      color: 'yellow',
    });
    for (const page of pages) {
      console.log('page.name start:>> ', page.name);
      let pageExternalAPI = '';
      if (page.collectionFrom && page.collectionFrom === 'EXTERNAL_API' && page.externalApiId) {
        pageExternalAPI =
          externalAPIs && externalAPIs.length
            ? externalAPIs.find((externalApi) => externalApi.uuid === page.externalApiId)
            : '';
      }
      let pageLayoutContent = '';
      let pageLayoutId = page?.pageLayoutId || '';
      if (pageLayoutId) {
        pageLayoutContent = await findTemplate(builderDB, { uuid: pageLayoutId });
        if (pageLayoutContent) {
          if (pageLayoutContent.content['nocode-assets'])
            delete pageLayoutContent.content['nocode-assets'];
          pageLayoutContent = pageLayoutContent?.content || '';
        }
      }
      await prepareAndSavePageHTML(
        project,
        page,
        pluginsWithCssAndJs,
        pluginsAutoAddToBody,
        plugins,
        faviconUrl,
        timeZone,
        projectCustomCSSURL,
        projectCustomJSURL,
        projectEventURL,
        onlySnippets,
        collections,
        pageExternalAPI,
        environment,
        localizations,
        publishTimestamp,
        project.dateFormat,
        pageLayoutContent,
      );
      console.log('page.name end:>> ', page.name);
    }
    logger.info('Pages processed successfully!', {
      label: `${projectId}/${project.seoName}`,
      color: 'green',
    });
    console.log('**************************************************************************');
    logger.info('Build completed successfully!', {
      label: `${projectId}/${project.seoName}`,
      color: 'green',
    });
    console.log('**************************************************************************');
    res.status(200).send({ message: 'Build Success' });
  } catch (error) {
    console.error('*** Build completed with an error :>>', error);
    res.json(error).status(400);
  }
};

const prepareAndSavePageHTML = async (
  project,
  page,
  pluginsWithCssAndJs,
  pluginsAutoAddToBody,
  plugins,
  faviconUrl,
  timeZone,
  projectCustomCSSURL,
  projectCustomJSURLObject,
  eventURLObject,
  snippets,
  collections,
  pageExternalAPI,
  environment,
  localizations,
  publishTimestamp,
  dateFormat,
  pageLayoutContent = '',
) => {
  /**
   * Generating Header Section
   * Returns
   * {headerFonts} Fonts CDN to be added in HTML Header
   * {headerCSS} CSS Files to be added in HTML Header
   * {headerJS} JS Files to be added in HTML Header
   * {metaTags} Meta Tags to be added in HTML Header
   * {titleOfPage} Title of the page to be added in HTML Header
   */

  let projectEventURL = '';
  let projectEventLinkURL = '';
  let projectCustomScriptURL = '';
  let projectCustomScriptLinkURL = '';
  if (eventURLObject && Object.keys(eventURLObject).length) {
    const { eventURL, eventLinkURL } = eventURLObject;
    projectEventURL = eventURL || '';
    projectEventLinkURL = eventLinkURL || '';
  }
  if (projectCustomJSURLObject && Object.keys(projectCustomJSURLObject).length) {
    const { customScriptURL, customScriptLinkURL } = projectCustomJSURLObject;
    projectCustomScriptURL = customScriptURL || '';
    projectCustomScriptLinkURL = customScriptLinkURL || '';
  }

  const prepareHeaderSectionOfPage = renderHeadSection(
    process.env.BUILD_FOLDER,
    pluginsWithCssAndJs,
    plugins,
    page,
    project,
    publishTimestamp,
    projectCustomCSSURL,
    environment,
  );
  if (projectEventLinkURL) {
    addLinkToHeaderCSS(prepareHeaderSectionOfPage, projectEventLinkURL);
  }
  if (projectCustomScriptLinkURL) {
    addLinkToHeaderCSS(prepareHeaderSectionOfPage, projectCustomScriptLinkURL);
  }
  const { loaderScreen } = project;
  const { isEnabled: fullScreenLoaderIsEnabled } = loaderScreen || {};
  await Promise.all(
    localizations.map(async (local) => {
      /**
       * Generate Body Section
       * Returns
       * {bodyCSS} contains style of current page and all snippets used in it
       * {bodyJS} contains JS of current page and all the JS used in it
       * {mainContent} HTML of the page and snippets HTML
       */
      const prepareBodySectionOfPage = renderBodySection(
        pluginsWithCssAndJs,
        pluginsAutoAddToBody,
        page,
        snippets,
        collections,
        project,
        plugins,
        pageExternalAPI,
        environment,
        local,
        pageLayoutContent,
      );
      let eventsScript = [];
      if (projectEventURL) {
        eventsScript.push(projectEventURL);
      }
      if (projectCustomScriptURL) {
        prepareBodySectionOfPage['projectCustomScriptUrl'] = projectCustomScriptURL;
      }
      const pageDirection = page && page.pageDirection ? page.pageDirection : 'ltr';

      if (project.projectType === 'FREE') {
        prepareBodySectionOfPage['brandMessage'] = brandMessage(brand_msg);
      }

      prepareBodySectionOfPage['fullScreenLoader'] = fullScreenLoaderIsEnabled
        ? `
      <div id="dc-loader-${project.uuid}">
        <i class="fas fa-spinner gear-icon"></i>
        <p class="mt-3 text-white">Loading, please wait...</p>
      </div>`
        : '';

      prepareBodySectionOfPage['fullScreenLoaderScript'] = fullScreenLoaderIsEnabled
        ? `
      <script>
        window.addEventListener("load", function () {
          const startTime = performance.now();  
          const regex = /^signUP.*/;
          const regexForModal = /^processVisibilityElements.*/;
          const checkInterval = setInterval(() => {
            const matchingKey = Object.keys(window).find(
              (key) => regex.test(key) && typeof window[key] === "function"
            );
            const matchingKeyForModal = Object.keys(window).find((key) => {
              const fn = window[key];
              return (
                regexForModal.test(key) &&
                typeof fn === "function" &&
                fn.toString().includes("=>")
              );
            });
            if (matchingKey && matchingKeyForModal) {
              const dcLoader = document.getElementById("dc-loader-${project.uuid}");
              dcLoader.style.display = "none";
              dcLoader.classList.add("fade-out");
              const endTime = performance.now();
              const timeTaken = endTime - startTime;
              clearInterval(checkInterval);
              console.log(
                "*** Successfully loaded function in DOM within "+timeTaken.toFixed(2)+" ms"
              );
            }
          }, 100);
        });
      </script>`
        : '';

      /**
       * Generate Template
       */
      const templateContent = fs.readFileSync(path.join(__dirname, '../views/index.hbs'), 'utf-8');
      const template = hbs.compile(templateContent);
      const finalHtmlContent = template({
        ...prepareHeaderSectionOfPage,
        ...prepareBodySectionOfPage,
        faviconUrl,
        timeZone,
        eventsScript,
        pageDirection,
        dateFormat,
        publishTimestamp,
      });
      /**
       * Save HTML File
       */
      const refPath = `${process.env.BUILD_FOLDER}views/${project.uuid}/${local.language}`;
      saveFile(finalHtmlContent, refPath, `${page.slug}`, `${page.slug}.hbs`);
    }),
  );
};

const renderBodySection = (
  pluginsWithCssAndJs,
  pluginsWithAutoAddToBody,
  page,
  snippets,
  collections,
  // eslint-disable-next-line no-unused-vars
  project,
  plugins,
  pageExternalAPI,
  environment,
  localization,
  pageLayoutContent = '',
) => {
  const { content, eventName, slug } = page;
  // console.log('*** Preparing body section for a page:', name);
  const componentScripts = [];
  const componentStyles = [];
  const listComponents = checkAndExtractComponent(content);
  const allValidations = checkAndCreateValidationJS(collections, listComponents);
  let pageHtmlContent = content['nocode-html'] || '';
  let pageContent = pageHtmlContent ? pageHtmlContent.replace(regex, '') : '';
  pageContent = replaceNbsps(pageContent);
  if (pageContent) {
    pageContent = findSnippetAndReplace(pageContent, snippets, componentScripts, componentStyles);
    pageContent = addStyleNoneToCMS(pageContent);
    pageContent = addPageLayoutToPage(pageLayoutContent, pageContent);
    pageContent = addLocalizationDataIntoElements(pageContent, localization);
  }
  const bodyJS = renderScriptSection(pluginsWithCssAndJs, pluginsWithAutoAddToBody, environment);
  const pageScript = pageHtmlContent ? regex.exec(pageHtmlContent) : [];

  if (pageScript && pageScript.length) {
    componentScripts.push(pageScript[1]);
  }

  if (['oauth2-loading-page', 'facebook-loading-page', 'twitter-loading-page'].includes(slug)) {
    bodyJS.push(socialScript);
  }
  const { atomChatPlugin } = plugins;
  if (atomChatPlugin && atomChatPlugin.code) {
    const haveChat = pageContent ? pageContent.includes('id="atomchat"') : false;
    if (haveChat) {
      pageContent = pageContent.replace(
        '<img src="https://public-webconnect.s3.amazonaws.com/atomchat.png" alt="atomchat" class="atomchat">',
        '<div id="cometchat_embed_synergy_container" style="width:100%;height:100%;max-width:100%;overflow:hidden;"></div>',
      );

      const { setting } = atomChatPlugin;
      let { api_id, auth_key } = setting;
      api_id = replaceValueFromSource(api_id, environment, null);
      auth_key = replaceValueFromSource(auth_key, environment, null);
      bodyJS.push(atomChatPluginScript(api_id, auth_key));
    }
  }
  const { fluidPayPlugin } = plugins;
  if (fluidPayPlugin) {
    const { setting } = fluidPayPlugin;
    let { scriptUrl } = setting;
    scriptUrl = replaceValueFromSource(scriptUrl, environment, null);
    bodyJS.push(`<script type="text/javascript" src="${scriptUrl}"></script>`);
  }

  addProjectCustomJSCdn(project, bodyJS);
  addPageExternalScriptUrl(page, bodyJS);
  addPageCustomScript(page, bodyJS);

  const hasDynamicDataTable = pageContent
    ? pageContent.includes('data-js="data-table-dynamic"')
    : false;
  if (hasDynamicDataTable) {
    bodyJS.push(
      '<script type="text/javascript" src="https://cdn.datatables.net/1.13.2/js/jquery.dataTables.min.js"></script>',
    );
  }

  const hasCalendarComponent = pageContent
    ? pageContent.includes('data-js="calendar"') ||
      pageContent.includes('data-js="calendar-timeslot"')
    : false;
  if (hasCalendarComponent) {
    bodyJS.push(
      '<script type="text/javascript" src="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.9/index.global.min.js"></script>',
    );
  }
  bodyJS.push(
    '<script type="text/javascript" src="https://cdn.jsdelivr.net/npm/timepicker@1.14.1/jquery.timepicker.min.js"></script>',
  );
  pageContent = addSnipcartElement(plugins.snipcartPlugin, pageContent, environment);
  pageContent = renderForPageExternalAPI(page, pageContent, pageExternalAPI);

  /**
   * Add combined JS and Minified
   */
  const result = UglifyJS.minify(componentScripts.join(' '), { ie8: true });
  if (result && result.code) {
    bodyJS.push(`<script>${result.code}</script>`);
  } else {
    bodyJS.push(`<script>${componentScripts.join(' ')}</script>`);
  }

  if (allValidations && allValidations.length > 0) {
    const minifiedValidation = UglifyJS.minify(allValidations.join(' '), { ie8: true });
    if (minifiedValidation && minifiedValidation.code) {
      bodyJS.push(`<script>${minifiedValidation.code}</script>`);
    } else {
      bodyJS.push(`<script>${allValidations.join(' ')}</script>`);
    }
  }

  if (eventName) {
    bodyJS.push(`<script> 
                    $(window).on('load', function() {
                      const url_params = Object.fromEntries(new URLSearchParams(window.location.search));
                      setTimeout(() => {
                        ${eventName}(null, url_params);
                      }, 500)
                    });
              </script>`);
  }

  const bodyCSS = [];
  bodyCSS.push(`<style>${content['nocode-css']}</style>`);
  bodyCSS.push(`<style>${pageLayoutContent['nocode-css']}</style>`);
  if (componentStyles) {
    componentStyles.forEach((style) => bodyCSS.push(`<style>${style}</style>`));
  }

  if (!content || !pageHtmlContent) {
    console.log('************ No Page Content *********');
    bodyCSS.push(
      `<link rel='stylesheet' type='text/css' href='${getAssetLink('css/dc-error-page.min.css')}'>`,
    );
    return {
      mainContent: pageNotFound(),
      bodyJS,
      bodyCSS,
    };
  }

  return {
    mainContent: pageContent,
    bodyJS,
    bodyCSS,
  };
};

// eslint-disable-next-line no-unused-vars
const isSummernoteEditorJsCssToAdd = (listComponents) => {
  return listComponents.find((comp) => comp && comp.tagName === 'textarea');
};

// eslint-disable-next-line no-unused-vars
const isFlatPickerJsCssToAdd = (listComponents) => {
  return listComponents.find((comp) => {
    if (comp && comp.attributes) {
      return (
        Object.keys(comp.attributes).includes('type') &&
        (comp.attributes.type === 'datetime-local' || comp.attributes.type === 'date')
      );
    }
  });
};

// eslint-disable-next-line no-unused-vars
const isIntlTelInputJsCssToAdd = (listComponents) => {
  return listComponents.find((comp) => {
    if (comp && comp.attributes) {
      return Object.keys(comp.attributes).includes('type') && comp.attributes.type === 'tel';
    }
  });
};

export const listProjectPages = async (req, res, next) => {
  try {
    const { builderDB, projectId } = req;
    const Pages = builderDB.collection('pages');
    let pages = await Pages.find(
      {
        projectId,
        $or: [{ isHidden: false }, { isHidden: null }, { isHidden: { $exists: false } }],
      },
      { projection: { name: 1, slug: 1, uuid: 1, projectId: 1 } },
    ).toArray();
    res.status(200).send(pages);
  } catch (error) {
    console.error('page list ~ error:', error);
    next(error);
  }
};
