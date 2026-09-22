param location string
param name string
param environmentId string
param registryServer string
param identityResourceId string
param image string
param keyVaultUri string
param plainEnvironment array = []
param secretEnvironment array = []
param triggerType string = 'Manual'
param cronExpression string = ''
param replicaTimeout int = 900
param replicaRetryLimit int = 1
param cpu string = '0.25'
param memory string = '0.5Gi'

var triggerConfiguration = triggerType == 'Schedule'
  ? {
      triggerType: 'Schedule'
      scheduleTriggerConfig: {
        cronExpression: cronExpression
        parallelism: 1
        replicaCompletionCount: 1
      }
    }
  : {
      triggerType: 'Manual'
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
    }

var secretDefinitions = [
  for item in secretEnvironment: {
    name: item.secretName
    keyVaultUrl: '${keyVaultUri}secrets/${item.keyVaultSecretName}'
    identity: identityResourceId
  }
]
var plainEnvironmentVariables = [
  for item in plainEnvironment: {
    name: item.name
    value: item.value
  }
]
var secretEnvironmentVariables = [
  for item in secretEnvironment: {
    name: item.environmentName
    secretRef: item.secretName
  }
]
var environmentVariables = concat(plainEnvironmentVariables, secretEnvironmentVariables)

resource job 'Microsoft.App/jobs@2024-03-01' = {
  name: name
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identityResourceId}': {}
    }
  }
  properties: {
    environmentId: environmentId
    configuration: union(triggerConfiguration, {
      replicaTimeout: replicaTimeout
      replicaRetryLimit: replicaRetryLimit
      registries: [
        {
          server: registryServer
          identity: identityResourceId
        }
      ]
      secrets: secretDefinitions
    })
    template: {
      containers: [
        {
          name: name
          image: image
          env: environmentVariables
          resources: {
            cpu: json(cpu)
            memory: memory
          }
        }
      ]
    }
  }
}

output id string = job.id
output name string = job.name
