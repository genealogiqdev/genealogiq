targetScope = 'subscription'

@description('Azure region for the production platform.')
param location string = 'brazilsouth'

@description('Short environment suffix used in resource names.')
param environmentName string = 'prod'

@description('Immutable image tag, normally the Git commit SHA.')
param imageTag string = 'bootstrap'

@description('Optional independently versioned database transfer image tag.')
param transferImageTag string = imageTag

@description('Deploy Container Apps and jobs after images and Key Vault secrets exist.')
param deployApplications bool = false

@description('Deploy the one-time source-to-Azure database transfer job.')
param deployTransferJob bool = false

@description('Key Vault-backed secret names that have been populated.')
param enabledSecretNames array = []

@secure()
@description('Azure PostgreSQL administrator password.')
param postgresAdminPassword string

@description('Object ID allowed to manage deployment secrets in Key Vault.')
param deployerPrincipalId string = ''

@description('Email address for Azure Monitor notifications.')
param alertEmail string = ''

@description('Public Sentry DSN compiled into the consumer app.')
param appSentryDsn string = ''

@description('Public Sentry DSN compiled into BMS.')
param bmsSentryDsn string = ''

@description('Public Sentry DSN compiled into Sequoia.')
param seqSentryDsn string = ''

@description('Public VAPID key compiled into the consumer app.')
param vapidPublicKey string = ''

@description('Public Turnstile site key compiled into the consumer app.')
param turnstileSiteKey string = ''

@description('Canonical consumer origin. Preserve the active origin during DNS cutovers.')
param appUrl string = 'https://genealogiq.app'

@description('Canonical BMS origin.')
param bmsUrl string = 'https://bms.genealogiq.app'

@description('Canonical Sequoia origin.')
param sequoiaUrl string = 'https://sequoia.rip'

@description('Existing consumer custom-domain bindings, including certificate IDs.')
param appCustomDomains array = []

@description('Existing BMS custom-domain bindings, including certificate IDs.')
param bmsCustomDomains array = []

@description('Existing Sequoia custom-domain bindings, including certificate IDs.')
param sequoiaCustomDomains array = []

var baseName = 'genealogiq'
var resourceGroupName = 'rg-${baseName}-${environmentName}'
var uniqueSuffix = take(uniqueString(subscription().id, environmentName), 8)

resource resourceGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: {
    application: 'genealogiq'
    environment: environmentName
    managedBy: 'bicep'
  }
}

module platform './modules/platform.bicep' = {
  name: 'genealogiq-${environmentName}'
  scope: resourceGroup
  params: {
    location: location
    environmentName: environmentName
    uniqueSuffix: uniqueSuffix
    imageTag: imageTag
    transferImageTag: transferImageTag
    deployApplications: deployApplications
    deployTransferJob: deployTransferJob
    enabledSecretNames: enabledSecretNames
    postgresAdminPassword: postgresAdminPassword
    deployerPrincipalId: deployerPrincipalId
    alertEmail: alertEmail
    appSentryDsn: appSentryDsn
    bmsSentryDsn: bmsSentryDsn
    seqSentryDsn: seqSentryDsn
    vapidPublicKey: vapidPublicKey
    turnstileSiteKey: turnstileSiteKey
    appUrl: appUrl
    bmsUrl: bmsUrl
    sequoiaUrl: sequoiaUrl
    appCustomDomains: appCustomDomains
    bmsCustomDomains: bmsCustomDomains
    sequoiaCustomDomains: sequoiaCustomDomains
  }
}

output resourceGroupName string = resourceGroup.name
output registryName string = platform.outputs.registryName
output registryLoginServer string = platform.outputs.registryLoginServer
output storageAccountName string = platform.outputs.storageAccountName
output databaseBackupContainerName string = platform.outputs.databaseBackupContainerName
output mediaStorageAccountName string = platform.outputs.mediaStorageAccountName
output mediaContainerName string = platform.outputs.mediaContainerName
output mediaStagingContainerName string = platform.outputs.mediaStagingContainerName
output mediaMigrationContainerName string = platform.outputs.mediaMigrationContainerName
output mediaPublicBaseUrl string = platform.outputs.mediaPublicBaseUrl
output mediaManagedIdentityName string = platform.outputs.mediaManagedIdentityName
output mediaManagedIdentityClientId string = platform.outputs.mediaManagedIdentityClientId
output mediaMigrationJobName string = platform.outputs.mediaMigrationJobName
output keyVaultName string = platform.outputs.keyVaultName
output containerAppsEnvironmentName string = platform.outputs.containerAppsEnvironmentName
output postgresServerName string = platform.outputs.postgresServerName
output postgresHost string = platform.outputs.postgresHost
output appFqdn string = platform.outputs.appFqdn
output bmsFqdn string = platform.outputs.bmsFqdn
output seqFqdn string = platform.outputs.seqFqdn
output githubActionsClientId string = platform.outputs.githubActionsClientId
output githubActionsPrincipalId string = platform.outputs.githubActionsPrincipalId
