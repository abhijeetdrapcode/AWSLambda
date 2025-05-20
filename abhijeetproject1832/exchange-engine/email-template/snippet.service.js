export const findTemplate = async (dbConnection, query) => {
  const snippetModel = dbConnection.collection('snippets');
  return await snippetModel.findOne(query);
};

export const listModalHtmlTemplates = async (dbConnection) => {
  const snippetModel = dbConnection.collection('Snippets');
  const query = { snippetType: 'MODAL' };
  return await snippetModel.find(query).toArray();
};
