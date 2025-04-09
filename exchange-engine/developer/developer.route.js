import express from 'express';
import {
  bulkDelete,
  countItemsByFilter,
  createBulkItem,
  createItem,
  deleteItem,
  findAllItems,
  findAllUpdatedItems,
  findItemDetail,
  findItemsByFilter,
  sendDynamicEmail,
  sendEmail,
  updateFileObject,
  updateItem,
} from './developer.controller';
import checkdb from '../middleware/dbchecking.middleware';
import verifyToken from '../middleware/verifyToken.middleware';
import { fileUploadToServer } from '../upload-api/upload.controller';
import { cryptItemData } from '../middleware/encryption.middleware';
import { verifyJwtForOpen } from '../loginPlugin/jwtUtils';
import devAuthorize from '../middleware/devAuth.middleware';
import { authIpRateLimiter, loginLimiter } from '../middleware/authRateLimiter.middleware';
import { loginWithProvider } from '../loginPlugin/user.controller';
import { getAllTypesenseIndexedData } from '../typesense-search/typesenseSearch.controller';
const developerRouter = express.Router();

/**
 * @openapi
 * /login:
 *  post:
 *      tags: [User]
 *      description: Login with Username and Password
 *      parameters:
 *        - in: header
 *          name: x-api-key
 *          schema:
 *            type: string
 *          required: false
 *          description: Developer API Key generated from Project Setting
 *      requestBody:
 *        required: true
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                userName:
 *                  type: string
 *                  example: userName
 *                password:
 *                  type: string
 *                  example: password
 *      responses:
 *          200:
 *              description: User Logged in Successfully.
 *              content:
 *                  application/json:
 *                      schema:
 *                          type: object
 *                          properties:
 *                            code:
 *                              type: number
 *                            data:
 *                              type: object
 *          404:
 *              description: Could not find User.
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          401:
 *              description: Not a valid token.
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          422:
 *              description: Required Params or header is missing
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          403:
 *              description: Not Authorized to perform this action
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 */
developerRouter.post(
  '/login',
  checkdb,
  verifyToken,
  devAuthorize,
  loginLimiter,
  authIpRateLimiter,
  loginWithProvider,
);

/**
 * @openapi
 * /collection/{collectionName}/items:
 *  post:
 *      tags: [Collection Item]
 *      requestBody:
 *         content:
 *            application/json:
 *               schema:
 *                  type: object
 *      description: Add Item to a collection
 *      parameters:
 *        - in: path
 *          name: collectionName
 *          type: string
 *          required: true
 *          description: Name of Collection to get record
 *        - in: header
 *          name: x-api-key
 *          description: Developer API Key generated from Project Setting
 *          required: false
 *          type: string
 *          value: A7E34-4E41-4591-9ED4
 *        - in: header
 *          name: Authorization
 *          description: User authentication/authorization token generated after user login
 *          required: false
 *          type: string
 *          value: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
 *      responses:
 *          200:
 *              description: Item has been created
 *              content:
 *                  application/json:
 *                      schema:
 *                          type: object
 *                          properties:
 *                            code:
 *                              type: number
 *                            data:
 *                              type: object
 *          404:
 *              description: No Collection Found
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          401:
 *              description: Not a valid token.
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          422:
 *              description: Required Params is missing
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          403:
 *              description: Not Authorized to perform this action
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 */
developerRouter.post(
  '/collection/:collectionName/items/',
  checkdb,
  verifyToken,
  verifyJwtForOpen,
  devAuthorize,
  cryptItemData,
  createItem,
);
/**
 * @openapi
 * /collection/{collectionName}/items:
 *  get:
 *      tags: [Collection Item]
 *      description: Return all items
 *      parameters:
 *        - in: path
 *          name: collectionName
 *          type: string
 *          required: true
 *          description: Name of Collection to get record
 *        - in: header
 *          name: x-api-key
 *          description: Developer API Key generated from Project Setting
 *          required: false
 *          type: string
 *          value: A7E34-4E41-4591-9ED4
 *        - in: header
 *          name: Authorization
 *          description: User authentication/authorization token generated after user login
 *          required: false
 *          type: string
 *          value: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
 *        - in: query
 *          name: query
 *          schema:
 *            type: object
 *            additionalProperties:
 *               offset:
 *                 type: integer
 *                 description: 0
 *               max:
 *                 type: integer
 *                 description: 100
 *            example:
 *               "offset": "0"
 *               "max": "100"
 *               "fieldName1:EQUALS": "value"
 *               "fieldName2:IS_NOT_NULL": "value"
 *               "fieldName3:IS_NULL": "value"
 *               "fieldName4:LIKE": "value"
 *               "fieldName5:LESS_THAN_EQUALS_TO": "value"
 *               "fieldName6:GREATER_THAN_EQUALS_TO": "value"
 *               "fieldName7:LESS_THAN": "value"
 *               "fieldName8:GREATER_THAN": "value"
 *               "fieldName9:IN_LIST": ["value1", "value2"]
 *               "fieldName10:NOT_IN_LIST": ["value1", "value2"]
 *      responses:
 *          200:
 *              description: All Items in this collection
 *              content:
 *                  application/json:
 *                      schema:
 *                          type: array
 *          400:
 *              description: Failed to Save
 *              content:
 *                  application/json:
 *                      schema:
 *                          type: object
 *                          properties:
 *                              message:
 *                                  type: string
 *                              code:
 *                                  type: number
 *          404:
 *              description: No Collection Found
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          401:
 *              description: Not a valid token.
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          422:
 *              description: Required Params is missing
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          403:
 *              description: Not Authorized to perform this action
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 */
developerRouter.get(
  '/collection/:collectionName/items',
  checkdb,
  verifyToken,
  verifyJwtForOpen,
  devAuthorize,
  findAllItems,
);

developerRouter.get('/collection/:collectionName/updated-items', verifyToken, findAllUpdatedItems);
/**
 * @openapi
 * /collection/{collectionName}/filter/{filterUuid}/items:
 *  get:
 *      tags: [Collection Item]
 *      description: It will return all items, according to filter
 *      parameters:
 *        - in: path
 *          name: collectionName
 *          type: string
 *          required: true
 *          description: Name of Collection to get record
 *        - in: path
 *          name: filterUuid
 *          type: string
 *          required: true
 *          description: Unique Id of Collection Filter
 *        - in: query
 *          name: query
 *          schema:
 *            type: object
 *            additionalProperties:
 *               type: string
 *          style: form
 *          explode: true
 *        - in: header
 *          name: x-api-key
 *          description: Developer API Key generated from Project Setting
 *          required: false
 *          type: string
 *          value: A7E34-4E41-4591-9ED4
 *        - in: header
 *          name: Authorization
 *          description: User authentication/authorization token generated after user login
 *          required: false
 *          type: string
 *          value: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
 *      responses:
 *          200:
 *              description: Filtered Items
 *              content:
 *                  application/json:
 *                      schema:
 *                          type: object
 *                          properties:
 *                              code:
 *                                  type: number
 *                              message:
 *                                  type: string
 *                              result:
 *                                  type: object
 *                              count:
 *                                  type: number
 *          400:
 *              description: Failed to Save
 *              content:
 *                  application/json:
 *                      schema:
 *                          type: object
 *                          properties:
 *                              message:
 *                                  type: string
 *                              code:
 *                                  type: number
 *          404:
 *              description: No Collection Found
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          401:
 *              description: Not a valid token.
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          422:
 *              description: Required Params is missing
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          403:
 *              description: Not Authorized to perform this action
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 */
developerRouter.get(
  '/collection/:collectionName/filter/:filterUuid/items',
  checkdb,
  verifyToken,
  verifyJwtForOpen,
  devAuthorize,
  findItemsByFilter,
);

/**
 * @openapi
 * /collection/{collectionName}/filter/{filterUuid}/count:
 *  get:
 *      tags: [Collection Item]
 *      description: Return the count of items, according to filter
 *      parameters:
 *        - in: path
 *          name: collectionName
 *          type: string
 *          required: true
 *          description: Name of Collection to get record
 *        - in: path
 *          name: filterUuid
 *          type: string
 *          required: true
 *          description: Unique Id of Collection Filter
 *        - in: header
 *          name: x-api-key
 *          description: Developer API Key generated from Project Setting
 *          required: false
 *          type: string
 *          value: A7E34-4E41-4591-9ED4
 *        - in: header
 *          name: Authorization
 *          description: User authentication/authorization token generated after user login
 *          required: false
 *          type: string
 *          value: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
 *      responses:
 *          200:
 *              description: Count of filtered items
 *              content:
 *                  application/json:
 *                      schema:
 *                          type: object
 *                          properties:
 *                              code:
 *                                  type: number
 *                              message:
 *                                  type: string
 *                              result:
 *                                  type: object
 *                              count:
 *                                  type: number
 *          400:
 *              description: Failed to Save
 *              content:
 *                  application/json:
 *                      schema:
 *                          type: object
 *                          properties:
 *                              message:
 *                                  type: string
 *                              code:
 *                                  type: number
 *          404:
 *              description: No Collection Found
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          401:
 *              description: Not a valid token.
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          422:
 *              description: Required Params is missing
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          403:
 *              description: Not Authorized to perform this action
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 */
developerRouter.get(
  '/collection/:collectionName/filter/:filterUuid/count',
  checkdb,
  verifyToken,
  verifyJwtForOpen,
  devAuthorize,
  countItemsByFilter,
);

/**
 * @openapi
 * /collection/{collectionName}/itemsbyids:
 *  post:
 *      tags: [Collection Item]
 *      requestBody:
 *         content:
 *            application/json:
 *               schema:
 *                  type: object
 *      description: Return all items according to ids or query
 *      parameters:
 *        - in: path
 *          name: collectionName
 *          type: string
 *          required: true
 *          description: Name of Collection to get record
 *        - in: query
 *          name: ids
 *          type: array
 *          collectionFormat: csv
 *          items:
 *            type: string
 *          required: false
 *          description: Optional send it in query or body
 *        - in: header
 *          name: x-api-key
 *          description: Developer API Key generated from Project Setting
 *          required: false
 *          type: string
 *          value: A7E34-4E41-4591-9ED4
 *        - in: header
 *          name: Authorization
 *          description: User authentication/authorization token generated after user login
 *          required: false
 *          type: string
 *          value: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
 *      responses:
 *          200:
 *              description: Count of filtered items
 *              content:
 *                  application/json:
 *                      schema:
 *                          type: array
 *          400:
 *              description: Failed to Save
 *              content:
 *                  application/json:
 *                      schema:
 *                          type: object
 *                          properties:
 *                              message:
 *                                  type: string
 *                              code:
 *                                  type: number
 *          404:
 *              description: No Collection Found
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          401:
 *              description: Not a valid token.
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          422:
 *              description: Required Params is missing
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          403:
 *              description: Not Authorized to perform this action
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 */
developerRouter.post(
  '/collection/:collectionName/itemsbyids',
  checkdb,
  verifyToken,
  verifyJwtForOpen,
  devAuthorize,
  findAllItems,
);

/**
 * @openapi
 * /collection/{collectionName}/item/{itemUuid}:
 *  get:
 *      tags: [Collection Item]
 *      description: Get Item Details
 *      parameters:
 *        - in: path
 *          name: collectionName
 *          type: string
 *          required: true
 *          description: Name of Collection to get record
 *        - in: path
 *          name: itemUuid
 *          type: string
 *          required: true
 *          description: Item unique id to get details
 *        - in: header
 *          name: x-api-key
 *          description: Developer API Key generated from Project Setting
 *          required: false
 *          type: string
 *          value: A7E34-4E41-4591-9ED4
 *        - in: header
 *          name: Authorization
 *          description: User authentication/authorization token generated after user login
 *          required: false
 *          type: string
 *          value: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
 *      responses:
 *          200:
 *              description: Item details
 *              content:
 *                  application/json:
 *                      schema:
 *                          type: object
 *          404:
 *              description: No Collection Found
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          401:
 *              description: Not a valid token.
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          422:
 *              description: Required Params is missing
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          403:
 *              description: Not Authorized to perform this action
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 */
developerRouter.get(
  '/collection/:collectionName/item/:itemUuid',
  checkdb,
  verifyToken,
  verifyJwtForOpen,
  devAuthorize,
  findItemDetail,
);

/**
 * @openapi
 * /collection/{collectionName}/item/{itemUuid}:
 *  put:
 *      tags: [Collection Item]
 *      requestBody:
 *         content:
 *            application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   ids:
 *                     type: string
 *                 example:
 *                     ids: 8bf7f496-9aac-4075-9961-fab035ff90e1
 *      description: Update Item of a collection
 *      parameters:
 *        - in: path
 *          name: collectionName
 *          type: string
 *          required: true
 *          description: Name of Collection to get record
 *        - in: path
 *          name: itemUuid
 *          type: string
 *          required: true
 *          description: Item unique id to get details
 *        - in: header
 *          name: x-api-key
 *          description: Developer API Key generated from Project Setting
 *          required: false
 *          type: string
 *          value: A7E34-4E41-4591-9ED4
 *        - in: header
 *          name: Authorization
 *          description: User authentication/authorization token generated after user login
 *          required: false
 *          type: string
 *          value: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
 *      responses:
 *          200:
 *              description: Item has been updated
 *              content:
 *                  application/json:
 *                      schema:
 *                          type: object
 *                          properties:
 *                            code:
 *                              type: number
 *                            data:
 *                              type: object
 *          404:
 *              description: No Collection Found
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          401:
 *              description: Not a valid token.
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          422:
 *              description: Required Params is missing
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          403:
 *              description: Not Authorized to perform this action
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 */
developerRouter.put(
  '/collection/:collectionName/item/:itemUuid',
  checkdb,
  verifyToken,
  verifyJwtForOpen,
  devAuthorize,
  cryptItemData,
  updateItem,
);

/**
 * @openapi
 * /collection/{collectionName}/item/{itemUuid}:
 *  delete:
 *      tags: [Collection Item]
 *      description: Delete Item of a collection
 *      parameters:
 *        - in: path
 *          name: collectionName
 *          type: string
 *          required: true
 *          description: Name of Collection to get record
 *        - in: path
 *          name: itemUuid
 *          type: string
 *          required: true
 *          description: Item unique id to get details
 *        - in: header
 *          name: x-api-key
 *          description: Developer API Key generated from Project Setting
 *          required: false
 *          type: string
 *          value: A7E34-4E41-4591-9ED4
 *        - in: header
 *          name: Authorization
 *          description: User authentication/authorization token generated after user login
 *          required: false
 *          type: string
 *          value: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
 *      responses:
 *          200:
 *              description: Item has been deleted
 *              content:
 *                  application/json:
 *                      schema:
 *                          type: object
 *          404:
 *              description: No Collection Found
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          401:
 *              description: Not a valid token.
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          422:
 *              description: Required Params is missing
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          403:
 *              description: Not Authorized to perform this action
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 */
developerRouter.delete(
  '/collection/:collectionName/item/:itemUuid',
  checkdb,
  verifyToken,
  verifyJwtForOpen,
  devAuthorize,
  deleteItem,
);

/**
 * @openapi
 * /collection/{collectionName}/bulk/:
 *  post:
 *      tags: [Collection Item]
 *      requestBody:
 *         required: true
 *         content:
 *            application/json:
 *               schema:
 *                  type: object
 *      description: Bulk Add Items of a collection
 *      parameters:
 *        - in: path
 *          name: collectionName
 *          type: string
 *          required: true
 *          description: Name of Collection to get record
 *        - in: body
 *          name: items
 *          description: Send items in body
 *          schema:
 *            type: object
 *            required:
 *              - items
 *              - primaryKey
 *            properties:
 *              items:
 *                type: array
 *                items:
 *                  type: object
 *              primaryKey:
 *                type: string
 *        - in: header
 *          name: x-api-key
 *          description: Developer API Key generated from Project Setting
 *          required: false
 *          type: string
 *          value: A7E34-4E41-4591-9ED4
 *        - in: header
 *          name: Authorization
 *          description: User authentication/authorization token generated after user login
 *          required: false
 *          type: string
 *          value: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
 *      responses:
 *          200:
 *              description: Items have been created
 *              content:
 *                  application/json:
 *                      schema:
 *                          type: array
 *                          properties:
 *                            code:
 *                              type: number
 *                            data:
 *                              type: object
 *          404:
 *              description: No Collection Found
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          401:
 *              description: Not a valid token.
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          422:
 *              description: Required Params is missing
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          403:
 *              description: Not Authorized to perform this action
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 */
developerRouter.post(
  '/collection/:collectionName/bulk/',
  checkdb,
  verifyToken,
  verifyJwtForOpen,
  devAuthorize,
  createBulkItem,
);

/**
 * @openapi
 * /collection/{collectionName}/bulkDelete:
 *  post:
 *      tags: [Collection Item]
 *      requestBody:
 *         content:
 *            application/json:
 *               schema:
 *                  type: object
 *      description: Bulk Delete Items of a collection
 *      parameters:
 *        - in: path
 *          name: collectionName
 *          type: string
 *          required: true
 *          description: Name of Collection to get record
 *        - in: body
 *          name: ids
 *          description: Send ids in body
 *          required: true
 *          schema:
 *            type: object
 *            required:
 *              - ids
 *            properties:
 *              ids:
 *                type: array
 *                items:
 *                  type: string
 *        - in: header
 *          name: x-api-key
 *          description: Developer API Key generated from Project Setting
 *          required: false
 *          type: string
 *          value: A7E34-4E41-4591-9ED4
 *        - in: header
 *          name: Authorization
 *          description: User authentication/authorization token generated after user login
 *          required: false
 *          type: string
 *          value: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
 *      responses:
 *          200:
 *              description: Items have been deleted
 *              content:
 *                  application/json:
 *                      schema:
 *                          type: array
 *          404:
 *              description: No Collection Found
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          401:
 *              description: Not a valid token.
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          422:
 *              description: Required Params is missing
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          403:
 *              description: Not Authorized to perform this action
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 */
developerRouter.post(
  '/collection/:collectionName/bulkDelete',
  checkdb,
  verifyToken,
  verifyJwtForOpen,
  devAuthorize,
  bulkDelete,
);

/**
 * @openapi
 * /collection/{collectionName}/items/constructor/:constructorId?:
 *  post:
 *      tags: [Collection Item]
 *      requestBody:
 *         content:
 *            application/json:
 *               schema:
 *                  type: object
 *      description: Add Item to a collection
 *      parameters:
 *        - in: path
 *          name: collectionName
 *          type: string
 *          required: true
 *          description: Name of Collection to get record
 *        - in: path
 *          name: constructorId
 *          type: string
 *          required: false
 *          description: Name of Collection to get record
 *        - in: header
 *          name: x-api-key
 *          description: Developer API Key generated from Project Setting
 *          required: false
 *          type: string
 *          value: A7E34-4E41-4591-9ED4
 *        - in: header
 *          name: Authorization
 *          description: User authentication/authorization token generated after user login
 *          required: false
 *          type: string
 *          value: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
 *      responses:
 *          200:
 *              description: Item has been created
 *              content:
 *                  application/json:
 *                      schema:
 *                          type: object
 *                          properties:
 *                            code:
 *                              type: number
 *                            data:
 *                              type: object
 *          404:
 *              description: No Collection Found
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          401:
 *              description: Not a valid token.
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          422:
 *              description: Required Params is missing
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          403:
 *              description: Not Authorized to perform this action
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 */
developerRouter.post(
  '/collection/:collectionName/items/constructor/:constructorId?',
  verifyToken,
  verifyJwtForOpen,
  devAuthorize,
  createItem,
);

/**
 * @openapi
 * /upload/{collectionName}/{fieldId}:
 *  post:
 *      tags: [Collection Item]
 *      requestBody:
 *         required: true
 *         content:
 *            multipart/form-data:
 *               schema:
 *                  type: object
 *      description: Upload a File
 *      parameters:
 *        - in: path
 *          name: collectionName
 *          type: string
 *          required: true
 *          description: Name of Collection.
 *        - in: path
 *          name: fieldId
 *          type: string
 *          required: true
 *          description: Name of Collection Field.
 *        - in: header
 *          name: x-api-key
 *          description: Developer API Key generated from Project Setting
 *          required: false
 *          type: string
 *          value: A7E34-4E41-4591-9ED4
 *        - in: header
 *          name: Authorization
 *          description: User authentication/authorization token generated after user login
 *          required: false
 *          type: string
 *          value: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
 *      responses:
 *          200:
 *              description: Item has been created
 *              content:
 *                  application/json:
 *                      schema:
 *                          type: object
 *                          properties:
 *                            code:
 *                              type: number
 *                            data:
 *                              type: object
 *          404:
 *              description: No Collection Found
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          401:
 *              description: Not a valid token.
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          422:
 *              description: Required Params is missing
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          403:
 *              description: Not Authorized to perform this action
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 */
developerRouter.post(
  '/upload/:collectionId/:fieldId',
  checkdb,
  verifyToken,
  verifyJwtForOpen,
  devAuthorize,
  fileUploadToServer,
);

/**
 * @openapi
 * /sendEmail/{templateId}/user/{sendTo}:
 *  post:
 *      tags: [Email]
 *      requestBody:
 *         content:
 *            application/json:
 *               schema:
 *                  type: object
 *      description: Send an Email
 *      parameters:
 *        - in: path
 *          name: templateId
 *          type: string
 *          required: true
 *          description: Uuid of Email Template.
 *        - in: path
 *          name: sendTo
 *          type: string
 *          required: false
 *          description: Email or Uuid of User to send email to.
 *        - in: header
 *          name: x-api-key
 *          description: Developer API Key generated from Project Setting
 *          required: false
 *          type: string
 *          value: A7E34-4E41-4591-9ED4
 *        - in: header
 *          name: Authorization
 *          description: User authentication/authorization token generated after user login
 *          required: false
 *          type: string
 *          value: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
 *      responses:
 *          200:
 *              description: Email has been Sent.
 *              content:
 *                  application/json:
 *                      schema:
 *                          type: object
 *                          properties:
 *                            code:
 *                              type: number
 *                            data:
 *                              type: object
 *          404:
 *              description: Could not find the email or template.
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          401:
 *              description: Not a valid token.
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          422:
 *              description: Required Params is missing
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          403:
 *              description: Not Authorized to perform this action
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 */
developerRouter.post(
  '/sendEmail/:templateId/user/:sendTo',
  checkdb,
  verifyToken,
  verifyJwtForOpen,
  devAuthorize,
  sendEmail,
);

/**
 * @openapi
 * /sendDynamicEmail/{templateId}/sendToCollection/{sendToCollectionName}/item/{collectionItemId}:
 *  post:
 *      tags: [Email]
 *      requestBody:
 *         content:
 *            application/json:
 *               schema:
 *                  type: object
 *      description: Send an Email
 *      parameters:
 *        - in: path
 *          name: templateId
 *          type: string
 *          required: true
 *          description: Uuid of Email Template.
 *        - in: path
 *          name: sendToCollectionName
 *          type: string
 *          required: false
 *          description: Send To Collection Name.
 *        - in: path
 *          name: collectionItemId
 *          type: string
 *          required: false
 *          description: Uuid of Collection Item.
 *        - in: body
 *          name: sendTo
 *          description: Email or Uuid of User to send email to.
 *          required: true
 *          schema:
 *            type: object
 *            required:
 *              - sendTo
 *            properties:
 *              sendTo:
 *                type: array
 *                items:
 *                  type: string
 *        - in: body
 *          name: emailCC
 *          description: Email or Uuid of User for CC
 *          required: true
 *          schema:
 *            type: object
 *            required:
 *              - emailCC
 *            properties:
 *              emailCC:
 *                type: array
 *                items:
 *                  type: string
 *        - in: body
 *          name: emailBCC
 *          description: Email or Uuid for BCC
 *          required: true
 *          schema:
 *            type: object
 *            required:
 *              - emailBCC
 *            properties:
 *              emailBCC:
 *                type: array
 *                items:
 *                  type: string
 *        - in: body
 *          name: sendToField
 *          description: Send To Collection Email Field
 *          required: false
 *          schema:
 *            type: object
 *            required:
 *              - sendToField
 *            properties:
 *              sendToField:
 *                type: string
 *        - in: header
 *          name: x-api-key
 *          description: Developer API Key generated from Project Setting
 *          required: false
 *          type: string
 *          value: A7E34-4E41-4591-9ED4
 *        - in: header
 *          name: Authorization
 *          description: User authentication/authorization token generated after user login
 *          required: false
 *          type: string
 *          value: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
 *      responses:
 *          200:
 *              description: Email has been Sent.
 *              content:
 *                  application/json:
 *                      schema:
 *                          type: object
 *                          properties:
 *                            code:
 *                              type: number
 *                            data:
 *                              type: object
 *          404:
 *              description: Could not find the email or template.
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          401:
 *              description: Not a valid token.
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          422:
 *              description: Required Params is missing
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 *          403:
 *              description: Not Authorized to perform this action
 *              content:
 *                application/json:
 *                  schema:
 *                    type: object
 *                    properties:
 *                      message:
 *                        type: string
 *                      code:
 *                        type: number
 */
developerRouter.post(
  '/sendDynamicEmail/:templateId/sendToCollection/:sendToCollectionName/item/:collectionItemId',
  checkdb,
  verifyToken,
  verifyJwtForOpen,
  devAuthorize,
  sendDynamicEmail,
);

developerRouter.put(
  '/updateFileObject/:collectionName/:fileObjectUuid',
  checkdb,
  verifyToken,
  verifyJwtForOpen,
  updateFileObject,
);

developerRouter.get(
  '/typesense-search/get-all-indexed-data/:typesenseCollectionName',
  checkdb,
  verifyToken,
  verifyJwtForOpen,
  getAllTypesenseIndexedData,
);

export default developerRouter;
