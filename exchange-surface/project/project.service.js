import axios from 'axios';
const BUILDER_ENGINE = process.env.BUILDER_ENGINE;

export const findProjectByName = async (builderDB, projectUrl) => {
  const Project = await builderDB.collection('projects');
  return await Project.findOne({
    url: projectUrl,
  });
};

export const findProjectByQuery = async (builderDB, query) => {
  const Project = await builderDB.collection('projects');
  let project = await Project.findOne(query);
  if (project) {
    return project;
  }
  console.log('query findProjectByQuery :>> ', query);
  const projectUrl = `${BUILDER_ENGINE}projects/core/query/exchange`;
  const response = await makePostApiCall(projectUrl, query);
  // TODO: In case of custom domain, old record with id exists. So new record not created.
  // Check project with uuid before saving new record
  if (response) {
    await Project.deleteOne({ uuid: response.uuid });
    try {
      await Project.insertOne(response);
      return response;
    } catch (error) {
      console.log('error :>> ', error);
      console.log('Failed to save project in project_detail db');
      return null;
    }
  }
  return null;
};

const makePostApiCall = async (url, body) => {
  const header = {
    headers: {
      'Content-Type': 'application/json',
    },
  };
  try {
    const response = await axios.post(url, body, header);
    return response.data;
  } catch (error) {
    console.log('error :>> ', error);
    return null;
  }
};
