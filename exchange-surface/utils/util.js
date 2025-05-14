//TODO: whats need of this file delete it if not getting used anywhere
// USAGE: prepareFunction is being imported in installedPlugin.service
import { getSpecialCharectorReplacedExpression } from 'drapcode-utility';
import { isNumber } from 'lodash';
const numeral = require('numeral');
const v = require('voca');
const moment = require('moment');
const math = require('mathjs');
const showdown = require('showdown');
/**
 * Starting of Utility Functions
 */

export const getTimezoneOffset = (time = '(GMT+5:30)') => {
  const str = time.substring(4, 10);
  return moment().utcOffset(str).utcOffset();
};

/**
 * String Utility Function
 */
export const capitalize = function (subject, restToLower) {
  return v.capitalize(subject, restToLower === 'TRUE');
};
export const lowerCase = function (subject) {
  return v.lowerCase(subject);
};
export const upperCase = function (subject) {
  return v.upperCase(subject);
};
export const slugify = function (subject) {
  return v.slugify(subject);
};
export const trim = function (subject, whitespace, type) {
  if (type === 'LEFT') {
    return v.trimLeft(subject, whitespace);
  } else if (type === 'RIGHT') {
    return v.trimRight(subject, whitespace);
  } else {
    return v.trim(subject, whitespace);
  }
};
export const titleCase = function (subject, noSplitopt) {
  return v.titleCase(subject, [noSplitopt]);
};
export const truncate = function (subject, length, endopt) {
  return v.truncate(subject, length, endopt);
};
export const substr = function (subject, startLength, endLength) {
  return v.substr(subject, startLength, endLength);
};

export const markdownToHtml = function (subject) {
  const converter = new showdown.Converter({ tables: true });
  const html = converter.makeHtml(subject);
  return html;
};

export const strJoin = function (dataArr, separator, startString, endString) {
  separator = separator ? separator.replace(/##@@##@@##/g, ' ') : ' ';
  dataArr = Array.isArray(dataArr) ? dataArr : [dataArr];
  dataArr = dataArr.filter(Boolean);
  return `${startString ? startString.replace(/##@@##@@##/g, ' ') + separator : ''}${dataArr.join(
    separator,
  )}${endString ? separator + endString.replace(/##@@##@@##/g, ' ') : ''}`;
};

export const evaluateCustomSentence = function (expression, data, user) {
  expression = expression ? getSpecialCharectorReplacedExpression(expression) : ' ';
  return replaceFieldsValueIntoExpression(expression, data, user);
};

/**
 * Math Utility Function
 */
const checkAndConvertNumber = (number) => {
  return isNumber(number) ? number : Number(number);
};

const validateNumbers = (numbers) => {
  return numbers.map((number) => {
    return checkAndConvertNumber(number);
  });
};

export const addition = function (formatType, { numbers }) {
  try {
    if (!Array.isArray(numbers)) {
      numbers = [numbers, 0];
    }
    numbers = numbers.map((number) => (isNaN(number) ? 0 : number));
    const allNumbers = validateNumbers(numbers);
    return numeral(math.add(...allNumbers)).format(formatType ? formatType : '00.00');
  } catch (err) {
    console.log('🚀 ~ file: util.js:89 ~ addition ~ error:', err);
    return '';
  }
};
export const average = function (formatType, { numbers }) {
  try {
    if (!Array.isArray(numbers)) {
      numbers = [numbers];
    }
    numbers = numbers.map((number) => (isNaN(number) ? 0 : number));
    const allNumbers = validateNumbers(numbers);
    return numeral(math.mean(...allNumbers)).format(formatType ? formatType : '00.00');
  } catch (err) {
    console.log('🚀 ~ file: util.js:98 ~ average ~ error:', err);
    return '';
  }
};
export const multiply = function (formatType, { numbers }) {
  try {
    if (!Array.isArray(numbers)) {
      numbers = [numbers, 1];
    }
    numbers = numbers.map((number) => (isNaN(number) ? 1 : number));
    const allNumbers = validateNumbers(numbers);
    return numeral(math.multiply(...allNumbers)).format(formatType ? formatType : '00.00');
  } catch (err) {
    console.log('🚀 ~ file: util.js:106 ~ multiply ~ error:', err);
    return '';
  }
};
export const divide = function (formatType, { number1, number2 }) {
  try {
    const num1 = checkAndConvertNumber(number1);
    const num2 = checkAndConvertNumber(number2);
    return numeral(math.divide(num1, num2)).format(formatType ? formatType : '00.00');
  } catch (err) {
    console.log('🚀 ~ file: util.js:114 ~ divide ~ error:', err);
    return '';
  }
};
export const evaluateExpression = function (expression, data, user, formatType) {
  expression = expression ? getSpecialCharectorReplacedExpression(expression) : ' ';
  const replacedExpression = replaceFieldsValueIntoExpression(expression, data, user);
  try {
    return numeral(math.evaluate(replacedExpression)).format(formatType ? formatType : '00.00');
  } catch (err) {
    return '';
  }
};

export const evaluateCurrency = function (formatType, subject, currency, position, maxFraction) {
  try {
    if (!subject) subject = 0;
    if (!maxFraction && maxFraction !== 0) maxFraction = 2;
    const multiplier = Math.pow(10, maxFraction || 0);
    const digit = Math.round(subject * multiplier) / multiplier;
    subject = new Intl.NumberFormat(formatType, { minimumFractionDigits: maxFraction }).format(
      digit,
    );
    switch (position) {
      case 'FRONT':
        return `${currency}${subject}`;
      case 'FRONT_WITH_SPACE':
        return `${currency} ${subject}`;
      case 'BACK':
        return `${subject}${currency}`;
      case 'BACK_WITH_SPACE':
        return `${subject} ${currency}`;
      default:
        return '';
    }
  } catch (error) {
    return '';
  }
};

export const evaluateJSLogic = function (expression, data, user) {
  expression = expression ? getSpecialCharectorReplacedExpression(expression) : ' ';
  const replacedExpression = replaceFieldsValueIntoExpression(expression, data, user);
  try {
    const replacedExpressionFunction = new Function(replacedExpression.toString());
    return replacedExpressionFunction();
  } catch (err) {
    return '';
  }
};

export const replaceFieldsValueIntoExpression = function (expression, data, user) {
  console.log('data', data);
  console.log('user', user);
  const contentList = expression.match(/{{(.*?)}}/g)?.map((b) => b.replace(/{{(.*?)}}/g, '$1'));
  contentList?.forEach((prop) => {
    const needle = `{{${prop}}}`;
    prop = v.trim(prop);
    let dataOfItem = '';
    //TODO: Need to check how to handle it.
    // if (prop.includes('current_user')) {
    //   prop = prop.replace('current_user.', '');
    //   if (Object.keys(user).length > 0) {
    //     dataOfItem = parseValueFromData(user, prop);
    //   }
    // } else {
    //   if (Object.keys(data).length > 0) {
    //     dataOfItem = parseValueFromData(data, prop);
    //   }
    // }
    expression = replaceValueInExpression(needle, dataOfItem, expression);
  });

  return expression;
};

export const replaceValueInExpression = function (needle, replacement, expression) {
  const match = new RegExp(needle, 'ig');
  replacement = replacement ? replacement : '';
  return expression.replace(match, replacement);
};

export const substraction = function (formatType, { numbers1, numbers2 }) {
  try {
    const actNumber1 = Array.isArray(numbers1) ? math.add(...numbers1) : numbers1;
    const actNumber2 = Array.isArray(numbers2) ? math.add(...numbers2) : numbers2;
    return numeral(math.subtract(actNumber1, actNumber2)).format(formatType ? formatType : '00.00');
  } catch (err) {
    console.log('🚀 ~ file: util.js:202 ~ substraction ~ error:', err);
    return '';
  }
};
export const count = function (subject) {
  return subject ? subject.length : 0;
};

/**
 * Date Utility Function
 */
export const formatDate = function (formatType, datentime, timezone, unixType) {
  const formatDateNTime =
    unixType && unixType === 'SEC'
      ? moment(datentime * 1000).utcOffset(timezone)
      : moment(datentime).utcOffset(timezone);
  if (formatType === 'FROM_NOW') {
    return datentime ? formatDateNTime.fromNow() : '';
  }
  return datentime ? formatDateNTime.format(formatType) : '';
};

export const dateDifference = (formatType, datentime1, datentime2, timezone) => {
  let result = '';
  const dateExist = !datentime1 || !datentime2;
  const firstDate =
    datentime1 === 'CURRENT_DATE_TIME'
      ? moment().utcOffset(timezone)
      : moment(datentime1).utcOffset(timezone);
  const secondDate =
    datentime2 === 'CURRENT_DATE_TIME'
      ? moment().utcOffset(timezone)
      : moment(datentime2).utcOffset(timezone);
  const patterns = formatType.split(',');
  patterns.forEach((format, i) => {
    const diff = firstDate.diff(secondDate, format);
    if (diff < 0) {
      firstDate.subtract(diff, format);
    } else {
      secondDate.add(diff, format);
    }
    result =
      result +
      `${Math.abs(dateExist ? 0 : diff)} ${format.charAt(0).toUpperCase() + format.slice(1)}${
        i === patterns.length - 1 ? '' : ','
      } `;
  });
  return result;
};
/**
 * End of Utility Functions
 */

export const prepareFunction = (functionDef, field, timezone, user) => {
  let formatType = '',
    restToLower = '',
    whitespace = '',
    noSplitopt = '',
    type = '',
    length = '',
    endopt = '';
  let args = [];
  console.log('user', user);
  functionDef.args.forEach((element) => {
    const { name, key } = element;
    const excludes = [
      'formatType',
      'restToLower',
      'whitespace',
      'type',
      'noSplitopt',
      'length',
      'endopt',
    ];
    if (name === 'formatType') {
      formatType = key;
    } else if (name === 'restToLower') {
      restToLower = key;
    } else if (name === 'whitespace') {
      whitespace = key;
    } else if (name === 'type') {
      type = key;
    } else if (name === 'noSplitopt') {
      noSplitopt = key;
    } else if (name === 'length') {
      length = key;
    } else if (name === 'endopt') {
      endopt = key;
    }

    let innerArgs = [];
    if (!excludes.includes(name)) {
      if (Array.isArray(key)) {
        key.forEach((k) => {
          if (field) innerArgs.push(field[k]);
        });
        args.push(innerArgs);
      } else {
        if (field) args.push(field[key]);
      }
    }
  });

  switch (functionDef.functionType) {
    case 'CAPITALIZE':
      return capitalize(args[0], restToLower);
    case 'LOWER_CASE':
      return lowerCase(args[0]);
    case 'UPPER_CASE':
      return upperCase(args[0]);
    case 'SLUGIFY':
      return slugify(args[0]);
    case 'TRIM':
      return trim(args[0], whitespace, type);
    case 'TITLE_CASE':
      return titleCase(args[0], noSplitopt);
    case 'TRUNCATE':
      return truncate(args[0], length, endopt);
    case 'ADDITION':
      return addition(formatType, { numbers: args[0] });
    case 'AVERAGE':
      return average(formatType, { numbers: args[0] });
    case 'MULTIPLY':
      return multiply(formatType, { numbers: args[0] });
    case 'SUBSTRACTION':
      return substraction(formatType, { numbers1: args[0], numbers2: args[1] });
    case 'FORMAT_DATE':
      if (!timezone) timezone = '(GMT+5:30)';
      // eslint-disable-next-line no-case-declarations
      const str = timezone.substring(4, 10);
      timezone = moment().utcOffset(str).utcOffset();
      return formatDate(formatType, args[0], timezone);
    case 'MARKDOWN_TO_HTML':
      return markdownToHtml(args[0]);
    default:
      return;
  }
};

export const htmlRegex =
  /<(br|basefont|hr|input|source|frame|param|area|meta|!--|col|link|option|base|img|wbr|!DOCTYPE).*?>|<(a|abbr|acronym|address|applet|article|aside|audio|b|bdi|bdo|big|blockquote|body|button|canvas|caption|center|cite|code|colgroup|command|datalist|dd|del|details|dfn|dialog|dir|div|dl|dt|em|embed|fieldset|figcaption|figure|font|footer|form|frameset|head|header|hgroup|h1|h2|h3|h4|h5|h6|html|i|iframe|ins|kbd|keygen|label|legend|li|map|mark|menu|meter|nav|noframes|noscript|object|ol|optgroup|output|p|pre|progress|q|rp|rt|ruby|s|samp|script|section|select|small|span|strike|strong|style|sub|summary|sup|table|tbody|td|textarea|tfoot|th|thead|time|title|tr|track|tt|u|ul|var|video).*?<\/\2>/i;

export const parseCookieToJson = (headers) => {
  let cookies = {};
  const cookieArr = headers && headers.cookie ? headers.cookie.split(';') : [];
  cookieArr.forEach((cookie) => {
    const [key, value] = cookie.split('=');
    cookies[key.trim()] = value;
  });
  return cookies;
};
