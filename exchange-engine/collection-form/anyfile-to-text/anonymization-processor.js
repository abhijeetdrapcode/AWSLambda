function normalizeContent(content) {
  if (typeof content !== 'string') {
    console.error('Invalid content type provided', {
      type: typeof content,
    });
    throw new Error('Invalid content type provided');
  }

  const segments = content.split('\n').map((line) => ({
    originalLine: line,
    content: line
      // eslint-disable-next-line
      .replace(/[\x00-\x08\x0B-\x1F\x7F-\x9F]/g, '')
      .replace(/^ÿþ/, '')
      .trim(),
    indentation: line.match(/^\s*/)[0].length,
    leadingSpace: line.match(/^\s*/)[0],
    trailingSpace: line.match(/\s*$/)[0],
  }));

  return segments;
}

function getMatchContext(content, term, contextSize = 50) {
  try {
    content = content.trim();
    term = term.trim();
    const index = content.toLowerCase().indexOf(term.toLowerCase());
    if (index === -1) return '';

    const start = Math.max(0, index - contextSize);
    const end = Math.min(content.length, index + term.length + contextSize);
    return content.substring(start, end);
  } catch (error) {
    console.warn('Error getting match context:', error);
    return '';
  }
}

function escapeRegExp(string) {
  if (typeof string !== 'string') {
    throw new Error('Invalid string type for RegExp escaping');
  }
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function detectCustomTerms(content, terms, rejectedTerms = new Map()) {
  if (!content || !terms) {
    throw new Error('Missing required parameters');
  }

  let changes = [];
  content = content // eslint-disable-next-line
    .replace(/[\x00-\x08\x0B-\x1F\x7F-\x9F]/g, '')
    .replace(/^ÿþ/, '')
    .trim();
  const termList = terms
    .split(',')
    .filter((term) => term && !rejectedTerms.has(term.toLowerCase()));
  for (const term of termList) {
    const termPattern = new RegExp(escapeRegExp(term), 'gi');
    const matches = content.match(termPattern) || [];
    if (matches.length > 0) {
      const change = {
        id: `term_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`,
        original: term,
        replacement: `[REDACTED_CUSTOM_${Date.now().toString(36)}]`,
        type: 'custom',
        status: 'pending',
        occurrences: matches.length,
        metadata: {
          originalTerm: term,
          matchedVariants: [...new Set(matches)],
          matchCount: matches.length,
          samples: matches.slice(0, 3),
          contexts: matches.slice(0, 3).map((match) => getMatchContext(content, match)),
          confidence: 1.0,
        },
      };
      changes.push(change);
    }
  }
  return changes;
}

export const processNlpAnonymization = async (content) => {
  try {
    if (!content) {
      throw new Error('Content is required');
    }

    let anonymization = {
      patterns: {
        emails: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        names: /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g,
        phones: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
        ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
      },
      replacements: {
        emails: '[REDACTED_EMAIL]',
        names: '[REDACTED_NAME]',
        phones: '[REDACTED_PHONE]',
        ssn: '[REDACTED_SSN]',
      },
    };

    let processedContent = '';
    let segments = normalizeContent(content);
    const termDetails = [];

    const anonymizedSegments = segments.map((segment) => {
      let anonymizedContent = segment.content;

      Object.entries(anonymization.patterns).forEach(([key, pattern]) => {
        const replacement = anonymization.replacements[key];
        const matches = anonymizedContent.match(pattern);

        if (matches) {
          matches.forEach((match) => {
            termDetails.push({
              patternType: key,
              original: match,
              replaced: replacement,
              context: anonymizedContent,
            });
          });

          anonymizedContent = anonymizedContent.replace(pattern, replacement);
        }
      });

      return segment.leadingSpace + anonymizedContent + segment.trailingSpace;
    });

    processedContent = anonymizedSegments.join('\n');

    return {
      processedContent,
      termDetails,
    };
  } catch (error) {
    console.error(error);
    throw error;
  }
};

export const processCustomTermsAnonymization = async (content, customTerms = '') => {
  try {
    if (!(content && customTerms)) {
      throw new Error('Content is required');
    }

    let processedContent = '';
    let segments = normalizeContent(content);

    const customChanges = await detectCustomTerms(content, customTerms);

    const termDetails = [];

    const anonymizedSegments = segments.map((segment) => {
      let anonymizedContent = segment.content;
      for (const change of customChanges) {
        if (!change.original || !change.replacement) {
          console.warn('Skipping invalid change:', change);
          continue;
        }
        const regex = new RegExp(escapeRegExp(change.original), 'gi');
        const matchCount = (anonymizedContent.match(regex) || []).length;

        if (matchCount > 0) {
          // Add term details for logging
          termDetails.push({
            original: change.original,
            replaced: change.replacement,
            context: anonymizedContent,
          });
        }
        anonymizedContent = anonymizedContent.replace(regex, change.replacement);
      }
      return segment.leadingSpace + anonymizedContent + segment.trailingSpace;
    });

    processedContent = anonymizedSegments.join('\n');

    return {
      processedContent,
      termDetails,
    };
  } catch (error) {
    console.error(error);
    throw error;
  }
};
