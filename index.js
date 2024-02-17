const {LambdaClient,CreateFunctionCommand} = require("@aws-sdk/client-lambda");
const {IAMClient, AttachRolePolicyCommand} = require("@aws-sdk/client-iam");
const childProcess = require('child_process');
const{readFileSync} = require('fs');


const lambdaClient = new LambdaClient({
    region: "ap-south-1",
    credentials: {
        accessKeyId: "Ente your key here",
        secretAccessKey: "Enter your secret key here",
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
    Role: "Enter your role here",
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
