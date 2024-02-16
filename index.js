const {LambdaClient,CreateFunctionCommand} = require("@aws-sdk/client-lambda");
const {IAMClient, AttachRolePolicyCommand} = require("@aws-sdk/client-iam");
const childProcess = require('child_process');
const{readFileSync} = require('fs');


const lambdaClient = new LambdaClient({
    region: "ap-south-1",
    credentials: {
        accessKeyId: "AKIA3NNAUZ6H3MBLIWMT",
        secretAccessKey: "x5k7ZFUB9kgi2cYwuhdIpVdPac0aTfl8wgP8bD8n",
    },
})

childProcess.execSync('zip exampleLambda.zip example.js');

const iamClient = new IAMClient({
    region:"ap-south-1",

})

const code = readFileSync("./exampleLambda.zip");

const lambdaParams = {
    FunctionName: "Testing",
    Code:{
        ZipFile : code
    },
    Handler: "example.handler",
    Role: "arn:aws:iam::784705310607:role/awsLambdaRole",
    Runtime:"nodejs20.x",
    Description: "This is just for testing purpose"
};

const iamparams = {
    RoleName: "awsLambdaRole",
    PolicyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
};

const createFunctionCommand = new CreateFunctionCommand(lambdaParams);

lambdaClient.send(createFunctionCommand)
.then((data)=>{
    console.log("Lambda Function created successfully: ", data);
    const attachPolicyCommand = new AttachRolePolicyCommand(iamparams);
    return iamClient.send(attachPolicyCommand);
})
