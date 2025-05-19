import { findCollectionByUuid } from '../install-plugin/installedPlugin.service';
import { fetchMultiTenantCollectionItemsForPage } from './collection.service';

const jsdom = require('jsdom');
const { JSDOM } = jsdom;

export const loadMultiTenantPluginScript = async (
  req,
  res,
  pageId,
  pageContent,
  installedPlugins,
) => {
  const { projectId, builderDB } = req;
  const multiTenantSAASPlugin = installedPlugins.find((e) => e.code === 'MULTI_TENANT_SAAS');
  if (multiTenantSAASPlugin) {
    console.log('#####==> MULTI TENANT SAAS :>> ');

    const jsDom = new JSDOM(pageContent, { includeNodeLocations: true });
    const multiTenantCollection = multiTenantSAASPlugin.setting.multiTenantCollection
      ? await findCollectionByUuid(
          builderDB,
          multiTenantSAASPlugin.setting.multiTenantCollection,
          projectId,
        )
      : '';

    const multiTenantCollectionName = multiTenantCollection
      ? multiTenantCollection.collectionName
      : '';
    let collectionItems = await fetchMultiTenantCollectionItemsForPage(
      req,
      res,
      projectId,
      multiTenantCollectionName,
      pageId,
    );

    if (collectionItems && Object.entries(collectionItems).length) {
      let userRoles = '';
      if (req.isAuthenticated()) {
        userRoles = req.user.userRoles;
        collectionItems =
          collectionItems && userRoles
            ? collectionItems.filter(
                (collectionItem) =>
                  collectionItem.userRoles &&
                  collectionItem.userRoles.some((ur) => userRoles.includes(ur)),
              )
            : [];

        const { tenantId } = req.user;
        const tenantIds = tenantId
          ? tenantId.map((tenant) => {
              return tenant._id;
            })
          : '';

        if (tenantIds && tenantIds.length > 0) {
          collectionItems = collectionItems
            ? collectionItems.filter((collectionItem) => tenantIds.includes(collectionItem._id))
            : [];
        }
      } else {
        collectionItems = collectionItems
          ? collectionItems.filter((collectionItem) => !collectionItem.userRoles.length)
          : [];
      }

      if (collectionItems) {
        collectionItems.map(async (collItem) => {
          const permission = collItem.permission ? collItem.permission.join('') : '';
          collItem.pageComponents.map((pageComponentString) => {
            multiTenantHandlePageElements(pageComponentString, jsDom, permission);
          });
        });
      }
    }

    pageContent = jsDom.serialize();
  }
  return pageContent;
};
const multiTenantHandlePageElements = (pageComponentString, jsDom, permission) => {
  const pageComponentList = pageComponentString.split(':');
  // const pageSlug = pageComponentList[0];
  // const pageComponent = pageComponentList[1];
  const pageComponentId = pageComponentList[2];

  const jsDomPageElems = jsDom.window.document.querySelectorAll(`[id^=${pageComponentId}]`);
  if (jsDomPageElems && jsDomPageElems.length > 0) {
    jsDomPageElems.forEach((el) => {
      if (permission) {
        if (permission === 'Remove' || permission === 'Hide') {
          el.remove();
        } else if (permission === 'Disabled') {
          el.classList.add('disabled');
          el.setAttribute('disabled', true);
        } else if (permission === 'Read Only') {
          el.setAttribute('readonly', true);
        } else if (permission === 'Show') {
          el.classList.remove('d-none');
          el.classList.remove('hide');
          el.classList.remove('hidden');
          let elementStyleDisplayValue = el.style.display;
          el.style.display =
            elementStyleDisplayValue && elementStyleDisplayValue !== 'none'
              ? elementStyleDisplayValue
              : 'block';
          el.style.visibility = 'visible';
        }
      }
    });
  }
};
