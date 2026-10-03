targetScope = 'resourceGroup'

@description('Current Container App definitions with proposed hostname and runtime URL changes. Used for what-if only; configure-domains.ps1 applies targeted Azure CLI updates.')
param applications array

resource containerApps 'Microsoft.App/containerApps@2024-03-01' = [for application in applications: {
  name: application.name
  location: application.location
  tags: application.tags
  identity: application.identity
  properties: application.properties
}]
