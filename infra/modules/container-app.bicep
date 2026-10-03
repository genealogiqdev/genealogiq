param location string
param name string
param environmentId string
param registryServer string
param identityResourceId string
param mediaIdentityResourceId string = ''
param image string
param keyVaultUri string
param plainEnvironment array
param secretEnvironment array
param customDomains array = []
param minReplicas int = 1
param maxReplicas int = 2
param cpu string = '0.5'
param memory string = '1Gi'

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
var userAssignedIdentities = empty(mediaIdentityResourceId)
  ? {
      '${identityResourceId}': {}
    }
  : union(
      {
        '${identityResourceId}': {}
      },
      {
        '${mediaIdentityResourceId}': {}
      }
    )

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: userAssignedIdentities
  }
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        customDomains: customDomains
        external: true
        allowInsecure: false
        targetPort: 3000
        transport: 'auto'
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
      registries: [
        {
          server: registryServer
          identity: identityResourceId
        }
      ]
      secrets: secretDefinitions
    }
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
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: '/api/health/live'
                port: 3000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 2
              periodSeconds: 5
              timeoutSeconds: 3
              failureThreshold: 30
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/api/health/live'
                port: 3000
                scheme: 'HTTP'
              }
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/api/health/ready'
                port: 3000
                scheme: 'HTTP'
              }
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: [
          {
            name: 'http-concurrency'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

output id string = app.id
output fqdn string = app.properties.configuration.ingress.fqdn
output latestRevisionName string = app.properties.latestRevisionName
