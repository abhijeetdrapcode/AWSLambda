resetItemsFromBrowserStorage();
const getBackendServerUrl = () => {
  const serverUrl = parseCookieForDomain();
  return serverUrl;
  // For Local Development
  // return `http://${projectSubDomain}.api.prodeless.com:5002/api/v1/`;
};

const parseCookieInfo = () => {
  const parsedCookie = document.cookie
    .split(';')
    .map((v) => v.split('='))
    .reduce((acc, v) => {
      acc[decodeURIComponent(v[0].trim())] = decodeURIComponent(v[1] ? v[1].trim() : '');
      return acc;
    }, {});
  return parsedCookie;
};

const parseCookieForDomain = () => {
  const parsedCookie = parseCookieInfo();
  const apiDomainName = parsedCookie['apiDomainName'];
  const domain = parsedCookie['projectSeoName'];
  const environment = parsedCookie['environment'];

  //Check if request is coming from our domain
  const hostName = window.location.hostname;
  if (hostName.includes('drapcode.io')) {
    return `https://${domain}.api.${environment ? environment + '.' : ''}drapcode.io/api/v1/`;
  }

  if (apiDomainName && apiDomainName !== 'undefined' && apiDomainName !== undefined) {
    return `https://${apiDomainName}/api/v1/`;
  } else {
    return `https://${domain}.api.${environment ? environment + '.' : ''}drapcode.io/api/v1/`;
  }
};

function resetItemsFromBrowserStorage() {
  const RESET_SESSION_KEYS = '__resetK';
  let resetKeys = sessionStorage.getItem(RESET_SESSION_KEYS);
  console.log('🚀 ~ file: constant.js:37 ~ resetItemsFromBrowserStorage ~ resetKeys:', resetKeys);
  if (resetKeys) resetKeys = resetKeys.split(',');
  if (resetKeys) {
    if (Array.isArray(resetKeys) && resetKeys.length) {
      resetKeys.forEach((key) => sessionStorage.removeItem(key));
    }
  }

  const RESET_SESSION_KEYS_DETAIL_PAGE = '__resetK_dp';
  let resetKeysDetailPage = sessionStorage.getItem(RESET_SESSION_KEYS_DETAIL_PAGE);
  console.log(
    '🚀 ~ file: constant.js:47 ~ resetItemsFromBrowserStorage ~ resetKeysDetailPage:',
    resetKeysDetailPage,
  );
  if (resetKeysDetailPage) resetKeysDetailPage = resetKeysDetailPage.split(',');
  if (resetKeysDetailPage) {
    if (Array.isArray(resetKeysDetailPage) && resetKeysDetailPage.length) {
      resetKeysDetailPage.forEach((key) => sessionStorage.removeItem(key));
    }
  }
}

const imageServerUrl = () => {
  const parsedCookie = parseCookieInfo();
  const S3URL = parsedCookie['S3URL'];
  return `${S3URL}/`;
};

const summernoteFontsArray = [
  'Arial',
  'Arial Black',
  'Comic Sans MS',
  'Courier New',
  'Helvetica',
  'Impact',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
  'Georgia',
  'Open Sans',
  'B612',
  'Roboto',
  'Ubuntu',
  'ABeeZee',
  'Spartan',
  'Bungee',
  'Dancing Script',
  'Lato',
  'Lobster',
  'Lobster Two',
  'Lora',
  'Montserrat',
  'Montserrat Alternates',
  'Nunito',
  'Nunito Sans',
  'Open Sans Condensed',
  'PT Sans',
  'PT Serif',
  'Raleway',
  'Roboto Condensed',
  'Roboto Mono',
  'Roboto Slab',
  'Alegreya',
  'Alegreya Sans',
  'Merriweather',
  'Merriweather Sans',
  'Quattrocento',
  'Quattrocento Sans',
  'Arvo',
  'Copse',
  'Cutive',
  'Sanchez',
  'Scope One',
  'Slabo 27px',
  'Trocchi',
  'Vesper Libre',
  'JetBrains Mono',
  'Noto Sans',
  'Noto Serif',
  'Playfair Display',
  'Poppins',
  'Rubik',
  'Source Code Pro',
  'Source Sans Pro',
  'Source Serif Pro',
  'Barlow',
  'Barlow Condensed',
  'Barlow Semi Condensed',
  'Fira Code',
  'Fira Mono',
  'Fira Sans',
  'Fira Sans Condensed',
  'Fira Sans Extra Condensed',
  'Quicksand',
  'Advent Pro',
  'Bitter',
  'Changa',
  'Changa One',
  'Exo',
  'Exo 2',
  'Great Vibes',
  'Inconsolata',
  'Kaushan Script',
  'Nova Cut',
  'Nova Flat',
  'Nova Mono',
  'Nova Oval',
  'Nova Round',
  'Nova Script',
  'Nova Slim',
  'Nova Square',
  'Oswald',
  'Oxygen',
  'Oxygen Mono',
  'Sacramento',
  'Abril Fatface',
  'Aldrich',
  'Balsamiq Sans',
  'Bebas Neue',
  'Berkshire Swash',
  'Bilbo',
  'Carter One',
  'Castoro',
  'Cinzel',
  'Federo',
  'Italianno',
  'Josefin Sans',
  'Josefin Slab',
  'Limelight',
  'Oregano',
  'Padauk',
  'Pattaya',
  'Prata',
  'Vollkorn SC',
  'Yesteryear',
  'Abel',
  'Aladin',
  'B612 Mono',
  'Black Han Sans',
  'Bungee Hairline',
  'Bungee Inline',
  'Bungee Outline',
  'Bungee Shade',
  'Delius',
  'Delius Swash Caps',
  'Delius Unicase',
  'Julee',
  'Mako',
  'Oleo Script',
  'Oleo Script Swash Caps',
  'Space Grotesk',
  'Space Mono',
  'Ubuntu Condensed',
  'Ubuntu Mono',
  'Vollkorn',
  'Work Sans',
  'Zeyada',
  'Zhi Mang Xing',
  'Zilla Slab',
];

const summernoteFontsSizeArray = [
  '8',
  '10',
  '12',
  '14',
  '16',
  '18',
  '20',
  '24',
  '28',
  '32',
  '36',
  '40',
  '48',
  '56',
  '64',
  '72',
];
