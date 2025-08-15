import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";

const domain = "api.dummy.com";

export class WordServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const getWordHandler = new NodejsFunction(this, "GetWordHandler", {
      entry: "lambda/get-word.ts",
      handler: "handler",
      runtime: cdk.aws_lambda.Runtime.NODEJS_LATEST,
    });

    const api = new apigw.RestApi(this, "WordApi", {
      restApiName: "Word Service API",
      deployOptions: {
        cachingEnabled: true,
        cacheClusterEnabled: true,
        stageName: "prod",
        dataTraceEnabled: true,
        loggingLevel: apigw.MethodLoggingLevel.INFO,
        cacheTtl: cdk.Duration.hours(1),
        throttlingBurstLimit: 100,
        throttlingRateLimit: 100,
        tracingEnabled: true,
        metricsEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: ["dummy"],
        allowMethods: ["GET"],
        allowHeaders: apigw.Cors.DEFAULT_HEADERS,
      },
      cloudWatchRole: true,
    });

    const words = api.root.addResource("words");
    const wordResource = words.addResource("{word}");

    wordResource.addMethod(
      "GET",
      new apigw.LambdaIntegration(getWordHandler, {
        proxy: true,
        allowTestInvoke: true,
        cacheKeyParameters: ["method.request.path.word"],
        cacheNamespace: "wordCache",
        requestParameters: {
          "integration.request.path.word": "method.request.path.word",
        },
      }),
      {
        requestParameters: {
          "method.request.path.word": true,
        },
      }
    );

    new apigw.BasePathMapping(this, "BasePathMapping", {
      domainName: apigw.DomainName.fromDomainNameAttributes(
        this,
        "DomainName",
        {
          domainName: domain,
          domainNameAliasHostedZoneId: "dummy",
          domainNameAliasTarget: "dummy",
        }
      ),
      restApi: api,
    });
  }
}
